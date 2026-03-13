import { Hono } from "hono";
import type { AgentTracker, TrackedAgent } from "../core/agent-tracker.js";

// createDiscoveryRoutes returns a Hono router with agent discovery endpoints.
//
// Mount at /api/agents alongside the existing routes in server.ts.
// The paths used here (/discover, /:target/context, /:target/output) do not
// conflict with the existing routes (GET /, POST /worker, POST /spawn,
// DELETE /:target, PATCH /:target/name) because "discover", "context", and
// "output" are static or sub-segments that Hono resolves before the dynamic
// /:target catch-all when registered first.
export function createDiscoveryRoutes(
  tracker: AgentTracker,
  captureFn: (target: string, lines?: number) => Promise<string>,
): Hono {
  const router = new Hono();

  // GET /discover — filter agents by tag, status, worker (boolean string)
  //
  // Query params (all optional, combinable):
  //   tag    — filter by a single context tag (e.g. "backend", "frontend", "infra")
  //   status — filter by AgentStatus ("working" | "waiting" | "permission" | "error" | "idle")
  //   worker — "true" | "false" — filter by isWorker flag
  router.get("/discover", (c) => {
    const tagParam    = c.req.query("tag");
    const statusParam = c.req.query("status");
    const workerParam = c.req.query("worker");

    let agents: TrackedAgent[] = tracker.getAll();

    if (tagParam) {
      agents = agents.filter((a) =>
        Array.isArray(a.context?.tags) && a.context.tags.includes(tagParam),
      );
    }

    if (statusParam) {
      agents = agents.filter((a) => a.status === statusParam);
    }

    if (workerParam !== undefined) {
      const wantWorker = workerParam === "true";
      agents = agents.filter((a) => a.isWorker === wantWorker);
    }

    return c.json(agents);
  });

  // GET /:target/context — return the context field for an agent.
  //
  // Looks up by agent.target (e.g. "worker-1:0") or agent.sessionName
  // (e.g. "worker-1"). Returns 404 if no match is found.
  router.get("/:target/context", (c) => {
    const param  = decodeURIComponent(c.req.param("target"));
    const agents: TrackedAgent[] = tracker.getAll();
    const agent  = agents.find(
      (a) => a.target === param || a.sessionName === param,
    );

    if (!agent) {
      return c.json({ error: `agent '${param}' not found` }, 404);
    }

    return c.json(agent.context ?? null);
  });

  // GET /:target/output — capture live terminal output for an agent.
  //
  // Query params:
  //   lines — number of scrollback lines to capture (default 100, min 1, max 10000)
  //
  // Looks up by agent.target or agent.sessionName. Returns 404 if no match.
  router.get("/:target/output", async (c) => {
    const param  = decodeURIComponent(c.req.param("target"));
    const agents: TrackedAgent[] = tracker.getAll();
    const agent  = agents.find(
      (a) => a.target === param || a.sessionName === param,
    );

    if (!agent) {
      return c.json({ error: `agent '${param}' not found` }, 404);
    }

    const linesRaw = c.req.query("lines");
    const lines    = linesRaw
      ? Math.min(Math.max(parseInt(linesRaw, 10) || 100, 1), 10_000)
      : 100;

    try {
      const content = await captureFn(agent.target, lines);
      return c.json({ target: agent.target, lines, content });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  return router;
}
