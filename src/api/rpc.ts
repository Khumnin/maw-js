import { Hono } from "hono";
import { capture } from "../services/ssh.js";
import type { AgentTracker, TrackedAgent } from "../core/agent-tracker.js";
import type { TaskDispatcher, Task } from "../core/dispatcher.js";
import type { RpcCall } from "../types/api.js";
import { RpcCallSchema } from "../types/api.js";

// Re-export RpcCall so existing importers of rpc.ts continue to work.
export type { RpcCall };

// In-memory store — RPC calls are transient
const rpcCalls = new Map<string, RpcCall>();

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS   = 2_000;

export function createRpcRoutes(
  dispatcher: TaskDispatcher,
  tracker: AgentTracker,
  broadcast: (msg: unknown) => void,
): Hono {
  const router = new Hono();

  // POST /call — initiate an agent-to-agent RPC
  router.post("/call", async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const parsed = RpcCallSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }

    const { from, to, prompt, timeout: timeoutRaw } = parsed.data;
    const timeoutMs = timeoutRaw ?? DEFAULT_TIMEOUT_MS;

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
            status.completed.find((t) => t.id === task.id) ??
            status.failed.find((t) => t.id === task.id) ??
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
