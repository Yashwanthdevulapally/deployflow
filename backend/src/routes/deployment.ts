import express from "express";
import { prisma } from "../prisma";
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

      const deployment = await prisma.deployment.create({
        data: {
          projectId: Number(projectId),
          repositoryUrl,
          branch: branch || "main",
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