import { Link, useLocation } from "react-router-dom";
import { Zap, Rocket, LogOut, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { User } from "../api/cloudship";

interface SidebarProps {
  user?: User | null;
  onLogout?: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const location = useLocation();
  const isDeployments = location.pathname.startsWith("/app");

  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2 px-5 pt-6 pb-8 font-display text-[15px] font-semibold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary">
          <Zap className="h-3.5 w-3.5 fill-white text-white" strokeWidth={2.5} />
        </span>
        CloudShip
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        <Link
          to="/app"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isDeployments ? "bg-white/8 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          <Rocket className="h-4 w-4" />
          Deployments
        </Link>
      </nav>

      {user && (
        <div className="border-t border-white/8 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.login} className="h-7 w-7 shrink-0 rounded-full" />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-primary" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.login}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <div className="px-2.5 py-1.5">
                <p className="text-sm font-medium">{user.login}</p>
                {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
