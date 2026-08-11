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

  const [repositoryUrl, setRepositoryUrl] = useState(
    ""
  );

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

      setCreateMessage(
        "Project created successfully!"
      );

      setProjectName("");
      setProjectDescription("");

      await fetchProjects();

      setTimeout(() => {
        setShowCreateForm(false);
        setCreateMessage("");
      }, 1000);
    } catch (error) {
      console.error(error);
      setCreateMessage(
        "Cannot connect to backend"
      );
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
        setDeploymentMessage(
          "Please select a project"
        );
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

      // Refresh deployments
      await handleViewDeployments(
        selectedProject
      );

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

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");

    setLoggedIn(false);
    setProjects([]);
    setSelectedProject(null);
    setDeployments([]);
  };

  // DASHBOARD
  if (loggedIn) {
    return (
      <div>
        <header>
          <h1>DeployFlow</h1>

          <button onClick={handleLogout}>
            Logout
          </button>
        </header>

        <main>
          <h2>Dashboard</h2>

          <p>
            Welcome to your deployment management
            dashboard.
          </p>

          <section>
            <h3>Projects</h3>

            {loadingProjects && (
              <p>Loading projects...</p>
            )}

            {!loadingProjects &&
              projects.length === 0 && (
                <p>No projects found.</p>
              )}

            {projects.map((project) => (
              <div key={project.id}>
                <h4>{project.name}</h4>

                <p>
                  {project.description}
                </p>

                <p>
                  Project ID: {project.id}
                </p>

                <button
                  onClick={() =>
                    handleViewDeployments(
                      project
                    )
                  }
                >
                  View Deployments
                </button>
              </div>
            ))}
          </section>

          <button
            onClick={() =>
              setShowCreateForm(true)
            }
          >
            + Create Project
          </button>

          {/* CREATE PROJECT FORM */}

          {showCreateForm && (
            <section>
              <h3>Create New Project</h3>

              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(e) =>
                  setProjectName(e.target.value)
                }
              />

              <br />
              <br />

              <textarea
                placeholder="Project description"
                value={projectDescription}
                onChange={(e) =>
                  setProjectDescription(
                    e.target.value
                  )
                }
              />

              <br />
              <br />

              <button
                onClick={
                  handleCreateProject
                }
              >
                Create Project
              </button>

              <button
                onClick={() =>
                  setShowCreateForm(false)
                }
              >
                Cancel
              </button>

              <p>{createMessage}</p>
            </section>
          )}

          {/* DEPLOYMENT SECTION */}

          {selectedProject && (
            <section>
              <h3>
                Deployments for{" "}
                {selectedProject.name}
              </h3>

              {/* CREATE DEPLOYMENT BUTTON */}

              <button
                onClick={() =>
                  setShowDeploymentForm(true)
                }
              >
                + Create Deployment
              </button>

              {/* CREATE DEPLOYMENT FORM */}

              {showDeploymentForm && (
                <section>
                  <h3>
                    Create New Deployment
                  </h3>

                  <input
                    type="text"
                    placeholder="GitHub repository URL"
                    value={repositoryUrl}
                    onChange={(e) =>
                      setRepositoryUrl(
                        e.target.value
                      )
                    }
                  />

                  <br />
                  <br />

                  <input
                    type="text"
                    placeholder="Branch"
                    value={branch}
                    onChange={(e) =>
                      setBranch(e.target.value)
                    }
                  />

                  <br />
                  <br />

                  <button
                    onClick={
                      handleCreateDeployment
                    }
                  >
                    Create Deployment
                  </button>

                  <button
                    onClick={() =>
                      setShowDeploymentForm(false)
                    }
                  >
                    Cancel
                  </button>

                  <p>
                    {deploymentMessage}
                  </p>
                </section>
              )}

              {loadingDeployments && (
                <p>
                  Loading deployments...
                </p>
              )}

              {!loadingDeployments &&
                deployments.length === 0 && (
                  <p>
                    No deployments found.
                  </p>
                )}

              {deployments.map(
                (deployment) => (
                  <div
                    key={deployment.id}
                  >
                    <h4>
                      Deployment #
                      {deployment.id}
                    </h4>

                    <p>
                      Repository:{" "}
                      {
                        deployment.repositoryUrl
                      }
                    </p>

                    <p>
                      Branch:{" "}
                      {deployment.branch}
                    </p>

                    <p>
                      Status:{" "}
                      {deployment.status}
                    </p>

                    <p>
                      Created:{" "}
                      {new Date(
                        deployment.createdAt
                      ).toLocaleString()}
                    </p>
                  </div>
                )
              )}

              <button
                onClick={() => {
                  setSelectedProject(null);
                  setDeployments([]);
                  setShowDeploymentForm(false);
                }}
              >
                Close
              </button>
            </section>
          )}
        </main>
      </div>
    );
  }

  // LOGIN PAGE

  return (
    <div>
      <h1>DeployFlow</h1>

      <p>
        Simple deployment management platform
      </p>

      <div>
        <h2>Login</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <br />
        <br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <br />
        <br />

        <button onClick={handleLogin}>
          Login
        </button>

        <p>{message}</p>
      </div>
    </div>
  );
}

export default App;