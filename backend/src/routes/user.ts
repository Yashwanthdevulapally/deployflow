import express from "express";
import { prisma } from "../prisma";
import {
  authenticateToken,
  AuthRequest
} from "../middleware/auth";

const router = express.Router();

router.get(
  "/profile",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: {
          id: req.user!.userId
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      res.json({
        message: "Profile retrieved successfully",
        user
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