import { useEffect, useMemo, useState } from "react";
import "./App.css";

interface Project {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  userId: number;
}

interface Deployment {
  id: number;
  repositoryUrl: string;
  branch: string;
  workflow: string;
  status: string;
  createdAt: string;
  projectId: number;
  commitSha?: string;
  commitMessage?: string;
  workflowRunId?: string;
  workflowUrl?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  jobs?: DeploymentJob[];
}

interface DeploymentJob {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  htmlUrl: string;
}

const API_BASE_URL = "http://localhost:5001";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const [loggedIn, setLoggedIn] = useState(
    Boolean(localStorage.getItem("token"))
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [expandedDeployment, setExpandedDeployment] = useState<number | null>(null);
  const [loadingJobs, setLoadingJobs] = useState<number | null>(null);

  const [showDeploymentForm, setShowDeploymentForm] = useState(false);

  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [workflow, setWorkflow] = useState("deployflow.yml");
  const [workflows, setWorkflows] = useState<{ id: number; name: string; path: string; state: string }[]>([]);
  const [deploymentMessage, setDeploymentMessage] = useState("");

  const [activePage, setActivePage] = useState("Dashboard");

  const successfulDeployments = useMemo(
    () => deployments.filter((d) => d.status === "SUCCESS").length,
    [deployments]
  );

  const failedDeployments = useMemo(
    () => deployments.filter((d) => d.status === "FAILED").length,
    [deployments]
  );

  // ---------------- LOGIN ----------------

  const handleLogin = async () => {
    try {
      setMessage("Logging in...");

      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);

      setMessage("");
      setLoggedIn(true);
    } catch (error) {
      console.error(error);
      setMessage("Cannot connect to backend");
    }
  };

  // ---------------- PROJECTS ----------------

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);

      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/projects`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(data);
        return;
      }

      setProjects(data.projects);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (loggedIn) {
      fetchProjects();
    }
  }, [loggedIn]);

  // ---------------- CREATE PROJECT ----------------

  const handleCreateProject = async () => {
    try {
      setCreateMessage("");

      if (!projectName.trim()) {
        setCreateMessage("Project name is required");
        return;
      }

      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/projects`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setCreateMessage(
          data.message || "Failed to create project"
        );
        return;
      }

      setCreateMessage("Project created successfully!");

      setProjectName("");
      setProjectDescription("");

      await fetchProjects();

      setTimeout(() => {
        setShowCreateForm(false);
        setCreateMessage("");
      }, 1000);
    } catch (error) {
      console.error(error);
      setCreateMessage("Cannot connect to backend");
    }
  };

  // ---------------- DEPLOYMENTS ----------------

  const handleViewDeployments = async (
    project: Project
  ) => {
    try {
      setSelectedProject(project);
      setLoadingDeployments(true);
      setDeployments([]);

      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/deployments/project/${project.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(data);
        return;
      }

      setDeployments(data.deployments);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDeployments(false);
    }
  };

  const handleFetchWorkflows = async () => {
    if (!repositoryUrl.trim()) {
      setWorkflows([]);
      setWorkflow("");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/deployments/workflows?repositoryUrl=${encodeURIComponent(repositoryUrl.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          "Failed to fetch workflows:",
          data.message
        );
        setWorkflows([]);
        setWorkflow("");
        return;
      }

      setWorkflows(data.workflows || []);

      if (data.workflows?.length > 0) {
        const firstWorkflow = data.workflows[0];
        setWorkflow(
          firstWorkflow.path.split("/").pop() || ""
        );
      } else {
        setWorkflow("");
      }
    } catch (error) {
      console.error(
        "Error fetching workflows:",
        error
      );
      setWorkflows([]);
      setWorkflow("");
    }
  };

  useEffect(() => {
    if (!showDeploymentForm || !repositoryUrl.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      handleFetchWorkflows();
    }, 500);

    return () => clearTimeout(timer);
  }, [repositoryUrl, showDeploymentForm]);
  const fetchDeploymentJobs = async (
    deploymentId: number
  ) => {
    const token = localStorage.getItem("token");

    try {
      setLoadingJobs(deploymentId);

      const response = await fetch(
        `${API_BASE_URL}/api/deployments/${deploymentId}/jobs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Failed to fetch deployment jobs");
        return;
      }

      setDeployments((currentDeployments) =>
        currentDeployments.map((deployment) =>
          deployment.id === deploymentId
            ? {
                ...deployment,
                jobs: data.jobs,
              }
            : deployment
        )
      );

      setExpandedDeployment(deploymentId);
    } catch (error) {
      console.error(
        "Failed to fetch deployment jobs:",
        error
      );

      alert("Failed to fetch deployment jobs");
    } finally {
      setLoadingJobs(null);
    }
  };

  const rollbackDeployment = async (
    deploymentId: number
  ) => {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/deployments/${deploymentId}/rollback`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Rollback failed");
        return;
      }

      alert("Rollback deployment created successfully");

      setDeployments((currentDeployments) => [
        data.deployment,
        ...currentDeployments,
      ]);

      if (data.deployment?.id) {
        void pollDeploymentStatus(data.deployment.id);
      }
    } catch (error) {
      console.error("Rollback failed:", error);
      alert("Rollback failed");
    }
  };
