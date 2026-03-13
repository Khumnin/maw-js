import { Hono } from "hono";
import { createGoal, getGoals, updateGoal, deleteGoal } from "./store.js";
import { CreateGoalSchema, UpdateGoalSchema } from "../types/api.js";

export const goalRoutes = new Hono();

// GET / — list all goals
goalRoutes.get("/", (c) => {
  try {
    const goals = getGoals();
    return c.json({ ok: true, goals });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// POST / — create a new goal
goalRoutes.post("/", async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = CreateGoalSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const goal = createGoal(parsed.data.title);
    return c.json({ ok: true, goal });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// PATCH /:id — update title, status, or linked chain IDs
goalRoutes.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const raw = await c.req.json();
    const parsed = UpdateGoalSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const goal = updateGoal(id, parsed.data);
    if (!goal) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, goal });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// DELETE /:id — remove a goal
goalRoutes.delete("/:id", (c) => {
  try {
    const id = c.req.param("id");
    const ok = deleteGoal(id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});
