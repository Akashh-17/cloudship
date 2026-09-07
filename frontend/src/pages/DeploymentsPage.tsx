import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Rocket } from "lucide-react";
import AppShell from "../components/AppShell";
import Drawer from "../components/Drawer";
import DeployForm from "../components/DeployForm";
import { cloudshipApi } from "../api/cloudship";
import type { Deployment } from "../api/cloudship";

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const data = await cloudshipApi.listDeployments();
      setDeployments(data);
    } catch (err) {
      console.error("Failed to load deployments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeployed = (deployment: Deployment) => {
    setDrawerOpen(false);
    navigate(`/app/deployments/${deployment.id}`);
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deployments</h1>
          <p className="page-subtitle">Every site you've shipped through CloudShip.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
          <Plus size={15} />
          New Deployment
        </button>
      </div>

      {loading ? (
        <div className="panel">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : deployments.length === 0 ? (
        <div className="empty-state">
          <div className="icon-badge icon-badge-accent" style={{ margin: "0 auto 1rem" }}>
            <Rocket size={16} />
          </div>
          <h3>No deployments yet</h3>
          <p>Paste a GitHub repo URL to deploy your first site.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setDrawerOpen(true)}>
            <Plus size={14} />
            New Deployment
          </button>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="deploy-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Deployed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr
                  key={d.id}
                  className="table-row-link"
                  onClick={() => navigate(`/app/deployments/${d.id}`)}
                >
                  <td>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                      {d.repoUrl.replace("https://github.com/", "")}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      {d.id}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {d.branch || "main"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${d.status}`}>{d.status}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {d.status === "SUCCESS" && (
                      <a
                        href={cloudshipApi.getSiteUrl(d.id, d.liveUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn"
                        title="Visit site"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer title="New Deployment" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <DeployForm onDeployed={handleDeployed} />
      </Drawer>
    </AppShell>
  );
}
