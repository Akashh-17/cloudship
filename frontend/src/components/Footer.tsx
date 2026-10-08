import { Zap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="container flex items-center justify-between gap-4 py-8">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-primary">
            <Zap className="h-2.5 w-2.5 fill-white text-white" strokeWidth={2.5} />
          </span>
          <span>© {new Date().getFullYear()} CloudShip</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          All systems operational
          <span className="text-white/15">·</span>
          <span className="font-mono">v1.0.0</span>
        </div>
      </div>
    </footer>
  );
}
