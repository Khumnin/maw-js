import { useState, useEffect, useCallback, useRef } from "react";

/** Color coding for the timeline */
export type ActivityColor = "green" | "red" | "cyan" | "muted";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  type: string;
  description: string;
  color: ActivityColor;
}

const MAX_ENTRIES = 100;

function colorForType(type: string): ActivityColor {
  if (type === "task-completed" || type === "chain-completed") return "green";
  if (type === "task-failed" || type === "chain-failed" || type === "task-timeout") return "red";
  if (type === "agent-spawned" || type === "agent-killed") return "cyan";
  return "muted";
}

function descriptionForEvent(data: Record<string, unknown>): string {
  const type = String(data.type ?? "");
  switch (type) {
    case "agent-spawned":
      return `Agent spawned: ${String(data.sessionName ?? "unknown")}`;
    case "agent-killed":
      return `Agent killed: ${String(data.target ?? "unknown")}`;
    case "agent-renamed":
      return `Agent renamed: ${String(data.target ?? "unknown")} → ${String(data.name ?? "")}`;
    case "session-killed":
      return `Session killed: ${String(data.sessionName ?? "unknown")}`;
    case "task-completed": {
      const task = data.task as Record<string, unknown> | undefined;
      return `Task completed: ${String(task?.command ?? "").slice(0, 60)}`;
    }
    case "task-failed": {
      const task = data.task as Record<string, unknown> | undefined;
      return `Task failed: ${String(task?.command ?? "").slice(0, 60)}`;
    }
    case "task-timeout": {
      const task = data.task as Record<string, unknown> | undefined;
      return `Task timed out: ${String(task?.command ?? "").slice(0, 60)}`;
    }
    case "chain-completed": {
      const chain = data.chain as Record<string, unknown> | undefined;
      return `Chain completed: ${String(chain?.name ?? "unknown")}`;
    }
    case "chain-failed": {
      const chain = data.chain as Record<string, unknown> | undefined;
      return `Chain failed: ${String(chain?.name ?? "unknown")}`;
    }
    case "task-assigned": {
      const task = data.task as Record<string, unknown> | undefined;
      const worker = data.worker as Record<string, unknown> | undefined;
      return `Task assigned to ${String(worker?.name ?? "unknown")}: ${String(task?.command ?? "").slice(0, 40)}`;
    }
    case "task-submitted": {
      const task = data.task as Record<string, unknown> | undefined;
      return `Task submitted: ${String(task?.command ?? "").slice(0, 60)}`;
    }
    case "agents-updated":
      return "Agent fleet updated";
    default:
      return `Event: ${type}`;
  }
}

/**
 * useActivityFeed — subscribes to `maw-ws-message` CustomEvent and collects
 * all events into a capped array (max 100) with newest first.
 */
export function useActivityFeed(): ActivityEntry[] {
  const [feed, setFeed] = useState<ActivityEntry[]>([]);
  const idRef = useRef(0);

  const handleEvent = useCallback((e: Event) => {
    const data = (e as CustomEvent<unknown>).detail;
    if (data === null || typeof data !== "object") return;

    const record = data as Record<string, unknown>;
    const type = String(record.type ?? "");

    // Skip high-frequency / low-value events
    if (type === "sessions" || type === "capture") return;

    const entry: ActivityEntry = {
      id: `${Date.now()}-${++idRef.current}`,
      timestamp: Date.now(),
      type,
      description: descriptionForEvent(record),
      color: colorForType(type),
    };

    setFeed((prev) => {
      const next = [entry, ...prev];
      return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("maw-ws-message", handleEvent);
    return () => window.removeEventListener("maw-ws-message", handleEvent);
  }, [handleEvent]);

  return feed;
}
