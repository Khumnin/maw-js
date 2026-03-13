import { memo } from "react";
import type { AgentCost } from "@/hooks/useCostBreakdown";
import { agentColor } from "@/lib/constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Returns the display name for an agent. null agentName renders as "(unknown)". */
function displayName(agentName: string | null): string {
  return agentName ?? "(unknown)";
}

/** Returns the first two characters of the display name, uppercased. */
function avatarChars(name: string | null): string {
  const dn = displayName(name);
  return dn.slice(0, 2).toUpperCase();
}

// ── AgentCostRow ─────────────────────────────────────────────────────────────

interface AgentCostRowProps {
  agent: AgentCost;
}

const AgentCostRow = memo(function AgentCostRow({ agent }: AgentCostRowProps) {
  const name = displayName(agent.agentName);
  const color = agentColor(name);
  const barColor = color + "33"; // 20% opacity hex suffix
  const pct = (agent.costShare * 100).toFixed(1);

  return (
    <li
      className="relative overflow-hidden"
      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
    >
      {/* Cost share background bar */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${agent.costShare * 100}%`,
          background: barColor,
        }}
      />

      {/* Row content */}
      <div
        className="relative flex items-center gap-3 px-4 py-3"
        aria-label={`Agent ${name}: $${agent.estimatedCost.toFixed(2)}, ${pct}% of total`}
      >
        {/* Colored avatar circle */}
        <div
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold"
          style={{
            background: barColor,
            border: `1px solid ${color}`,
            color: color,
          }}
          aria-hidden="true"
        >
          {avatarChars(agent.agentName)}
        </div>

        {/* Name + token counts */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-mono truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {name}
          </p>
          <p
            className="text-[11px] font-mono mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            in {fmtTokens(agent.inputTokens)} / out {fmtTokens(agent.outputTokens)} tok
            &nbsp;&middot;&nbsp;
            subscription runs: {agent.sessionCount}
          </p>
        </div>

        {/* Cost — right aligned */}
        <p
          className="shrink-0 text-[14px] font-mono font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          ${agent.estimatedCost.toFixed(2)}
        </p>
      </div>
    </li>
  );
});

// ── AgentCostPanel ────────────────────────────────────────────────────────────

interface AgentCostPanelProps {
  agents: AgentCost[];
  /** Whether data is still loading (shows skeleton rows) */
  loading: boolean;
}

/**
 * AgentCostPanel — ranked list of agent cost contributions.
 *
 * Agents are rendered in the order provided (backend sorts by cost desc).
 * Each row shows a colored avatar, agent name, token counts, session count,
 * cost, and a proportional background bar.
 */
export const AgentCostPanel = memo(function AgentCostPanel({
  agents,
  loading,
}: AgentCostPanelProps) {
  return (
    <section
      className="rounded-[var(--radius-md)] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)" }}
      >
        <h2
          className="text-[13px] font-mono font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          By Agent
        </h2>
        {!loading && agents.length > 0 && (
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <ul aria-label="Loading agents..." className="divide-y divide-transparent">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div
                className="shrink-0 w-7 h-7 rounded-full animate-pulse"
                style={{ background: "var(--color-bg-elevated)" }}
              />
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3 w-32 rounded animate-pulse"
                  style={{ background: "var(--color-bg-elevated)" }}
                />
                <div
                  className="h-2.5 w-48 rounded animate-pulse"
                  style={{ background: "var(--color-bg-elevated)" }}
                />
              </div>
              <div
                className="shrink-0 h-4 w-14 rounded animate-pulse"
                style={{ background: "var(--color-bg-elevated)" }}
              />
            </li>
          ))}
        </ul>
      ) : agents.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p
            className="text-[12px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            No agent data for this range
          </p>
        </div>
      ) : (
        <ul aria-label="Agent cost breakdown">
          {agents.map((agent) => (
            <AgentCostRow
              key={agent.agentName ?? "__unknown__"}
              agent={agent}
            />
          ))}
        </ul>
      )}
    </section>
  );
});
