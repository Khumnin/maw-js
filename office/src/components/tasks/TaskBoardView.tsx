import { useTaskQueue } from "@/hooks/useTaskQueue";
import { useAgents } from "@/hooks/useAgents";
import { KanbanBoard } from "./KanbanBoard";
import { TaskSubmitForm } from "./TaskSubmitForm";

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskBoardView — route container for `#tasks`.
 *
 * Composes:
 * - TaskSubmitForm  (top — enhanced submission with affinity detection)
 * - KanbanBoard     (main — 4-column Pending/Assigned/Completed/Failed)
 *
 * Live data via useTaskQueue (WS + initial GET /api/queue).
 * Lazy-loaded by App.tsx via React.lazy.
 */
export function TaskBoardView() {
  const queue = useTaskQueue();
  const agents = useAgents();

  const totalActive = queue.pending.length + queue.assigned.length;

  return (
    <div
      className="flex flex-col gap-5 p-5 min-h-full"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Page heading */}
      <div>
        <h1
          className="text-[14px] font-semibold tracking-[1.5px] uppercase"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
        >
          Task Board
        </h1>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {totalActive > 0 ? (
            <>
              <span style={{ color: "var(--color-accent-primary)" }}>{totalActive}</span>
              {" active · "}
              <span style={{ color: "var(--color-status-waiting)" }}>{queue.pending.length}</span>
              {" pending · "}
              <span style={{ color: "var(--color-status-working)" }}>{queue.assigned.length}</span>
              {" assigned"}
            </>
          ) : (
            "No active tasks"
          )}
        </p>
      </div>

      {/* Submission form */}
      <TaskSubmitForm agents={agents} />

      {/* Kanban board */}
      <div className="flex-1">
        <p
          className="text-[11px] font-medium uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Queue
        </p>
        <KanbanBoard queue={queue} />
      </div>
    </div>
  );
}
