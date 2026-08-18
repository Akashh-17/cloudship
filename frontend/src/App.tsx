import { useState, useEffect } from "react";
import { cloudshipApi } from "./api/cloudship";
import type { Deployment } from "./api/cloudship";

interface EnvVarPair {
  id: string;
  key: string;
  value: string;
}

interface LogEntry {
  timestamp: string;
  text: string;
}

const BUILD_STEPS = [
  { key: "QUEUED", label: "Queued" },
  { key: "CLONING", label: "Cloning" },
  { key: "INSTALLING", label: "Installing" },
  { key: "BUILDING", label: "Building" },
  { key: "UPLOADING", label: "Uploading" },
  { key: "SUCCESS", label: "Live" },
];

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [frontendDir, setFrontendDir] = useState("./");
  const [customSlug, setCustomSlug] = useState("");
  const [envVars, setEnvVars] = useState<EnvVarPair[]>([]);

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(null);
  const [buildLogs, setBuildLogs] = useState<LogEntry[]>([]);
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

  // Poll active deployment & append terminal logs on status change
  useEffect(() => {
    if (!activeDeployment) return;

    const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString();
      setBuildLogs((prev) => {
        if (prev.some((log) => log.text === msg)) return prev;
        return [...prev, { timestamp: time, text: msg }];
      });
    };

    switch (activeDeployment.status) {
      case "QUEUED":
        addLog("QUEUED: Build job pushed to AWS SQS queue");
        break;
      case "CLONING":
        addLog("CLONING: Fetching repository main branch...");
        break;
      case "INSTALLING":
        addLog("INSTALLING: Running npm install in sandbox...");
        break;
      case "BUILDING":
        addLog("BUILDING: Executing production bundle build (npm run build)...");
        break;
      case "UPLOADING":
        addLog("UPLOADING: Transferring built static assets to AWS S3...");
        break;
      case "SUCCESS":
        addLog("SUCCESS: Deployment completed! Site is live on S3.");
        break;
      case "FAILED":
        addLog("FAILED: Build process failed. Check worker logs.");
        break;
    }

    if (["SUCCESS", "FAILED"].includes(activeDeployment.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await cloudshipApi.getDeploymentStatus(activeDeployment.id);
        setActiveDeployment(updated);
        loadDeployments();
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeDeployment?.status, activeDeployment?.id]);

  // Environment Variable Handlers
  const addEnvVar = () => {
    setEnvVars([
      ...envVars,
      { id: Date.now().toString(), key: "", value: "" },
    ]);
  };

  const removeEnvVar = (id: string) => {
    setEnvVars(envVars.filter((item) => item.id !== id));
  };

  const updateEnvVar = (id: string, field: "key" | "value", val: string) => {
    setEnvVars(
      envVars.map((item) =>
        item.id === id ? { ...item, [field]: val } : item
      )
    );
  };

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
    setBuildLogs([]);

    const formattedEnvVars: Record<string, string> = {};
    envVars.forEach((pair) => {
      if (pair.key.trim()) {
        formattedEnvVars[pair.key.trim()] = pair.value;
      }
    });

    try {
      const newDeployment = await cloudshipApi.createDeployment({
        repoUrl: repoUrl.trim(),
        branch: branch || "main",
        frontendDir: frontendDir.trim() || "./",
        customSlug: customSlug.trim() || undefined,
        envVars: Object.keys(formattedEnvVars).length > 0 ? formattedEnvVars : undefined,
      });

      setActiveDeployment(newDeployment);
      setRepoUrl("");
      setCustomSlug("");
      setEnvVars([]);
      loadDeployments();
    } catch (err: any) {
      setError(err.message || "Failed to start deployment");
    } finally {
      setLoading(false);
    }
  };

  const getStepClass = (stepKey: string) => {
    if (!activeDeployment) return "step-pending";

    const currentStatus = activeDeployment.status;
    const stepKeys = BUILD_STEPS.map((s) => s.key);
    const currentIndex = stepKeys.indexOf(currentStatus);
    const stepIndex = stepKeys.indexOf(stepKey);

    if (currentStatus === "FAILED") {
      return stepIndex === currentIndex ? "step-failed" : stepIndex < currentIndex ? "step-completed" : "step-pending";
    }

    if (currentStatus === "SUCCESS") return "step-completed";

    if (stepIndex < currentIndex) return "step-completed";
    if (stepIndex === currentIndex) return "step-active";
    return "step-pending";
  };

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="brand">⚡ CloudShip</div>
      </header>

      {/* Main Deployment Card */}
      <div className="card">
        <div className="card-title">New Project</div>
        <form onSubmit={handleDeploy}>
          {/* GitHub Repository URL */}
          <div className="form-group">
            <label htmlFor="repo">GitHub URL</label>
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

          {/* Row 2: Branch & Frontend Directory */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="branch">Branch</label>
              <select
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={loading}
              >
                <option value="main">main</option>
                <option value="master">master</option>
                <option value="dev">dev</option>
                <option value="staging">staging</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="frontendDir">Frontend Directory (Optional)</label>
              <input
                id="frontendDir"
                type="text"
                placeholder="./ (auto-detected)"
                value={frontendDir}
                onChange={(e) => setFrontendDir(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Custom URL (Optional) */}
          <div className="form-group">
            <label htmlFor="slug">Custom URL (Optional)</label>
            <input
              id="slug"
              type="text"
              placeholder="something-unique"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Environmental Variables (Optional) */}
          <div className="form-group">
            <div className="env-header">
              <label style={{ margin: 0 }}>Environmental Variables (Optional)</label>
              <button
                type="button"
                className="env-add-btn"
                onClick={addEnvVar}
                disabled={loading}
              >
                + Add Variable
              </button>
            </div>

            {envVars.map((pair) => (
              <div key={pair.id} className="env-row">
                <input
                  type="text"
                  placeholder="Name (e.g. VITE_API_URL)"
                  value={pair.key}
                  onChange={(e) => updateEnvVar(pair.id, "key", e.target.value)}
                  disabled={loading}
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder="Variable value"
                  value={pair.value}
                  onChange={(e) => updateEnvVar(pair.id, "value", e.target.value)}
                  disabled={loading}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="env-remove-btn"
                  onClick={() => removeEnvVar(pair.id)}
                  disabled={loading}
                >
                  -
                </button>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "DEPLOYING..." : "DEPLOY"}
          </button>
        </form>

        {/* Active Deployment & Stepper Output */}
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

            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
              Repo: {activeDeployment.repoUrl}
            </div>

            {/* Stepper */}
            <div className="stepper-container">
              {BUILD_STEPS.map((step, idx) => {
                const stateClass = getStepClass(step.key);
                return (
                  <div key={step.key} className={`step-item ${stateClass}`}>
                    <div className="step-circle">
                      {stateClass === "step-completed" ? "✓" : idx + 1}
                    </div>
                    <div className="step-label">{step.label}</div>
                  </div>
                );
              })}
            </div>

            {/* CRT Terminal Console */}
            <div className="terminal-box">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <div className="dot dot-red"></div>
                  <div className="dot dot-yellow"></div>
                  <div className="dot dot-green"></div>
                </div>
                <div>cloudship-worker.log</div>
              </div>
              <div className="terminal-body">
                {buildLogs.map((log, index) => (
                  <div key={index} className="terminal-log-line">
                    <span style={{ color: "#6b7280" }}>[{log.timestamp}]</span> {log.text}
                  </div>
                ))}
                {!["SUCCESS", "FAILED"].includes(activeDeployment.status) && (
                  <div className="terminal-log-line">
                    <span style={{ color: "var(--accent-gold)" }}>▶ Processing build job...</span>
                    <span className="terminal-cursor"></span>
                  </div>
                )}
              </div>
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
              <div className="error-text" style={{ marginTop: "0.75rem" }}>
                Build failed. Check AWS CloudWatch / SQS worker logs for details.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtask 4: Recent Deployments Table */}
      <div>
        <div className="recent-header">
          <div className="section-title">Recent Deployments</div>
          <div className="recent-count">Total: {deployments.length}</div>
        </div>

        {deployments.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            No deployments yet. Submit a repository URL above!
          </div>
        ) : (
          <table className="deploy-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Repository</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                    {d.id.substring(0, 14)}…
                  </td>
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
                        className="btn-visit-sm"
                      >
                        Visit ↗
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <footer>
        ⚡ CloudShip — Serverless Frontend Deployment Engine
      </footer>
    </div>
  );
}
