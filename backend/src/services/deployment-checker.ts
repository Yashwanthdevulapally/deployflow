import { prisma } from "../prisma";
import {
  getWorkflowRunForCommit,
  getWorkflowRunById
} from "./github";

function getRepositoryParts(repositoryUrl: string) {
  const githubPath = repositoryUrl
    .replace("https://github.com/", "")
    .replace(".git", "")
    .replace(/\/$/, "");

  const [owner, repo] = githubPath.split("/");

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo
  };
}

async function syncDeployment(
  deployment: {
    id: number;
    repositoryUrl: string;
    branch: string;
    commitSha: string | null;
    workflowRunId: string | null;
    status: string;
    startedAt?: Date | null;
    completedAt?: Date | null;
    duration?: number | null;
  }
) {
  if (!deployment.commitSha && !deployment.workflowRunId) {
    return;
  }

  const repository = getRepositoryParts(
    deployment.repositoryUrl
  );

  if (!repository) {
    console.error(
      `Invalid GitHub repository URL for deployment ${deployment.id}`
    );

    return;
  }

  try {
    let workflowRun = null;

    // =====================================================
    // ROLLBACK / KNOWN WORKFLOW RUN
    // =====================================================

    if (deployment.workflowRunId) {
      workflowRun = await getWorkflowRunById(
        repository.owner,
        repository.repo,
        Number(deployment.workflowRunId)
      );
    }

    // =====================================================
    // NORMAL DEPLOYMENT
    // =====================================================

    if (!workflowRun && deployment.commitSha) {
      workflowRun = await getWorkflowRunForCommit(
        repository.owner,
        repository.repo,
        deployment.branch,
        deployment.commitSha
      );
    }

    if (!workflowRun) {
      console.log(
        `No GitHub Actions run found for deployment ${deployment.id}`
      );

      return;
    }

    // =====================================================
    // DETERMINE DEPLOYMENT STATUS
    // =====================================================

    let status = "PENDING";

    if (
      workflowRun.status === "queued" ||
      workflowRun.status === "in_progress"
    ) {
      status = "RUNNING";
    }

    if (
      workflowRun.status === "completed" &&
      workflowRun.conclusion === "success"
    ) {
      status = "SUCCESS";
    }

    if (
      workflowRun.status === "completed" &&
      workflowRun.conclusion !== "success"
    ) {
      status = "FAILED";
    }

    // =====================================================
    // DEPLOYMENT OBSERVABILITY
    // =====================================================

    const startedAt =
      deployment.startedAt ??
      new Date(workflowRun.createdAt);

    let completedAt = deployment.completedAt;
    let duration = deployment.duration;

    if (status === "RUNNING") {
      // Record when the GitHub Actions run actually started.
      await prisma.deployment.update({
        where: {
          id: deployment.id
        },

        data: {
          workflowRunId: String(workflowRun.id),
          workflowUrl: workflowRun.htmlUrl,
          status,
          startedAt
        }
      });
    } else if (
      status === "SUCCESS" ||
      status === "FAILED"
    ) {
      // GitHub's updatedAt represents the end of the workflow run.
      completedAt =
        deployment.completedAt ??
        new Date(workflowRun.updatedAt);

      duration =
        Math.max(
          0,
          Math.round(
            (
              completedAt.getTime() -
              startedAt.getTime()
            ) / 1000
          )
        );

      await prisma.deployment.update({
        where: {
          id: deployment.id
        },

        data: {
          workflowRunId: String(workflowRun.id),
          workflowUrl: workflowRun.htmlUrl,
          status,
          startedAt,
          completedAt,
          duration
        }
      });
    } else {
      await prisma.deployment.update({
        where: {
          id: deployment.id
        },

        data: {
          workflowRunId: String(workflowRun.id),
          workflowUrl: workflowRun.htmlUrl,
          status,
          startedAt
        }
      });
    }

    console.log(
      `Deployment #${deployment.id}: ${deployment.status} -> ${status}`
    );
  } catch (error) {
    console.error(
      `Failed to sync deployment ${deployment.id}:`,
      error
    );
  }
}

export async function checkDeployments() {
  try {
    // Only actively running deployments need polling.
    // SUCCESS and FAILED deployments are already finished
    // and should never be checked again.
    const deployments =
      await prisma.deployment.findMany({
        where: {
          status: "RUNNING",
          workflowRunId: {
            not: null
          }
        },

        orderBy: {
          createdAt: "desc"
        }
      });

    if (deployments.length === 0) {
      return;
    }

    console.log(
      `Checking ${deployments.length} active deployment(s)...`
    );

    for (const deployment of deployments) {
      await syncDeployment(deployment);
    }
  } catch (error) {
    console.error(
      "Deployment checker failed:",
      error
    );
  }
}

export function startDeploymentChecker() {
  console.log(
    "Deployment status checker started."
  );

  // Run immediately when the server starts.
  void checkDeployments();

  // Check every 10 seconds.
  setInterval(() => {
    void checkDeployments();
  }, 10_000);
}