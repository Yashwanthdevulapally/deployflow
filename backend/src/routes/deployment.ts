import express from "express";
import { prisma } from "../prisma";

import {
  getLatestCommit,
  getWorkflowRunForCommit,
  getWorkflows,
  triggerWorkflow,
  getWorkflowRunJobs
} from "../services/github";

import {
  authenticateToken,
  AuthRequest
} from "../middleware/auth";

const router = express.Router();


// =====================================================
// GET GITHUB WORKFLOWS
// =====================================================

router.get(
  "/workflows",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const repositoryUrl =
        req.query.repositoryUrl as string;

      if (!repositoryUrl) {
        return res.status(400).json({
          message: "Repository URL is required"
        });
      }

      // -----------------------------------------------
      // Extract GitHub owner and repository
      // -----------------------------------------------

      const githubPath = repositoryUrl
        .replace("https://github.com/", "")
        .replace(".git", "")
        .replace(/\/$/, "");

      const [owner, repo] =
        githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message: "Invalid GitHub repository URL"
        });
      }

      // -----------------------------------------------
      // Get workflows from GitHub
      // -----------------------------------------------

      const workflows = await getWorkflows(
        owner,
        repo
      );

      return res.status(200).json({
        workflows
      });

    } catch (error) {

      console.error(
        "Failed to fetch GitHub workflows:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch GitHub workflows"
      });
    }
  }
);
// =====================================================
// CREATE DEPLOYMENT
// =====================================================

router.post(
  "/",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const {
        projectId,
        repositoryUrl,
        branch,
        workflow
      } = req.body;

      if (!projectId || !repositoryUrl) {
        return res.status(400).json({
          message:
            "Project ID and repository URL are required"
        });
      }

      // Check that the project belongs to the logged-in user
      const project = await prisma.project.findFirst({
        where: {
          id: Number(projectId),
          userId: req.user!.userId
        }
      });

      if (!project) {
        return res.status(404).json({
          message: "Project not found"
        });
      }

      // Default branch
      const deploymentBranch = branch || "main";

      // Default workflow
      const deploymentWorkflow =
        workflow || "deploy.yml";


      // -----------------------------------------------
      // Extract GitHub owner and repository
      // -----------------------------------------------

      const githubPath = repositoryUrl
        .replace("https://github.com/", "")
        .replace(".git", "")
        .replace(/\/$/, "");

      const [owner, repo] = githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message: "Invalid GitHub repository URL"
        });
      }


      // -----------------------------------------------
      // Get latest GitHub commit
      // -----------------------------------------------

      const latestCommit = await getLatestCommit(
        owner,
        repo,
        deploymentBranch
      );


      // -----------------------------------------------
      // Create deployment
      // -----------------------------------------------

      const deployment =
        await prisma.deployment.create({
          data: {
            projectId: Number(projectId),
            repositoryUrl,
            branch: deploymentBranch,
            workflow: deploymentWorkflow,
            commitSha: latestCommit.sha,
            commitMessage: latestCommit.message,
            status: "PENDING"
          }
        });


      // -----------------------------------------------
      // Trigger GitHub Actions
      // -----------------------------------------------

      try {
  const workflowResult =
    await triggerWorkflow(
      owner,
      repo,
      deploymentWorkflow,
      deploymentBranch
    );

if (!workflowResult.success) {
  throw new Error(
    "GitHub Actions workflow dispatch failed"
  );
}
  await prisma.deployment.update({
    where: {
      id: deployment.id
    },

    data: {
      workflowRunId:
        String(workflowResult.workflowRunId),

      workflowUrl:
        workflowResult.workflowUrl,

      status: "RUNNING"
    }
  });

  console.log(
    `GitHub Actions triggered for deployment #${deployment.id}`
  );

  console.log(
    `GitHub workflow run: ${workflowResult.workflowRunId}`
  );

      } catch (githubError) {

        console.error(
          "Failed to trigger GitHub Actions:",
          githubError
        );

        // Mark deployment as failed if GitHub
        // Actions could not be triggered

        const failedDeployment =
          await prisma.deployment.update({
            where: {
              id: deployment.id
            },
            data: {
              status: "FAILED"
            }
          });

        return res.status(500).json({
          message:
            "Deployment created but GitHub Actions could not be triggered",
          deployment: failedDeployment
        });
      }


      // -----------------------------------------------
      // Response
      // -----------------------------------------------

      return res.status(201).json({
        message:
          "Deployment created and GitHub Actions triggered",
        deployment
      });

    } catch (error) {

      console.error(error);

      return res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);


