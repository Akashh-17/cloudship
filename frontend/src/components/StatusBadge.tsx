import { Loader2, CheckCircle2, XCircle, Ban, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Deployment } from "@/api/cloudship";

const CONFIG: Record<Deployment["status"], { label: string; variant: "success" | "destructive" | "warning" | "info" | "outline"; icon: React.ElementType; spin?: boolean }> = {
  QUEUED: { label: "Queued", variant: "outline", icon: Clock },
  CLONING: { label: "Cloning", variant: "info", icon: Loader2, spin: true },
  INSTALLING: { label: "Installing", variant: "info", icon: Loader2, spin: true },
  BUILDING: { label: "Building", variant: "warning", icon: Loader2, spin: true },
  UPLOADING: { label: "Uploading", variant: "warning", icon: Loader2, spin: true },
  SUCCESS: { label: "Ready", variant: "success", icon: CheckCircle2 },
  FAILED: { label: "Failed", variant: "destructive", icon: XCircle },
  CANCELLED: { label: "Cancelled", variant: "outline", icon: Ban },
};

export default function StatusBadge({ status, className }: { status: Deployment["status"]; className?: string }) {
  const { label, variant, icon: Icon, spin } = CONFIG[status];
  return (
    <Badge variant={variant} className={cn("uppercase", className)}>
      <Icon className={cn("h-3 w-3", spin && "animate-spin")} />
      {label}
    </Badge>
  );
}
