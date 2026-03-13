import { TaskCard } from "./TaskCard";
import type { Task } from "@/lib/types";

// ── Column config ─────────────────────────────────────────────────────────────

interface ColumnConfig {
  accentColor: string;
  dotColor: string;
}

const COLUMN_CONFIG: Record<string, ColumnConfig> = {
  Pending:   { accentColor: "var(--color-status-waiting)",   dotColor: "#fbbf24" },
  Assigned:  { accentColor: "var(--color-status-working)",   dotColor: "#22d3ee" },
  Completed: { accentColor: "var(--color-status-completed)", dotColor: "#4ade80" },
  Failed:    { accentColor: "var(--color-status-error)",     dotColor: "#f87171" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  showCancel?: boolean;
  onTaskClick: (task: Task) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * KanbanColumn — a single titled column in the Kanban board.
 *
 * Renders a header with count badge and a scrollable list of TaskCards.
 * No drag-and-drop — click-only interactions per ADR-002.
 */
export function KanbanColumn({ title, tasks, showCancel, onTaskClick }: KanbanColumnProps) {
  const config = COLUMN_CONFIG[title] ?? {
    accentColor: "var(--color-text-muted)",
    dotColor: "#6b7280",
  };

  return (
    <div
      className="flex flex-col rounded-xl border overflow-hidden min-h-0"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {/* Accent dot */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: config.dotColor }}
        />
        {/* Title */}
        <span
          className="text-[11px] font-medium uppercase tracking-wider flex-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </span>
        {/* Count badge */}
        <span
          className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md"
          style={{
            background: "var(--color-bg-elevated)",
            color: tasks.length > 0 ? config.accentColor : "var(--color-text-muted)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Scrollable task list */}
      <div
        className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-[120px]"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        {tasks.length === 0 ? (
          <div
            className="flex items-center justify-center h-full py-8 text-[10px] italic"
            style={{ color: "var(--color-text-muted)" }}
          >
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showCancel={showCancel}
              onClick={onTaskClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