const retryDeployment = async (
  deploymentId: number
) => {
  const token = localStorage.getItem("token");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/deployments/${deploymentId}/retry`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      alert(
        data.message ||
          "Failed to retry deployment"
      );
      return;
    }

    alert(
      "Retry deployment created successfully"
    );

    if (data.deployment) {
      setDeployments((currentDeployments) => [
        data.deployment,
        ...currentDeployments,
      ]);

      if (data.deployment.id) {
        void pollDeploymentStatus(
          data.deployment.id
        );
      }
    }

  } catch (error) {
    console.error(
      "Retry deployment failed:",
      error
    );

    alert(
      "Failed to retry deployment"
    );
  }
};

  const pollDeploymentStatus = async (
  deploymentId: number
) => {
  const token = localStorage.getItem("token");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/deployments/${deploymentId}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Failed to get deployment status:",
        data.message
      );
      return true;
    }

    setDeployments((currentDeployments) =>
      currentDeployments.map((deployment) =>
        deployment.id === deploymentId
          ? {
              ...deployment,
              status: data.status,
              workflowRunId:
                data.workflowRunId ??
                deployment.workflowRunId,
              workflowUrl:
                data.workflowUrl ??
                deployment.workflowUrl,
              startedAt:
                data.startedAt ??
                deployment.startedAt,
              completedAt:
                data.completedAt ??
                deployment.completedAt,
              duration:
                data.duration ??
                deployment.duration,
            }
          : deployment
      )
    );

    // Stop polling when GitHub finishes
    if (
      data.status === "SUCCESS" ||
      data.status === "FAILED"
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(
      "Error checking deployment status:",
      error
    );

    return false;
  }
};
  const handleCreateDeployment = async () => {
    try {
      setDeploymentMessage("");

      if (!selectedProject) {
        setDeploymentMessage("Please select a project");
        return;
      }

      if (!repositoryUrl.trim()) {
        setDeploymentMessage(
          "Repository URL is required"
        );
        return;
      }

      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/deployments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: selectedProject.id,
            repositoryUrl,
            branch: branch || "main",
            workflow: workflow || "deployflow.yml",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setDeploymentMessage(
          data.message ||
            "Failed to create deployment"
        );
        return;
      }

      setDeploymentMessage(
        "Deployment created successfully!"
      );

      setRepositoryUrl("");
      setBranch("main");
      setWorkflow("");
      setWorkflows([]);

      await handleViewDeployments(selectedProject);
      const deploymentId = data.deployment?.id;

if (deploymentId) {
  const interval = setInterval(
    async () => {
      const finished =
        await pollDeploymentStatus(
          deploymentId
        );

      if (finished) {
        clearInterval(interval);

        // Refresh deployment history
        await handleViewDeployments(
          selectedProject
        );
      }
    },
    3000
  );
}
      setTimeout(() => {
        setShowDeploymentForm(false);
        setDeploymentMessage("");
      }, 1000);
    } catch (error) {
      console.error(error);

      setDeploymentMessage(
        "Cannot connect to backend"
      );
    }
  };

  // ---------------- LOGOUT ----------------

  const handleLogout = () => {
    localStorage.removeItem("token");

    setLoggedIn(false);
    setProjects([]);
    setSelectedProject(null);
    setDeployments([]);
  };

  // ---------------- LOGIN SCREEN ----------------

  if (!loggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-glow glow-one" />
        <div className="auth-glow glow-two" />

        <div className="auth-container">
          <div className="auth-brand">
            <div className="brand-mark">
              DF
            </div>

            <span>DeployFlow</span>
          </div>

          <div className="auth-card">
            <div className="auth-heading">
              <span className="eyebrow">
                DEPLOYMENT PLATFORM
              </span>

              <h1>Welcome back</h1>

              <p>
                Manage projects, deployments and
                GitHub Actions from one place.
              </p>
            </div>

            <div className="form-group">
              <label>Email</label>

              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label>Password</label>
              </div>

              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleLogin();
                  }
                }}
              />
            </div>

            <button
              className="primary-button full-width"
              onClick={handleLogin}
            >
              Sign in
              <span>→</span>
            </button>

            {message && (
              <div className="error-message">
                {message}
              </div>
            )}

            <div className="auth-footer">
              <span className="status-dot" />
              DeployFlow services ready
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- DASHBOARD ----------------

  return (
    <div className="app-shell">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="sidebar-brand">
          <div className="brand-mark">
            DF
          </div>

          <div>
            <strong>DeployFlow</strong>
            <span>DevOps Platform</span>
          </div>
        </div>

        <nav className="sidebar-nav">

          <button
            className={
              activePage === "Dashboard"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setActivePage("Dashboard")}
          >
            <span className="nav-icon">⌂</span>
            Dashboard
          </button>

          <button
            className={
              activePage === "Projects"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setActivePage("Projects")}
          >
            <span className="nav-icon">▣</span>
            Projects
          </button>

          <button
            className={
              activePage === "Deployments"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setActivePage("Deployments")
            }
          >
            <span className="nav-icon">⇧</span>
            Deployments
          </button>
        </nav>

        <div className="sidebar-bottom">

          <div className="system-card">
            <div className="system-header">
              <span className="status-dot" />
              System status
            </div>

            <strong>All systems operational</strong>

            <span>
              Backend · Database · GitHub
            </span>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            <span>↪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}

      <main className="main-content">

        <header className="topbar">

          <div>
            <span className="breadcrumb">
              Workspace / {activePage}
            </span>

            <h1>
              {activePage}
            </h1>
          </div>

          <div className="topbar-actions">

            <div className="online-badge">
              <span className="status-dot" />
              Online
            </div>

            <button
              className="primary-button"
              onClick={() =>
                setShowCreateForm(true)
              }
            >
              + New Project
            </button>
          </div>
        </header>

        {/* DASHBOARD */}

        {activePage === "Dashboard" && (
          <>
            <section className="hero-section">

              <div>
                <span className="eyebrow">
                  DEPLOYMENT OVERVIEW
                </span>

                <h2>
                  Ship with confidence.
                </h2>

                <p>
                  Monitor your projects and track
                  GitHub Actions deployments from a
                  single dashboard.
                </p>
              </div>

              <div className="hero-decoration">
                <div className="pipeline-line">
                  <span />
                  <span />
                  <span />
                </div>

                <div className="pipeline-label">
                  GitHub → Actions → Deploy
                </div>
              </div>
            </section>

            <section className="stats-grid">

              <div className="stat-card">
                <div className="stat-icon purple">
                  ▣
                </div>

                <div>
                  <span>Total projects</span>
                  <strong>{projects.length}</strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon blue">
                  ⇧
                </div>

                <div>
                  <span>Deployments</span>
                  <strong>{deployments.length}</strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon green">
                  ✓
                </div>

                <div>
                  <span>Successful</span>
                  <strong>
                    {successfulDeployments}
                  </strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon red">
                  !
                </div>

                <div>
                  <span>Failed</span>
                  <strong>
                    {failedDeployments}
                  </strong>
                </div>
              </div>

            </section>
          </>
        )}

        {/* PROJECTS */}

        {(activePage === "Dashboard" ||
          activePage === "Projects") && (
          <section className="content-section">

            <div className="section-heading">

              <div>
                <span className="eyebrow">
                  WORKSPACES
                </span>

                <h2>Your projects</h2>

                <p>
                  Manage applications and their
                  deployment pipelines.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={() =>
                  setShowCreateForm(true)
                }
              >
                + Create Project
              </button>

            </div>

            {loadingProjects ? (
              <div className="empty-card">
                <div className="spinner" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-card">
                <div className="empty-icon">
                  ▣
                </div>

                <h3>
                  No projects yet
                </h3>

                <p>
                  Create your first project to start
                  tracking deployments.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    setShowCreateForm(true)
                  }
                >
                  Create your first project
                </button>
              </div>
            ) : (
              <div className="project-grid">

                {projects.map((project) => (
                  <div
                    className="project-card"
                    key={project.id}
                  >

                    <div className="project-card-top">

                      <div className="project-avatar">
                        {project.name
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <span className="project-status">
                        Active
                      </span>

                    </div>

                    <h3>
                      {project.name}
                    </h3>

                    <p className="project-description">
                      {project.description ||
                        "No description provided."}
                    </p>

                    <div className="project-meta">
                      <span>
                        ID #{project.id}
                      </span>

                      <span>
                        {new Date(
                          project.createdAt
                        ).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      className="project-button"
                      onClick={() =>
                        handleViewDeployments(
                          project
                        )
                      }
                    >
                      View deployments
                      <span>→</span>
                    </button>

                  </div>
                ))}

              </div>
            )}

          </section>
        )}

        {/* DEPLOYMENTS */}

        {(activePage === "Dashboard" ||
          activePage === "Deployments") &&
          selectedProject && (
            <section className="content-section">

              <div className="section-heading">

                <div>
                  <span className="eyebrow">
                    DEPLOYMENT HISTORY
                  </span>

                  <h2>
                    {selectedProject.name}
                  </h2>

                  <p>
                    GitHub Actions deployment
                    activity.
                  </p>
                </div>

                <div className="heading-actions">

                  <button
                    className="secondary-button"
                    onClick={() =>
                      handleViewDeployments(
                        selectedProject
                      )
                    }
                  >
                    Refresh
                  </button>

                  <button
                    className="primary-button"
                    onClick={() =>
                      setShowDeploymentForm(true)
                    }
                  >
                    + Deploy
                  </button>

                </div>

              </div>

              {loadingDeployments ? (
                <div className="empty-card">
                  <div className="spinner" />
                  Loading deployments...
                </div>
              ) : deployments.length === 0 ? (
                <div className="empty-card compact">
                  <div className="empty-icon">
                    ⇧
                  </div>

                  <h3>
                    No deployments yet
                  </h3>

                  <p>
                    Create your first deployment
                    for this project.
                  </p>

                  <button
                    className="primary-button"
                    onClick={() =>
                      setShowDeploymentForm(true)
                    }
                  >
                    Create deployment
                  </button>
                </div>
              ) : (
                <div className="deployment-list">

                  {deployments.map(
                    (deployment) => (
                      <div
                        className="deployment-card"
                        key={deployment.id}
                      >

                        <div className="deployment-main">

                          <div className="deployment-icon">
                            ⇧
                          </div>

                          <div className="deployment-info">

                            <div className="deployment-title">

                              <strong>
                                Deployment #
                                {deployment.id}
                              </strong>

                              <StatusBadge
                                status={
                                  deployment.status
                                }
                              />

                            </div>

                            <div className="deployment-repo">
                              {deployment.repositoryUrl}
                            </div>

                            <div className="deployment-meta">

                              <span>
                                ◇{" "}
                                {deployment.branch}
                              </span>

                              <span>
                                ⚙{" "}
                                {deployment.workflow || "deploy.yml"}
                              </span>

                              <span>
                                {new Date(
                                  deployment.createdAt
                                ).toLocaleString()}
                              </span>

                              {deployment.commitSha && (
                                <span>
                                  #
                                  {deployment.commitSha.slice(
                                    0,
                                    7
                                  )}
                                </span>
                              )}

                            </div>

                            {deployment.commitMessage && (
                              <div className="commit-message">
                                {deployment.commitMessage}
                              </div>
                            )}

                            {(deployment.startedAt ||
                              deployment.completedAt ||
                              deployment.duration !== undefined) && (
                              <div className="deployment-observability">

                                {deployment.startedAt && (
                                  <span>
                                    Started:{" "}
                                    {new Date(
                                      deployment.startedAt
                                    ).toLocaleString()}
                                  </span>
                                )}

                                {deployment.completedAt && (
                                  <span>
                                    Completed:{" "}
                                    {new Date(
                                      deployment.completedAt
                                    ).toLocaleString()}
                                  </span>
                                )}

                                {deployment.duration !== undefined &&
                                  deployment.duration !== null && (
                                    <span>
                                      Duration:{" "}
                                      {deployment.duration}s
                                    </span>
                                  )}

                                {deployment.workflowRunId && (
                                  <span>
                                    Run #{deployment.workflowRunId}
                                  </span>
                                )}

                              </div>
                            )}

                          </div>

                        </div>

                        <button
                          className="secondary-button"
                          onClick={() => rollbackDeployment(deployment.id)}
                          disabled={
                            deployment.status === "PENDING" ||
                            deployment.status === "RUNNING"
                          }
                        >
                          Rollback
                        </button>

                        {deployment.workflowUrl && (
                          <a
                            className="github-link"
                            href={
                              deployment.workflowUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            GitHub Actions ↗
                          </a>
                        )}

                        {deployment.workflowRunId && (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              fetchDeploymentJobs(
                                deployment.id
                              )
                            }
                            disabled={
                              loadingJobs === deployment.id
                            }
                          >
                            {loadingJobs === deployment.id
                              ? "Loading..."
                              : expandedDeployment === deployment.id
                              ? "Hide jobs"
                              : "View jobs"}
                          </button>
                        )}

                        {expandedDeployment === deployment.id && (
                          <div className="deployment-jobs">
                            {deployment.jobs &&
                            deployment.jobs.length > 0 ? (
                              deployment.jobs.map((job) => (
                                <div
                                  key={job.id}
                                  className="deployment-job"
                                >
                                  <strong>
                                    {job.name}
                                  </strong>

                                  <span>
                                    Status: {job.status}
                                  </span>

                                  <span>
                                    Conclusion:{" "}
                                    {job.conclusion || "—"}
                                  </span>

                                  {job.startedAt && (
                                    <span>
                                      Started:{" "}
                                      {new Date(
                                        job.startedAt
                                      ).toLocaleString()}
                                    </span>
                                  )}

                                  {job.completedAt && (
                                    <span>
                                      Completed:{" "}
                                      {new Date(
                                        job.completedAt
                                      ).toLocaleString()}
                                    </span>
                                  )}

                                  <a
                                    className="github-link"
                                    href={job.htmlUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View job ↗
                                  </a>
                                </div>
                              ))
                            ) : (
                              <div>
                                No jobs found for this deployment.
                              </div>
                            )}
                          </div>
                        )}
{deployment.status === "FAILED" && (
  <button
    className="secondary-button"
    onClick={() =>
      retryDeployment(deployment.id)
    }
  >
    Retry
  </button>
)}
                      </div>
                    )
                  )}

                </div>
              )}

            </section>
          )}

      </main>

      {/* CREATE PROJECT MODAL */}

      {showCreateForm && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowCreateForm(false)
          }
        >
          <div
            className="modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>
                <span className="eyebrow">
                  NEW PROJECT
                </span>

                <h2>
                  Create project
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setShowCreateForm(false)
                }
              >
                ×
              </button>

            </div>

            <div className="form-group">
              <label>Project name</label>

              <input
                type="text"
                placeholder="My awesome project"
                value={projectName}
                onChange={(e) =>
                  setProjectName(e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label>Description</label>

              <textarea
                placeholder="What are you deploying?"
                value={projectDescription}
                onChange={(e) =>
                  setProjectDescription(
                    e.target.value
                  )
                }
              />
            </div>

            {createMessage && (
              <div className="success-message">
                {createMessage}
              </div>
            )}

            <div className="modal-actions">

              <button
                className="secondary-button"
                onClick={() =>
                  setShowCreateForm(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                onClick={handleCreateProject}
              >
                Create project
              </button>

            </div>

          </div>
        </div>
      )}

      {/* CREATE DEPLOYMENT MODAL */}

      {showDeploymentForm &&
        selectedProject && (
          <div
            className="modal-overlay"
            onClick={() =>
              setShowDeploymentForm(false)
            }
          >
            <div
              className="modal"
              onClick={(e) =>
                e.stopPropagation()
              }
            >

              <div className="modal-header">

                <div>
                  <span className="eyebrow">
                    NEW DEPLOYMENT
                  </span>

                  <h2>
                    Deploy {selectedProject.name}
                  </h2>
                </div>

                <button
                  className="close-button"
                  onClick={() =>
                    setShowDeploymentForm(false)
                  }
                >
                  ×
                </button>

              </div>

              <div className="form-group">

                <label>
                  GitHub repository
                </label>

                <input
                  type="text"
                  placeholder="https://github.com/user/repository"
                  value={repositoryUrl}
                  onChange={(e) =>
                    setRepositoryUrl(
                      e.target.value
                    )
                  }
                />

              </div>

              <div className="form-group">

                <label>
                  Branch
                </label>

                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) =>
                    setBranch(e.target.value)
                  }
                />

              </div>

              <div className="form-group">

                <label>
                  GitHub Actions workflow
                </label>

                <select
                  value={workflow}
                  onChange={(e) =>
                    setWorkflow(e.target.value)
                  }
                  disabled={workflows.length === 0}
                >
                  {workflows.length === 0 ? (
                    <option value="">
                      No workflows found
                    </option>
                  ) : (
                    workflows.map((item) => (
                      <option
                        key={item.id}
                        value={item.path.split("/").pop() || ""}
                      >
                        {item.name} ({item.path.split("/").pop()})
                      </option>
                    ))
                  )}
                </select>

                <small>
                  Workflows are automatically loaded from .github/workflows/
                </small>

              </div>

              <div className="deploy-info">
                <span>Deployment pipeline</span>

                <div className="pipeline">
                  <span>GitHub</span>
                  <b>→</b>
                  <span>Actions</span>
                  <b>→</b>
                  <span>Deploy</span>
                </div>
              </div>

              {deploymentMessage && (
                <div
                  className={
                    deploymentMessage.includes(
                      "successfully"
                    )
                      ? "success-message"
                      : "error-message"
                  }
                >
                  {deploymentMessage}
                </div>
              )}

              <div className="modal-actions">

                <button
                  className="secondary-button"
                  onClick={() =>
                    setShowDeploymentForm(false)
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  onClick={
                    handleCreateDeployment
                  }
                >
                  Start deployment
                  <span>→</span>
                </button>

              </div>

            </div>
          </div>
        )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = status.toLowerCase();

  return (
    <span
      className={`status-badge ${normalized}`}
    >
      <span className="status-dot" />
      {status}
    </span>
  );
}

export default App;