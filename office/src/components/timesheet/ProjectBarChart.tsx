import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ProjectSummary } from "@/hooks/useTimesheet";

interface ProjectBarChartProps {
  projects: ProjectSummary[];
}

const BAR_COLOR = "#818cf8";
const AXIS_COLOR = "var(--color-text-muted)";
const GRID_COLOR = "rgba(255,255,255,0.05)";

interface TooltipPayloadItem {
  value?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px] font-mono shadow-lg"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-default)",
        color: "var(--color-text-primary)",
      }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <p>
        <span style={{ color: BAR_COLOR }}>{value.toFixed(1)}h</span> total
      </p>
    </div>
  );
}

export function ProjectBarChart({ projects }: ProjectBarChartProps) {
  // Truncate long names for the chart axis
  const data = projects.map((p) => ({
    name: p.spaceName.length > 18 ? `${p.spaceName.slice(0, 16)}…` : p.spaceName,
    fullName: p.spaceName,
    hours: parseFloat(p.totalHours.toFixed(2)),
  }));

  if (data.length === 0) return null;

  return (
    <div
      className="rounded-lg px-4 pt-4 pb-2"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <p
        className="text-[11px] font-mono uppercase tracking-wider mb-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        Hours by Project
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          barCategoryGap="28%"
        >
          <XAxis
            dataKey="name"
            tick={{ fill: AXIS_COLOR, fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: AXIS_COLOR, fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}h`}
            width={40}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={BAR_COLOR}
                fillOpacity={1 - index * (0.15 / Math.max(data.length - 1, 1))}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
