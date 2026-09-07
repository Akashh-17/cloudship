import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import AppShell from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { cloudshipApi } from "../api/cloudship";
import type { Deployment } from "../api/cloudship";

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

  const TERMINAL_STATUSES = ["SUCCESS", "FAILED", "CANCELLED"];

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [buildLogs, setBuildLogs] = useState<LogEntry[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    cloudshipApi
      .getDeploymentStatus(id)
      .then(setDeployment)
      .catch(() => setNotFound(true));
  }, [id]);

  // Poll while the build is active. Cleanup always runs; backoff caps the
  // worst-case polling duration.
  useEffect(() => {
    if (!id || !deployment || TERMINAL_STATUSES.includes(deployment.status)) return;

    let delayMs = 2500;
    let pollCount = 0;
    const MAX_POLLS = 144;

    const poll = async () => {
      if (pollCount++ > MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      try {
        const updated = await cloudshipApi.getDeploymentStatus(id);
        setDeployment(updated);
      } catch (err) {
        console.error("Polling error:", err);
      }
      delayMs = Math.min(delayMs * 1.2, 10000);
    };

    const interval = setInterval(poll, delayMs);
    return () => clearInterval(interval);
  }, [id, deployment?.status]);

  // Cursor-based polling works behind API Gateway/Lambda and does not keep an
  // expensive connection open per dashboard user.
  useEffect(() => {
    if (!id || !deployment) return;
    let cursor = 0;
    let alive = true;
    const read = async () => {
      try {
        const delta = await cloudshipApi.getLogDelta(id, cursor);
        cursor = delta.cursor;
        if (alive && delta.lines.length) {
          setBuildLogs((prev) => [...prev, ...delta.lines.map((text) => ({ timestamp: new Date().toLocaleTimeString(), text }))]);
        }
      } catch { /* status polling still keeps the page usable */ }
    };
    read();
    if (TERMINAL_STATUSES.includes(deployment.status)) return () => { alive = false; };
    const interval = window.setInterval(read, 2_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [id, deployment?.status]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await cloudshipApi.deleteDeployment(id);
      navigate("/app");
    } catch (err: any) {
      window.alert(err.message || "Failed to delete deployment");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const getStepClass = (stepKey: string) => {
    if (!deployment) return "step-pending";
    const stepKeys = BUILD_STEPS.map((s) => s.key);
    const currentIndex = stepKeys.indexOf(deployment.status);
    const stepIndex = stepKeys.indexOf(stepKey);

    if (deployment.status === "FAILED") {
      return stepIndex === currentIndex ? "step-failed" : stepIndex < currentIndex ? "step-completed" : "step-pending";
    }
    if (deployment.status === "SUCCESS") return "step-completed";
    if (stepIndex < currentIndex) return "step-completed";
    if (stepIndex === currentIndex) return "step-active";
    return "step-pending";
  };

  if (notFound) {
    return (
      <AppShell>
        <div className="empty-state">
          <h3>Deployment not found</h3>
          <p>It may have been deleted, or you don't have access to it.</p>
          <Link to="/app" className="btn btn-ghost btn-sm">
            Back to deployments
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!deployment) {
    return (
      <AppShell>
        <div className="panel">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/app" className="back-link">
        <ArrowLeft size={14} />
        Deployments
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem" }}>
            {deployment.repoUrl.replace("https://github.com/", "")}
          </h1>
          <p className="page-subtitle">{deployment.id}</p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <span className={`badge badge-${deployment.status}`}>{deployment.status}</span>
          {deployment.status === "SUCCESS" && (
            <a
              href={cloudshipApi.getSiteUrl(deployment.id, deployment.liveUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              <ExternalLink size={14} />
              Visit site
            </a>
          )}
          <button className="icon-btn icon-btn-danger" title="Delete deployment" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="stepper-container">
          {BUILD_STEPS.map((step, idx) => {
            const stateClass = getStepClass(step.key);
            return (
              <div key={step.key} className={`step-item ${stateClass}`}>
                <div className="step-circle">{stateClass === "step-completed" ? "✓" : idx + 1}</div>
                <div className="step-label">{step.label}</div>
              </div>
            );
          })}
        </div>

        <div className="terminal">
          <div className="terminal-titlebar">
            <div className="terminal-dots">
              <span /><span /><span />
            </div>
            <div className="terminal-title">build.log</div>
          </div>
          <div className="terminal-body">
            {buildLogs.length === 0 && (
              <span style={{ color: "var(--text-muted)" }}>Waiting for output…</span>
            )}
            {buildLogs.map((log, index) => (
              <div key={index}>
                <span style={{ color: "var(--text-muted)" }}>[{log.timestamp}]</span> {log.text}
              </div>
            ))}
            {!TERMINAL_STATUSES.includes(deployment.status) && (
              <div>
                <span style={{ color: "var(--text-muted)" }}>Streaming build output…</span>
                <span className="terminal-cursor" />
              </div>
            )}
          </div>
        </div>

        {deployment.status === "FAILED" && (
          <div className="error-text" style={{ marginTop: "0.75rem" }}>
            {deployment.failureMessage || "Build failed. See the log above for the real error."}
          </div>
        )}
        {deployment.status === "CANCELLED" && (
          <div className="error-text" style={{ marginTop: "0.75rem" }}>Deployment cancelled.</div>
        )}
      </div>

      <div className="panel meta-panel">
        <div className="panel-title">Configuration</div>
        <div className="meta-grid">
          <div>
            <div className="meta-label">Branch</div>
            <div className="meta-value">{deployment.branch || "main"}</div>
          </div>
          <div>
            <div className="meta-label">Frontend directory</div>
            <div className="meta-value">{deployment.frontendDir || "./"}</div>
          </div>
          <div>
            <div className="meta-label">Custom slug</div>
            <div className="meta-value">{deployment.customSlug || "—"}</div>
          </div>
          <div>
            <div className="meta-label">Created</div>
            <div className="meta-value">{new Date(deployment.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="meta-label">Environment variables</div>
            <div className="meta-value">
              {deployment.envVars && Object.keys(deployment.envVars).length > 0
                ? Object.keys(deployment.envVars).join(", ")
                : "None"}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this deployment?"
        body="This removes the deployment record and its S3 artifacts. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </AppShell>
  );
}
