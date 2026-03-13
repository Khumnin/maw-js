import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { TrackedAgent } from "@/lib/types";

interface StatusSummaryCardsProps {
  agents: TrackedAgent[];
  /** Count of tasks completed today — pass from event accumulation or 0 */
  tasksToday: number;
}

interface StatCardProps {
  label: string;
  value: number;
  accent?: string;
  highlight?: boolean;
}

function StatCard({ label, value, accent, highlight }: StatCardProps) {
  return (
    <Card
      className={cn(
        "flex-1 min-w-0 gap-0 rounded-lg border py-4",
        highlight && value > 0 && "border-orange-500/30"
      )}
      style={{
        background: "var(--color-bg-surface)",
        borderColor: highlight && value > 0 ? undefined : "var(--color-border-default)",
      }}
    >
      <CardContent className="px-4 py-0">
        <p
          className="text-[11px] font-medium uppercase tracking-wider mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          {label}
        </p>
        <p
          className="text-[28px] font-bold leading-none"
          style={{
            color: accent ?? "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * StatusSummaryCards — 4-card fleet overview grid.
 * Responsive: 2-col on mobile, 4-col on xl.
 */
export function StatusSummaryCards({ agents, tasksToday }: StatusSummaryCardsProps) {
  const counts = useMemo(() => {
    const total = agents.length;
    const working = agents.filter((a) => a.status === "working").length;
    const needsPermission = agents.filter((a) => a.status === "permission").length;
    return { total, working, needsPermission };
  }, [agents]);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <StatCard label="Total Agents" value={counts.total} />
      <StatCard
        label="Working"
        value={counts.working}
        accent="var(--color-status-working)"
      />
      <StatCard
        label="Needs Permission"
        value={counts.needsPermission}
        accent={counts.needsPermission > 0 ? "var(--color-status-permission)" : undefined}
        highlight
      />
      <StatCard label="Tasks Today" value={tasksToday} />
    </div>
  );
}
