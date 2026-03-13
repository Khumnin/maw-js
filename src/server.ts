import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { listSessions, capture, sendKeys, selectWindow, spawnAgent, killSession, killEntireSession, renameWindow } from "./services/ssh";
import { getTokenUsage, getRealtimeSessions, getUsageLimits } from "./services/token-usage";
import { AgentTracker } from "./core/agent-tracker";
import { TaskDispatcher } from "./core/dispatcher";
import { loadConfig, addWorker, removeWorker } from "./config";
import type { ServerWebSocket } from "bun";
import { readdir, readFile, access } from "fs/promises";
import { join, dirname, resolve, isAbsolute } from "path";
import { homedir } from "node:os";
import { pathValidator } from "./middleware/path-validator";
import { initDb } from "./db/store";
import { mailboxRoutes } from "./db/mailbox";
import { kvRoutes } from "./db/kv";
import { goalRoutes } from "./db/goals";
import { createRpcRoutes } from "./api/rpc";
import { createDiscoveryRoutes } from "./api/discovery";
import type { AgentDefinition } from "./types/api.js";
import { SubmitTaskSchema, CancelTaskSchema, SubmitChainSchema, WorkerActionSchema, SpawnAgentSchema } from "./types/api.js";
import { MAW_AGENTS_DIR, MAW_UPLOAD_DIR } from "./paths";

// ── Path-validator allowed roots ───────────────────────────────────────────────
// homedir() is always trusted (user's own files).
// MAW_UPLOAD_DIR is included so the upload staging area is always reachable.
// Additional roots can be injected via MAW_ALLOWED_ROOTS (colon-separated).
const extraRoots = process.env.MAW_ALLOWED_ROOTS
  ? process.env.MAW_ALLOWED_ROOTS.split(":").filter(Boolean)
  : [];
const ALLOWED_ROOTS: string[] = [homedir(), MAW_UPLOAD_DIR, ...extraRoots];

const app = new Hono();
app.use("/api/*", cors());

// --- WebSocket client set (must be declared before tracker/dispatcher) ---
type WSData = { target: string | null; lines: number };
const clients = new Set<ServerWebSocket<WSData>>();

// ── Command Center — Agent Tracker + Task Dispatcher ──────────────────────────

function broadcastToAll(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    try { ws.send(data); } catch {}
  }
}

const tracker = new AgentTracker();
const dispatcher = new TaskDispatcher(tracker, broadcastToAll);

initDb();

// Dispatcher loop — poll agents + tick dispatcher every 2s
let dispatchInterval: ReturnType<typeof setInterval> | null = null;

function startDispatchLoop() {
  if (dispatchInterval) return;
  dispatchInterval = setInterval(async () => {
    await tracker.pollAll();
    await dispatcher.tick();
    // Broadcast updated agent states to all clients
    broadcastToAll({ type: "agents-updated", agents: tracker.getAll() });
  }, 2000);
}

// ── Queue API ──────────────────────────────────────────────────────────────────

app.get("/api/queue", (c) => {
  return c.json(dispatcher.getStatus());
});

