import { memo, useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
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
}

/**
 * Fixed-width sidebar shell.
 * - Expanded: 220px — icon + label per nav item
 * - Collapsed: 56px — icon-only with title tooltips
 *
 * Includes SidebarNav, SidebarFleetStatus summary, a stub Spawn Agent button,
 * and a collapse toggle at the bottom.
 */
export const Sidebar = memo(function Sidebar({
  activeRoute,
  agents,
  connected,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [spawnOpen, setSpawnOpen] = useState(false);

  return (
    <aside
      aria-label="Sidebar navigation"
      className={cn(
        "flex flex-col shrink-0 h-full",
        "border-r transition-all duration-200 ease-in-out",
        collapsed ? "w-14" : "w-[220px]"
      )}
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* ── Brand header ───────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center shrink-0 px-3 h-12 border-b",
          collapsed && "justify-center px-0"
        )}
        style={{ borderColor: "var(--color-border-default)" }}
      >
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

      {/* ── Fleet status ───────────────────────────────────────────────────── */}
      <div className="mt-3">
        <SidebarFleetStatus agents={agents} connected={connected} collapsed={collapsed} />
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto mt-3 pb-2">
        <SidebarNav activeRoute={activeRoute} collapsed={collapsed} />
      </div>

      {/* ── Spawn Agent button ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "px-2 py-3 border-t",
          collapsed && "flex justify-center"
        )}
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <button
          type="button"
          onClick={() => setSpawnOpen(true)}
          aria-label="Spawn Agent"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2",
            "text-[12px] font-medium transition-colors duration-150",
            "hover:bg-white/[0.08]",
            collapsed ? "w-10 h-10 justify-center px-0" : "w-full"
          )}
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-accent-primary)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <Plus size={14} className="shrink-0" />
          {!collapsed && <span>Spawn Agent</span>}
        </button>
      </div>

      <SpawnAgentDialog open={spawnOpen} onOpenChange={setSpawnOpen} />

      {/* ── Collapse toggle ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex pb-3 px-2",
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
  );
});
