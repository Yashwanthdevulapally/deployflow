import express from "express";
import { prisma } from "../prisma";
import {
  authenticateToken,
  AuthRequest
} from "../middleware/auth";

const router = express.Router();

// Create a project
router.post(
  "/",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({
          message: "Project name is required"
        });
      }

      const project = await prisma.project.create({
        data: {
          name,
          description,
          userId: req.user!.userId
        }
      });

      res.status(201).json({
        message: "Project created successfully",
        project
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);

// Get all projects for logged-in user
router.get(
  "/",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const projects = await prisma.project.findMany({
        where: {
          userId: req.user!.userId
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      res.json({
        projects
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