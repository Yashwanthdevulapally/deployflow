import express from "express";
import { prisma } from "../prisma";

import {
  getLatestCommit,
  getWorkflowRunForCommit,
  triggerWorkflow
} from "../services/github";

import {
  authenticateToken,
  AuthRequest
} from "../middleware/auth";

const router = express.Router();


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
        branch
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
            commitSha: latestCommit.sha,
            commitMessage: latestCommit.message,
            status: "PENDING"
          }
        });

      // -----------------------------------------------
      // Trigger GitHub Actions
      // -----------------------------------------------

      try {
        await triggerWorkflow(
          owner,
          repo,
          "deployflow.yml",
          deploymentBranch
        );

        console.log(
          `GitHub Actions triggered for deployment #${deployment.id}`
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


export default router;