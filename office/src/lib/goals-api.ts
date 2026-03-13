// ── Goals API — typed async helpers for /api/goals ────────────────────────────

import type { Goal } from "./types";

// ── Response shapes ────────────────────────────────────────────────────────────

interface ErrorResponse {
  error: string;
}

interface GoalResponse {
  ok: true;
  goal: Goal;
}

interface GoalsListResponse {
  ok: true;
  goals: Goal[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isErrorResponse(data: unknown): data is ErrorResponse {
  return (
    data !== null &&
    typeof data === "object" &&
    "error" in (data as Record<string, unknown>) &&
    typeof (data as Record<string, unknown>)["error"] === "string"
  );
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data: unknown = await res.json();
  if (!res.ok || isErrorResponse(data)) {
    const message = isErrorResponse(data) ? data.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch all goals from the server.
 * GET /api/goals → { ok: true, goals: Goal[] }
 */
export async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch("/api/goals");
  const data = await parseResponse<GoalsListResponse>(res);
  return data.goals;
}

/**
 * Create a new goal.
 * POST /api/goals → { ok: true, goal: Goal }
 */
export async function createGoal(title: string): Promise<Goal> {
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const data = await parseResponse<GoalResponse>(res);
  return data.goal;
}

/**
 * Patch an existing goal.
 * PATCH /api/goals/:id → { ok: true, goal: Goal }
 *
 * Supported patch fields:
 * - title: new title string
 * - status: "in_progress" | "completed"
 * - linkChainId: chain ID to add to linkedChainIds
 * - unlinkChainId: chain ID to remove from linkedChainIds
 */
export async function updateGoal(
  id: string,
  patch: {
    title?: string;
    status?: string;
    linkChainId?: string;
    unlinkChainId?: string;
  }
): Promise<Goal> {
  const res = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await parseResponse<GoalResponse>(res);
  return data.goal;
}

/**
 * Delete a goal by ID.
 * DELETE /api/goals/:id → 204 No Content
 */
export async function deleteGoal(id: string): Promise<void> {
  const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
  if (!res.ok) {
    // Try to parse error body; fall back to status text
    const data: unknown = await res.json().catch(() => null);
    const message = isErrorResponse(data) ? data.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
}
