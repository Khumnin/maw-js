import { useState, useCallback, useEffect } from "react";
import { Menu } from "lucide-react";
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
 * Structure (desktop, ≥768px):
 * ```
 * <div flex h-dvh>
 *   <Sidebar />             ← fixed-width, 220px / 56px collapsed
 *   <main flex-1 scroll>
 * ```
 *
 * Structure (mobile, <768px):
 * ```
 * <div flex-col h-dvh>
 *   <TopBar hamburger />    ← 48px top bar with ☰ button
 *   <main flex-1 scroll>
 *   <Sidebar overlay />     ← fixed overlay, slide-in from left, z-50
 * ```
 *
 * Sidebar collapse state (desktop) and mobile-open state both live here so
 * they persist across route changes.
 */
export function AppShell({ route, agents, connected, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  // Mobile sidebar does not support collapse — provide a stable no-op
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = useCallback(() => {}, []);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen, closeMobile]);

  return (
    <div
      className="flex h-dvh overflow-hidden"
      style={{ background: "var(--color-bg-base)", fontFamily: "var(--font-sans)" }}
    >
      {/* ── Desktop sidebar (hidden on mobile) ──────────────────────────────── */}
      <div className="hidden md:flex">
        <Sidebar
          activeRoute={route}
          agents={agents}
          connected={connected}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          mobileOpen={false}
          onMobileClose={closeMobile}
        />
      </div>

      {/* ── Mobile overlay sidebar ──────────────────────────────────────────── */}
      <div className="md:hidden">
        <Sidebar
          activeRoute={route}
          agents={agents}
          connected={connected}
          collapsed={false}
          onToggleCollapse={noop}
          mobileOpen={mobileOpen}
          onMobileClose={closeMobile}
        />
      </div>

      {/* ── Main content column ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
        {/* Mobile top bar — only visible below md */}
        <div
          className="md:hidden flex items-center h-12 px-3 shrink-0 border-b"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar"
            className="flex items-center justify-center w-11 h-11 rounded-md transition-colors hover:bg-white/[0.06]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2 ml-2">
            <img
              src="/office/tigersoft-logo-trimmed.png"
              alt="TigerSoft"
              style={{ height: 18, width: "auto", objectFit: "contain" }}
            />
            <span
              className="text-[11px] font-bold tracking-[2px] uppercase"
              style={{ color: "var(--color-accent-brand)" }}
            >
              TigerSpace
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto relative" style={{ minWidth: 0 }}>
          {children}
        </main>
      </div>

      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
