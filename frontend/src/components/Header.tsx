import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { User } from "../api/cloudship";

interface HeaderProps {
  user?: User | null;
  onLogout?: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <div className="site-header">
      <header className="site-header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Zap size={14} strokeWidth={2.5} fill="currentColor" />
          </span>
          CloudShip
        </Link>

        <div className="nav-actions">
          {user ? (
            <>
              <div className="user-chip">
                {user.avatarUrl && <img src={user.avatarUrl} alt={user.login} />}
                {user.login}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm btn-pill">
              Sign in with GitHub
            </Link>
          )}
        </div>
      </header>
    </div>
  );
}