// =====================================================
// GET DEPLOYMENTS FOR PROJECT
// =====================================================

router.get(
  "/project/:projectId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {

      const projectId =
        Number(req.params.projectId);


      // Check project ownership
      const project =
        await prisma.project.findFirst({
          where: {
            id: projectId,
            userId: req.user!.userId
          }
        });


      if (!project) {
        return res.status(404).json({
          message: "Project not found"
        });
      }


      const deployments =
        await prisma.deployment.findMany({
          where: {
            projectId
          },
          orderBy: {
            createdAt: "desc"
          }
        });


      return res.json({
        deployments
      });

    } catch (error) {

      console.error(error);

      return res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);


// =====================================================
// SYNC DEPLOYMENT WITH GITHUB ACTIONS
// =====================================================

router.post(
  "/:deploymentId/sync",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {

      const deploymentId =
        Number(req.params.deploymentId);


      // -----------------------------------------------
      // Find deployment
      // -----------------------------------------------

      const deployment =
        await prisma.deployment.findUnique({
          where: {
            id: deploymentId
          },
          include: {
            project: true
          }
        });


      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }


      // -----------------------------------------------
      // Check ownership
      // -----------------------------------------------

      if (
        deployment.project.userId !==
        req.user!.userId
      ) {
        return res.status(403).json({
          message:
            "You are not allowed to sync this deployment"
        });
      }


      // -----------------------------------------------
      // Check commit
      // -----------------------------------------------

      if (!deployment.commitSha) {
        return res.status(400).json({
          message:
            "Deployment does not have a GitHub commit"
        });
      }


      // -----------------------------------------------
      // Extract GitHub repository
      // -----------------------------------------------

      const githubPath =
        deployment.repositoryUrl
          .replace(
            "https://github.com/",
            ""
          )
          .replace(".git", "")
          .replace(/\/$/, "");


      const [owner, repo] =
        githubPath.split("/");


      if (!owner || !repo) {
        return res.status(400).json({
          message:
            "Invalid GitHub repository URL"
        });
      }


      // -----------------------------------------------
      // Find workflow run for exact commit
      // -----------------------------------------------

      const workflowRun =
        await getWorkflowRunForCommit(
          owner,
          repo,
          deployment.branch,
          deployment.commitSha
        );


      if (!workflowRun) {
        return res.status(404).json({
          message:
            "No GitHub Actions run found for this commit"
        });
      }


      // -----------------------------------------------
      // Determine deployment status
      // -----------------------------------------------

      let deploymentStatus = "PENDING";


      if (
        workflowRun.status === "queued" ||
        workflowRun.status === "in_progress"
      ) {
        deploymentStatus = "RUNNING";
      }


      if (
        workflowRun.status === "completed" &&
        workflowRun.conclusion === "success"
      ) {
        deploymentStatus = "SUCCESS";
      }


      if (
        workflowRun.status === "completed" &&
        workflowRun.conclusion !== "success"
      ) {
        deploymentStatus = "FAILED";
      }


      // -----------------------------------------------
      // Update deployment
      // -----------------------------------------------

      const updatedDeployment =
        await prisma.deployment.update({
          where: {
            id: deploymentId
          },
          data: {
            workflowRunId:
              String(workflowRun.id),

            workflowUrl:
              workflowRun.htmlUrl,

            status:
              deploymentStatus
          }
        });


      // -----------------------------------------------
      // Response
      // -----------------------------------------------

      return res.json({

        message:
          "Deployment synced with GitHub Actions",

        deployment:
          updatedDeployment,

        githubActions:
          workflowRun

      });

    } catch (error) {

      console.error(error);

      return res.status(500).json({
        message:
          "Failed to sync deployment with GitHub Actions"
      });
    }
  }
);


