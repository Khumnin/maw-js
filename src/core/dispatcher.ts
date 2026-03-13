import type { AgentTracker, TrackedAgent } from "./agent-tracker.js";
import { upsertTask } from "../db/store.js";
import { capture } from "../services/ssh.js";

export type TaskPriority = "high" | "normal" | "low";
export type TaskStatus = "pending" | "assigned" | "completed" | "failed";

export interface TaskAffinity {
  tags?: string[];        // preferred tags: ['backend', 'frontend', 'infra']
  projectName?: string;  // preferred project name
  filePaths?: string[];  // related file paths
  preferAgent?: string;  // explicitly prefer a specific agent target
}

export interface Task {
  id: string;
  command: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;      // worker target (e.g. "worker-1:0")
  assignedToName?: string;  // worker session name (e.g. "worker-1")
  assignedAt?: number;
  completedAt?: number;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;          // ms, default 300_000 (5 min)
  output?: string;
  affinity?: TaskAffinity;
  dispatchReason?: string;  // human-readable explanation of why this agent was chosen
  // Chain fields
  chainId?: string;
  chainIndex?: number;
}

// ── Task Chain types ──────────────────────────────────────────────────────────

export type ChainStatus = "pending" | "running" | "completed" | "failed";

export interface TaskChainStep {
  prompt: string;
  targetTag?: string;  // 'backend' | 'frontend' | 'any' — currently unused, for future routing
  dependsOn?: number;  // step index this depends on (currently sequential only)
}

export interface TaskChain {
  id: string;
  name: string;
  steps: TaskChainStep[];
  status: ChainStatus;
  currentStep: number;
  taskIds: string[];   // task IDs created for each step (sparse — only submitted steps)
  priority: TaskPriority;
  createdAt: number;
  completedAt?: number;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
const MAX_HISTORY = 50;

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ── Affinity auto-detection ───────────────────────────────────────────────────

const BACKEND_WORDS = /\b(go|api|endpoint|database|migration|db|model|repository|service|handler|sql|query|server|grpc|rest|backend)\b/i;
const FRONTEND_WORDS = /\b(component|page|ui|style|css|react|nextjs|next\.js|vue|svelte|html|tailwind|frontend|tsx?|jsx?)\b/i;
const INFRA_WORDS = /\b(deploy|docker|ci|pipeline|k8s|kubernetes|helm|terraform|ansible|nginx|ingress|infra|devops|aws|gcp|azure|ecr|eks)\b/i;
const FILE_PATH_RE = /(~?\/[\w./~-]{4,}|\.\/[\w./~-]{3,}|src\/[\w./~-]{3,})/g;

function inferAffinity(command: string): TaskAffinity | undefined {
  const tags: string[] = [];
  const filePaths: string[] = [];

  if (BACKEND_WORDS.test(command)) tags.push("backend");
  if (FRONTEND_WORDS.test(command)) tags.push("frontend");
  if (INFRA_WORDS.test(command)) tags.push("infra");

  let m: RegExpExecArray | null;
  const re = new RegExp(FILE_PATH_RE.source, "g");
  while ((m = re.exec(command)) !== null) {
    filePaths.push(m[1]);
  }

  if (tags.length === 0 && filePaths.length === 0) return undefined;
  return { tags: tags.length > 0 ? tags : undefined, filePaths: filePaths.length > 0 ? filePaths : undefined };
}

// ── Agent scoring ─────────────────────────────────────────────────────────────

function scoreAgent(agent: TrackedAgent, task: Task): { score: number; reasons: string[] } {
  const affinity = task.affinity;
  const ctx = agent.context;
  const reasons: string[] = [];

  if (!affinity) return { score: 0, reasons };

  let score = 0;

  // Explicit agent preference — wins immediately
  if (affinity.preferAgent && agent.target === affinity.preferAgent) {
    score += 100;
    reasons.push(`explicit preference for ${affinity.preferAgent}`);
  }

  if (!ctx) return { score, reasons };

  // Tag overlap
  if (affinity.tags && affinity.tags.length > 0) {
    const matched = affinity.tags.filter((t) => ctx.tags.includes(t));
    if (matched.length > 0) {
      score += matched.length * 10;
      reasons.push(`${matched.join(", ")} tag match`);
    }
  }

  // Project match
  if (affinity.projectName && ctx.projectName && ctx.projectName === affinity.projectName) {
    score += 20;
    reasons.push(`project match (${ctx.projectName})`);
  }

  // File path overlap
  if (affinity.filePaths && affinity.filePaths.length > 0 && ctx.recentFiles.length > 0) {
    const overlap = affinity.filePaths.some((fp) =>
      ctx.recentFiles.some((rf) => rf.includes(fp) || fp.includes(rf))
    );
    if (overlap) {
      score += 15;
      reasons.push("file path overlap");
    }
  }

  // Recency bonus — active in the last 5 minutes
  const minutesIdle = (Date.now() - ctx.lastActiveAt) / 60_000;
  if (minutesIdle < 5) {
    score += 5;
    reasons.push("recently active");
  }

  return { score, reasons };
}

export class TaskDispatcher {
  private queue: Task[] = [];
  private history: Task[] = [];
  private chains: Map<string, TaskChain> = new Map();

