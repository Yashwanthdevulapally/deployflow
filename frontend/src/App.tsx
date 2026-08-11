import { useEffect, useState } from "react";

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
  commitSha: string | null;
  commitMessage: string | null;
  workflowRunId: string | null;
  workflowUrl: string | null;
  status: string;
  createdAt: string;
  projectId: number;
}

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

  const [deployments, setDeployments] =
    useState<Deployment[]>([]);

  const [loadingDeployments, setLoadingDeployments] =
    useState(false);

  const [showDeploymentForm, setShowDeploymentForm] =
    useState(false);

  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [deploymentMessage, setDeploymentMessage] =
    useState("");

  // LOGIN
  const handleLogin = async () => {
    try {
      setMessage("Logging in...");

      const response = await fetch(
        "http://localhost:5001/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
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

  // GET PROJECTS
  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);

      const token = localStorage.getItem("token");

      const response = await fetch(
        "http://localhost:5001/api/projects",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
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

  // CREATE PROJECT
  const handleCreateProject = async () => {
    try {
      setCreateMessage("");

      if (!projectName.trim()) {
        setCreateMessage("Project name is required");
        return;
      }

      const token = localStorage.getItem("token");

      const response = await fetch(
        "http://localhost:5001/api/projects",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: projectName,
            description: projectDescription
          })
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

  // VIEW DEPLOYMENTS
  const handleViewDeployments = async (
    project: Project
  ) => {
    try {
      setSelectedProject(project);
      setLoadingDeployments(true);
      setDeployments([]);

      const token = localStorage.getItem("token");

      const response = await fetch(
        `http://localhost:5001/api/deployments/project/${project.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
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

  // CREATE DEPLOYMENT
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
        "http://localhost:5001/api/deployments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            projectId: selectedProject.id,
            repositoryUrl,
            branch: branch || "main"
          })
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

      await handleViewDeployments(selectedProject);

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

  // SYNC DEPLOYMENT WITH GITHUB ACTIONS
  const handleSyncDeployment = async (
    deploymentId: number
  ) => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `http://localhost:5001/api/deployments/${deploymentId}/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(data);
        return;
      }

      if (selectedProject) {
        await handleViewDeployments(selectedProject);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");

    setLoggedIn(false);
    setProjects([]);
    setSelectedProject(null);
    setDeployments([]);
  };

  const getStatusClass = (status: string) => {
    return `status status-${status.toLowerCase()}`;
  };

  // DASHBOARD
  if (loggedIn) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <h1>DeployFlow</h1>
            <span className="subtitle">
              Deployment Management Platform
            </span>
          </div>

          <button
            className="button secondary"
            onClick={handleLogout}
          >
            Logout
          </button>
        </header>

        <main className="dashboard">
          <div className="dashboard-heading">
            <div>
              <h2>Dashboard</h2>
              <p>
                Manage projects and track deployments.
              </p>
            </div>

            <button
              className="button primary"
              onClick={() =>
                setShowCreateForm(true)
              }
            >
              + Create Project
            </button>
          </div>

          {/* PROJECTS */}
          <section className="panel">
            <div className="panel-heading">
              <h3>Projects</h3>
              <span className="count">
                {projects.length}
              </span>
            </div>

            {loadingProjects && (
              <p className="muted">
                Loading projects...
              </p>
            )}

            {!loadingProjects &&
              projects.length === 0 && (
                <p className="muted">
                  No projects found.
                </p>
              )}

            <div className="project-grid">
              {projects.map((project) => (
                <div
                  className="project-card"
                  key={project.id}
                >
                  <div>
                    <h4>{project.name}</h4>

                    <p>
                      {project.description ||
                        "No description provided."}
                    </p>

                    <span className="project-id">
                      Project #{project.id}
                    </span>
                  </div>

                  <button
                    className="button secondary"
                    onClick={() =>
                      handleViewDeployments(project)
                    }
                  >
                    View Deployments
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* CREATE PROJECT */}
          {showCreateForm && (
            <section className="panel form-panel">
              <h3>Create New Project</h3>

              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(e) =>
                  setProjectName(e.target.value)
                }
              />

              <textarea
                placeholder="Project description"
                value={projectDescription}
                onChange={(e) =>
                  setProjectDescription(
                    e.target.value
                  )
                }
              />

              <div className="form-actions">
                <button
                  className="button primary"
                  onClick={handleCreateProject}
                >
                  Create Project
                </button>

                <button
                  className="button secondary"
                  onClick={() =>
                    setShowCreateForm(false)
                  }
                >
                  Cancel
                </button>
              </div>

              {createMessage && (
                <p className="form-message">
                  {createMessage}
                </p>
              )}
            </section>
          )}

          {/* DEPLOYMENTS */}
          {selectedProject && (
            <section className="panel deployments-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    Deployments for{" "}
                    {selectedProject.name}
                  </h3>

                  <p className="muted">
                    Track GitHub commits and Actions.
                  </p>
                </div>

                <div className="heading-actions">
                  <button
                    className="button primary"
                    onClick={() =>
                      setShowDeploymentForm(true)
                    }
                  >
                    + Create Deployment
                  </button>

                  <button
                    className="button secondary"
                    onClick={() => {
                      setSelectedProject(null);
                      setDeployments([]);
                      setShowDeploymentForm(false);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* CREATE DEPLOYMENT FORM */}
              {showDeploymentForm && (
                <div className="deployment-form">
                  <h4>Create New Deployment</h4>

                  <input
                    type="text"
                    placeholder="GitHub repository URL"
                    value={repositoryUrl}
                    onChange={(e) =>
                      setRepositoryUrl(e.target.value)
                    }
                  />

                  <input
                    type="text"
                    placeholder="Branch"
                    value={branch}
                    onChange={(e) =>
                      setBranch(e.target.value)
                    }
                  />

                  <div className="form-actions">
                    <button
                      className="button primary"
                      onClick={
                        handleCreateDeployment
                      }
                    >
                      Create Deployment
                    </button>

                    <button
                      className="button secondary"
                      onClick={() =>
                        setShowDeploymentForm(false)
                      }
                    >
                      Cancel
                    </button>
                  </div>

                  {deploymentMessage && (
                    <p className="form-message">
                      {deploymentMessage}
                    </p>
                  )}
                </div>
              )}

              {loadingDeployments && (
                <p className="muted">
                  Loading deployments...
                </p>
              )}

              {!loadingDeployments &&
                deployments.length === 0 && (
                  <p className="muted">
                    No deployments found.
                  </p>
                )}

              {/* DEPLOYMENT CARDS */}
              <div className="deployment-list">
                {deployments.map((deployment) => (
                  <div
                    className="deployment-card"
                    key={deployment.id}
                  >
                    <div className="deployment-header">
                      <div>
                        <h4>
                          Deployment #{deployment.id}
                        </h4>

                        <p className="deployment-date">
                          {new Date(
                            deployment.createdAt
                          ).toLocaleString()}
                        </p>
                      </div>

                      <span
                        className={getStatusClass(
                          deployment.status
                        )}
                      >
                        {deployment.status}
                      </span>
                    </div>

                    <div className="deployment-details">
                      <div>
                        <span className="detail-label">
                          Repository
                        </span>

                        <a
                          href={deployment.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {deployment.repositoryUrl}
                        </a>
                      </div>

                      <div>
                        <span className="detail-label">
                          Branch
                        </span>

                        <code>
                          {deployment.branch}
                        </code>
                      </div>

                      {deployment.commitSha && (
                        <div>
                          <span className="detail-label">
                            Commit
                          </span>

                          <code>
                            {deployment.commitSha.slice(
                              0,
                              7
                            )}
                          </code>

                          {deployment.commitMessage && (
                            <span className="commit-message">
                              {deployment.commitMessage}
                            </span>
                          )}
                        </div>
                      )}

                      {deployment.workflowRunId && (
                        <div>
                          <span className="detail-label">
                            GitHub Actions
                          </span>

                          <span>
                            Run #
                            {deployment.workflowRunId}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="deployment-actions">
                      {deployment.workflowUrl && (
                        <a
                          className="button secondary"
                          href={deployment.workflowUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View GitHub Actions
                        </a>
                      )}

                      {deployment.commitSha &&
                        deployment.status !==
                          "SUCCESS" && (
                          <button
                            className="button secondary"
                            onClick={() =>
                              handleSyncDeployment(
                                deployment.id
                              )
                            }
                          >
                            Sync Status
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // LOGIN PAGE
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <h1>DeployFlow</h1>

          <p>
            Simple deployment management platform
          </p>
        </div>

        <h2>Welcome back</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button
          className="button primary login-button"
          onClick={handleLogin}
        >
          Login
        </button>

        {message && (
          <p className="form-message">{message}</p>
        )}
      </div>
    </div>
  );
}

export default App;
