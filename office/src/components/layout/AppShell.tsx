import { useState } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import type { AgentState } from "@/lib/types";

interface AppShellProps {
  /** Currently active hash route (without "#") */
  route: string;
  agents: AgentState[];
  connected: boolean;
  children: React.ReactNode;
}

/**
 * Root layout shell for all routes.
 *
 * Structure:
 * ```
 * <div flex h-dvh>          ← full viewport, no scroll on root
 *   <Sidebar />             ← fixed-width, 220px / 56px collapsed
 *   <main flex-1 scroll>   ← all route content renders here
 * ```
 *
 * Sidebar collapse state lives here so it persists across route changes.
 */
export function AppShell({ route, agents, connected, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="flex h-dvh overflow-hidden"
      style={{ background: "var(--color-bg-base)", fontFamily: "var(--font-sans)" }}
    >
      <Sidebar
        activeRoute={route}
        agents={agents}
        connected={connected}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />
      <main
        className="flex-1 overflow-y-auto relative"
        style={{ minWidth: 0 }}
      >
        {children}
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
