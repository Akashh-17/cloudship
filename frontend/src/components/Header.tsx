import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@/api/cloudship";

interface HeaderProps {
  user?: User | null;
  onLogout?: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/70 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary">
            <Zap className="h-3.5 w-3.5 fill-white text-white" strokeWidth={2.5} />
          </span>
          CloudShip
        </Link>

        <nav className="flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm">
                {user.avatarUrl && <img src={user.avatarUrl} alt={user.login} className="h-6 w-6 rounded-full" />}
                <span className="font-medium">{user.login}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={onLogout}>
                Log out
              </Button>
              <Button asChild size="sm">
                <Link to="/app">Dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/login">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
