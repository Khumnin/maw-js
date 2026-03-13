import { useState, useEffect, useCallback } from "react";
import type { Task } from "@/lib/types";

/** Categorised task queue state — mirrors the 4 Kanban columns. */
export interface TaskQueueState {
  pending: Task[];
  assigned: Task[];
  completed: Task[];
  failed: Task[];
}

const EMPTY: TaskQueueState = { pending: [], assigned: [], completed: [], failed: [] };

/**
 * useTaskQueue — maintains real-time Kanban task state.
 *
 * - Fetches initial state from GET /api/queue on mount.
 * - Subscribes to `maw-ws-message` CustomEvents for live updates:
 *   - `queue-status`    → full replace (reconnect / initial push)
 *   - `task-submitted`  → insert into pending
 *   - `task-assigned`   → move pending → assigned
 *   - `task-completed`  → move assigned → completed (cap at 50)
 *   - `task-failed`     → move any column → failed (cap at 50)
 *   - `task-timeout`    → treated as failed
 */
export function useTaskQueue(): TaskQueueState {
  const [state, setState] = useState<TaskQueueState>(EMPTY);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const removeById = (lists: Task[][], id: string): Task[][] =>
    lists.map((list) => list.filter((t) => t.id !== id));

  const upsertTask = useCallback((task: Task) => {
    setState((prev) => {
      const status = task.status;
      // Remove from all columns first
      const [pending, assigned, completed, failed] = removeById(
        [prev.pending, prev.assigned, prev.completed, prev.failed],
        task.id
      );

      switch (status) {
        case "pending":
          return { pending: [task, ...pending], assigned, completed, failed };
        case "assigned":
          return { pending, assigned: [task, ...assigned], completed, failed };
        case "completed":
          return {
            pending,
            assigned,
            completed: [task, ...completed].slice(0, 50),
            failed,
          };
        case "failed":
          return {
            pending,
            assigned,
            completed,
            failed: [task, ...failed].slice(0, 50),
          };
        default:
          return prev;
      }
    });
  }, []);

  // ── Initial fetch ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/queue");
        if (!res.ok) return;
        const data = (await res.json()) as {
          pending?: Task[];
          assigned?: Task[];
          completed?: Task[];
          failed?: Task[];
        };
        if (!cancelled) {
          setState({
            pending: data.pending ?? [],
            assigned: data.assigned ?? [],
            completed: (data.completed ?? []).slice(0, 50),
            failed: (data.failed ?? []).slice(0, 50),
          });
        }
      } catch {
        // Non-fatal — WS updates will populate state
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── WS listener ───────────────────────────────────────────────────────────

  useEffect(() => {
    function handleEvent(e: Event) {
      const data = (e as CustomEvent<unknown>).detail;
      if (data === null || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;

      switch (msg.type) {
        case "queue-status": {
          // Full replace
          const qs = msg as {
            type: string;
            pending?: Task[];
            assigned?: Task[];
            history?: Task[];
          };
          const history: Task[] = qs.history ?? [];
          setState({
            pending: qs.pending ?? [],
            assigned: qs.assigned ?? [],
            completed: history.filter((t) => t.status === "completed").slice(0, 50),
            failed: history.filter((t) => t.status === "failed").slice(0, 50),
          });
          break;
        }
        case "task-submitted":
        case "task-assigned":
        case "task-completed": {
          const t = (msg as { task: Task }).task;
          if (t) upsertTask(t);
          break;
        }
        case "task-failed":
        case "task-timeout": {
          const t = (msg as { task: Task }).task;
          if (t) upsertTask({ ...t, status: "failed" });
          break;
        }
      }
    }

    window.addEventListener("maw-ws-message", handleEvent);
    return () => window.removeEventListener("maw-ws-message", handleEvent);
  }, [upsertTask]);

  return state;
}
