import { useState, useEffect } from "react";
import { cloudshipApi } from "./api/cloudship";
import type { Deployment } from "./api/cloudship";

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing deployments on mount
  useEffect(() => {
    loadDeployments();
  }, []);

  const loadDeployments = async () => {
    try {
      const data = await cloudshipApi.listDeployments();
      setDeployments(data);
    } catch (err: any) {
      console.error("Failed to load deployments:", err);
    }
  };

  // Poll active deployment if it exists and is in progress
  useEffect(() => {
    if (!activeDeployment) return;
    if (["SUCCESS", "FAILED"].includes(activeDeployment.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await cloudshipApi.getDeploymentStatus(activeDeployment.id);
        setActiveDeployment(updated);
        // Refresh full list too
        loadDeployments();
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeDeployment]);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL");
      return;
    }
    if (!repoUrl.trim().startsWith("https://github.com/")) {
      setError("URL must start with https://github.com/");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const newDeployment = await cloudshipApi.createDeployment(repoUrl.trim());
      setActiveDeployment(newDeployment);
      setRepoUrl("");
      loadDeployments();
    } catch (err: any) {
      setError(err.message || "Failed to start deployment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="brand">⚡ CloudShip</div>
        <div className="status-indicator">
          <span className="dot-online"></span>
          API Connected
        </div>
      </header>

      {/* Main Deployment Card */}
      <div className="card">
        <div className="card-title">Deploy Project</div>
        <form onSubmit={handleDeploy}>
          <div className="form-group">
            <label htmlFor="repo">GitHub Repository URL</label>
            <input
              id="repo"
              type="text"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={loading}
            />
            {error && <div className="error-text">{error}</div>}
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Submitting..." : "Deploy"}
          </button>
        </form>

        {/* Active Deployment Output */}
        {activeDeployment && (
          <div className="active-build">
            <div className="active-header">
              <span>
                <strong>ID:</strong> {activeDeployment.id}
              </span>
              <span className={`badge badge-${activeDeployment.status}`}>
                {activeDeployment.status}
              </span>
            </div>

            <div style={{ fontSize: "0.85rem", color: "#8a8d9b", marginTop: "0.5rem" }}>
              Repo: {activeDeployment.repoUrl}
            </div>

            {activeDeployment.status === "SUCCESS" && (
              <a
                href={cloudshipApi.getSiteUrl(activeDeployment.id, activeDeployment.liveUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-visit"
              >
                View Deployed Site 🚀
              </a>
            )}

            {activeDeployment.status === "FAILED" && (
              <div className="error-text" style={{ marginTop: "0.5rem" }}>
                Build failed. Check AWS CloudWatch / SQS worker logs for details.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Deployments Section */}
      <div>
        <div className="section-title">Recent Deployments</div>
        {deployments.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "#8a8d9b" }}>
            No deployments yet. Submit a repository URL above!
          </div>
        ) : (
          <table className="deploy-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Repository</th>
                <th>Status</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td>{d.id.substring(0, 14)}…</td>
                  <td>
                    <a
                      href={d.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="repo-link"
                    >
                      {d.repoUrl.replace("https://github.com/", "")}
                    </a>
                  </td>
                  <td>
                    <span className={`badge badge-${d.status}`}>{d.status}</span>
                  </td>
                  <td>
                    {d.status === "SUCCESS" ? (
                      <a
                        href={cloudshipApi.getSiteUrl(d.id, d.liveUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#10b981", fontWeight: 600, textDecoration: "none" }}
                      >
                        Visit ↗
                      </a>
                    ) : (
                      <span style={{ color: "#8a8d9b" }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