// =====================================================
// MANUAL UPDATE DEPLOYMENT STATUS
// =====================================================

router.patch(
  "/:deploymentId/status",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {

      const deploymentId =
        Number(req.params.deploymentId);

      const { status } = req.body;


      // -----------------------------------------------
      // Allowed statuses
      // -----------------------------------------------

      const allowedStatuses = [
        "PENDING",
        "RUNNING",
        "SUCCESS",
        "FAILED"
      ];


      if (
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          message:
            "Invalid deployment status"
        });
      }


      // -----------------------------------------------
      // Find deployment
      // -----------------------------------------------

      const deployment =
        await prisma.deployment.findUnique({
          where: {
            id: deploymentId
          },
          include: {
            project: true
          }
        });


      if (!deployment) {
        return res.status(404).json({
          message:
            "Deployment not found"
        });
      }


      // -----------------------------------------------
      // Check ownership
      // -----------------------------------------------

      if (
        deployment.project.userId !==
        req.user!.userId
      ) {
        return res.status(403).json({
          message:
            "You are not allowed to update this deployment"
        });
      }


      // -----------------------------------------------
      // Update status
      // -----------------------------------------------

      const updatedDeployment =
        await prisma.deployment.update({
          where: {
            id: deploymentId
          },
          data: {
            status
          }
        });


      return res.json({
        message:
          "Deployment status updated",

        deployment:
          updatedDeployment
      });

    } catch (error) {

      console.error(error);

      return res.status(500).json({
        message:
          "Something went wrong"
      });
    }
  }
);


// =====================================================
// GET LIVE GITHUB ACTIONS STATUS
// =====================================================

router.get(
  "/:id/status",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.id);

      if (!deploymentId) {
        return res.status(400).json({
          message: "Invalid deployment ID"
        });
      }

      // Find deployment and make sure it belongs
      // to the logged-in user
      const deployment =
        await prisma.deployment.findFirst({
          where: {
            id: deploymentId,
            project: {
              userId: req.user!.userId
            }
          },
          include: {
            project: true
          }
        });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }

      // If we don't have a commit SHA yet,
      // there is nothing to check
      if (!deployment.commitSha) {
        return res.json({
          status: deployment.status,
          workflowRunId:
            deployment.workflowRunId,
          workflowUrl:
            deployment.workflowUrl
        });
      }

      // Extract GitHub repository
      const githubPath = deployment.repositoryUrl
        .replace("https://github.com/", "")
        .replace(".git", "")
        .replace(/\/$/, "");

      const [owner, repo] =
        githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message: "Invalid GitHub repository URL"
        });
      }

      // Ask GitHub for the workflow run
      // belonging to this commit
      const workflowRun =
        await getWorkflowRunForCommit(
          owner,
          repo,
          deployment.branch,
          deployment.commitSha
        );

      // Workflow may take a short time to appear
      if (!workflowRun) {
        return res.json({
          status: deployment.status,
          workflowRunId:
            deployment.workflowRunId,
          workflowUrl:
            deployment.workflowUrl
        });
      }

      // Convert GitHub status into our
      // DeployFlow status
      let deploymentStatus = "RUNNING";

      if (
        workflowRun.status === "completed"
      ) {
        if (
          workflowRun.conclusion === "success"
        ) {
          deploymentStatus = "SUCCESS";
        } else {
          deploymentStatus = "FAILED";
        }
      }

      // Save latest GitHub information
      const updatedDeployment =
        await prisma.deployment.update({
          where: {
            id: deployment.id
          },
          data: {
            workflowRunId:
              String(workflowRun.id),
            workflowUrl:
              workflowRun.htmlUrl,
            status: deploymentStatus
          }
        });

      return res.json({
        status: updatedDeployment.status,
        workflowRunId:
          updatedDeployment.workflowRunId,
        workflowUrl:
          updatedDeployment.workflowUrl,
        startedAt:
          updatedDeployment.startedAt,
        completedAt:
          updatedDeployment.completedAt,
        duration:
          updatedDeployment.duration
      });

    } catch (error) {
      console.error(
        "Failed to fetch deployment status:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch deployment status"
      });
    }
  }
);
// =====================================================
// GET DEPLOYMENT DETAILS
// =====================================================

