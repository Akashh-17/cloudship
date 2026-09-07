import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "../hooks/useAuth";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="app-sidebar-desktop">
        <Sidebar user={user} onLogout={logout} />
      </div>

      <div className="app-mobile-bar">
        <button className="icon-btn" onClick={() => setMobileNavOpen(true)} title="Open menu">
          <Menu size={16} />
        </button>
      </div>

      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
          <div className="mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-btn"
              style={{ alignSelf: "flex-end", marginBottom: "1rem" }}
              onClick={() => setMobileNavOpen(false)}
              title="Close menu"
            >
              <X size={16} />
            </button>
            <Sidebar user={user} onLogout={logout} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <main className="app-main">{children}</main>
    </div>
  );
}
