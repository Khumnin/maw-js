/**
 * TokenUsage — Token usage summary dashboard.
 * Aggregates Claude Code JSONL session data from the backend.
 */

import { useState, useEffect, useCallback, memo } from "react";
import type { Session } from "../lib/types";

// ── API types ─────────────────────────────────────────────────────────────────

interface SessionUsage {
  sessionId: string;
  sessionPrefix: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  totalTokens: number;
  turnCount: number;
  toolUseCount: number;
  estimatedCost: number;
  firstSeen: string;
  lastSeen: string;
  durationMs: number;
  turnsLast5h: number;
}

interface TotalsUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  totalTokens: number;
  estimatedCost: number;
  sessionCount: number;
  turnCount: number;
  toolUseCount: number;
  promptsLast5h: number;
}

interface TimelineEntry {
  hour: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface TokenUsageResponse {
  sessions: SessionUsage[];
  totals: TotalsUsage;
  timeline: TimelineEntry[];
  cachedAt: string;
}

interface RealtimeSession {
  sessionName: string;
  sessionPrefix: string;
  model: string;
  contextPercent: number | null;
  streamingTokens: number | null;
}

interface UsageLimits {
  session: {
    prompts: number;
    oldestPromptTime: string | null;
    newestPromptTime: string | null;
    resetsIn: string;
    resetsAt: string;
    nextCapacityIn: string;
    nextCapacityAt: string;
  };
  weekly: {
    allModels: { prompts: number };
    sonnetOnly: { prompts: number };
    opusOnly: { prompts: number };
    resetsAt: string;
    resetsIn: string;
  };
  extraUsage: {
    enabled: boolean;
  };
  perSession: Array<{
    sessionId: string;
    sessionPrefix: string;
    promptsLast5h: number;
    promptsThisWeek: number;
    model: string;
    lastActivity: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtHour(hour: string): string {
  // "2026-03-09T10:00" → "10:00"
  return hour.slice(11, 16);
}

function modelLabel(model: string): string {
  if (/opus/i.test(model)) return "Opus";
  if (/haiku/i.test(model)) return "Haiku";
  return "Sonnet";
}

function modelColor(model: string): string {
  if (/opus/i.test(model)) return "#a78bfa"; // purple
  if (/haiku/i.test(model)) return "#34d399"; // emerald
  return "#38bdf8"; // sky blue — Sonnet
}

// ── Plan constants ────────────────────────────────────────────────────────────
const PROMPT_LIMIT_5H = 900; // Claude Max $200: 900 prompts per 5-hour rolling window

// ── Usage Limits Section ──────────────────────────────────────────────────────

function useLiveCountdown(resetsAt: string | null): string {
  const [display, setDisplay] = useState("—");

  useEffect(() => {
    function compute() {
      if (!resetsAt) { setDisplay("—"); return; }
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) { setDisplay("now"); return; }
      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}hr`);
      if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
      setDisplay(parts.join(" "));
    }
    compute();
    const t = setInterval(compute, 1000);
    return () => clearInterval(t);
  }, [resetsAt]);

  return display;
}

/** A single horizontal progress row matching Claude's Settings > Usage layout */
interface UsageRowProps {
  label: string;
  count: number;
  limit?: number;
  resetNote?: string; // e.g. "Resets in 2hr 46min"
}

const UsageRow = memo(function UsageRow({ label, count, limit, resetNote }: UsageRowProps) {
  const pct = limit != null ? Math.min(100, (count / limit) * 100) : null;

  // Bar color: blue/indigo matching Claude's UI; shift to amber/red at thresholds
  const barColor =
    pct == null
      ? "#6366f1"
      : pct > 80
      ? "#ef4444"
      : pct > 60
      ? "#f59e0b"
      : "#6366f1"; // indigo — matches Claude's blue bars

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label + count */}
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-mono text-white/70">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-mono font-semibold text-white/80">
            {count.toLocaleString()} prompts
          </span>
          {pct != null && (
            <span className="text-[11px] font-mono text-white/35">~{pct.toFixed(0)}% est.</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {pct != null && (
        <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: barColor,
              boxShadow: `0 0 6px ${barColor}55`,
            }}
          />
        </div>
      )}

      {/* Reset note */}
      {resetNote && (
        <div className="text-[11px] font-mono text-white/30">{resetNote}</div>
      )}
    </div>
  );
});

interface UsageLimitsSectionProps {
  limits: UsageLimits;
  lastUpdated: Date | null;
}

const UsageLimitsSection = memo(function UsageLimitsSection({
  limits,
  lastUpdated,
}: UsageLimitsSectionProps) {
  const sessionResetsIn = useLiveCountdown(limits.session.resetsAt);
  const nextCapacityIn = useLiveCountdown(limits.session.nextCapacityAt);

  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    function tick() {
      setSecondsAgo(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  // Format weekly reset as "Fri 11:00 PM" matching Claude's Settings page
  const weeklyResetsLabel = (() => {
    try {
      const d = new Date(limits.weekly.resetsAt);
      const weekday = d.toLocaleDateString(undefined, { weekday: "short" }); // "Fri"
      const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }); // "11:00 PM"
      return `${weekday} ${time}`;
    } catch {
      return "Fri 11:00 PM";
    }
  })();

  return (
    <div
      className="rounded-2xl border border-white/[0.06] p-5 flex flex-col gap-0"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] font-mono tracking-[3px] text-white/40 uppercase">
            Plan Usage Limits
          </span>
          <span className="text-[11px] font-mono text-white/25">Claude Max $200</span>
          {limits.extraUsage.enabled && (
            <span className="text-[10px] font-mono text-amber-400/70">· extra usage active</span>
          )}
        </div>
        <span className="text-[9px] font-mono text-white/20">
          Updated {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
        </span>
      </div>

      {/* Current session */}
      <UsageRow
        label="Current session"
        count={limits.session.prompts}
        limit={PROMPT_LIMIT_5H}
        resetNote={`Resets in ~${sessionResetsIn}  ·  Next slot in ~${nextCapacityIn}`}
      />

      {/* Divider */}
      <div className="my-5 border-t border-white/[0.06]" />

      {/* Weekly limits header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-mono tracking-[2px] text-white/40 uppercase">
          Weekly limits
        </span>
        <span className="text-[11px] font-mono text-white/30">
          Resets {weeklyResetsLabel}
        </span>
      </div>

      {/* All models */}
      <div className="flex flex-col gap-4">
        <UsageRow
          label="All models"
          count={limits.weekly.allModels.prompts}
        />

        {/* Sonnet only */}
        <UsageRow
          label="Sonnet only"
          count={limits.weekly.sonnetOnly.prompts}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] font-mono text-white/20 leading-relaxed mt-5">
        ⓘ Prompt counts approximate. Actual limits are token-weighted by Anthropic.
      </p>
    </div>
  );
});

// ── Weekly Reset Card ─────────────────────────────────────────────────────────

interface WeeklyResetCardProps {
  resetsAt: string | null;
}

const WeeklyResetCard = memo(function WeeklyResetCard({ resetsAt }: WeeklyResetCardProps) {
  const countdown = useLiveCountdown(resetsAt);
  const accent = "#a78bfa"; // violet

  const resetsLabel = (() => {
    if (!resetsAt) return "Fri 23:00";
    try {
      const d = new Date(resetsAt);
      return (
        d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
        " 23:00"
      );
    } catch {
      return "Fri 23:00";
    }
  })();

  return (
    <div
      className="flex-1 min-w-0 rounded-2xl border p-5 flex flex-col gap-2"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: `${accent}30`,
        boxShadow: `0 0 24px ${accent}10`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">↻</span>
        <span className="text-[11px] font-mono tracking-[2px] uppercase" style={{ color: `${accent}99` }}>
          Weekly Reset
        </span>
      </div>

      {/* Countdown */}
      <div className="text-2xl font-bold font-mono" style={{ color: accent }}>
        {countdown}
      </div>

      {/* Subtitle */}
      <div className="text-[11px] text-white/30 font-mono">Resets {resetsLabel}</div>
    </div>
  );
});

// ── Overview Card ─────────────────────────────────────────────────────────────

interface OverviewCardProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  icon: string;
}

const OverviewCard = memo(function OverviewCard({ label, value, sub, accent, icon }: OverviewCardProps) {
  return (
    <div
      className="flex-1 min-w-0 rounded-2xl border p-5 flex flex-col gap-2"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: `${accent}30`,
        boxShadow: `0 0 24px ${accent}10`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[11px] font-mono tracking-[2px] uppercase" style={{ color: `${accent}99` }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-white/30 font-mono">{sub}</div>}
    </div>
  );
});

// ── Timeline Chart (pure SVG) ─────────────────────────────────────────────────

interface TimelineChartProps {
  timeline: TimelineEntry[];
}

const TimelineChart = memo(function TimelineChart({ timeline }: TimelineChartProps) {
  const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);
  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/20 text-sm font-mono">
        No timeline data
      </div>
    );
  }

  const W = 800;
  const H = 120;
  const PADDING = { left: 40, right: 16, top: 8, bottom: 28 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxTokens = Math.max(...timeline.map((e) => e.inputTokens + e.outputTokens), 1);
  const barW = Math.max(4, (chartW / timeline.length) * 0.7);
  const gap = chartW / timeline.length;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minHeight: 120 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y-axis label */}
        <text x={4} y={PADDING.top + chartH / 2} fill="#ffffff30" fontSize={9} dominantBaseline="middle" fontFamily="monospace">
          tokens
        </text>

        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PADDING.top + chartH * (1 - frac);
          return (
            <line
              key={frac}
              x1={PADDING.left}
              y1={y}
              x2={W - PADDING.right}
              y2={y}
              stroke="#ffffff"
              strokeWidth={0.3}
              opacity={0.08}
            />
          );
        })}

        {/* Bars */}
        {timeline.map((entry, i) => {
          const x = PADDING.left + i * gap + gap / 2 - barW / 2;
          const totalH = ((entry.inputTokens + entry.outputTokens) / maxTokens) * chartH;
          const inputH = (entry.inputTokens / maxTokens) * chartH;
          const outputH = (entry.outputTokens / maxTokens) * chartH;
          const _y = PADDING.top + chartH - totalH;

          const isHovered = tooltip?.idx === i;

          return (
            <g
              key={entry.hour}
              onMouseEnter={(e) => {
                const _rect = (e.currentTarget.ownerSVGElement as SVGSVGElement)?.getBoundingClientRect();
                setTooltip({ idx: i, x: i * gap + PADDING.left + gap / 2, y: PADDING.top + chartH - totalH });
              }}
              style={{ cursor: "crosshair" }}
            >
              {/* Input tokens (blue) */}
              <rect
                x={x}
                y={PADDING.top + chartH - inputH}
                width={barW}
                height={inputH}
                fill={isHovered ? "#60a5fa" : "#3b82f6"}
                rx={2}
                opacity={isHovered ? 1 : 0.75}
              />
              {/* Output tokens (amber) — stacked on top */}
              <rect
                x={x}
                y={PADDING.top + chartH - totalH}
                width={barW}
                height={outputH}
                fill={isHovered ? "#fbbf24" : "#f59e0b"}
                rx={2}
                opacity={isHovered ? 1 : 0.7}
              />

              {/* Hover hit area */}
              <rect
                x={PADDING.left + i * gap}
                y={PADDING.top}
                width={gap}
                height={chartH}
                fill="transparent"
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const entry = timeline[tooltip.idx];
          const tx = Math.min(tooltip.x, W - 140);
          const ty = Math.max(PADDING.top, tooltip.y - 60);
          return (
            <g>
              <rect x={tx} y={ty} width={130} height={54} rx={6} fill="rgba(8,8,20,0.95)" stroke="#ffffff20" strokeWidth={0.5} />
              <text x={tx + 8} y={ty + 16} fill="#a5f3fc" fontSize={9} fontFamily="monospace">{entry.hour.replace("T", " ")}</text>
              <text x={tx + 8} y={ty + 28} fill="#60a5fa" fontSize={9} fontFamily="monospace">In: {fmtTokens(entry.inputTokens)}</text>
              <text x={tx + 8} y={ty + 40} fill="#fbbf24" fontSize={9} fontFamily="monospace">Out: {fmtTokens(entry.outputTokens)}</text>
              <text x={tx + 80} y={ty + 40} fill="#34d399" fontSize={9} fontFamily="monospace">{fmtCost(entry.cost)}</text>
            </g>
          );
        })()}

        {/* X-axis labels — show every N entries to avoid crowding */}
        {timeline.map((entry, i) => {
          const step = Math.max(1, Math.floor(timeline.length / 8));
          if (i % step !== 0) return null;
          const x = PADDING.left + i * gap + gap / 2;
          return (
            <text
              key={`xlabel-${i}`}
              x={x}
              y={H - 6}
              textAnchor="middle"
              fill="#ffffff30"
              fontSize={8}
              fontFamily="monospace"
            >
              {fmtHour(entry.hour)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 px-2">
        <span className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#3b82f6" }} />
          Input
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} />
          Output
        </span>
      </div>
    </div>
  );
});

// ── Model Breakdown ───────────────────────────────────────────────────────────

interface ModelBreakdownProps {
  sessions: SessionUsage[];
}

const ModelBreakdown = memo(function ModelBreakdown({ sessions }: ModelBreakdownProps) {
  // Group by model family
  const groups: Record<string, { tokens: number; cost: number; count: number }> = {};
  for (const s of sessions) {
    const key = modelLabel(s.model);
    const g = groups[key] || { tokens: 0, cost: 0, count: 0 };
    g.tokens += s.totalTokens;
    g.cost += s.estimatedCost;
    g.count++;
    groups[key] = g;
  }

  const totalTokens = Object.values(groups).reduce((s, g) => s + g.tokens, 0) || 1;
  const sorted = Object.entries(groups).sort((a, b) => b[1].tokens - a[1].tokens);

  const COLORS: Record<string, string> = {
    Opus: "#a78bfa",
    Sonnet: "#38bdf8",
    Haiku: "#34d399",
  };

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map(([model, data]) => {
        const pct = (data.tokens / totalTokens) * 100;
        const color = COLORS[model] || "#94a3b8";
        return (
          <div key={model} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono" style={{ color }}>{model}</span>
              <span className="text-white/40 font-mono">
                {fmtTokens(data.tokens)} · {fmtCost(data.cost)} · {data.count} sessions
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}60` }}
              />
            </div>
            <div className="text-[9px] text-white/20 font-mono">{pct.toFixed(1)}% of total tokens</div>
          </div>
        );
      })}
    </div>
  );
});