router.get(
  "/:deploymentId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId =
        Number(req.params.deploymentId);

      if (!deploymentId) {
        return res.status(400).json({
          message: "Invalid deployment ID"
        });
      }

      // -----------------------------------------------
      // Find deployment
      // -----------------------------------------------

      const deployment =
        await prisma.deployment.findFirst({
          where: {
            id: deploymentId,
            project: {
              userId: req.user!.userId
            }
          },
          include: {
            project: true
          }
        });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }

      // -----------------------------------------------
      // Return deployment details
      // -----------------------------------------------

      return res.json({
        id: deployment.id,
        repositoryUrl:
          deployment.repositoryUrl,
        branch:
          deployment.branch,
        workflow:
          deployment.workflow,
        commitSha:
          deployment.commitSha,
        commitMessage:
          deployment.commitMessage,
        status:
          deployment.status,
        workflowRunId:
          deployment.workflowRunId,
        workflowUrl:
          deployment.workflowUrl,
        createdAt:
          deployment.createdAt,
        startedAt:
          deployment.startedAt,
        completedAt:
          deployment.completedAt,
        duration:
          deployment.duration,
        projectId:
          deployment.projectId
      });

    } catch (error) {

      console.error(
        "Failed to fetch deployment details:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch deployment details"
      });
    }
  }
);
// =====================================================
// RETRY FAILED DEPLOYMENT
// =====================================================

router.post(
  "/:deploymentId/retry",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.deploymentId);

      if (!deploymentId) {
        return res.status(400).json({
          message: "Invalid deployment ID"
        });
      }

      // -------------------------------------------------
      // Find failed deployment
      // -------------------------------------------------

      const deployment =
        await prisma.deployment.findUnique({
          where: {
            id: deploymentId
          },
          include: {
            project: true
          }
        });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }

      // -------------------------------------------------
      // Check ownership
      // -------------------------------------------------

      if (
        deployment.project.userId !==
        req.user!.userId
      ) {
        return res.status(403).json({
          message:
            "You are not allowed to retry this deployment"
        });
      }

      // -------------------------------------------------
      // Retry is allowed only for FAILED deployments
      // -------------------------------------------------

      if (deployment.status !== "FAILED") {
        return res.status(400).json({
          message:
            "Only failed deployments can be retried"
        });
      }

      // -------------------------------------------------
      // Make sure deployment has a commit
      // -------------------------------------------------

      if (!deployment.commitSha) {
        return res.status(400).json({
          message:
            "Failed deployment has no commit SHA"
        });
      }

      // -------------------------------------------------
      // Extract GitHub repository
      // -------------------------------------------------

      const githubPath =
        deployment.repositoryUrl
          .replace("https://github.com/", "")
          .replace(".git", "")
          .replace(/\/$/, "");

      const [owner, repo] =
        githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message:
            "Invalid GitHub repository URL"
        });
      }

      // -------------------------------------------------
      // Create retry deployment
      // -------------------------------------------------

      const retryDeployment =
        await prisma.deployment.create({
          data: {
            projectId:
              deployment.projectId,

            repositoryUrl:
              deployment.repositoryUrl,

            branch:
              deployment.branch,

            workflow:
              deployment.workflow,

            commitSha:
              deployment.commitSha,

            commitMessage:
              deployment.commitMessage,

            status:
              "PENDING"
          }
        });

      // -------------------------------------------------
      // Trigger GitHub Actions
      //
      // ref = branch containing the workflow
      // deploySha = exact commit we want to build
      // -------------------------------------------------

      try {
        const workflowResult =
          await triggerWorkflow(
            owner,
            repo,
            deployment.workflow || "deployflow.yml",
            deployment.branch,
            deployment.commitSha
          );

        if (!workflowResult.success) {
          throw new Error(
            "GitHub Actions workflow dispatch failed"
          );
        }

        await prisma.deployment.update({
          where: {
            id: retryDeployment.id
          },

          data: {
            workflowRunId:
              String(workflowResult.workflowRunId),

            workflowUrl:
              workflowResult.workflowUrl,

            status: "RUNNING"
          }
        });

        console.log(
          `Retry triggered for deployment #${retryDeployment.id}`
        );

        console.log(
          `GitHub workflow run: ${workflowResult.workflowRunId}`
        );

      } catch (githubError) {

        console.error(
          "Failed to trigger retry:",
          githubError
        );

        const failedRetry =
          await prisma.deployment.update({
            where: {
              id: retryDeployment.id
            },
            data: {
              status: "FAILED"
            }
          });

        return res.status(500).json({
          message:
            "Retry deployment created but GitHub Actions could not be triggered",

          deployment:
            failedRetry
        });
      }

      // -------------------------------------------------
      // Response
      // -------------------------------------------------

      return res.status(201).json({
        message:
          "Retry deployment created and GitHub Actions triggered",

        deployment:
          retryDeployment,

        retriedDeployment:
          deployment.id
      });

    } catch (error) {

      console.error(
        "Retry deployment failed:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to retry deployment"
      });
    }
  }
);

