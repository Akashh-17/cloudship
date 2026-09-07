import { Navigate, useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import { cloudshipApi } from "../api/cloudship";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={14} strokeWidth={2.5} fill="currentColor" />
          </span>
          CloudShip
        </div>
        <h1>Sign in to continue</h1>
        <p>Connect your GitHub account to deploy and manage your sites.</p>

        <a href={cloudshipApi.getGitHubLoginUrl()} className="btn btn-github">
          Sign in with GitHub
        </a>

        {error && <div className="login-error">Sign-in failed. Please try again.</div>}
      </div>
    </div>
  );
}
