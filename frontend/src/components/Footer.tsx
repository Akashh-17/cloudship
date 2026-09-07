import { Zap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page">
        <div className="footer-bottom" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="brand" style={{ fontSize: "0.9rem" }}>
            <span className="brand-mark">
              <Zap size={13} strokeWidth={2.5} fill="currentColor" />
            </span>
            CloudShip
          </div>
          <span>© {new Date().getFullYear()} CloudShip</span>
        </div>

        <div className="footer-status">
          <span className="footer-status-dot">All systems operational</span>
          <span>v1.0.0</span>
        </div>
      </div>
    </footer>
  );
}