  constructor(
    private tracker: AgentTracker,
    private broadcast: (msg: unknown) => void,
  ) {}

  submitTask(
    command: string,
    priority: TaskPriority = "normal",
    chainId?: string,
    chainIndex?: number,
    affinity?: TaskAffinity,
  ): Task {
    // Merge explicit affinity with auto-inferred affinity from command text
    const inferred = inferAffinity(command);
    let mergedAffinity: TaskAffinity | undefined;
    if (affinity || inferred) {
      mergedAffinity = {
        tags: [...new Set([...(affinity?.tags ?? []), ...(inferred?.tags ?? [])])].length > 0
          ? [...new Set([...(affinity?.tags ?? []), ...(inferred?.tags ?? [])])]
          : undefined,
        projectName: affinity?.projectName,
        filePaths: [...new Set([...(affinity?.filePaths ?? []), ...(inferred?.filePaths ?? [])])].length > 0
          ? [...new Set([...(affinity?.filePaths ?? []), ...(inferred?.filePaths ?? [])])]
          : undefined,
        preferAgent: affinity?.preferAgent,
      };
    }

    const task: Task = {
      id: shortId(),
      command,
      priority,
      status: "pending",
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      timeout: 300_000,
      affinity: mergedAffinity,
      chainId,
      chainIndex,
    };
    this.queue.push(task);
    this.broadcast({ type: "task-submitted", task: this.sanitize(task) });
    upsertTask({
      id: task.id,
      chainId: task.chainId,
      command: task.command,
      output: task.output,
      status: task.status,
      assignedTo: task.assignedTo,
      priority: task.priority,
      dispatchReason: task.dispatchReason,
      affinity: task.affinity,
      createdAt: task.createdAt,
      assignedAt: task.assignedAt,
      completedAt: task.completedAt,
    });
    return task;
  }

  cancelTask(taskId: string): boolean {
    const idx = this.queue.findIndex((t) => t.id === taskId && t.status === "pending");
    if (idx === -1) return false;
    const [task] = this.queue.splice(idx, 1);
    task.status = "failed";
    task.completedAt = Date.now();
    this.pushHistory(task);
    this.broadcast({ type: "task-failed", task: this.sanitize(task) });
    upsertTask({
      id: task.id,
      chainId: task.chainId,
      command: task.command,
      output: task.output,
      status: task.status,
      assignedTo: task.assignedTo,
      priority: task.priority,
      dispatchReason: task.dispatchReason,
      affinity: task.affinity,
      createdAt: task.createdAt,
      assignedAt: task.assignedAt,
      completedAt: task.completedAt,
    });
    return true;
  }

  // ── Chain API ───────────────────────────────────────────────────────────────

  submitChain(name: string, steps: TaskChainStep[], priority: TaskPriority = "normal"): TaskChain {
    if (steps.length === 0) throw new Error("chain must have at least one step");

    const chain: TaskChain = {
      id: shortId(),
      name,
      steps,
      status: "pending",
      currentStep: 0,
      taskIds: [],
      priority,
      createdAt: Date.now(),
    };

    this.chains.set(chain.id, chain);
    this.broadcast({ type: "chain-created", chain: this.sanitizeChain(chain) });

    // Submit the first step immediately
    this.advanceChain(chain);
    return chain;
  }