// =====================================================
// ROLLBACK DEPLOYMENT
// =====================================================
// =====================================================
// ROLLBACK DEPLOYMENT
// =====================================================
// =====================================================
// ROLLBACK DEPLOYMENT
// =====================================================

router.post(
  "/:deploymentId/rollback",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.deploymentId);

      if (!deploymentId || Number.isNaN(deploymentId)) {
        return res.status(400).json({
          message: "Invalid deployment ID"
        });
      }

      // -------------------------------------------------
      // Find deployment being rolled back
      // -------------------------------------------------

      const deployment =
        await prisma.deployment.findUnique({
          where: {
            id: deploymentId
          },
          include: {
            project: true
          }
        });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }

      // -------------------------------------------------
      // Check ownership
      // -------------------------------------------------

      if (
        deployment.project.userId !==
        req.user!.userId
      ) {
        return res.status(403).json({
          message:
            "You are not allowed to rollback this deployment"
        });
      }

      // -------------------------------------------------
      // Find previous successful deployment
      // -------------------------------------------------

      const previousSuccessfulDeployment =
        await prisma.deployment.findFirst({
          where: {
            projectId: deployment.projectId,

            repositoryUrl:
              deployment.repositoryUrl,

            status: "SUCCESS",

            id: {
              lt: deployment.id
            }
          },

          orderBy: {
            id: "desc"
          }
        });

      if (!previousSuccessfulDeployment) {
        return res.status(400).json({
          message:
            "No previous successful deployment found"
        });
      }

      // -------------------------------------------------
      // Make sure previous deployment has commit SHA
      // -------------------------------------------------

      if (!previousSuccessfulDeployment.commitSha) {
        return res.status(400).json({
          message:
            "Previous successful deployment has no commit SHA"
        });
      }

      // -------------------------------------------------
      // Extract GitHub repository
      // -------------------------------------------------

      const githubPath =
        previousSuccessfulDeployment.repositoryUrl
          .replace("https://github.com/", "")
          .replace(/\.git$/, "")
          .replace(/\/$/, "");

      const [owner, repo] =
        githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message:
            "Invalid GitHub repository URL"
        });
      }

      // -------------------------------------------------
      // Create rollback deployment
      // -------------------------------------------------

      const rollbackDeployment =
        await prisma.deployment.create({
          data: {
            projectId:
              deployment.projectId,

            repositoryUrl:
              previousSuccessfulDeployment.repositoryUrl,

            branch:
              previousSuccessfulDeployment.branch,

            workflow:
              previousSuccessfulDeployment.workflow,

            commitSha:
              previousSuccessfulDeployment.commitSha,

            commitMessage:
              previousSuccessfulDeployment.commitMessage,

            status:
              "PENDING",

            rollbackOfId:
              deployment.id
          }
        });

      // -------------------------------------------------
      // Trigger GitHub Actions
      // -------------------------------------------------

      // -------------------------------------------------