app.post("/api/queue/submit", async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = SubmitTaskSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const { command, priority, affinity } = parsed.data;
    const task = dispatcher.submitTask(command, priority, undefined, undefined, affinity);
    return c.json({ ok: true, task });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/queue/cancel", async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = CancelTaskSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const ok = dispatcher.cancelTask(parsed.data.taskId);
    return c.json({ ok });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── Agent API ─────────────────────────────────────────────────────────────────

app.get("/api/agents", (c) => {
  return c.json(tracker.getAll());
});

app.post("/api/agents/worker", async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = WorkerActionSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const { sessionName, action } = parsed.data;
    if (action === "add") {
      addWorker(sessionName);
      tracker.refreshWorkerFlags();
      broadcastToAll({ type: "agents-updated", agents: tracker.getAll() });
      return c.json({ ok: true, action: "added", sessionName });
    } else {
      removeWorker(sessionName);
      tracker.refreshWorkerFlags();
      broadcastToAll({ type: "agents-updated", agents: tracker.getAll() });
      return c.json({ ok: true, action: "removed", sessionName });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── Agent Definitions ──────────────────────────────────────────────────────────
// AgentDefinition is imported from ./types/api.js

function parseAgentFrontmatter(content: string): { name?: string; description?: string; model?: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const result: { name?: string; description?: string; model?: string } = {};
  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "name") result.name = val;
    else if (key === "description") result.description = val;
    else if (key === "model") result.model = val;
  }
  return result;
}

app.get("/api/agent-definitions", async (c) => {
  try {
    const agentsDir = MAW_AGENTS_DIR;
    const files = await readdir(agentsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const definitions: AgentDefinition[] = [];

    for (const file of mdFiles.sort()) {
      try {
        const content = await readFile(join(agentsDir, file), "utf8");
        const fm = parseAgentFrontmatter(content);
        const baseName = file.replace(/\.md$/, "");
        definitions.push({
          name: fm.name || baseName,
          description: fm.description || "",
          model: fm.model || "default",
          file,
        });
      } catch {
        // skip unreadable files
      }
    }

    return c.json(definitions);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── Agent Spawner ──────────────────────────────────────────────────────────────

app.post(
  "/api/agents/spawn",
  pathValidator({ allowedRoots: ALLOWED_ROOTS, bodyFields: ["workDir"] }),
  async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = SpawnAgentSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const { name, workDir, initialPrompt, agentName } = parsed.data;
    await spawnAgent(name, workDir, initialPrompt, undefined, agentName);
    broadcastToAll({ type: "agent-spawned", sessionName: name });
    return c.json({ ok: true, sessionName: name });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── Task Chains ────────────────────────────────────────────────────────────────

app.get("/api/chain", (c) => {
  return c.json(dispatcher.getChains());
});

app.post("/api/chain/submit", async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = SubmitChainSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ error: issue?.message ?? "invalid request" }, 400);
    }
    const { name, steps, priority } = parsed.data;
    const chain = dispatcher.submitChain(name, steps, priority);
    return c.json({ ok: true, chain });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.delete("/api/chain/:id", (c) => {
  const chainId = c.req.param("id");
  const ok = dispatcher.cancelChain(chainId);
  return c.json({ ok });
});

// API routes (keep for CLI compatibility)
app.get("/api/sessions", async (c) => c.json(await listSessions()));

app.get("/api/capture", async (c) => {
  const target = c.req.query("target");
  if (!target) return c.json({ error: "target required" }, 400);
  const lines = Math.min(Math.max(+(c.req.query("lines") || 80), 1), 10000);
  return c.json({ content: await capture(target, lines) });
});

app.post("/api/send", async (c) => {
  const { target, text } = await c.req.json();
  if (!target || !text) return c.json({ error: "target and text required" }, 400);
  await sendKeys(target, text);
  return c.json({ ok: true, target, text });
});

app.post("/api/select", async (c) => {
  const { target } = await c.req.json();
  if (!target) return c.json({ error: "target required" }, 400);
  await selectWindow(target);
  return c.json({ ok: true, target });
});

app.delete("/api/agents/:target", async (c) => {
  try {
    const target = decodeURIComponent(c.req.param("target"));
    if (!target) return c.json({ error: "target required" }, 400);
    await killSession(target);
    broadcastToAll({ type: "agent-killed", target });
    return c.json({ ok: true, target });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.patch("/api/agents/:target/name", async (c) => {
  try {
    const target = decodeURIComponent(c.req.param("target"));
    if (!target) return c.json({ error: "target required" }, 400);
    const body = await c.req.json();
    const { name } = body;
    if (!name || typeof name !== "string") return c.json({ error: "name required" }, 400);
    await renameWindow(target, name);
    broadcastToAll({ type: "agent-renamed", target, name });
    return c.json({ ok: true, name });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.delete("/api/sessions/:name", async (c) => {
  try {
    const name = decodeURIComponent(c.req.param("name"));
    if (!name) return c.json({ error: "name required" }, 400);
    await killEntireSession(name);
    broadcastToAll({ type: "session-killed", sessionName: name });
    return c.json({ ok: true, sessionName: name });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    // Accept either "file" (new generic field) or legacy "image" field
    const file = formData.get("file") ?? formData.get("image");
    if (!file || typeof file === "string") {
      return c.json({ error: "file required" }, 400);
    }
    const f = file as File;
    const timestamp = Date.now();
    const originalName = f.name || "upload";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = join(MAW_UPLOAD_DIR, `maw-upload-${timestamp}-${safeName}`);
    const arrayBuffer = await f.arrayBuffer();
    await Bun.write(path, arrayBuffer);
    return c.json({ path, originalName, size: f.size });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── Directory Browse API ───────────────────────────────────────────────────────

app.get(
  "/api/browse",
  pathValidator({ allowedRoots: ALLOWED_ROOTS, queryParams: ["path"] }),
  async (c) => {
  try {
    const home = homedir();
    const rawPath = c.req.query("path") || home;
    // Expand leading ~ to home directory
    const resolved = rawPath.startsWith("~")
      ? home + rawPath.slice(1)
      : rawPath;

    const entries = await readdir(resolved, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    const parent = dirname(resolved);

    return c.json({
      current: resolved,
      parent: parent !== resolved ? parent : null,
      dirs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 400);
  }
});

// ── Open File API ──────────────────────────────────────────────────────────────

app.post(
  "/api/open-file",
  pathValidator({ allowedRoots: ALLOWED_ROOTS, bodyFields: ["path", "cwd"] }),
  async (c) => {
  try {
    const body = await c.req.json() as { path?: unknown; cwd?: unknown };
    const rawPath = body.path;
    const rawCwd = body.cwd;

    if (!rawPath || typeof rawPath !== "string") {
      return c.json({ error: "path required" }, 400);
    }

    const home = homedir();

    // Expand ~ prefix
    const expandedPath = rawPath.startsWith("~/")
      ? join(home, rawPath.slice(2))
      : rawPath;

    // Resolve relative paths
    let resolvedPath: string;
    if (isAbsolute(expandedPath)) {
      resolvedPath = expandedPath;
    } else if (rawCwd && typeof rawCwd === "string") {
      const expandedCwd = rawCwd.startsWith("~/")
        ? join(home, rawCwd.slice(2))
        : rawCwd;
      resolvedPath = resolve(expandedCwd, expandedPath);
    } else {
      resolvedPath = resolve(home, expandedPath);
    }

    // Check file exists
    try {
      await access(resolvedPath);
    } catch {
      return c.json({ error: `File not found: ${resolvedPath}` }, 404);
    }

    // Open with macOS `open` command — routes to the correct app by file type
    Bun.spawn(["open", resolvedPath], { stdout: "ignore", stderr: "ignore" });

    return c.json({ ok: true, resolved: resolvedPath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// Serve UI
const html = Bun.file(import.meta.dir + "/ui.html");
app.get("/", (c) => c.body(html.stream(), { headers: { "Content-Type": "text/html" } }));

const dashboardHtml = Bun.file(import.meta.dir + "/dashboard.html");
app.get("/dashboard", (c) => c.body(dashboardHtml.stream(), { headers: { "Content-Type": "text/html" } }));

// Serve React office app (built by vite to dist-office/)
app.get("/office", serveStatic({ root: "./dist-office", path: "/index.html" }));
app.get("/office/*", serveStatic({
  root: "./",
  rewriteRequestPath: (p) => p.replace(/^\/office/, "/dist-office"),
}));

// Oracle v2 proxy — search, stats
const ORACLE_URL = process.env.ORACLE_URL || "http://localhost:47779";

app.get("/api/oracle/search", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: "q required" }, 400);
  const params = new URLSearchParams({ q, mode: c.req.query("mode") || "hybrid", limit: c.req.query("limit") || "10" });
  const model = c.req.query("model");
  if (model) params.set("model", model);
  try {
    const res = await fetch(`${ORACLE_URL}/api/search?${params}`);
    return c.json(await res.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Oracle unreachable: ${msg}` }, 502);
  }
});

app.get("/api/oracle/traces", async (c) => {
  const limit = c.req.query("limit") || "10";
  try {
    const res = await fetch(`${ORACLE_URL}/api/traces?limit=${limit}`);
    return c.json(await res.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Oracle unreachable: ${msg}` }, 502);
  }
});

app.get("/api/oracle/stats", async (c) => {
  try {
    const res = await fetch(`${ORACLE_URL}/api/stats`);
    return c.json(await res.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Oracle unreachable: ${msg}` }, 502);
  }
});

// ── Token Usage ───────────────────────────────────────────────────────────────

app.get("/api/token-usage", async (c) => {
  try {
    const data = await getTokenUsage();
    return c.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/token-usage/realtime", async (c) => {
  try {
    const data = await getRealtimeSessions();
    return c.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/usage-limits", async (c) => {
  try {
    const data = await getUsageLimits();
    return c.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// Agent-to-Agent communication
app.route("/api/mailbox", mailboxRoutes);
app.route("/api/kv", kvRoutes);
app.route("/api/goals", goalRoutes);
app.route("/api/rpc", createRpcRoutes(dispatcher, tracker, broadcastToAll));
app.route("/api/discovery", createDiscoveryRoutes(tracker, capture));

app.onError((err, c) => c.json({ error: err.message }, 500));

export { app };

// --- WebSocket + Server ---

// Push capture to a specific client (only if changed)
const lastContent = new Map<ServerWebSocket<WSData>, string>();

async function pushCapture(ws: ServerWebSocket<WSData>) {
  if (!ws.data.target) return;
  try {
    const content = await capture(ws.data.target, ws.data.lines || 80);
    const prev = lastContent.get(ws);
    if (content !== prev) {
      lastContent.set(ws, content);
      ws.send(JSON.stringify({ type: "capture", target: ws.data.target, content }));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ws.send(JSON.stringify({ type: "error", error: msg }));
  }
}

// Broadcast sessions to all clients
async function broadcastSessions() {
  if (clients.size === 0) return;
  try {
    const sessions = await listSessions();
    const msg = JSON.stringify({ type: "sessions", sessions });
    for (const ws of clients) ws.send(msg);
  } catch {}
}

// Capture loop — push to each subscribed client
let captureInterval: ReturnType<typeof setInterval> | null = null;
let sessionInterval: ReturnType<typeof setInterval> | null = null;

function startIntervals() {
  if (captureInterval) return;
  // Capture every 50ms for real-time feel
  captureInterval = setInterval(() => {
    for (const ws of clients) pushCapture(ws);
  }, 50);
  // Sessions every 5s
  sessionInterval = setInterval(broadcastSessions, 5000);
}

function stopIntervals() {
  if (clients.size > 0) return;
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  if (sessionInterval) { clearInterval(sessionInterval); sessionInterval = null; }
}

export function startServer(port = +(process.env.MAW_PORT || 3456)) {

  const server = Bun.serve<WSData>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      // Upgrade WebSocket
      if (url.pathname === "/ws") {
        if (server.upgrade(req, { data: { target: null, lines: 2000 } })) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        startIntervals();
        startDispatchLoop();
        // Send sessions immediately
        listSessions().then(s => ws.send(JSON.stringify({ type: "sessions", sessions: s }))).catch(() => {});
        // Send current agent state and queue
        ws.send(JSON.stringify({ type: "agents-updated", agents: tracker.getAll() }));
        ws.send(JSON.stringify({ type: "queue-status", ...dispatcher.getStatus() }));
      },
      message(ws, msg) {
        try {
          const data = JSON.parse(msg as string);
          if (data.type === "subscribe") {
            ws.data.target = data.target;
            ws.data.lines = data.lines || 80;
            pushCapture(ws); // immediate first push
          } else if (data.type === "select") {
            selectWindow(data.target).catch(() => {});
          } else if (data.type === "send") {
            sendKeys(data.target, data.text)
              .then(() => {
                ws.send(JSON.stringify({ type: "sent", ok: true, target: data.target, text: data.text }));
                // Push capture after short delay to show result
                setTimeout(() => pushCapture(ws), 300);
              })
              .catch((e: unknown) => {
                const errMsg = e instanceof Error ? e.message : String(e);
                ws.send(JSON.stringify({ type: "error", error: errMsg }));
              });
          } else if (data.type === "submit-task") {
            const task = dispatcher.submitTask(data.command, data.priority, undefined, undefined, data.affinity);
            ws.send(JSON.stringify({ type: "task-submitted", task }));
          } else if (data.type === "cancel-task") {
            const ok = dispatcher.cancelTask(data.taskId);
            ws.send(JSON.stringify({ type: "task-cancel-result", ok, taskId: data.taskId }));
          } else if (data.type === "submit-chain") {
            try {
              const chain = dispatcher.submitChain(data.name, data.steps, data.priority);
              ws.send(JSON.stringify({ type: "chain-submitted", chain }));
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              ws.send(JSON.stringify({ type: "error", error: msg }));
            }
          } else if (data.type === "cancel-chain") {
            const ok = dispatcher.cancelChain(data.chainId);
            ws.send(JSON.stringify({ type: "chain-cancel-result", ok, chainId: data.chainId }));
          } else if (data.type === "kill-agent") {
            if (data.target) {
              killSession(data.target)
                .then(() => {
                  broadcastToAll({ type: "agent-killed", target: data.target });
                })
                .catch((e: unknown) => {
                  const msg = e instanceof Error ? e.message : String(e);
                  ws.send(JSON.stringify({ type: "error", error: msg }));
                });
            }
          } else if (data.type === "toggle-worker") {
            const { sessionName } = data;
            if (sessionName) {
              const config = loadConfig();
              if (config.workers.includes(sessionName)) {
                removeWorker(sessionName);
              } else {
                addWorker(sessionName);
              }
              tracker.refreshWorkerFlags();
              broadcastToAll({ type: "agents-updated", agents: tracker.getAll() });
            }
          }
        } catch {}
      },
      close(ws) {
        clients.delete(ws);
        lastContent.delete(ws);
        stopIntervals();
      },
    },
  });

  console.log(`maw serve → http://localhost:${port} (ws://localhost:${port}/ws)`);
  return server;
}

// Auto-start unless imported by CLI (CLI sets MAW_CLI=1)
if (!process.env.MAW_CLI) {
  startServer();
}
