import { Link, useLocation } from "react-router-dom";
import { Zap, Rocket, LogOut } from "lucide-react";
import { User } from "../api/cloudship";

interface SidebarProps {
  user?: User | null;
  onLogout?: () => void;
  onNavigate?: () => void;
}

export default function Sidebar({ user, onLogout, onNavigate }: SidebarProps) {
  const location = useLocation();
  const isDeployments = location.pathname.startsWith("/app");

  return (
    <aside className="app-sidebar">
      <Link to="/" className="brand" style={{ marginBottom: "1.75rem" }}>
        <span className="brand-mark">
          <Zap size={14} strokeWidth={2.5} fill="currentColor" />
        </span>
        CloudShip
      </Link>

      <nav className="sidebar-nav">
        <Link
          to="/app"
          className={`sidebar-link ${isDeployments ? "is-active" : ""}`}
          onClick={onNavigate}
        >
          <Rocket size={16} />
          Deployments
        </Link>
      </nav>

      {user && (
        <div className="sidebar-footer">
          <div className="user-chip" style={{ width: "100%" }}>
            {user.avatarUrl && <img src={user.avatarUrl} alt={user.login} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.login}
            </span>
          </div>
          <button className="icon-btn" title="Log out" onClick={onLogout}>
            <LogOut size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}
