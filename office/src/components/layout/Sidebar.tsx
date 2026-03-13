import { memo, useState, useEffect, useRef } from "react";
import { Plus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { SidebarFleetStatus } from "./SidebarFleetStatus";
import { SpawnAgentDialog } from "@/components/agents/SpawnAgentDialog";
import { cn } from "@/lib/cn";
import type { AgentState } from "@/lib/types";

interface SidebarProps {
  /** Currently active hash route (without "#") */
  activeRoute: string;
  agents: AgentState[];
  connected: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Whether the mobile overlay is open (only meaningful on <768px) */
  mobileOpen: boolean;
  /** Called to close the mobile overlay */
  onMobileClose: () => void;
}

/**
 * Sidebar shell.
 *
 * Desktop (≥768px):
 * - Expanded: 220px — icon + label per nav item
 * - Collapsed: 56px — icon-only with title tooltips
 *
 * Mobile (<768px, rendered inside `md:hidden` in AppShell):
 * - Fixed left-edge overlay (z-50) with translucent backdrop
 * - Slides in when `mobileOpen` is true, hidden otherwise
 * - Closes on nav item click, backdrop click, or Escape key
 */
export const Sidebar = memo(function Sidebar({
  activeRoute,
  agents,
  connected,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [spawnOpen, setSpawnOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Lock body scroll while mobile overlay is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Mobile backdrop ──────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}

      {/* ── Sidebar panel ────────────────────────────────────────────────────── */}
      <aside
        id="mobile-sidebar"
        ref={sidebarRef}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? "true" : undefined}
        aria-label="Navigation menu"
        className={cn(
          "flex flex-col shrink-0 h-full",
          "border-r transition-[transform,width] duration-200 ease-in-out",
          // Mobile: fixed overlay, slide in/out via translate
          "fixed top-0 left-0 z-50 h-dvh w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static in flow, collapse-width aware
          "md:static md:translate-x-0",
          collapsed ? "md:w-14" : "md:w-[220px]"
        )}
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
        }}
      >
        {/* ── Brand header ─────────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center shrink-0 px-3 h-12 border-b",
            collapsed && "md:justify-center md:px-0"
          )}
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {/* Mobile: always show full brand + close button */}
          <div className="md:hidden flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <img
                src="/office/tigersoft-logo-trimmed.png"
                alt="TigerSoft"
                style={{ height: 20, width: "auto", objectFit: "contain" }}
              />
              <span
                className="text-[11px] font-bold tracking-[2px] uppercase"
                style={{ color: "var(--color-accent-brand)" }}
              >
                TigerSpace
              </span>
            </div>
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Close navigation menu"
              className="flex items-center justify-center w-11 h-11 rounded-md transition-colors hover:bg-white/[0.06]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Desktop: icon-only when collapsed, full brand when expanded */}
          <div className="hidden md:flex items-center w-full">
            {collapsed ? (
              <img
                src="/office/tigersoft-logo-trimmed.png"
                alt="TigerSoft"
                style={{ height: 20, width: "auto", objectFit: "contain" }}
              />
            ) : (
              <div className="flex items-center gap-2 overflow-hidden">
                <img
                  src="/office/tigersoft-logo-trimmed.png"
                  alt="TigerSoft"
                  style={{ height: 20, width: "auto", objectFit: "contain" }}
                />
                <span
                  className="text-[11px] font-bold tracking-[2px] uppercase truncate"
                  style={{ color: "var(--color-accent-brand)" }}
                >
                  TigerSpace
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Fleet status ─────────────────────────────────────────────────── */}
        <div className="mt-3">
          <SidebarFleetStatus
            agents={agents}
            connected={connected}
            collapsed={collapsed}
          />
        </div>

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto mt-3 pb-2">
          <SidebarNav
            activeRoute={activeRoute}
            collapsed={collapsed}
            onNavClick={onMobileClose}
          />
        </div>

        {/* ── Spawn Agent button ────────────────────────────────────────────── */}
        <div
          className={cn(
            "px-2 py-3 border-t",
            collapsed && "md:flex md:justify-center"
          )}
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <button
            type="button"
            onClick={() => setSpawnOpen(true)}
            aria-label="Spawn Agent"
            className={cn(
              "flex items-center gap-2 rounded-md px-3",
              "text-[12px] font-medium transition-colors duration-150",
              "hover:bg-white/[0.08]",
              // Mobile: full-width with 44px touch target
              "w-full min-h-[44px]",
              // Desktop collapsed: icon-only square
              "md:w-full",
              collapsed && "md:w-10 md:h-10 md:min-h-0 md:justify-center md:px-0"
            )}
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-accent-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <Plus size={14} className="shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>Spawn Agent</span>
          </button>
        </div>

        <SpawnAgentDialog open={spawnOpen} onOpenChange={setSpawnOpen} />

        {/* ── Collapse toggle (desktop only) ────────────────────────────────── */}
        <div
          className={cn(
            "hidden md:flex pb-3 px-2",
            collapsed ? "justify-center" : "justify-end"
          )}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]",
              "hover:bg-white/[0.06]"
            )}
            style={{ color: "var(--color-text-muted)" }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>
    </>
  );
});