// ── Session Row ───────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: SessionUsage;
  tmuxName: string | null;
  realtime: RealtimeSession | null;
  expanded: boolean;
  onToggle: () => void;
}

const SessionRow = memo(function SessionRow({ session, tmuxName, realtime, expanded, onToggle }: SessionRowProps) {
  const accent = modelColor(session.model);
  const isLive = realtime !== null;

  return (
    <>
      <tr
        className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
        onClick={onToggle}
      >
        {/* Col 1: Session Name */}
        <td className="py-3 px-4 min-w-[120px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono text-white/80">{tmuxName || session.sessionPrefix}</span>
            <span className="text-[10px] text-white/25 font-mono">{session.sessionPrefix}</span>
          </div>
        </td>

        {/* Col 2: Model */}
        <td className="py-3 px-3 min-w-[72px]">
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{ color: accent, borderColor: `${accent}40`, background: `${accent}10` }}
          >
            {modelLabel(session.model)}
          </span>
        </td>

        {/* Col 3: Input Tokens */}
        <td className="py-3 px-3 text-right min-w-[72px]">
          <span className="text-xs font-mono text-blue-400">{fmtTokens(session.inputTokens)}</span>
        </td>

        {/* Col 4: Output Tokens */}
        <td className="py-3 px-3 text-right min-w-[72px]">
          <span className="text-xs font-mono text-amber-400">{fmtTokens(session.outputTokens)}</span>
        </td>

        {/* Col 5: Cache (write / read stacked) */}
        <td className="py-3 px-3 text-right min-w-[72px]">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-mono text-violet-400/70">{fmtTokens(session.cacheCreation)}</span>
            <span className="text-[10px] font-mono text-emerald-400/70">{fmtTokens(session.cacheRead)}</span>
          </div>
        </td>

        {/* Col 6: Total Tokens */}
        <td className="py-3 px-3 text-right min-w-[72px]">
          <span className="text-xs font-mono text-white/70">{fmtTokens(session.totalTokens)}</span>
        </td>

        {/* Col 7: Cost */}
        <td className="py-3 px-3 text-right min-w-[64px]">
          <span className="text-xs font-mono font-bold text-emerald-400">{fmtCost(session.estimatedCost)}</span>
        </td>

        {/* Col 8: Turns */}
        <td className="py-3 px-3 text-center min-w-[48px]">
          <span className="text-[10px] font-mono text-white/50">{session.turnCount}</span>
        </td>

        {/* Col 9: Tool Uses */}
        <td className="py-3 px-3 text-center min-w-[56px]">
          <span className="text-[10px] font-mono text-white/40">{session.toolUseCount}</span>
        </td>

        {/* Col 10: Context % */}
        <td className="py-3 px-3 min-w-[88px]">
          {realtime?.contextPercent != null ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-white/40">ctx</span>
                <span
                  className="text-[9px] font-mono"
                  style={{
                    color:
                      realtime.contextPercent > 80
                        ? "#ef4444"
                        : realtime.contextPercent > 50
                        ? "#f59e0b"
                        : "#34d399",
                  }}
                >
                  {realtime.contextPercent}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden w-16">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${realtime.contextPercent}%`,
                    background:
                      realtime.contextPercent > 80
                        ? "#ef4444"
                        : realtime.contextPercent > 50
                        ? "#f59e0b"
                        : "#34d399",
                  }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[9px] text-white/20 font-mono">—</span>
          )}
        </td>

        {/* Col 11: Status */}
        <td className="py-3 px-3 min-w-[64px]">
          {isLive ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              live
            </span>
          ) : (
            <span className="text-[9px] font-mono text-white/20">idle</span>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-white/[0.04]">
          <td colSpan={11} className="py-3 px-6 bg-white/[0.015]">
            <div className="flex flex-wrap gap-6 text-[11px] font-mono text-white/50">
              <div>
                <span className="text-white/25 text-[10px]">Session ID</span>
                <div className="text-cyan-400/70">{session.sessionId}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">First seen</span>
                <div>{new Date(session.firstSeen).toLocaleString()}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Last seen</span>
                <div>{new Date(session.lastSeen).toLocaleString()}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Duration</span>
                <div>{fmtDuration(session.durationMs)}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Cache write</span>
                <div className="text-violet-400">{fmtTokens(session.cacheCreation)}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Cache read</span>
                <div className="text-emerald-400">{fmtTokens(session.cacheRead)}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Prompts (5hr)</span>
                <div className="text-rose-400">{session.turnsLast5h}</div>
              </div>
              <div>
                <span className="text-white/25 text-[10px]">Model</span>
                <div style={{ color: accent }}>{session.model}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

// ── Main Component ────────────────────────────────────────────────────────────

interface TokenUsageProps {
  sessions: Session[]; // tmux sessions from WebSocket
}

export const TokenUsage = memo(function TokenUsage({ sessions }: TokenUsageProps) {
  const [data, setData] = useState<TokenUsageResponse | null>(null);
  const [realtime, setRealtime] = useState<RealtimeSession[]>([]);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [limitsLastUpdated, setLimitsLastUpdated] = useState<Date | null>(null);

  // Map sessionPrefix → tmux session name
  const prefixToName: Record<string, string> = {};
  for (const s of sessions) {
    prefixToName[s.name.slice(0, 8)] = s.name;
  }

  // Fetch historical usage (30s interval)
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/token-usage");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TokenUsageResponse = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch realtime (5s interval)
  const fetchRealtime = useCallback(async () => {
    try {
      const res = await fetch("/api/token-usage/realtime");
      if (!res.ok) return;
      const json: RealtimeSession[] = await res.json();
      setRealtime(json);
    } catch {}
  }, []);

  // Fetch usage limits (10s interval)
  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch("/api/usage-limits");
      if (!res.ok) return;
      const json: UsageLimits = await res.json();
      setLimits(json);
      setLimitsLastUpdated(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchRealtime();
    fetchLimits();
    const historicalTimer = setInterval(fetchUsage, 30_000);
    const realtimeTimer = setInterval(fetchRealtime, 5_000);
    const limitsTimer = setInterval(fetchLimits, 10_000);
    return () => {
      clearInterval(historicalTimer);
      clearInterval(realtimeTimer);
      clearInterval(limitsTimer);
    };
  }, [fetchUsage, fetchRealtime, fetchLimits]);

  // Map realtime sessions by prefix
  const realtimeByPrefix: Record<string, RealtimeSession> = {};
  for (const r of realtime) {
    realtimeByPrefix[r.sessionPrefix] = r;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/30 font-mono text-sm animate-pulse">Parsing sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400/60 font-mono text-sm">Error: {error}</div>
      </div>
    );
  }

  const totals = data?.totals;
  const sessionList = data?.sessions || [];
  const timeline = data?.timeline || [];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-3 sm:p-6 pb-12 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-[4px] text-cyan-400 uppercase font-mono">
            Token Usage
          </h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            Claude Code session analytics · {sessionList.length} sessions parsed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-white/20 font-mono">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchUsage}
            className="px-3 py-1.5 rounded-lg text-[11px] font-mono border border-white/10 text-white/40 hover:text-cyan-400 hover:border-cyan-400/30 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Section 1: Overview Cards */}
      {totals && (
        <div className="token-overview-cards">
          <OverviewCard
            label="Total Tokens"
            value={fmtTokens(totals.totalTokens)}
            sub={`${fmtTokens(totals.inputTokens)} in · ${fmtTokens(totals.outputTokens)} out`}
            accent="#38bdf8"
            icon="⬡"
          />
          <OverviewCard
            label="Estimated Cost"
            value={fmtCost(totals.estimatedCost)}
            sub={`${fmtTokens(totals.cacheCreation)} cache write · ${fmtTokens(totals.cacheRead)} cache read`}
            accent="#34d399"
            icon="◎"
          />
          <OverviewCard
            label="Sessions"
            value={String(totals.sessionCount)}
            sub={`${totals.turnCount} turns total`}
            accent="#a78bfa"
            icon="⬢"
          />
          <OverviewCard
            label="Tool Uses"
            value={fmtTokens(totals.toolUseCount)}
            sub={`${totals.turnCount > 0 ? (totals.toolUseCount / totals.turnCount).toFixed(1) : 0} tools/turn avg`}
            accent="#fb923c"
            icon="◈"
          />
          {/* Weekly Reset — countdown to next weekly quota reset */}
          <WeeklyResetCard resetsAt={limits?.weekly.resetsAt ?? null} />
        </div>
      )}

      {/* Section 2: Plan Usage Limits */}
      {limits && (
        <UsageLimitsSection limits={limits} lastUpdated={limitsLastUpdated} />
      )}

      {/* Section 3: Live Sessions */}
      {realtime.length > 0 && (
        <div
          className="rounded-2xl border border-white/[0.06] p-5"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono tracking-[3px] text-white/40 uppercase">Live Sessions</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {realtime.map((r) => (
              <div
                key={r.sessionName}
                className="flex flex-col gap-1.5 px-4 py-3 rounded-xl border border-white/[0.06] min-w-[160px]"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-white/70">{r.sessionName}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">
                    live
                  </span>
                </div>
                <div className="text-[10px] font-mono" style={{ color: modelColor(r.model) }}>
                  {modelLabel(r.model)}
                </div>
                {r.contextPercent != null && (
                  <div className="flex flex-col gap-1">
                    {/* Label */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/30 tracking-[1px] uppercase">
                        Context Window
                      </span>
                      <span
                        className="text-[9px] font-mono font-bold"
                        style={{
                          color:
                            r.contextPercent > 80
                              ? "#ef4444"
                              : r.contextPercent > 50
                              ? "#f59e0b"
                              : "#34d399",
                        }}
                      >
                        {r.contextPercent}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${r.contextPercent}%`,
                          background:
                            r.contextPercent > 80
                              ? "#ef4444"
                              : r.contextPercent > 50
                              ? "#f59e0b"
                              : "#34d399",
                          boxShadow:
                            r.contextPercent > 80
                              ? "0 0 6px #ef444460"
                              : r.contextPercent > 50
                              ? "0 0 6px #f59e0b60"
                              : "0 0 6px #34d39960",
                        }}
                      />
                    </div>
                    {/* Hint text */}
                    <span className="text-[8px] font-mono text-white/20">
                      {r.contextPercent > 80
                        ? "Nearly full — consider compacting"
                        : r.contextPercent > 50
                        ? "Half full"
                        : "Plenty of context remaining"}
                    </span>
                  </div>
                )}
                {r.streamingTokens != null && (
                  <div className="text-[9px] font-mono text-cyan-400/60 animate-pulse">
                    ↓ {fmtTokens(r.streamingTokens)} streaming
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Per-Session Table */}
      <div
        className="rounded-2xl border border-white/[0.06] overflow-hidden"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
          <span className="text-[11px] font-mono tracking-[3px] text-white/40 uppercase">Sessions</span>
          <span className="text-[10px] text-white/20 font-mono">sorted by total tokens</span>
        </div>

        <div className="overflow-x-auto -mx-0">
          <p className="text-[9px] font-mono text-white/20 px-5 pb-1 sm:hidden">Scroll horizontally to see all columns</p>
          <table className="w-full text-left border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr className="border-b border-white/[0.04]">
                {[
                  "Session Name",
                  "Model",
                  "Input Tokens",
                  "Output Tokens",
                  "Cache",
                  "Total Tokens",
                  "Cost",
                  "Turns",
                  "Tool Uses",
                  "Context %",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="py-2 px-3 text-[9px] font-mono tracking-[2px] uppercase text-white/20 font-normal whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessionList.map((s) => (
                <SessionRow
                  key={s.sessionId}
                  session={s}
                  tmuxName={prefixToName[s.sessionPrefix] || null}
                  realtime={realtimeByPrefix[s.sessionPrefix] || null}
                  expanded={expandedRow === s.sessionId}
                  onToggle={() => setExpandedRow(expandedRow === s.sessionId ? null : s.sessionId)}
                />
              ))}
              {sessionList.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-white/20 font-mono text-sm">
                    No session data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Hourly Timeline */}
      <div
        className="rounded-2xl border border-white/[0.06] p-5"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="mb-4">
          <span className="text-[11px] font-mono tracking-[3px] text-white/40 uppercase">Hourly Timeline</span>
          <p className="text-[10px] text-white/20 mt-0.5">Token usage over time (all sessions combined)</p>
        </div>
        <TimelineChart timeline={timeline} />
      </div>

      {/* Section 6: Model Breakdown */}
      <div
        className="rounded-2xl border border-white/[0.06] p-5"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="mb-4">
          <span className="text-[11px] font-mono tracking-[3px] text-white/40 uppercase">Model Breakdown</span>
          <p className="text-[10px] text-white/20 mt-0.5">Token distribution by Claude model family</p>
        </div>
        <ModelBreakdown sessions={sessionList} />
      </div>
    </div>
  );
});