  cancelChain(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;
    if (chain.status === "completed" || chain.status === "failed") return false;

    chain.status = "failed";
    chain.completedAt = Date.now();

    // Cancel any pending task belonging to this chain
    for (const taskId of chain.taskIds) {
      const task = this.queue.find((t) => t.id === taskId && t.status === "pending");
      if (task) {
        task.status = "failed";
        task.completedAt = Date.now();
        const idx = this.queue.indexOf(task);
        if (idx !== -1) this.queue.splice(idx, 1);
        this.pushHistory(task);
        this.broadcast({ type: "task-failed", task: this.sanitize(task) });
      }
    }

    this.broadcast({ type: "chain-failed", chain: this.sanitizeChain(chain) });
    return true;
  }

  getChains(): TaskChain[] {
    return [...this.chains.values()].map((c) => this.sanitizeChain(c));
  }

  private advanceChain(chain: TaskChain): void {
    if (chain.currentStep >= chain.steps.length) {
      chain.status = "completed";
      chain.completedAt = Date.now();
      this.broadcast({ type: "chain-completed", chain: this.sanitizeChain(chain) });
      return;
    }

    chain.status = "running";
    const step = chain.steps[chain.currentStep];
    const task = this.submitTask(step.prompt, chain.priority, chain.id, chain.currentStep);
    chain.taskIds.push(task.id);
    this.broadcast({ type: "chain-updated", chain: this.sanitizeChain(chain) });
  }

  // ── Main tick ───────────────────────────────────────────────────────────────

  async tick(): Promise<void> {
    const now = Date.now();

    // 1. Check assigned tasks for completion or timeout
    for (const task of this.queue.filter((t) => t.status === "assigned")) {
      const agent = this.tracker.getAll().find((a) => a.target === task.assignedTo);

      if (!agent) {
        // Agent disappeared — release and retry
        this.tracker.unlockWorker(task.assignedTo!);
        task.assignedTo = undefined;
        task.assignedToName = undefined;
        task.status = task.retryCount < task.maxRetries ? "pending" : "failed";
        task.retryCount++;
        if (task.status === "failed") {
          task.completedAt = now;
          this.moveToHistory(task);
          this.broadcast({ type: "task-failed", task: this.sanitize(task) });
          upsertTask({
            id: task.id,
            chainId: task.chainId,
            command: task.command,
            output: task.output,
            status: task.status,
            assignedTo: task.assignedTo,
            priority: task.priority,
            dispatchReason: task.dispatchReason,
            affinity: task.affinity,
            createdAt: task.createdAt,
            assignedAt: task.assignedAt,
            completedAt: task.completedAt,
          });
          this.onTaskFailed(task);
        }
        continue;
      }

      // Timeout check — runs before completion check
      if (now - (task.assignedAt ?? now) > task.timeout) {
        task.retryCount++;
        this.tracker.unlockWorker(task.assignedTo!);
        if (task.retryCount < task.maxRetries) {
          task.status = "pending";
          task.assignedTo = undefined;
          task.assignedToName = undefined;
          task.assignedAt = undefined;
          this.broadcast({ type: "task-timeout", task: this.sanitize(task) });
        } else {
          task.status = "failed";
          task.completedAt = now;
          task.assignedTo = undefined;
          task.assignedToName = undefined;
          this.moveToHistory(task);
          this.broadcast({ type: "task-failed", task: this.sanitize(task) });
          upsertTask({
            id: task.id,
            chainId: task.chainId,
            command: task.command,
            output: task.output,
            status: task.status,
            assignedTo: task.assignedTo,
            priority: task.priority,
            dispatchReason: task.dispatchReason,
            affinity: task.affinity,
            createdAt: task.createdAt,
            assignedAt: task.assignedAt,
            completedAt: task.completedAt,
          });
          this.onTaskFailed(task);
        }
        continue;
      }

      // Completion: agent returned to waiting/idle while it was our worker
      if (agent.status === "waiting" || agent.status === "idle") {
        // Capture terminal output as task result before marking complete
        try {
          const raw = await capture(task.assignedTo!, 150);
          task.output = raw;
        } catch {}
        task.status = "completed";
        task.completedAt = now;
        this.tracker.unlockWorker(task.assignedTo!);
        this.moveToHistory(task);
        this.broadcast({ type: "task-completed", task: this.sanitize(task) });
        upsertTask({
          id: task.id,
          chainId: task.chainId,
          command: task.command,
          output: task.output,
          status: task.status,
          assignedTo: task.assignedTo,
          priority: task.priority,
          dispatchReason: task.dispatchReason,
          affinity: task.affinity,
          createdAt: task.createdAt,
          assignedAt: task.assignedAt,
          completedAt: task.completedAt,
        });
        this.onTaskCompleted(task);
      }
    }

    // 2. Dispatch pending tasks to idle workers (priority order, then FIFO)
    const pending = this.queue
      .filter((t) => t.status === "pending")
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt - b.createdAt);

