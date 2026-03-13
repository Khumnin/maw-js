import type { TrackedAgent, AgentState } from "@/lib/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/cn";

interface AgentStatusGridProps {
  agents: TrackedAgent[];
  /** Called when a row is clicked — opens TerminalModal for the given agent */
  onSelectAgent: (agent: AgentState) => void;
}

/**
 * AgentStatusGrid — live table of all tracked agents.
 * Click a row to open the TerminalModal for that agent.
 *
 * Note: TrackedAgent from the WS push does not include the `active`,
 * `windowIndex`, `preview`, or `isWorker` fields that AgentState does.
 * We bridge to AgentState by casting the available fields so the
 * existing TerminalModal API is satisfied.
 */
export function AgentStatusGrid({ agents, onSelectAgent }: AgentStatusGridProps) {
  if (agents.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border py-10 text-[12px]"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        No agents running
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Header */}
      <div
        className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 px-4 py-2 border-b text-[10px] font-medium uppercase tracking-widest"
        style={{
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        <span>Agent</span>
        <span>Status</span>
        <span>Context</span>
        <span>Project</span>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
        {agents.map((agent) => {
          // Bridge TrackedAgent → AgentState for the TerminalModal callback
          const agentState: AgentState = {
            target: agent.target,
            name: agent.windowName,
            session: agent.sessionName,
            windowIndex: agent.windowIndex,
            active: false,
            preview: agent.preview,
            status: agent.status,
            isWorker: agent.isWorker,
          };

          return (
            <button
              key={agent.target}
              type="button"
              onClick={() => onSelectAgent(agentState)}
              className={cn(
                "grid grid-cols-[1fr_auto_1fr_auto] gap-3 w-full px-4 py-2.5 text-left",
                "transition-colors hover:bg-white/[0.04]"
              )}
            >
              {/* Name */}
              <span
                className="text-[12px] font-mono truncate"
                style={{ color: "var(--color-text-primary)" }}
                title={agent.target}
              >
                {agent.windowName}
              </span>

              {/* Status badge */}
              <StatusBadge status={agent.status} />

              {/* Headline / context */}
              <span
                className="text-[11px] truncate"
                style={{ color: "var(--color-text-muted)" }}
                title={agent.headline}
              >
                {agent.headline || agent.preview.slice(0, 60) || "—"}
              </span>

              {/* Project name */}
              <span
                className="text-[11px] truncate text-right"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {agent.context?.projectName ?? "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
