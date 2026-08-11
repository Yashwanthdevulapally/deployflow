import githubRoutes from "./routes/github";
import "dotenv/config";
import express from "express";
import cors from "cors";

import { prisma } from "./prisma";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import projectRoutes from "./routes/project";
import deploymentRoutes from "./routes/deployment";
import { startDeploymentChecker } from "./services/deployment-checker";

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/deployments", deploymentRoutes);
app.use("/api/github", githubRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "DeployFlow backend is running!"
  });
});

// Database test
app.get("/api/test-db", async (req, res) => {
  try {
    const users = await prisma.user.findMany();

    res.json({
      message: "Database connection successful!",
      users
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Database connection failed"
    });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DeployFlow backend running on port ${PORT}`);
});

// Initialize background worker
startDeploymentChecker();
