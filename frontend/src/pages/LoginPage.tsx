import { Navigate, useSearchParams, Link } from "react-router-dom";
import { Zap, AlertCircle } from "lucide-react";
import GithubIcon from "../components/icons/GithubIcon";
import AuroraBackground from "../components/AuroraBackground";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AuroraBackground />

      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 font-display text-[15px] font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary">
            <Zap className="h-3.5 w-3.5 fill-white text-white" strokeWidth={2.5} />
          </span>
          CloudShip
        </Link>

        <Card className="glow-ring p-8 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your GitHub account to deploy and manage your sites.
          </p>

          <Button asChild size="lg" className="mt-7 w-full">
            <a href={cloudshipApi.getGitHubLoginUrl()}>
              <GithubIcon className="h-4 w-4" />
              Continue with GitHub
            </a>
          </Button>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-left text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Sign-in failed. Please try again.
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            By continuing you agree to CloudShip deploying public repositories on your behalf.
          </p>
        </Card>
      </div>
    </div>
  );
}