    // Maintain a mutable pool of still-available idle workers for this tick
    const availableIdle = this.tracker.getIdleWorkers();

    for (const task of pending) {
      if (availableIdle.length === 0) break;

      // Score every available idle worker against this task
      let bestWorker: TrackedAgent | undefined;
      let bestScore = -1;
      let bestReasons: string[] = [];

      for (const w of availableIdle) {
        const { score, reasons } = scoreAgent(w, task);
        if (score > bestScore) {
          bestScore = score;
          bestWorker = w;
          bestReasons = reasons;
        }
      }

      const worker = bestWorker ?? availableIdle[0];
      // Remove chosen worker from the available pool
      const poolIdx = availableIdle.indexOf(worker);
      if (poolIdx !== -1) availableIdle.splice(poolIdx, 1);

      const dispatchReason = bestScore > 0 && bestReasons.length > 0
        ? `score ${bestScore} — ${bestReasons.join(" + ")}`
        : "first available worker";

      task.status = "assigned";
      task.assignedTo = worker.target;
      task.assignedToName = worker.sessionName;
      task.assignedAt = now;
      task.dispatchReason = dispatchReason;
      this.tracker.lockWorker(worker.target, task.id);

      try {
        const { sendKeys } = await import("../services/ssh.js");
        await sendKeys(worker.target, task.command);
      } catch {
        // Dispatch failed — return to pending
        task.status = "pending";
        task.assignedTo = undefined;
        task.assignedToName = undefined;
        task.assignedAt = undefined;
        task.dispatchReason = undefined;
        this.tracker.unlockWorker(worker.target);
        continue;
      }

      this.broadcast({
        type: "task-assigned",
        task: this.sanitize(task),
        worker: { target: worker.target, name: worker.sessionName },
        dispatchReason,
      });
      upsertTask({
        id: task.id,
        chainId: task.chainId,
        command: task.command,
        output: task.output,
        status: task.status,
        assignedTo: task.assignedTo,
        priority: task.priority,
        dispatchReason: task.dispatchReason,
        affinity: task.affinity,
        createdAt: task.createdAt,
        assignedAt: task.assignedAt,
        completedAt: task.completedAt,
      });
    }
  }

  getStatus(): { pending: Task[]; assigned: Task[]; history: Task[] } {
    return {
      pending:  this.queue.filter((t) => t.status === "pending").map((t) => this.sanitize(t)),
      assigned: this.queue.filter((t) => t.status === "assigned").map((t) => this.sanitize(t)),
      history:  this.history.map((t) => this.sanitize(t)),
    };
  }

  getTaskById(id: string): Task | undefined {
    return [...this.queue, ...this.history].find((t) => t.id === id);
  }

  // ── Chain event handlers ────────────────────────────────────────────────────

  private onTaskCompleted(task: Task): void {
    if (!task.chainId) return;
    const chain = this.chains.get(task.chainId);
    if (!chain) return;
    if (chain.status === "failed") return;

    // Advance to next step
    chain.currentStep++;
    this.advanceChain(chain);
  }

  private onTaskFailed(task: Task): void {
    if (!task.chainId) return;
    const chain = this.chains.get(task.chainId);
    if (!chain) return;
    if (chain.status === "failed") return;

    chain.status = "failed";
    chain.completedAt = Date.now();
    this.broadcast({ type: "chain-failed", chain: this.sanitizeChain(chain) });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private sanitize(task: Task): Task {
    return { ...task };
  }

  private sanitizeChain(chain: TaskChain): TaskChain {
    return { ...chain, steps: [...chain.steps], taskIds: [...chain.taskIds] };
  }

  private moveToHistory(task: Task): void {
    const idx = this.queue.indexOf(task);
    if (idx !== -1) this.queue.splice(idx, 1);
    this.pushHistory(task);
  }

  private pushHistory(task: Task): void {
    this.history.unshift(task);
    if (this.history.length > MAX_HISTORY) {
      this.history.length = MAX_HISTORY;
    }
  }
}
