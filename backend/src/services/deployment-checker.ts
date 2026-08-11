import { prisma } from "../prisma";
import { getWorkflowRunForCommit } from "./github";

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
    status: string;
  }
) {
  if (!deployment.commitSha) {
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
    const workflowRun = await getWorkflowRunForCommit(
      repository.owner,
      repository.repo,
      deployment.branch,
      deployment.commitSha
    );

    if (!workflowRun) {
      console.log(
        `No GitHub Actions run found for deployment ${deployment.id}`
      );
      return;
    }

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

    await prisma.deployment.update({
      where: {
        id: deployment.id
      },
      data: {
        workflowRunId: String(workflowRun.id),
        workflowUrl: workflowRun.htmlUrl,
        status
      }
    });

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
    const deployments =
      await prisma.deployment.findMany({
        where: {
          status: {
            in: ["PENDING", "RUNNING"]
          },
          commitSha: {
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
      `Checking ${deployments.length} deployment(s)...`
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