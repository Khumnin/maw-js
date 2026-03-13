import { memo } from "react";
import { Activity } from "lucide-react";
import type { AgentState } from "@/lib/types";
import { cn } from "@/lib/cn";

interface SidebarFleetStatusProps {
  agents: AgentState[];
  connected: boolean;
  collapsed: boolean;
}

/**
 * Compact fleet status summary shown at the top of the sidebar.
 * Displays total agent count and how many are actively working,
 * with a live connection indicator dot.
 */
export const SidebarFleetStatus = memo(function SidebarFleetStatus({
  agents,
  connected,
  collapsed,
}: SidebarFleetStatusProps) {
  const total = agents.length;
  const working = agents.filter((a) => a.status === "working").length;

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-1 py-3 px-2 mx-2 rounded-md"
        style={{ background: "var(--color-bg-elevated)" }}
        title={`${total} agents · ${working} working · ${connected ? "Live" : "Reconnecting"}`}
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            connected ? "bg-emerald-400 shadow-[0_0_5px_#4ade80]" : "bg-red-400 animate-pulse"
          )}
        />
        <span className="text-[10px] font-mono font-bold" style={{ color: "var(--color-accent-primary)" }}>
          {total}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mx-2 px-3 py-2.5 rounded-md flex items-center gap-2"
      style={{ background: "var(--color-bg-elevated)" }}
    >
      <Activity size={13} style={{ color: "var(--color-text-muted)" }} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] leading-none" style={{ color: "var(--color-text-muted)" }}>
          Fleet
        </p>
        <p className="text-[12px] font-mono font-bold mt-0.5 whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
          <span style={{ color: "var(--color-accent-primary)" }}>{total}</span>
          {" agents · "}
          <span style={{ color: working > 0 ? "var(--color-status-working)" : "var(--color-text-muted)" }}>
            {working}
          </span>
          {" working"}
        </p>
      </div>
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          connected ? "bg-emerald-400 shadow-[0_0_5px_#4ade80]" : "bg-red-400 animate-pulse"
        )}
        title={connected ? "Live" : "Reconnecting"}
      />
    </div>
  );
});
