import { useCallback } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Task, TaskPriority } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Priority badge config ─────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  high:   { label: "High",   className: "bg-red-500/15 text-red-400 border-red-500/25" },
  normal: { label: "Normal", className: "bg-gray-500/15 text-gray-400 border-gray-500/20" },
  low:    { label: "Low",    className: "bg-gray-500/10 text-gray-500 border-gray-500/15" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  /** Show cancel button on pending tasks */
  showCancel?: boolean;
  onClick: (task: Task) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskCard — compact card for a single task in the Kanban board.
 *
 * - Shows task ID (truncated), command (max 80 chars), priority badge, age.
 * - Assigned column: also shows agent session name.
 * - Pending column: shows cancel (X) button.
 * - Click anywhere (except cancel) → opens TaskDetailDrawer.
 */
export function TaskCard({ task, showCancel, onClick }: TaskCardProps) {
  const { label: priorityLabel, className: priorityClass } = PRIORITY_CONFIG[task.priority];
  const shortId = task.id.slice(0, 8);
  const truncatedCommand =
    task.command.length > 80 ? task.command.slice(0, 80) + "…" : task.command;

  const handleCancel = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch("/api/queue/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success("Task cancelled", { description: `#${shortId}` });
      } catch {
        toast.error("Failed to cancel task", { description: `#${shortId}` });
      }
    },
    [task.id, shortId]
  );

  return (
    <button
      type="button"
      onClick={() => onClick(task)}
      className={cn(
        "w-full text-left rounded-lg border p-3 flex flex-col gap-2",
        "transition-colors hover:border-white/[0.12] hover:bg-white/[0.03]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
      )}
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Top row: ID + age + cancel */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-mono shrink-0"
          style={{ color: "var(--color-accent-primary)" }}
        >
          #{shortId}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span
            className="text-[9px] tabular-nums shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {relTime(task.createdAt)}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] font-mono px-1.5 py-0", priorityClass)}
          >
            {priorityLabel}
          </Badge>
          {showCancel && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded p-0.5 transition-colors hover:bg-red-500/20 hover:text-red-400"
              aria-label={`Cancel task ${shortId}`}
              title="Cancel task"
              style={{ color: "var(--color-text-muted)" }}
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Command */}
      <p
        className="text-[11px] font-mono leading-snug break-all text-left"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {truncatedCommand}
      </p>

      {/* Agent info for assigned tasks */}
      {task.assignedToName && (
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "var(--color-status-working)" }}
          />
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: "var(--color-text-muted)" }}
          >
            {task.assignedToName}
          </span>
        </div>
      )}
    </button>
  );
}
