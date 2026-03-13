import { useState, memo } from "react";
import type { Session } from "@/lib/types";
import { useCostBreakdown, RANGE_LABELS } from "@/hooks/useCostBreakdown";
import type { TimeRange } from "@/hooks/useCostBreakdown";
import { TimeRangeTabs } from "./TimeRangeTabs";
import { CostHeader } from "./CostHeader";
import { AgentCostPanel } from "./AgentCostPanel";
import { ProjectCostPanel } from "./ProjectCostPanel";
import { TokenUsage } from "@/components/TokenUsage";

interface CostBreakdownViewProps {
  /** tmux sessions from App.tsx WebSocket — passed through to the TokenUsage detail table */
  sessions: Session[];
}

/**
 * CostBreakdownView — route container for the `#tokens` hash route.
 *
 * Layout (desktop, >= 1024px):
 *   - CostHeader (left) + TimeRangeTabs (right) in a top bar
 *   - Two-panel grid: AgentCostPanel (60%) | ProjectCostPanel (40%)
 *   - Collapsible <details> "Session Detail" with the full TokenUsage table
 *
 * On mobile (< 1024px): panels stack vertically.
 */
export const CostBreakdownView = memo(function CostBreakdownView({
  sessions,
}: CostBreakdownViewProps) {
  const [range, setRange] = useState<TimeRange>("7d");
  const { data, loading, error } = useCostBreakdown(range);

  const totalCost = data?.totalCost ?? null;
  const agents = data?.agents ?? [];
  const projects = data?.projects ?? [];
  const rangeLabel = RANGE_LABELS[range];

  return (
    <div
      className="flex flex-col gap-4 p-4 sm:p-6 pb-12 max-w-[1400px] mx-auto"
      style={{ color: "var(--color-text-primary)" }}
    >
      {/* ── Top bar: header + tabs ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {/* Page title */}
        <div>
          <h1
            className="text-[11px] font-mono font-semibold tracking-[3px] uppercase mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            COSTS
          </h1>
          <CostHeader totalCost={loading ? null : totalCost} rangeLabel={rangeLabel} />
        </div>

        {/* Time range tabs */}
        <TimeRangeTabs activeRange={range} onRangeChange={setRange} />
      </div>

      {/* ── Error state ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          className="rounded-md px-4 py-3 text-[12px] font-mono"
          style={{
            background: "var(--color-accent-danger-subtle)",
            border: "1px solid var(--color-accent-danger-border)",
            color: "var(--color-accent-danger)",
          }}
          role="alert"
        >
          Failed to load cost data: {error}
        </div>
      )}

      {/* ── Two-panel grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <AgentCostPanel agents={agents} loading={loading} />
        <ProjectCostPanel projects={projects} loading={loading} />
      </div>

      {/* ── Session Detail (collapsible) ──────────────────────────────── */}
      <details className="group">
        <summary
          className="flex items-center gap-2 cursor-pointer select-none list-none rounded-md px-4 py-2.5 text-[12px] font-mono font-medium w-fit transition-colors"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          {/* Custom disclosure indicator */}
          <span
            className="text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block"
            aria-hidden="true"
          >
            ▶
          </span>
          Session Detail
        </summary>

        <div className="mt-3">
          <TokenUsage sessions={sessions} />
        </div>
      </details>
    </div>
  );
});
