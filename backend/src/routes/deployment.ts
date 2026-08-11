import express from "express";
import { prisma } from "../prisma";
import {
  getLatestCommit,
  getWorkflowRunForCommit
} from "../services/github";
import {
  authenticateToken,
  AuthRequest
} from "../middleware/auth";

const router = express.Router();

// Create a deployment
router.post(
  "/",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { projectId, repositoryUrl, branch } = req.body;

      if (!projectId || !repositoryUrl) {
        return res.status(400).json({
          message: "Project ID and repository URL are required"
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

      // Use main if no branch is provided
      const deploymentBranch = branch || "main";

      // Extract GitHub owner and repository name
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

      // Fetch the latest real commit from GitHub
      const latestCommit = await getLatestCommit(
        owner,
        repo,
        deploymentBranch
      );

      // Create deployment with real GitHub commit information
      const deployment = await prisma.deployment.create({
        data: {
          projectId: Number(projectId),
          repositoryUrl,
          branch: deploymentBranch,
          commitSha: latestCommit.sha,
          commitMessage: latestCommit.message,
          status: "PENDING"
        }
      });

      res.status(201).json({
        message: "Deployment created successfully",
        deployment
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);

// Get deployments for a project
router.get(
  "/project/:projectId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.projectId);

      const project = await prisma.project.findFirst({
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

      const deployments = await prisma.deployment.findMany({
        where: {
          projectId
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      res.json({
        deployments
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);
// Sync deployment status with GitHub Actions
router.post(
  "/:deploymentId/sync",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.deploymentId);

      const deployment = await prisma.deployment.findUnique({
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

      if (deployment.project.userId !== req.user!.userId) {
        return res.status(403).json({
          message: "You are not allowed to sync this deployment"
        });
      }

      if (!deployment.commitSha) {
        return res.status(400).json({
          message: "Deployment does not have a GitHub commit"
        });
      }

      const githubPath = deployment.repositoryUrl
        .replace("https://github.com/", "")
        .replace(".git", "")
        .replace(/\/$/, "");

      const [owner, repo] = githubPath.split("/");

      if (!owner || !repo) {
        return res.status(400).json({
          message: "Invalid GitHub repository URL"
        });
      }

      const workflowRun = await getWorkflowRunForCommit(
        owner,
        repo,
        deployment.branch,
        deployment.commitSha
      );

      if (!workflowRun) {
        return res.status(404).json({
          message: "No GitHub Actions run found for this commit"
        });
      }

      let deploymentStatus = "PENDING";

      if (workflowRun.status === "in_progress" ||
          workflowRun.status === "queued") {
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

      const updatedDeployment =
        await prisma.deployment.update({
          where: {
            id: deploymentId
          },
          data: {
  workflowRunId: String(workflowRun.id),
  workflowUrl: workflowRun.htmlUrl,
  status: deploymentStatus
}
        });

      res.json({
        message: "Deployment synced with GitHub Actions",
        deployment: updatedDeployment,
        githubActions: workflowRun
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to sync deployment with GitHub Actions"
      });
    }
  }
);
// Update deployment status
router.patch(
  "/:deploymentId/status",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const deploymentId = Number(req.params.deploymentId);
      const { status } = req.body;

      const allowedStatuses = [
        "PENDING",
        "RUNNING",
        "SUCCESS",
        "FAILED"
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid deployment status"
        });
      }

      const deployment = await prisma.deployment.findUnique({
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

      if (deployment.project.userId !== req.user!.userId) {
        return res.status(403).json({
          message: "You are not allowed to update this deployment"
        });
      }

      const updatedDeployment =
        await prisma.deployment.update({
          where: {
            id: deploymentId
          },
          data: {
            status
          }
        });

      res.json({
        message: "Deployment status updated",
        deployment: updatedDeployment
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);

export default router;