import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import type { DayCost } from "@/hooks/useTokenUsage";

// Recharts passes `fill` as an SVG attribute (not a CSS property), so the
// browser does not resolve CSS custom properties in that context.
// The semantic value is defined in index.css as --color-chart-bar-default;
// this constant mirrors it so the token remains the single source of truth.
const CHART_BAR_DEFAULT = "rgba(34, 211, 238, 0.35)"; // --color-chart-bar-default

/** Custom dark-theme tooltip */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const cost = payload[0]?.value ?? 0;
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px] shadow-lg"
      style={{
        background: "var(--color-bg-elevated)",
        borderColor: "var(--color-border-strong)",
        color: "var(--color-text-primary)",
      }}
    >
      <p className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <p className="font-mono mt-0.5">
        ${cost.toFixed(4)}
      </p>
    </div>
  );
}

/**
 * DailyCostChart — Recharts BarChart showing token cost for the last 7 days.
 * Today's bar is highlighted with the accent-primary colour.
 * Lazy-loaded via React.lazy in DashboardView.
 */
export function DailyCostChart() {
  const { data, totalCost, loading, error } = useTokenUsage();

  const todayDate = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border py-10 text-[12px]"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-muted)",
        }}
      >
        Loading cost data…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border py-10 text-[12px]"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
          color: "var(--color-accent-danger)",
        }}
      >
        Failed to load: {error}
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
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <p
          className="text-[12px] font-medium uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Daily Token Cost (7d)
        </p>
        <p
          className="text-[13px] font-mono font-semibold"
          style={{ color: "var(--color-accent-primary)" }}
        >
          ${totalCost.toFixed(2)} total
        </p>
      </div>

      {/* Chart */}
      <div className="px-2 py-4 min-h-0 w-full" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              width={48}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="cost" radius={[3, 3, 0, 0]}>
              {data.map((entry: DayCost) => (
                <Cell
                  key={entry.date}
                  fill={
                    entry.date === todayDate
                      ? "var(--color-accent-primary)"
                      : CHART_BAR_DEFAULT
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
