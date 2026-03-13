import { lazy, Suspense, useMemo, useEffect, useRef, useState } from "react";
import { useAgents } from "@/hooks/useAgents";
import { StatusSummaryCards } from "./StatusSummaryCards";
import { AgentStatusGrid } from "./AgentStatusGrid";
import { ActivityTimeline } from "./ActivityTimeline";
import { AgentDetailDrawer } from "@/components/agents/AgentDetailDrawer";
import type { AgentState, TrackedAgent } from "@/lib/types";

/** DailyCostChart is lazy-loaded because Recharts is ~45KB */
const DailyCostChart = lazy(() =>
  import("./DailyCostChart").then((m) => ({ default: m.DailyCostChart }))
);

interface DashboardViewProps {
  /** Passed from App so we can open TerminalModal when clicking an agent row */
  onSelectAgent: (agent: AgentState) => void;
}

/**
 * DashboardView — composes the full dashboard:
 * - StatusSummaryCards  (fleet totals)
 * - AgentStatusGrid     (live agent table)
 * - DailyCostChart      (lazy, Recharts)
 * - ActivityTimeline    (WS event log)
 */
export function DashboardView({ onSelectAgent }: DashboardViewProps) {
  const agents = useAgents();

  // Agent detail drawer state
  const [detailAgent, setDetailAgent] = useState<TrackedAgent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Accumulate tasks-today counter from maw-ws-message events
  const [tasksToday, setTasksToday] = useState(0);
  const todayRef = useRef(new Date().toDateString());

  useEffect(() => {
    function handle(e: Event) {
      const data = (e as CustomEvent<unknown>).detail;
      if (data === null || typeof data !== "object") return;
      const type = (data as Record<string, unknown>).type;
      if (type === "task-completed") {
        // Reset counter at midnight
        const today = new Date().toDateString();
        if (today !== todayRef.current) {
          todayRef.current = today;
          setTasksToday(1);
        } else {
          setTasksToday((n) => n + 1);
        }
      }
    }
    window.addEventListener("maw-ws-message", handle);
    return () => window.removeEventListener("maw-ws-message", handle);
  }, []);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => {
      // Permission first, then working, then others
      const priority = (s: string) =>
        s === "permission" ? 0 : s === "working" ? 1 : s === "waiting" ? 2 : 3;
      return priority(a.status) - priority(b.status);
    }),
    [agents]
  );

  return (
    <div
      className="flex flex-col gap-4 p-4 md:gap-5 md:p-5 min-h-full"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Page heading */}
      <div>
        <h1
          className="text-[14px] font-semibold tracking-[1.5px] uppercase"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
        >
          Dashboard
        </h1>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        >
          Real-time fleet overview
        </p>
      </div>

      {/* Fleet status summary cards */}
      <StatusSummaryCards agents={sortedAgents} tasksToday={tasksToday} />

      {/* Agent table */}
      <div className="flex flex-col gap-2">
        <p
          className="text-[11px] font-medium uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Active Agents
        </p>
        <AgentStatusGrid
          agents={sortedAgents}
          onSelectAgent={onSelectAgent}
          onShowDetails={(agent) => {
            setDetailAgent(agent);
            setDetailOpen(true);
          }}
        />
      </div>

      {/* Bottom two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Cost chart — lazy loaded */}
        <div className="flex flex-col gap-2">
          <p
            className="text-[11px] font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Token Cost
          </p>
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center rounded-lg border py-10 text-[12px]"
                style={{
                  background: "var(--color-bg-surface)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-muted)",
                }}
              >
                Loading chart…
              </div>
            }
          >
            <DailyCostChart />
          </Suspense>
        </div>

        {/* Activity feed */}
        <div className="flex flex-col gap-2">
          <p
            className="text-[11px] font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Live Events
          </p>
          <ActivityTimeline />
        </div>
      </div>

      {/* Agent detail drawer */}
      <AgentDetailDrawer
        agent={detailAgent}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
