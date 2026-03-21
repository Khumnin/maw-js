import { useState, useEffect, useCallback, memo, lazy, Suspense } from "react";
import {
  Clock,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertTriangle,
  Timer,
  TrendingUp,
  DollarSign,
  BarChart2,
  ListChecks,
  Settings2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Save,
  FolderOpen,
  Loader2,
} from "lucide-react";
import {
  useTimesheetSummary,
  useTimesheetByProject,
  useTimesheetSpaces,
  useTimesheetTasks,
  useBillingRules,
  useSpaceFolders,
} from "@/hooks/useTimesheet";
import type {
  MemberWeeklySummary,
  ProjectSummary,
  SpaceInfo,
  TaskDetail,
  BillingRule,
  FolderWithRule,
} from "@/hooks/useTimesheet";

/** ProjectBarChart is lazy-loaded because Recharts is large */
const ProjectBarChart = lazy(() =>
  import("./ProjectBarChart").then((m) => ({ default: m.ProjectBarChart }))
);

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = "weekly" | "monthly";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the Monday of the week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekEnd(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  return d;
}

/** Returns all ISO date strings Mon–Sun for a given week start. */
function weekDates(start: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toISODate(d));
  }
  return dates;
}

/** Returns the first day of the month for `date`. */
function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** Returns the last day of the month for `date`. */
function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

interface WeekGroup {
  label: string;
  /** Mon–Sun ISO dates within the month range */
  dates: string[];
  /** True if this week is a complete Mon–Sun (no boundary truncation) */
  isComplete: boolean;
}

/**
 * Groups dates in [startISO, endISO] into Mon–Sun week buckets.
 * Used for the monthly grid view.
 */