// Trigger GitHub Actions
// -------------------------------------------------

try {
  const workflowResult =
    await triggerWorkflow(
      owner,
      repo,
      "deployflow.yml",

      // IMPORTANT:
      // workflow_dispatch ref must be a branch/tag.
      // We use main as the workflow source.
      previousSuccessfulDeployment.branch,

      // This is the OLD commit we actually want
      // GitHub Actions to deploy.
      previousSuccessfulDeployment.commitSha
    );

  // -------------------------------------------------
  // Save GitHub workflow information
  // -------------------------------------------------

  await prisma.deployment.update({
    where: {
      id: rollbackDeployment.id
    },

    data: {
      workflowRunId:
        String(workflowResult.workflowRunId),

      workflowUrl:
        workflowResult.workflowUrl,

      status: "RUNNING"
    }
  });

  console.log(
    `Rollback triggered for deployment #${rollbackDeployment.id}`
  );

  console.log(
    `GitHub workflow run: ${workflowResult.workflowRunId}`
  );

} catch (githubError) {

  console.error(
    "Failed to trigger rollback:",
    githubError
  );

  const failedRollback =
    await prisma.deployment.update({
      where: {
        id: rollbackDeployment.id
      },

      data: {
        status: "FAILED"
      }
    });

  return res.status(500).json({
    message:
      "Rollback created but GitHub Actions could not be triggered",

    deployment:
      failedRollback
  });
}

      // -------------------------------------------------
      // Response
      // -------------------------------------------------

      return res.status(201).json({
        message:
          "Rollback deployment created and GitHub Actions triggered",

        deployment:
          rollbackDeployment,

        rolledBackTo:
          previousSuccessfulDeployment.id
      });

    } catch (error) {

      console.error(
        "Rollback failed:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to rollback deployment"
      });
    }
  }
);

// =====================================================
// GET GITHUB ACTIONS JOBS
// =====================================================

router.get(
  "/:deploymentId/jobs",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.deploymentId);

      if (!deploymentId) {
        return res.status(400).json({
          message: "Invalid deployment ID"
        });
      }

      const deployment =
        await prisma.deployment.findUnique({
          where: {
            id: deploymentId
          },
          include: {
            project: true
          }
        });

      if (!deployment) {
        return res.status(404).json({
          message: "Deployment not found"
        });
      }

      if (
        deployment.project.userId !==
        req.user!.userId
      ) {
        return res.status(403).json({
          message: "You are not allowed to view this deployment"
        });
      }

      if (!deployment.workflowRunId) {
        return res.status(400).json({
          message: "Deployment has no GitHub Actions run"
        });
      }

      const githubPath =
        deployment.repositoryUrl
          .replace("https://github.com/", "")
          .replace(".git", "")
          .replace(/\/$/, "");

      const [owner, repo] =
        githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message: "Invalid GitHub repository URL"
        });
      }

      const jobs =
        await getWorkflowRunJobs(
          owner,
          repo,
          Number(deployment.workflowRunId)
        );

      return res.json({
        deploymentId,
        workflowRunId:
          deployment.workflowRunId,
        jobs
      });

    } catch (error) {
      console.error(
        "Failed to fetch GitHub Actions jobs:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch GitHub Actions jobs"
      });
    }
  }
);

export default router;