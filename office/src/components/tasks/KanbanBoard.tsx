import { useState } from "react";
import { KanbanColumn } from "./KanbanColumn";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import type { Task } from "@/lib/types";
import type { TaskQueueState } from "@/hooks/useTaskQueue";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  queue: TaskQueueState;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * KanbanBoard — 4-column board (Pending / Assigned / Completed / Failed).
 *
 * - No drag-and-drop (ADR-002) — click to open TaskDetailDrawer.
 * - Pending tasks include a cancel button.
 * - Each column scrolls independently.
 */
export function KanbanBoard({ queue }: KanbanBoardProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleTaskClick(task: Task) {
    setSelectedTask(task);
    setDrawerOpen(true);
  }

  function handleDrawerClose() {
    setDrawerOpen(false);
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 h-full">
        <KanbanColumn
          title="Pending"
          tasks={queue.pending}
          showCancel
          onTaskClick={handleTaskClick}
        />
        <KanbanColumn
          title="Assigned"
          tasks={queue.assigned}
          onTaskClick={handleTaskClick}
        />
        <KanbanColumn
          title="Completed"
          tasks={queue.completed}
          onTaskClick={handleTaskClick}
        />
        <KanbanColumn
          title="Failed"
          tasks={queue.failed}
          onTaskClick={handleTaskClick}
        />
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={handleDrawerClose}
      />
    </>
  );
}
