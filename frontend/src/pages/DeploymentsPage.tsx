import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Rocket, RefreshCw, AlertCircle } from "lucide-react";
import AppShell from "../components/AppShell";
import DeployForm from "../components/DeployForm";
import StatusBadge from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cloudshipApi } from "../api/cloudship";
import type { Deployment } from "../api/cloudship";

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cloudshipApi.listDeployments();
      setDeployments(data);
    } catch (err: any) {
      setError(err.message || "Failed to load deployments");
    } finally {
      setLoading(false);
    }
  };

  const handleDeployed = (deployment: Deployment) => {
    setDeployDialogOpen(false);
    navigate(`/app/deployments/${deployment.id}`);
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Deployments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every site you've shipped through CloudShip.</p>
        </div>
        <Button onClick={() => setDeployDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Deployment
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <Card className="mb-5 flex items-center justify-between gap-4 border-destructive/25 bg-destructive/[0.04] px-5 py-4">
            <div className="flex items-center gap-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </Card>
        )}

        {loading ? (
          <Card className="divide-y divide-white/8 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </Card>
        ) : error ? null : deployments.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary">
              <Rocket className="h-5 w-5" />
            </div>
            <h3 className="font-display text-base font-semibold">No deployments yet</h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              Paste a GitHub repo URL to deploy your first site in seconds.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setDeployDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Deployment
            </Button>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_120px_140px_120px_44px] gap-4 border-b border-white/8 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Repository</span>
              <span>Branch</span>
              <span>Status</span>
              <span>Deployed</span>
              <span />
            </div>
            <div className="divide-y divide-white/8">
              {deployments.map((d) => (
                <div
                  key={d.id}
                  onClick={() => navigate(`/app/deployments/${d.id}`)}
                  className="grid cursor-pointer grid-cols-[1fr_120px_140px_120px_44px] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{d.repoUrl.replace("https://github.com/", "")}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{d.id}</div>
                  </div>
                  <div className="font-mono text-sm text-muted-foreground">{d.branch || "main"}</div>
                  <div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
                    {d.status === "SUCCESS" && (
                      <a
                        href={cloudshipApi.getSiteUrl(d.id, d.liveUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
                        title="Visit site"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Deployment</DialogTitle>
            <DialogDescription>Connect a public GitHub repository and CloudShip takes care of the rest.</DialogDescription>
          </DialogHeader>
          <DeployForm onDeployed={handleDeployed} />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
