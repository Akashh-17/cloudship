import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { useAuth } from "../hooks/useAuth";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-64 shrink-0 border-r border-white/8">
        <Sidebar user={user} onLogout={logout} />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="container max-w-6xl py-10">{children}</div>
      </main>
    </div>
  );
}
