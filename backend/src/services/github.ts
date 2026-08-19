export async function getRepository(
  owner: string,
  repo: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response = await octokit.rest.repos.get({
    owner,
    repo
  });

  return {
    name: response.data.name,
    fullName: response.data.full_name,
    owner: response.data.owner.login,
    defaultBranch: response.data.default_branch,
    htmlUrl: response.data.html_url
  };
}


// =====================================================
// GET LATEST COMMIT
// =====================================================

export async function getLatestCommit(
  owner: string,
  repo: string,
  branch: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: branch
  });

  return {
    sha: response.data.sha,
    message: response.data.commit.message,
    author: response.data.commit.author?.name ?? null,
    date: response.data.commit.author?.date ?? null,
    htmlUrl: response.data.html_url
  };
}


// =====================================================
// GET LATEST WORKFLOW RUN
// =====================================================

export async function getLatestWorkflowRun(
  owner: string,
  repo: string,
  branch: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      per_page: 1
    });

  const run = response.data.workflow_runs[0];

  if (!run) {
    return null;
  }

  return {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}


// =====================================================
// GET WORKFLOW RUN FOR SPECIFIC COMMIT
// =====================================================

export async function getWorkflowRunForCommit(
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      head_sha: commitSha,
      per_page: 10
    });

  const run = response.data.workflow_runs[0];

  if (!run) {
    return null;
  }

  return {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}


// =====================================================
// GET REPOSITORY WORKFLOWS
// =====================================================

export async function getWorkflows(
  owner: string,
  repo: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.listRepoWorkflows({
      owner,
      repo
    });

  return response.data.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    htmlUrl: workflow.html_url
  }));
}


// =====================================================
// GET WORKFLOW RUN BY ID
// =====================================================

export async function getWorkflowRunById(
  owner: string,
  repo: string,
  runId: number
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId
    });

  const run = response.data;

  return {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}


// =====================================================
// TRIGGER GITHUB ACTIONS WORKFLOW
// =====================================================
//
// Normal deployment:
// triggerWorkflow(
//   owner,
//   repo,
//   workflow,
//   "main"
// )
//
// Rollback:
// triggerWorkflow(
//   owner,
//   repo,
//   workflow,
//   "main",
//   oldCommitSha
// )
//
// IMPORTANT:
// ref = branch/tag where GitHub loads the workflow
//
// deploySha = actual commit that checkout should deploy
// =====================================================

// =====================================================
// TRIGGER GITHUB ACTIONS WORKFLOW
// =====================================================
//
// ref:
//   Branch/tag where GitHub loads the workflow.
//
// deploySha:
//   Optional commit that the workflow should actually
//   checkout and deploy.
//
// Normal deployment:
//   triggerWorkflow(owner, repo, workflow, "main")
//
// Rollback:
//   triggerWorkflow(
//     owner,
//     repo,
//     workflow,
//     "main",
//     previousCommitSha
//   )
//
// =====================================================

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  deploySha?: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  // -------------------------------------------------
  // Get existing workflow runs BEFORE dispatch
  // -------------------------------------------------

  const before =
    await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowFile,
      branch: ref,
      event: "workflow_dispatch",
      per_page: 10
    });

  const existingRunIds = new Set(
    before.data.workflow_runs.map(
      (run) => run.id
    )
  );

  // -------------------------------------------------
  // Trigger workflow
  // -------------------------------------------------

  const dispatchStartedAt = new Date();

  const response =
    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowFile,
      ref,
      inputs: deploySha
        ? {
            deploy_sha: deploySha
          }
        : undefined
    });

  if (response.status !== 204) {
    throw new Error(
      `GitHub workflow dispatch failed with status ${response.status}`
    );
  }

  console.log(
    `GitHub workflow dispatched: ${workflowFile}`
  );

  // -------------------------------------------------
  // Wait for GitHub to create the NEW workflow run
  // -------------------------------------------------

  let workflowRun = null;

  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, 2000)
    );

    const runs =
      await octokit.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowFile,
        branch: ref,
        event: "workflow_dispatch",
        per_page: 100
      });

    workflowRun =
      runs.data.workflow_runs.find((run) => {
        const createdAt = new Date(run.created_at);

        return (
          !existingRunIds.has(run.id) &&
          createdAt >= dispatchStartedAt
        );
      });

    if (workflowRun) {
      break;
    }

    console.log(
      `Waiting for NEW GitHub workflow run... attempt ${attempt}/15`
    );
  }

  // -------------------------------------------------
  // Make sure run was created
  // -------------------------------------------------

  if (!workflowRun) {
    throw new Error(
      "Workflow was dispatched successfully, but GitHub workflow run could not be found"
    );
  }

  console.log(
    `GitHub workflow run created: ${workflowRun.id}`
  );

  // -------------------------------------------------
  // Return workflow information
  // -------------------------------------------------

  return {
    success: true,
    workflowRunId: workflowRun.id,
    workflowUrl: workflowRun.html_url
  };
}

// =====================================================
// GET WORKFLOW RUN JOBS
// =====================================================

export async function getWorkflowRunJobs(
  owner: string,
  repo: string,
  runId: number
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
      per_page: 100
    });

  return response.data.jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    htmlUrl: job.html_url
  }));
}


// =====================================================
// GET GITHUB ACTIONS JOB LOGS
// =====================================================

export async function getWorkflowJobLogs(
  owner: string,
  repo: string,
  jobId: number
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: jobId,
      request: {
        redirect: "manual"
      }
    });

  const location =
    response.headers.location;

  if (!location) {
    throw new Error(
      "GitHub did not return a log download URL"
    );
  }

  const logsResponse =
    await fetch(location);

  if (!logsResponse.ok) {
    throw new Error(
      `Failed to download GitHub job logs: ${logsResponse.status}`
    );
  }

  const logs =
    await logsResponse.text();

  return logs;
}
