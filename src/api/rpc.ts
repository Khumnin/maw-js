import { Hono } from "hono";
import { capture } from "../services/ssh.js";
import type { AgentTracker, TrackedAgent } from "../core/agent-tracker.js";
import type { TaskDispatcher, Task } from "../core/dispatcher.js";

export interface RpcCall {
  id: string;
  from: string;           // caller agent session name
  to: string;             // target agent session name
  prompt: string;         // the work to do
  taskId: string;         // underlying dispatcher task ID
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  output?: string;        // captured output from target agent
  createdAt: number;
  completedAt?: number;
  timeout: number;        // ms, default 120000
}

// In-memory store — RPC calls are transient
const rpcCalls = new Map<string, RpcCall>();

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS     = 300_000;
const POLL_INTERVAL_MS   = 2_000;

export function createRpcRoutes(
  dispatcher: TaskDispatcher,
  tracker: AgentTracker,
  broadcast: (msg: unknown) => void,
): Hono {
  const router = new Hono();

  // POST /call — initiate an agent-to-agent RPC
  router.post("/call", async (c) => {
    let body: { from?: unknown; to?: unknown; prompt?: unknown; timeout?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { from, to, prompt, timeout: timeoutRaw } = body;

    if (!from || typeof from !== "string") {
      return c.json({ error: "from (caller session name) required" }, 400);
    }
    if (!to || typeof to !== "string") {
      return c.json({ error: "to (target session name) required" }, 400);
    }
    if (!prompt || typeof prompt !== "string") {
      return c.json({ error: "prompt required" }, 400);
    }

    const timeoutMs = typeof timeoutRaw === "number"
      ? Math.min(Math.max(timeoutRaw, 1_000), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

    // Resolve target agent by session name
    const agents: TrackedAgent[] = tracker.getAll();
    const targetAgent = agents.find((a) => a.sessionName === to);
    if (!targetAgent) {
      return c.json({ error: `agent with session name '${to}' not found` }, 404);
    }

    // Submit high-priority task with affinity for the target agent
    const task = dispatcher.submitTask(
      prompt,
      "high",
      undefined,
      undefined,
      { preferAgent: targetAgent.target },
    );

    const call: RpcCall = {
      id: crypto.randomUUID().slice(0, 8),
      from,
      to,
      prompt,
      taskId: task.id,
      status: "pending",
      createdAt: Date.now(),
      timeout: timeoutMs,
    };

    rpcCalls.set(call.id, call);
    broadcast({ type: "rpc-initiated", call: { ...call } });

    // Poll for completion — honour client disconnect via AbortController
    const ac = new AbortController();
    c.req.raw.signal?.addEventListener("abort", () => ac.abort());

    try {
      call.status = "running";
      rpcCalls.set(call.id, call);

      const deadline = call.createdAt + timeoutMs;

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(() => {
          if (ac.signal.aborted) {
            clearInterval(interval);
            reject(new Error("client disconnected"));
            return;
          }

          if (Date.now() > deadline) {
            clearInterval(interval);
            reject(new Error("timeout"));
            return;
          }

          const status = dispatcher.getStatus();
          const found: Task | undefined =
            status.history.find((t) => t.id === task.id) ??
            status.assigned.find((t) => t.id === task.id) ??
            status.pending.find((t) => t.id === task.id);

          if (!found) return; // not yet visible — keep polling

          if (found.status === "completed") {
            clearInterval(interval);
            resolve();
          } else if (found.status === "failed") {
            clearInterval(interval);
            reject(new Error("task failed"));
          }
        }, POLL_INTERVAL_MS);
      });

      // Task completed — capture output from target agent
      const output = await capture(targetAgent.target, 150);

      call.status = "completed";
      call.output = output;
      call.completedAt = Date.now();
      rpcCalls.set(call.id, call);
      broadcast({ type: "rpc-completed", call: { ...call } });

      return c.json({
        id: call.id,
        from: call.from,
        to: call.to,
        status: call.status,
        output: call.output,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg === "timeout") {
        call.status = "timeout";
      } else if (msg === "client disconnected") {
        call.status = "failed";
      } else {
        call.status = "failed";
      }

      call.completedAt = Date.now();
      rpcCalls.set(call.id, call);
      broadcast({ type: "rpc-failed", call: { ...call }, reason: msg });

      // 499 (client disconnected) is not in Hono's StatusCode union — cast required.
      // TODO: Sprint 2 - use a typed status code wrapper when Hono supports 499
      const httpStatus = msg === "client disconnected" ? 499 : 504;
      return c.json(
        { error: msg, id: call.id, from: call.from, to: call.to, status: call.status },
        httpStatus as 504,
      );
    }
  });

  // GET /:callId/status — retrieve a single RPC call by ID
  router.get("/:callId/status", (c) => {
    const callId = c.req.param("callId");
    const call = rpcCalls.get(callId);
    if (!call) {
      return c.json({ error: `RPC call '${callId}' not found` }, 404);
    }
    return c.json(call);
  });

  // GET / — list all active (non-terminal) RPC calls
  router.get("/", (c) => {
    const active = [...rpcCalls.values()].filter(
      (call) => call.status === "pending" || call.status === "running",
    );
    return c.json(active);
  });

  return router;
}
