// =====================================================
// GitHub Service
// =====================================================

const getOctokit = async () => {
  const { Octokit } = await import("octokit");

  return new Octokit({
    auth: process.env.GITHUB_TOKEN
  });
};


// =====================================================
// GET REPOSITORY
// =====================================================

export async function getRepository(
  owner: string,
  repo: string
) {
  const octokit = await getOctokit();

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
  const octokit = await getOctokit();

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
  const octokit = await getOctokit();

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
// GET WORKFLOW RUN FOR EXACT COMMIT
// =====================================================

export async function getWorkflowRunForCommit(
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
) {
  const octokit = await getOctokit();

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
// GET GITHUB WORKFLOWS
// =====================================================

export async function getWorkflows(
  owner: string,
  repo: string
) {
  const octokit = await getOctokit();

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
// TRIGGER GITHUB ACTIONS WORKFLOW
// =====================================================

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  commitSha?: string
) {
  const { Octokit } = await import("octokit");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const response =
    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowFile,
      ref,
      inputs: commitSha
        ? {
            commit_sha: commitSha
          }
        : undefined
    });

  return {
    success: response.status === 204
  };
}