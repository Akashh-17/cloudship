import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2, Check, GitBranch, Folder, Link2, Clock } from "lucide-react";
import AppShell from "../components/AppShell";
import StatusBadge from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
      } catch {
        /* keep polling */
      }
      delayMs = Math.min(delayMs * 1.2, 10000);
    };

    const interval = setInterval(poll, delayMs);
    return () => clearInterval(interval);
  }, [id, deployment?.status]);

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
      } catch {
        /* status polling still keeps the page usable */
      }
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

  const getStepState = (stepKey: string): "done" | "active" | "failed" | "pending" => {
    if (!deployment) return "pending";
    const stepKeys = BUILD_STEPS.map((s) => s.key);
    const currentIndex = stepKeys.indexOf(deployment.status);
    const stepIndex = stepKeys.indexOf(stepKey);

    if (deployment.status === "FAILED") {
      return stepIndex === currentIndex ? "failed" : stepIndex < currentIndex ? "done" : "pending";
    }
    if (deployment.status === "SUCCESS") return "done";
    if (stepIndex < currentIndex) return "done";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  if (notFound) {
    return (
      <AppShell>
        <Card className="flex flex-col items-center gap-2 px-6 py-20 text-center">
          <h3 className="font-display text-base font-semibold">Deployment not found</h3>
          <p className="text-sm text-muted-foreground">It may have been deleted, or you don't have access to it.</p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link to="/app">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to deployments
            </Link>
          </Button>
        </Card>
      </AppShell>
    );
  }

  if (!deployment) {
    return (
      <AppShell>
        <Skeleton className="h-6 w-40" />
        <Card className="mt-6 p-6">
          <Skeleton className="h-32 w-full" />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Deployments
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">
            {deployment.repoUrl.replace("https://github.com/", "")}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{deployment.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={deployment.status} />
          {deployment.status === "SUCCESS" && (
            <Button asChild variant="secondary" size="sm">
              <a href={cloudshipApi.getSiteUrl(deployment.id, deployment.liveUrl)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Visit site
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stepper + terminal */}
      <Card className="mt-6 p-6">
        <div className="flex items-center">
          {BUILD_STEPS.map((step, idx) => {
            const state = getStepState(step.key);
            return (
              <div key={step.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                      state === "done" && "border-success/30 bg-success/15 text-success",
                      state === "active" && "border-primary/40 bg-primary/15 text-primary",
                      state === "failed" && "border-destructive/40 bg-destructive/15 text-destructive",
                      state === "pending" && "border-white/10 bg-white/[0.03] text-muted-foreground"
                    )}
                  >
                    {state === "done" ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      state === "pending" ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < BUILD_STEPS.length - 1 && (
                  <div className={cn("mx-2 h-px flex-1 transition-colors", state === "done" ? "bg-success/30" : "bg-white/10")} />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-7 overflow-hidden rounded-xl border border-white/10 bg-[hsl(0_0%_4%)]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 font-mono text-xs text-muted-foreground">build.log</span>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed">
            {buildLogs.length === 0 && <span className="text-muted-foreground">Waiting for output…</span>}
            {buildLogs.map((log, index) => (
              <div key={index}>
                <span className="text-muted-foreground">[{log.timestamp}]</span> {log.text}
              </div>
            ))}
            {!TERMINAL_STATUSES.includes(deployment.status) && (
              <div className="flex items-center gap-1 text-muted-foreground">
                Streaming build output…
                <span className="inline-block h-3.5 w-1.5 animate-blink bg-primary" />
              </div>
            )}
          </div>
        </div>

        {deployment.status === "FAILED" && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {deployment.failureMessage || "Build failed. See the log above for the real error."}
          </div>
        )}
        {deployment.status === "CANCELLED" && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-muted-foreground">
            Deployment cancelled.
          </div>
        )}
      </Card>

      {/* Configuration */}
      <Card className="mt-6 p-6">
        <h2 className="font-display text-sm font-semibold">Configuration</h2>
        <div className="mt-4 grid grid-cols-4 gap-x-6 gap-y-5">
          <ConfigItem icon={GitBranch} label="Branch" value={deployment.branch || "main"} mono />
          <ConfigItem icon={Folder} label="Frontend directory" value={deployment.frontendDir || "./"} mono />
          <ConfigItem icon={Link2} label="Custom slug" value={deployment.customSlug || "—"} mono />
          <ConfigItem icon={Clock} label="Created" value={new Date(deployment.createdAt).toLocaleString()} />
        </div>
        {deployment.envVars && Object.keys(deployment.envVars).length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-muted-foreground">Environment variables</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(deployment.envVars).map((key) => (
                <Badge key={key} variant="mono">
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Push-to-deploy */}
      <Card className="mt-6 p-6">
        <h2 className="font-display text-sm font-semibold">Push-to-deploy</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add this as a webhook on the GitHub repository (Settings → Webhooks → Add webhook) to automatically
          redeploy this project whenever <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs">{deployment.branch || "main"}</code> is pushed to.
        </p>
        <Separator className="my-5" />
        <div className="grid grid-cols-2 gap-4">
          <ConfigItem label="Payload URL" value={cloudshipApi.getWebhookUrl()} mono />
          <ConfigItem label="Content type" value="application/json" mono />
          <ConfigItem label="Secret" value="Same as server's GITHUB_WEBHOOK_SECRET" />
          <ConfigItem label="Events" value="Just the push event" />
        </div>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deployment?</DialogTitle>
            <DialogDescription>
              This removes the deployment record and its S3 artifacts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ConfigItem({ icon: Icon, label, value, mono }: { icon?: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn("mt-1 truncate text-sm", mono && "font-mono text-[13px]")}>{value}</div>
    </div>
  );
}
