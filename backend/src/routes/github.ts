import express from "express";
import {
  getRepository,
  getLatestCommit,
  getLatestWorkflowRun
} from "../services/github";

const router = express.Router();

// Get GitHub repository information
router.get(
  "/repository/:owner/:repo",
  async (req, res) => {
    try {
      const { owner, repo } = req.params;

      const repository = await getRepository(owner, repo);

      res.json({
        message: "GitHub repository fetched successfully",
        repository
      });
    } catch (error) {
      console.error(error);

      res.status(404).json({
        message: "GitHub repository not found"
      });
    }
  }
);

// Get latest commit
router.get(
  "/repository/:owner/:repo/commits/latest",
  async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const branch = (req.query.branch as string) || "main";

      const commit = await getLatestCommit(
        owner,
        repo,
        branch
      );

      res.json({
        message: "Latest GitHub commit fetched successfully",
        commit
      });
    } catch (error) {
      console.error(error);

      res.status(404).json({
        message: "Latest commit not found"
      });
    }
  }
);

// Get latest GitHub Actions workflow run
router.get(
  "/repository/:owner/:repo/actions/latest",
  async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const branch = (req.query.branch as string) || "main";

      const workflowRun = await getLatestWorkflowRun(
        owner,
        repo,
        branch
      );

      if (!workflowRun) {
        return res.status(404).json({
          message: "No GitHub Actions workflow runs found"
        });
      }

      res.json({
        message: "Latest GitHub Actions run fetched successfully",
        workflowRun
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch GitHub Actions run"
      });
    }
  }
);

export default router;