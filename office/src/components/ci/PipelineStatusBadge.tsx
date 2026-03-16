import { memo } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  MinusCircle,
  SkipForward,
  Hand,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | "running"
  | "pending"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
  | "manual"
  | string;

interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

// ── Status config map ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, StatusConfig> = {
  running: {
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.25)",
    label: "Running",
    Icon: Loader2,
  },
  pending: {
    color: "#eab308",
    bg: "rgba(234,179,8,0.1)",
    border: "rgba(234,179,8,0.25)",
    label: "Pending",
    Icon: Clock,
  },
  success: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.25)",
    label: "Success",
    Icon: CheckCircle2,
  },
  failed: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    label: "Failed",
    Icon: XCircle,
  },
  canceled: {
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.2)",
    label: "Canceled",
    Icon: MinusCircle,
  },
  skipped: {
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.2)",
    label: "Skipped",
    Icon: SkipForward,
  },
  manual: {
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.25)",
    label: "Manual",
    Icon: Hand,
  },
};

const FALLBACK_CONFIG: StatusConfig = {
  color: "#6b7280",
  bg: "rgba(107,114,128,0.1)",
  border: "rgba(107,114,128,0.2)",
  label: "Unknown",
  Icon: MinusCircle,
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? FALLBACK_CONFIG;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PipelineStatusBadgeProps {
  /** Pipeline status string */
  status: PipelineStatus;
  /** Whether to show the text label alongside the icon (default: true) */
  showLabel?: boolean;
  /** Icon size in px (default: 13) */
  iconSize?: number;
}

/**
 * PipelineStatusBadge — small pill showing pipeline status with icon + color.
 *
 * The "running" status renders a spinning icon to draw attention.
 */
export const PipelineStatusBadge = memo(function PipelineStatusBadge({
  status,
  showLabel = true,
  iconSize = 13,
}: PipelineStatusBadgeProps) {
  const cfg = getStatusConfig(status);
  const isRunning = status === "running";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-mono font-medium shrink-0"
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
      aria-label={`Status: ${cfg.label}`}
    >
      <cfg.Icon
        size={iconSize}
        className={isRunning ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      {showLabel && <span>{cfg.label}</span>}
    </span>
  );
});