function groupDatesByWeek(startISO: string, endISO: string): WeekGroup[] {
  const startD = new Date(startISO + "T00:00:00");
  const endD = new Date(endISO + "T00:00:00");

  const groups: WeekGroup[] = [];
  const cur = new Date(startD);

  while (cur <= endD) {
    // Find the Monday of the week containing cur
    const dow = cur.getDay();
    const daysFromMon = dow === 0 ? 6 : dow - 1;
    const mon = new Date(cur);
    mon.setDate(mon.getDate() - daysFromMon);

    const weekDatesArr: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(d.getDate() + i);
      if (d >= startD && d <= endD) {
        weekDatesArr.push(toISODate(d));
      }
    }

    if (weekDatesArr.length > 0) {
      const firstDate = new Date(weekDatesArr[0] + "T12:00:00");
      const lastDate = new Date(weekDatesArr[weekDatesArr.length - 1] + "T12:00:00");
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      groups.push({
        label: `${fmt(firstDate)} – ${fmt(lastDate)}`,
        dates: weekDatesArr,
        isComplete: weekDatesArr.length === 7,
      });
    }

    // Jump to the Monday following this week's Sunday
    const nextMon = new Date(mon);
    nextMon.setDate(nextMon.getDate() + 7);
    cur.setTime(nextMon.getTime());
  }

  return groups;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHours(h: number): string {
  if (h === 0) return "—";
  return `${h.toFixed(1)}h`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

type HoursStatus = "ok" | "warning" | "danger" | "empty";

function getHoursStatus(total: number): HoursStatus {
  if (total === 0) return "empty";
  if (total >= 40) return "ok";
  if (total >= 30) return "warning";
  return "danger";
}

/** Status for a weekly bucket — only flags complete Mon–Sun weeks. */
function getWeekStatus(hours: number, isComplete: boolean): HoursStatus {
  if (!isComplete) return hours > 0 ? "ok" : "empty";
  return getHoursStatus(hours);
}

const STATUS_STYLES: Record<HoursStatus, React.CSSProperties> = {
  ok: { color: "#34d399", background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.2)" },
  warning: { color: "#fbbf24", background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.2)" },
  danger: { color: "#f87171", background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.2)" },
  empty: { color: "var(--color-text-muted)", background: "transparent", borderColor: "transparent" },
};

// ── Summary Stats Cards ───────────────────────────────────────────────────────

interface SummaryCardsProps {
  members: MemberWeeklySummary[];
  totalMemberCount: number;
  loading: boolean;
  mode: ViewMode;
}

function SummaryCards({ members, totalMemberCount, loading, mode }: SummaryCardsProps) {
  const loggedMembers = members.filter((m) => m.totalHours > 0);
  const totalHours = members.reduce((s, m) => s + m.totalHours, 0);
  const avgHours = loggedMembers.length > 0 ? totalHours / loggedMembers.length : 0;
  // For weekly mode, flag people under 40h. For monthly (≈4 weeks), flag under 160h.
  const threshold = mode === "monthly" ? 160 : 40;
  const underCount = loggedMembers.filter((m) => m.totalHours < threshold).length;

  const activeCount = loggedMembers.length;
  const peopleValue = loading
    ? "—"
    : totalMemberCount > activeCount
      ? `${activeCount} / ${totalMemberCount}`
      : String(activeCount);
  const peopleSubLabel = !loading && totalMemberCount > activeCount
    ? "active / total"
    : undefined;

  const cards = [
    {
      label: "Total Hours",
      value: loading ? "—" : `${totalHours.toFixed(1)}h`,
      subLabel: undefined,
      icon: Timer,
      accent: "#818cf8",
    },
    {
      label: "Avg per Person",
      value: loading ? "—" : `${avgHours.toFixed(1)}h`,
      subLabel: undefined,
      icon: TrendingUp,
      accent: "#34d399",
    },
    {
      label: "Logged Time",
      value: peopleValue,
      subLabel: peopleSubLabel,
      icon: Users,
      accent: "#60a5fa",
    },
    {
      label: mode === "monthly" ? "Under 160h" : "Under 40h",
      value: loading ? "—" : String(underCount),
      subLabel: undefined,
      icon: AlertTriangle,
      accent: underCount > 0 ? "#f87171" : "#34d399",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, subLabel, icon: Icon, accent }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg px-4 py-3"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <div
            className="flex items-center justify-center rounded-md w-8 h-8 shrink-0"
            style={{ background: `${accent}18` }}
          >
            <Icon size={16} style={{ color: accent }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-mono uppercase tracking-wider truncate"
              style={{ color: "var(--color-text-muted)" }}
            >
              {label}
            </p>
            <p
              className="text-[20px] font-semibold leading-tight font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {value}
            </p>
            {subLabel && (
              <p
                className="text-[10px] font-mono"
                style={{ color: "var(--color-text-muted)" }}
              >
                {subLabel}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Weekly Grid Table ─────────────────────────────────────────────────────────

interface WeeklyGridProps {
  members: MemberWeeklySummary[];
  dates: string[];
  loading: boolean;
}

function WeeklyGrid({ members, dates, loading }: WeeklyGridProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr style={{ background: "var(--color-bg-elevated)" }}>
              <th
                className="text-left px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
              >
                Person
              </th>
              {DAY_LABELS.map((d) => (
                <th
                  key={d}
                  className="text-right px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
                >
                  {d}
                </th>
              ))}
              <th
                className="text-right px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-3">
                  <div className="h-3 w-32 rounded" style={{ background: "var(--color-bg-elevated)" }} />
                </td>
                {DAY_LABELS.map((d) => (
                  <td key={d} className="px-3 py-3 text-right">
                    <div className="h-3 w-10 rounded ml-auto" style={{ background: "var(--color-bg-elevated)" }} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="h-3 w-12 rounded ml-auto" style={{ background: "var(--color-bg-elevated)" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3 rounded-lg"
        style={{
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        <Clock size={32} className="opacity-30" aria-hidden="true" />
        <p className="text-[13px] font-mono">No time entries found for this period.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr style={{ background: "var(--color-bg-elevated)" }}>
            <th
              className="text-left px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
              style={{
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Person
            </th>
            {dates.map((date, i) => (
              <th
                key={date}
                className="text-right px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{
                  color: "var(--color-text-muted)",
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                {DAY_LABELS[i]}
              </th>
            ))}
            <th
              className="text-right px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider"
              style={{
                color: "var(--color-text-secondary)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Total
            </th>
            <th
              className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
              style={{
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, rowIdx) => {
            const status = getHoursStatus(member.totalHours);
            const statusStyle = STATUS_STYLES[status];
            const isLast = rowIdx === members.length - 1;

            return (
              <tr
                key={member.userId}
                style={{
                  background:
                    status === "danger"
                      ? "rgba(248,113,113,0.04)"
                      : status === "warning"
                        ? "rgba(251,191,36,0.03)"
                        : undefined,
                  borderBottom: isLast
                    ? undefined
                    : "1px solid var(--color-border-default)",
                }}
              >
                {/* Person name */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {member.username}
                    </span>
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {member.email}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {dates.map((date) => {
                  const h = member.days[date] ?? 0;
                  return (
                    <td
                      key={date}
                      className="px-3 py-3 text-right text-[13px] font-mono"
                      style={{
                        color: h > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)",
                      }}
                    >
                      {formatHours(h)}
                    </td>
                  );
                })}

                {/* Total */}
                <td
                  className="px-4 py-3 text-right text-[14px] font-mono font-semibold"
                  style={{ color: statusStyle.color }}
                >
                  {member.totalHours > 0 ? `${member.totalHours.toFixed(1)}h` : "0h"}
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                  {status !== "empty" && (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-mono border"
                      style={statusStyle}
                    >
                      {status === "ok"
                        ? "OK"
                        : status === "warning"
                          ? "< 40h"
                          : "< 30h"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Monthly Grid Table ────────────────────────────────────────────────────────

interface MonthlyGridProps {
  members: MemberWeeklySummary[];
  startISO: string;
  endISO: string;
  loading: boolean;
}

function MonthlyGrid({ members, startISO, endISO, loading }: MonthlyGridProps) {
  const weeks = groupDatesByWeek(startISO, endISO);

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr style={{ background: "var(--color-bg-elevated)" }}>
              <th
                className="text-left px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
              >
                Person
              </th>
              {weeks.map((w) => (
                <th
                  key={w.label}
                  className="text-right px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
                >
                  {w.label}
                </th>
              ))}
              <th
                className="text-right px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-default)" }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-3">
                  <div className="h-3 w-32 rounded" style={{ background: "var(--color-bg-elevated)" }} />
                </td>
                {weeks.map((w) => (
                  <td key={w.label} className="px-3 py-3 text-right">
                    <div className="h-3 w-12 rounded ml-auto" style={{ background: "var(--color-bg-elevated)" }} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="h-3 w-14 rounded ml-auto" style={{ background: "var(--color-bg-elevated)" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3 rounded-lg"
        style={{
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        <Clock size={32} className="opacity-30" aria-hidden="true" />
        <p className="text-[13px] font-mono">No time entries found for this period.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr style={{ background: "var(--color-bg-elevated)" }}>
            <th
              className="text-left px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
              style={{
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Person
            </th>
            {weeks.map((week) => (
              <th
                key={week.label}
                className="text-right px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{
                  color: "var(--color-text-muted)",
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                {week.label}
              </th>
            ))}
            <th
              className="text-right px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider"
              style={{
                color: "var(--color-text-secondary)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Total
            </th>
            <th
              className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
              style={{
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, rowIdx) => {
            const totalStatus = getHoursStatus(member.totalHours);
            const totalStyle = STATUS_STYLES[totalStatus];
            const isLast = rowIdx === members.length - 1;

            // Determine if any complete week is under 40h
            const hasUnderWeek = weeks.some((week) => {
              if (!week.isComplete) return false;
              const wh = week.dates.reduce((s, d) => s + (member.days[d] ?? 0), 0);
              return wh < 40;
            });

            const rowBg = hasUnderWeek
              ? "rgba(248,113,113,0.04)"
              : totalStatus === "warning"
                ? "rgba(251,191,36,0.03)"
                : undefined;

            return (
              <tr
                key={member.userId}
                style={{
                  background: rowBg,
                  borderBottom: isLast
                    ? undefined
                    : "1px solid var(--color-border-default)",
                }}
              >
                {/* Person name */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {member.username}
                    </span>
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {member.email}
                    </span>
                  </div>
                </td>

                {/* Week subtotal cells */}
                {weeks.map((week) => {
                  const weekHours = week.dates.reduce(
                    (s, d) => s + (member.days[d] ?? 0),
                    0
                  );
                  const wStatus = getWeekStatus(weekHours, week.isComplete);
                  const wStyle = STATUS_STYLES[wStatus];
                  return (
                    <td
                      key={week.label}
                      className="px-3 py-3 text-right text-[13px] font-mono"
                      style={{ color: wStyle.color }}
                      title={
                        week.isComplete && wStatus !== "ok" && wStatus !== "empty"
                          ? `${weekHours.toFixed(1)}h this week (under 40h)`
                          : undefined
                      }
                    >
                      {formatHours(weekHours)}
                    </td>
                  );
                })}

                {/* Monthly total */}
                <td
                  className="px-4 py-3 text-right text-[14px] font-mono font-semibold"
                  style={{ color: totalStyle.color }}
                >
                  {member.totalHours > 0 ? `${member.totalHours.toFixed(1)}h` : "0h"}
                </td>

                {/* Status badge — based on overall total */}
                <td className="px-4 py-3">
                  {totalStatus !== "empty" && (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-mono border"
                      style={totalStyle}
                    >
                      {totalStatus === "ok"
                        ? "OK"
                        : totalStatus === "warning"
                          ? "< 40h"
                          : "< 30h"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Project Breakdown Table ───────────────────────────────────────────────────

interface ProjectBreakdownProps {
  projects: ProjectSummary[];
  loading: boolean;
}

function ProjectBreakdown({ projects, loading }: ProjectBreakdownProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg px-4 py-3 animate-pulse"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <div className="h-3 w-40 rounded" style={{ background: "var(--color-bg-elevated)" }} />
            <div className="h-3 w-20 rounded ml-auto" style={{ background: "var(--color-bg-elevated)" }} />
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-[12px] font-mono py-6 text-center" style={{ color: "var(--color-text-muted)" }}>
        No project data available.
      </p>
    );
  }

  const maxHours = Math.max(...projects.map((p) => p.totalHours), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Bar chart (lazy) */}
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center rounded-lg py-10 text-[12px] font-mono"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-muted)",
            }}
          >
            Loading chart…
          </div>
        }
      >
        <ProjectBarChart projects={projects} />
      </Suspense>

      {/* Table */}
      <div
        className="overflow-x-auto rounded-lg"
        style={{ border: "1px solid var(--color-border-default)" }}
      >
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr style={{ background: "var(--color-bg-elevated)" }}>
              {["Project / Space", "Total Hours", "# People", "Avg Hrs/Person"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-left first:text-left [&:not(:first-child)]:text-right"
                  style={{
                    color: "var(--color-text-muted)",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                >
                  {h}
                </th>
              ))}
              <th
                className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider"
                style={{
                  color: "var(--color-text-muted)",
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((proj, i) => (
              <tr
                key={proj.spaceId}
                style={{
                  borderBottom:
                    i < projects.length - 1
                      ? "1px solid var(--color-border-default)"
                      : undefined,
                }}
              >
                <td className="px-4 py-3">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {proj.spaceName}
                  </span>
                </td>
                <td
                  className="px-4 py-3 text-right text-[13px] font-mono"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {proj.totalHours.toFixed(1)}h
                </td>
                <td
                  className="px-4 py-3 text-right text-[13px] font-mono"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {proj.memberCount}
                </td>
                <td
                  className="px-4 py-3 text-right text-[13px] font-mono"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {proj.avgHoursPerMember.toFixed(1)}h
                </td>
                <td className="px-4 py-3">
                  <div
                    className="h-2 rounded-full overflow-hidden w-full min-w-[80px]"
                    style={{ background: "var(--color-bg-elevated)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(proj.totalHours / maxHours) * 100}%`,
                        background: "#818cf8",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Billing Summary Cards ─────────────────────────────────────────────────────

interface BillingCardsProps {
  members: MemberWeeklySummary[];
  loading: boolean;
}

function BillingCards({ members, loading }: BillingCardsProps) {
  const totalHours     = members.reduce((s, m) => s + m.totalHours, 0);
  const billableHours  = members.reduce((s, m) => s + m.billableHours, 0);
  const nonBillable    = members.reduce((s, m) => s + m.nonBillableHours, 0);
  const billPct        = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

  const pctColor =
    billPct >= 70 ? "#34d186" : billPct >= 50 ? "#fbbf24" : "#f87171";

  const cards = [
    {
      label: "Total Hours",
      value: loading ? "—" : `${totalHours.toFixed(1)}h`,
      icon: Timer,
      accent: "#818cf8",
    },
    {
      label: "Billable",
      value: loading ? "—" : `${billableHours.toFixed(1)}h`,
      icon: DollarSign,
      accent: "#34d186",
    },
    {
      label: "Non-Billable",
      value: loading ? "—" : `${nonBillable.toFixed(1)}h`,
      icon: BarChart2,
      accent: "#f87171",
    },
    {
      label: "Bill Ratio",
      value: loading ? "—" : `${billPct.toFixed(1)}%`,
      icon: TrendingUp,
      accent: pctColor,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg px-4 py-3"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <div
            className="flex items-center justify-center rounded-md w-8 h-8 shrink-0"
            style={{ background: `${accent}18` }}
          >
            <Icon size={16} style={{ color: accent }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-mono uppercase tracking-wider truncate"
              style={{ color: "var(--color-text-muted)" }}
            >
              {label}
            </p>
            <p
              className="text-[20px] font-semibold leading-tight font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Client Breakdown Section ──────────────────────────────────────────────────

interface ClientBreakdownProps {
  members: MemberWeeklySummary[];
  loading: boolean;
}

function ClientBreakdown({ members, loading }: ClientBreakdownProps) {
  // Aggregate clients across all members
  const clientMap = new Map<string, { hours: number; people: Set<number> }>();
  let grandTotal = 0;

  for (const member of members) {
    for (const [client, hours] of Object.entries(member.byClient)) {
      if (!clientMap.has(client)) clientMap.set(client, { hours: 0, people: new Set() });
      const entry = clientMap.get(client)!;
      entry.hours += hours;
      entry.people.add(member.userId);
      grandTotal += hours;
    }
  }

  const rows = Array.from(clientMap.entries())
    .map(([client, data]) => ({
      client,
      hours: data.hours,
      people: data.people.size,
      pct: grandTotal > 0 ? (data.hours / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-lg animate-pulse"
            style={{ background: "var(--color-bg-elevated)" }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[12px] font-mono py-6 text-center" style={{ color: "var(--color-text-muted)" }}>
        No client data available.
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <table className="w-full min-w-[400px] border-collapse">
        <thead>
          <tr style={{ background: "var(--color-bg-elevated)" }}>
            {["Client", "Hours", "# People", "% of Total", "Distribution"].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-left first:text-left [&:not(:first-child)]:text-right last:text-left"
                style={{
                  color: "var(--color-text-muted)",
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.client}
              style={{
                borderBottom:
                  i < rows.length - 1 ? "1px solid var(--color-border-default)" : undefined,
              }}
            >
              <td className="px-4 py-3">
                <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {row.client}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[13px] font-mono" style={{ color: "var(--color-text-primary)" }}>
                {row.hours.toFixed(1)}h
              </td>
              <td className="px-4 py-3 text-right text-[13px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                {row.people}
              </td>
              <td className="px-4 py-3 text-right text-[13px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                {row.pct.toFixed(1)}%
              </td>
              <td className="px-4 py-3 min-w-[120px]">
                <div
                  className="h-2 rounded-full overflow-hidden w-full"
                  style={{ background: "var(--color-bg-elevated)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${row.pct}%`,
                      background: "#34d186",
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Task Detail Section ───────────────────────────────────────────────────────

interface TaskDetailSectionProps {
  tasks: TaskDetail[];
  loading: boolean;
}

type SortKey = "taskName" | "spaceName" | "folderName" | "classification" | "clientName" | "totalHours";

function TaskDetailSection({ tasks, loading }: TaskDetailSectionProps) {
  const [filter, setFilter]           = useState("");
  const [classFilter, setClassFilter] = useState<"all" | "billable" | "non-billable">("all");
  const [sortKey, setSortKey]         = useState<SortKey>("totalHours");
  const [sortAsc, setSortAsc]         = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const filtered = tasks
    .filter((t) => {
      if (classFilter !== "all" && t.classification !== classFilter) return false;
      if (filter) {
        const q = filter.toLowerCase();
        return (
          t.taskName.toLowerCase().includes(q) ||
          t.spaceName.toLowerCase().includes(q) ||
          t.folderName.toLowerCase().includes(q) ||
          t.clientName.toLowerCase().includes(q) ||
          t.taskTags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "totalHours") cmp = a.totalHours - b.totalHours;
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortAsc ? cmp : -cmp;
    });

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: "var(--color-bg-elevated)" }} />
        ))}
      </div>
    );
  }

  const SortIndicator = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      <span className="ml-1 inline-block" style={{ color: "var(--color-accent-primary)" }}>
        {sortAsc ? "↑" : "↓"}
      </span>
    ) : null;

  const colHeader = (label: string, key: SortKey) => (
    <th
      key={label}
      className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-left cursor-pointer select-none"
      style={{
        color: sortKey === key ? "var(--color-text-primary)" : "var(--color-text-muted)",
        borderBottom: "1px solid var(--color-border-default)",
      }}
      onClick={() => handleSort(key)}
    >
      {label}
      <SortIndicator col={key} />
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Filter tasks, spaces, clients..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md px-3 py-1.5 text-[12px] font-mono outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
            minWidth: "220px",
          }}
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as typeof classFilter)}
          className="rounded-md px-3 py-1.5 text-[12px] font-mono outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          <option value="all">All Classifications</option>
          <option value="billable">Billable</option>
          <option value="non-billable">Non-Billable</option>
        </select>
        <span className="text-[11px] font-mono self-center" style={{ color: "var(--color-text-muted)" }}>
          {filtered.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-[12px] font-mono py-6 text-center" style={{ color: "var(--color-text-muted)" }}>
          No tasks match the current filter.
        </p>
      ) : (
        <div
          className="overflow-x-auto rounded-lg"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr style={{ background: "var(--color-bg-elevated)" }}>
                {colHeader("Task", "taskName")}
                {colHeader("Space", "spaceName")}
                {colHeader("Folder", "folderName")}
                {colHeader("Classification", "classification")}
                {colHeader("Client", "clientName")}
                <th
                  className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-left cursor-pointer select-none"
                  style={{
                    color: "var(--color-text-muted)",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                  onClick={() => handleSort("totalHours")}
                >
                  Hours
                  <SortIndicator col="totalHours" />
                </th>
                <th
                  className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-left"
                  style={{
                    color: "var(--color-text-muted)",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                >
                  Tags
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => (
                <tr
                  key={task.taskId}
                  style={{
                    borderBottom:
                      i < filtered.length - 1
                        ? "1px solid var(--color-border-default)"
                        : undefined,
                    background:
                      task.classification === "billable"
                        ? "rgba(52,209,134,0.03)"
                        : undefined,
                  }}
                >
                  <td className="px-4 py-3 max-w-[280px]">
                    <a
                      href={task.taskUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                      style={{ color: "var(--color-accent-primary)" }}
                      title={task.taskName}
                    >
                      <span className="truncate max-w-[240px] block">{task.taskName}</span>
                      <ExternalLink size={11} className="shrink-0" aria-hidden="true" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                    {task.spaceName}
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                    {task.folderName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-mono border"
                      style={
                        task.classification === "billable"
                          ? {
                              color: "#34d186",
                              background: "rgba(52,209,134,0.1)",
                              borderColor: "rgba(52,209,134,0.25)",
                            }
                          : {
                              color: "#a3a3a3",
                              background: "rgba(163,163,163,0.08)",
                              borderColor: "rgba(163,163,163,0.2)",
                            }
                      }
                    >
                      {task.classification}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                    {task.clientName}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-mono font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {task.totalHours.toFixed(1)}h
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {task.taskTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono"
                          style={{
                            background: "rgba(129,140,248,0.12)",
                            color: "#818cf8",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {task.taskTags.length > 3 && (
                        <span
                          className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          +{task.taskTags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Billing Config Panel ──────────────────────────────────────────────────────

// ── Pending folder-level edits key ────────────────────────────────────────────

/** Key for pending folder changes: either `rule:<id>` for existing or `new:<folderId>` for new. */
type FolderPendingKey = `rule:${number}` | `new:${string}`;

interface FolderPendingValue {
  /** "inherit" means delete or skip creating the folder rule */
  classification: "billable" | "non-billable" | "inherit";
  clientName: string;
  /** Folder metadata needed to create a new rule */
  folderId: string;
  folderName: string;
}

// ── SpaceFolderRows — loads and displays folders for one expanded space row ───

interface SpaceFolderRowsProps {
  spaceId: string;
  spaceRule: BillingRule | null;
  pendingFolders: Map<FolderPendingKey, FolderPendingValue>;
  onFolderPendingChange: (key: FolderPendingKey, value: FolderPendingValue) => void;
}

function SpaceFolderRows({ spaceId, spaceRule, pendingFolders, onFolderPendingChange }: SpaceFolderRowsProps) {
  const { folders, loading, error, refetch } = useSpaceFolders(spaceId);

  // Trigger fetch on mount
  useEffect(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3 pl-10">
          <span className="inline-flex items-center gap-2 text-[12px] font-mono" style={{ color: "var(--color-text-muted)" }}>
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Loading folders…
          </span>
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3 pl-10">
          <span className="text-[12px] font-mono" style={{ color: "#f4001a" }}>
            Failed to load folders: {error}
          </span>
        </td>
      </tr>
    );
  }

  if (folders.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3 pl-10">
          <span className="text-[12px] font-mono" style={{ color: "var(--color-text-muted)" }}>
            No folders in this space.
          </span>
        </td>
      </tr>
    );
  }

  return (
    <>
      {folders.map((folder) => {
        // Look up pending state — key is `rule:<id>` if rule exists, else `new:<folderId>`
        const key: FolderPendingKey = folder.ruleId != null
          ? `rule:${folder.ruleId}`
          : `new:${folder.id}`;

        const pending = pendingFolders.get(key);
        const currentClassification: "billable" | "non-billable" | "inherit" =
          pending?.classification ??
          (folder.classification != null ? folder.classification : "inherit");
        const currentClientName = pending?.clientName ?? folder.clientName ?? "";

        const originalClassification: "billable" | "non-billable" | "inherit" =
          folder.classification != null ? folder.classification : "inherit";
        const isDirty =
          currentClassification !== originalClassification ||
          (currentClientName || "") !== (folder.clientName ?? "");

        // Effective classification badge — resolve folder > space
        const effective = currentClassification !== "inherit"
          ? currentClassification
          : (spaceRule?.classification ?? "non-billable");

        const handleChange = (patch: Partial<FolderPendingValue>) => {
          const base: FolderPendingValue = pending ?? {
            classification: currentClassification,
            clientName: currentClientName,
            folderId: folder.id,
            folderName: folder.name,
          };
          onFolderPendingChange(key, { ...base, ...patch });
        };

        return (
          <tr
            key={folder.id}
            style={{
              borderBottom: "1px solid var(--color-border-default)",
              background: isDirty
                ? "rgba(251,191,36,0.04)"
                : "rgba(255,255,255,0.01)",
            }}
          >
            {/* Indent + folder icon + name */}
            <td className="px-4 py-2.5" style={{ paddingLeft: "2.5rem" }}>
              <div className="flex items-center gap-2" style={{ borderLeft: "2px solid var(--color-border-default)", paddingLeft: "0.75rem" }}>
                <FolderOpen size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} aria-hidden="true" />
                <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {folder.name}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                  {folder.id}
                </span>
              </div>
            </td>
            {/* Classification dropdown with "Inherit" option */}
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <select
                  value={currentClassification}
                  onChange={(e) =>
                    handleChange({ classification: e.target.value as "billable" | "non-billable" | "inherit" })
                  }
                  className="rounded-md px-2 py-1 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-default)",
                    color:
                      currentClassification === "billable"
                        ? "#34d186"
                        : currentClassification === "non-billable"
                        ? "var(--color-text-secondary)"
                        : "var(--color-text-muted)",
                  }}
                >
                  <option value="inherit">Inherit from Space</option>
                  <option value="billable">Billable</option>
                  <option value="non-billable">Non-Billable</option>
                </select>
                {/* Effective badge */}
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: effective === "billable" ? "rgba(52,209,134,0.1)" : "rgba(163,163,163,0.1)",
                    color: effective === "billable" ? "#34d186" : "var(--color-text-muted)",
                    border: `1px solid ${effective === "billable" ? "rgba(52,209,134,0.2)" : "rgba(163,163,163,0.2)"}`,
                  }}
                >
                  {effective}
                </span>
              </div>
            </td>
            {/* Client name */}
            <td className="px-4 py-2.5">
              <input
                type="text"
                placeholder="Client name (optional)"
                value={currentClientName}
                onChange={(e) => handleChange({ clientName: e.target.value })}
                className="rounded-md px-2 py-1 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                style={{
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-secondary)",
                  width: "180px",
                }}
              />
            </td>
            {/* Dirty indicator */}
            <td className="px-4 py-2.5">
              {isDirty && (
                <span className="text-[11px] font-mono" style={{ color: "#fbbf24" }}>
                  unsaved
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── BillingConfigPanel ────────────────────────────────────────────────────────

interface BillingConfigPanelProps {
  rules: BillingRule[];
  loading: boolean;
  onUpdateRule: (id: number, patch: { classification?: "billable" | "non-billable"; clientName?: string }) => Promise<boolean>;
  onCreateRule: (input: { ruleType: "space" | "folder" | "tag"; matchId: string; matchName?: string; classification: "billable" | "non-billable"; clientName?: string }) => Promise<BillingRule | null>;
  onDeleteRule: (id: number) => Promise<boolean>;
  onSeedRules: () => Promise<{ seeded: number; skipped: boolean }>;
}

function BillingConfigPanel({ rules, loading, onUpdateRule, onCreateRule, onDeleteRule, onSeedRules }: BillingConfigPanelProps) {
  // Pending space-level edits by rule id
  const [spacePending, setSpacePending] = useState<
    Map<number, { classification: "billable" | "non-billable"; clientName: string }>
  >(new Map());
  // Pending folder-level edits — keyed by `rule:<id>` or `new:<folderId>`
  const [folderPending, setFolderPending] = useState<Map<FolderPendingKey, FolderPendingValue>>(new Map());
  // Which space rows are expanded
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const spaceRules = rules.filter((r) => r.ruleType === "space");

  const getSpacePending = (rule: BillingRule) =>
    spacePending.get(rule.id) ?? {
      classification: rule.classification,
      clientName: rule.clientName ?? "",
    };

  const setSpacePendingFor = (
    id: number,
    patch: Partial<{ classification: "billable" | "non-billable"; clientName: string }>
  ) => {
    setSpacePending((prev) => {
      const current = prev.get(id) ?? { classification: "non-billable" as const, clientName: "" };
      const next = new Map(prev);
      next.set(id, { ...current, ...patch });
      return next;
    });
  };

  const handleFolderPendingChange = useCallback((key: FolderPendingKey, value: FolderPendingValue) => {
    setFolderPending((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  }, []);

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const totalPendingCount = spacePending.size + folderPending.size;

  const handleSaveAll = async () => {
    setSaving(true);

    // Save space-level changes
    const spaceEntries = Array.from(spacePending.entries());
    await Promise.all(
      spaceEntries.map(([id, p]) =>
        onUpdateRule(id, {
          classification: p.classification,
          clientName: p.clientName || undefined,
        })
      )
    );
    setSpacePending(new Map());

    // Save folder-level changes
    const folderEntries = Array.from(folderPending.entries());
    await Promise.all(
      folderEntries.map(async ([key, p]) => {
        if (key.startsWith("rule:")) {
          // Existing rule
          const ruleId = Number(key.slice(5));
          if (p.classification === "inherit") {
            // Delete the rule — revert to "inherit from space"
            await onDeleteRule(ruleId);
          } else {
            await onUpdateRule(ruleId, {
              classification: p.classification,
              clientName: p.clientName || undefined,
            });
          }
        } else {
          // No rule yet (key = `new:<folderId>`)
          if (p.classification !== "inherit") {
            await onCreateRule({
              ruleType: "folder",
              matchId: p.folderId,
              matchName: p.folderName,
              classification: p.classification,
              clientName: p.clientName || undefined,
            });
          }
          // If "inherit", nothing to do — no rule to create or delete
        }
      })
    );
    setFolderPending(new Map());

    setSaving(false);
  };

  const handleSeed = async () => {
    const result = await onSeedRules();
    setSeedMsg(
      result.skipped
        ? "Rules already seeded."
        : `Seeded ${result.seeded} default rules.`
    );
    setTimeout(() => setSeedMsg(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: "var(--color-bg-elevated)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {totalPendingCount > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium transition-all"
            style={{
              background: "rgba(52,209,134,0.15)",
              border: "1px solid rgba(52,209,134,0.3)",
              color: "#34d186",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Save size={12} aria-hidden="true" />
            Save {totalPendingCount} change{totalPendingCount !== 1 ? "s" : ""}
          </button>
        )}
        <button
          type="button"
          onClick={handleSeed}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          Seed Defaults
        </button>
        {seedMsg && (
          <span className="text-[11px] font-mono" style={{ color: "#34d186" }}>
            {seedMsg}
          </span>
        )}
      </div>

      {/* Space rules with expandable folder drill-down */}
      {spaceRules.length > 0 && (
        <div>
          <p className="text-[11px] font-mono font-medium uppercase tracking-widest mb-2" style={{ color: "var(--color-text-muted)" }}>
            Space Rules
          </p>
          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr style={{ background: "var(--color-bg-elevated)" }}>
                  {["Space / Folder", "Classification", "Client Name", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-wider"
                      style={{
                        color: "var(--color-text-muted)",
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spaceRules.map((rule) => {
                  const p = getSpacePending(rule);
                  const isSpaceDirty =
                    p.classification !== rule.classification ||
                    (p.clientName || "") !== (rule.clientName ?? "");
                  const isExpanded = rule.matchId != null && expandedSpaces.has(rule.matchId);

                  return (
                    <>
                      {/* Space row */}
                      <tr
                        key={rule.id}
                        style={{
                          borderBottom: isExpanded ? "none" : "1px solid var(--color-border-default)",
                          background: isSpaceDirty ? "rgba(251,191,36,0.04)" : undefined,
                        }}
                      >
                        {/* Chevron + space name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => rule.matchId && toggleSpace(rule.matchId)}
                              aria-label={isExpanded ? "Collapse folders" : "Expand folders"}
                              className="flex items-center justify-center w-5 h-5 rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]"
                              style={{
                                color: "var(--color-text-muted)",
                                flexShrink: 0,
                              }}
                            >
                              <ChevronRight
                                size={12}
                                aria-hidden="true"
                                style={{
                                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                  transition: "transform 150ms ease",
                                }}
                              />
                            </button>
                            <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                              {rule.matchName ?? rule.matchId}
                            </span>
                            {rule.matchId && (
                              <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                                {rule.matchId}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Classification */}
                        <td className="px-4 py-3">
                          <select
                            value={p.classification}
                            onChange={(e) =>
                              setSpacePendingFor(rule.id, {
                                classification: e.target.value as "billable" | "non-billable",
                              })
                            }
                            className="rounded-md px-2 py-1 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                            style={{
                              background: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border-default)",
                              color:
                                p.classification === "billable" ? "#34d186" : "var(--color-text-secondary)",
                            }}
                          >
                            <option value="billable">Billable</option>
                            <option value="non-billable">Non-Billable</option>
                          </select>
                        </td>
                        {/* Client name */}
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            placeholder="Client name (optional)"
                            value={p.clientName}
                            onChange={(e) => setSpacePendingFor(rule.id, { clientName: e.target.value })}
                            className="rounded-md px-2 py-1 text-[12px] font-mono outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                            style={{
                              background: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border-default)",
                              color: "var(--color-text-secondary)",
                              width: "180px",
                            }}
                          />
                        </td>
                        {/* Dirty indicator */}
                        <td className="px-4 py-3">
                          {isSpaceDirty && (
                            <span className="text-[11px] font-mono" style={{ color: "#fbbf24" }}>
                              unsaved
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded folder rows */}
                      {isExpanded && rule.matchId && (
                        <SpaceFolderRows
                          key={`folders-${rule.matchId}`}
                          spaceId={rule.matchId}
                          spaceRule={rule}
                          pendingFolders={folderPending}
                          onFolderPendingChange={handleFolderPendingChange}
                        />
                      )}

                      {/* Separator after expanded section */}
                      {isExpanded && (
                        <tr key={`sep-${rule.id}`} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <td colSpan={4} style={{ padding: 0, height: 0 }} />
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rules.length === 0 && (
        <p className="text-[12px] font-mono py-4 text-center" style={{ color: "var(--color-text-muted)" }}>
          No billing rules configured. Click "Seed Defaults" to initialize.
        </p>
      )}
    </div>
  );
}

// ── Collapsible Section wrapper ───────────────────────────────────────────────

interface CollapsibleSectionProps {
  label: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ label, icon, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 cursor-pointer select-none rounded-md px-4 py-2.5 text-[12px] font-mono font-medium w-fit transition-colors"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
        aria-expanded={open}
      >
        {icon}
        <span>{label}</span>
        {open ? (
          <ChevronUp size={12} aria-hidden="true" />
        ) : (
          <ChevronDown size={12} aria-hidden="true" />
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── Space Filter Dropdown ─────────────────────────────────────────────────────

interface SpaceFilterProps {
  spaces: SpaceInfo[];
  selectedSpaceId: string;
  onChange: (id: string) => void;
}

function SpaceFilter({ spaces, selectedSpaceId, onChange }: SpaceFilterProps) {
  return (
    <select
      value={selectedSpaceId}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md px-3 py-1.5 text-[12px] font-mono outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-default)",
        color: "var(--color-text-secondary)",
        minWidth: "160px",
      }}
      aria-label="Filter by space"
    >
      <option value="">All Projects</option>
      {spaces.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

// ── Week Selector ─────────────────────────────────────────────────────────────

interface WeekSelectorProps {
  weekStartDate: Date;
  onPrev: () => void;
  onNext: () => void;
}

function WeekSelector({ weekStartDate, onPrev, onNext }: WeekSelectorProps) {
  const endDate = weekEnd(weekStartDate);
  const label = `${weekStartDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous week"
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span
        className="px-3 py-1 rounded-md text-[12px] font-mono"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-primary)",
          minWidth: "200px",
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next week"
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Month Selector ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthSelectorProps {
  /** First day of the selected month */
  monthDate: Date;
  onPrev: () => void;
  onNext: () => void;
}

function MonthSelector({ monthDate, onPrev, onNext }: MonthSelectorProps) {
  const label = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous month"
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span
        className="px-3 py-1 rounded-md text-[12px] font-mono"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-primary)",
          minWidth: "160px",
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next month"
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── View Mode Toggle ──────────────────────────────────────────────────────────

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div
      className="flex items-center rounded-md overflow-hidden"
      style={{ border: "1px solid var(--color-border-default)" }}
      role="group"
      aria-label="View mode"
    >
      {(["weekly", "monthly"] as ViewMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className="px-3 py-1.5 text-[12px] font-mono font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)] capitalize"
          style={
            mode === m
              ? {
                  background: "var(--color-accent-primary)",
                  color: "#fff",
                }
              : {
                  background: "var(--color-bg-surface)",
                  color: "var(--color-text-secondary)",
                }
          }
          aria-pressed={mode === m}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

// ── CSV Download ──────────────────────────────────────────────────────────────

function triggerCsvDownload(start: string, end: string, spaceId: string) {
  const params = new URLSearchParams({ start, end });
  if (spaceId) params.set("space_id", spaceId);
  const url = `/api/timesheet/export?${params}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `timesheet-${start}-to-${end}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Main Component ────────────────────────────────────────────────────────────

export const TimesheetDashboard = memo(function TimesheetDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");

  // Weekly state
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    weekStart(new Date())
  );

  // Monthly state — default to the first of the current month
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() =>
    monthStart(new Date())
  );

  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("");

  /** When true, only rows with totalHours > 0 are shown in the grid. Default ON. */
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  // Derive the active date range based on view mode
  const { startDate, endDate } = (() => {
    if (viewMode === "weekly") {
      const dates = weekDates(currentWeekStart);
      return { startDate: dates[0], endDate: dates[6] };
    } else {
      return {
        startDate: toISODate(monthStart(currentMonthDate)),
        endDate: toISODate(
          new Date(
            currentMonthDate.getFullYear(),
            currentMonthDate.getMonth() + 1,
            0
          )
        ),
      };
    }
  })();

  const summary    = useTimesheetSummary();
  const byProject  = useTimesheetByProject();
  const spacesHook = useTimesheetSpaces();
  const tasksHook  = useTimesheetTasks();
  const billingHook= useBillingRules();

  // Fetch data whenever date range or space filter changes
  const fetchAll = useCallback(() => {
    summary.refetch(startDate, endDate, selectedSpaceId || undefined);
    byProject.refetch(startDate, endDate, selectedSpaceId || undefined);
  }, [startDate, endDate, selectedSpaceId, summary.refetch, byProject.refetch]);

  // Fetch spaces + billing rules once on mount
  useEffect(() => {
    spacesHook.refetch();
    billingHook.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch summary+project data whenever filter changes
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedSpaceId]);

  const loading = summary.loading || byProject.loading;
  const error = summary.error ?? byProject.error;

  const members  = summary.data?.members ?? [];
  const projects = byProject.data?.projects ?? [];
  const tasks    = tasksHook.data?.tasks ?? [];

  /** Members shown in the grid — respects the "hide empty" toggle. */
  const gridMembers = hideEmpty ? members.filter((m) => m.totalHours > 0) : members;

  // ── Weekly navigation handlers ─────────────────────────────────────────────

  const handlePrevWeek = () => {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  // ── Monthly navigation handlers ────────────────────────────────────────────

  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => {
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => {
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  };

  // ── Title ──────────────────────────────────────────────────────────────────

  const pageTitle = viewMode === "weekly" ? "Weekly Timesheet" : "Monthly Timesheet";

  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6 pb-12 max-w-[1400px] mx-auto"
      style={{ color: "var(--color-text-primary)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Title */}
        <div>
          <h1
            className="text-[11px] font-mono font-semibold tracking-[3px] uppercase mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            TIMESHEET
          </h1>
          <div className="flex items-center gap-2">
            <Clock size={18} style={{ color: "var(--color-accent-primary)" }} aria-hidden="true" />
            <span
              className="text-[20px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {pageTitle}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />

          {/* Date picker — changes based on view mode */}
          {viewMode === "weekly" ? (
            <WeekSelector
              weekStartDate={currentWeekStart}
              onPrev={handlePrevWeek}
              onNext={handleNextWeek}
            />
          ) : (
            <MonthSelector
              monthDate={currentMonthDate}
              onPrev={handlePrevMonth}
              onNext={handleNextMonth}
            />
          )}

          <SpaceFilter
            spaces={spacesHook.spaces}
            selectedSpaceId={selectedSpaceId}
            onChange={setSelectedSpaceId}
          />

          {/* Hide empty toggle */}
          <button
            type="button"
            onClick={() => setHideEmpty((v) => !v)}
            aria-pressed={hideEmpty}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
            style={
              hideEmpty
                ? {
                    background: "rgba(129,140,248,0.15)",
                    border: "1px solid rgba(129,140,248,0.4)",
                    color: "#818cf8",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-secondary)",
                  }
            }
          >
            <Users size={13} aria-hidden="true" />
            {hideEmpty ? "Active only" : "Show all"}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            aria-label="Refresh timesheet"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: "var(--color-text-secondary)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <RefreshCw
              size={13}
              className={loading ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            Refresh
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => triggerCsvDownload(startDate, endDate, selectedSpaceId)}
            aria-label="Export to CSV"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
            style={{
              color: "var(--color-text-secondary)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <Download size={13} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
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
          Failed to load timesheet: {error}
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <SummaryCards members={members} totalMemberCount={members.length} loading={summary.loading} mode={viewMode} />

      {/* ── Billing summary cards ──────────────────────────────────────────── */}
      <BillingCards members={members} loading={summary.loading} />

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <section>
        <p
          className="text-[11px] font-mono font-medium uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {viewMode === "weekly" ? "Weekly Grid" : "Monthly Summary"}
        </p>
        {viewMode === "weekly" ? (
          <WeeklyGrid
            members={gridMembers}
            dates={weekDates(currentWeekStart)}
            loading={summary.loading}
          />
        ) : (
          <MonthlyGrid
            members={gridMembers}
            startISO={startDate}
            endISO={endDate}
            loading={summary.loading}
          />
        )}
      </section>

      {/* ── Project breakdown (collapsible) ───────────────────────────────── */}
      <details className="group">
        <summary
          className="flex items-center gap-2 cursor-pointer select-none list-none rounded-md px-4 py-2.5 text-[12px] font-mono font-medium w-fit transition-colors mb-3"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span
            className="text-[10px] transition-transform duration-150 group-open:rotate-90 inline-block"
            aria-hidden="true"
          >
            ▶
          </span>
          Project Breakdown
        </summary>
        <ProjectBreakdown projects={projects} loading={byProject.loading} />
      </details>

      {/* ── Client breakdown (collapsible) ────────────────────────────────── */}
      <CollapsibleSection
        label="Client Breakdown"
        icon={<DollarSign size={13} aria-hidden="true" />}
      >
        <ClientBreakdown members={members} loading={summary.loading} />
      </CollapsibleSection>

      {/* ── Task detail (collapsible) ─────────────────────────────────────── */}
      <CollapsibleSection
        label="Task Detail (for verification)"
        icon={<ListChecks size={13} aria-hidden="true" />}
      >
        <TaskDetailSection tasks={tasks} loading={tasksHook.loading} />
        {!tasksHook.data && !tasksHook.loading && (
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={() =>
                tasksHook.refetch(startDate, endDate, selectedSpaceId || undefined)
              }
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-secondary)",
              }}
            >
              <RefreshCw size={12} aria-hidden="true" />
              Load Tasks
            </button>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Billing config (collapsible) ──────────────────────────────────── */}
      <CollapsibleSection
        label="Billing Configuration"
        icon={<Settings2 size={13} aria-hidden="true" />}
      >
        <BillingConfigPanel
          rules={billingHook.rules}
          loading={billingHook.loading}
          onUpdateRule={billingHook.updateRule}
          onCreateRule={billingHook.createRule}
          onDeleteRule={billingHook.deleteRule}
          onSeedRules={billingHook.seedRules}
        />
      </CollapsibleSection>
    </div>
  );
});
