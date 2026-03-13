/**
 * Token Usage API
 * Parses Claude Code JSONL session files to aggregate token usage statistics.
 * Handles large files (20MB+) via streaming line-by-line reads.
 */

import { readdir } from "node:fs/promises";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { capture } from "./ssh";
import type { Session } from "./ssh";
import { MAW_CLAUDE_DIR } from "../paths";

// ── Pricing (per million tokens) ─────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

function modelPricing(model: string) {
  if (/opus/i.test(model)) return PRICING.opus;
  if (/haiku/i.test(model)) return PRICING.haiku;
  return PRICING.sonnet; // default
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number
): number {
  const p = modelPricing(model);
  return (
    (inputTokens * p.input +
      outputTokens * p.output +
      cacheCreation * p.cacheWrite +
      cacheRead * p.cacheRead) /
    1_000_000
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionUsage {
  sessionId: string;
  sessionPrefix: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  totalTokens: number;
  turnCount: number;
  toolUseCount: number;
  estimatedCost: number;
  firstSeen: string;
  lastSeen: string;
  durationMs: number;
  /** Turns (assistant messages) in the last 5 hours for this session */
  turnsLast5h: number;
}

export interface TotalsUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  totalTokens: number;
  estimatedCost: number;
  sessionCount: number;
  turnCount: number;
  toolUseCount: number;
  /** Total assistant turns across all sessions in the last 5 hours */
  promptsLast5h: number;
}

export interface TimelineEntry {
  hour: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface TokenUsageResponse {
  sessions: SessionUsage[];
  totals: TotalsUsage;
  timeline: TimelineEntry[];
  cachedAt: string;
}

// ── Usage Limits Types ────────────────────────────────────────────────────────

export interface UsageLimits {
  session: {
    prompts: number;
    oldestPromptTime: string | null;
    newestPromptTime: string | null;
    /** When the full window clears (newest prompt + 5h) */
    resetsIn: string;
    resetsAt: string;
    /** When the first slot frees up (oldest prompt + 5h) */
    nextCapacityIn: string;
    nextCapacityAt: string;
  };
  weekly: {
    allModels: { prompts: number };
    sonnetOnly: { prompts: number };
    opusOnly: { prompts: number };
    resetsAt: string;
    resetsIn: string;
  };
  extraUsage: {
    enabled: boolean;
  };
  perSession: Array<{
    sessionId: string;
    sessionPrefix: string;
    promptsLast5h: number;
    promptsThisWeek: number;
    model: string;
    lastActivity: string;
  }>;
}

// ── JSONL dir ─────────────────────────────────────────────────────────────────

// MAW_CLAUDE_DIR points to the Claude config root (default: ~/.claude).
// The projects sub-directory is where Claude Code stores session JSONL files.
// MAW_CLAUDE_PROJECTS_DIR can override the full path when the project slug differs.
const JSONL_DIR = process.env.MAW_CLAUDE_PROJECTS_DIR
  ? path.resolve(process.env.MAW_CLAUDE_PROJECTS_DIR)
  : path.join(MAW_CLAUDE_DIR, "projects/-Users-kanatekhumnin-Project");

// ── Cache (30-second TTL for token usage, 10-second for limits) ──────────────

let cache: { data: TokenUsageResponse; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

let limitsCache: { data: UsageLimits; ts: number } | null = null;
const LIMITS_CACHE_TTL_MS = 10_000;

// ── Parse a single JSONL file streaming ──────────────────────────────────────

interface RawSessionData {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  turnCount: number;
  toolUseCount: number;
  turnsLast5h: number;
  modelCounts: Record<string, number>;
  timestamps: string[];
  durationMs: number;
  hourBuckets: Record<string, { inputTokens: number; outputTokens: number; cost: number }>;
  /** Each completed assistant turn: { timestamp (ms), model } */
  promptEvents: Array<{ tsMs: number; model: string; timestamp: string }>;
}

async function parseJsonlFile(filePath: string): Promise<RawSessionData | null> {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const data: RawSessionData = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation: 0,
    cacheRead: 0,
    turnCount: 0,
    toolUseCount: 0,
    turnsLast5h: 0,
    modelCounts: {},
    timestamps: [],
    durationMs: 0,
    hourBuckets: {},
    promptEvents: [],
  };

  try {
    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      // TODO: Sprint 2 - type this properly with a typed union for JSONL entry variants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let entry: any; // JSONL entries have deeply nested, schema-less structure
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // skip malformed lines
      }

      // Assistant messages — token usage
      if (entry.type === "assistant" && entry.message?.usage) {
        const usage = entry.message.usage;
        const model: string = entry.message?.model || "unknown";

        const input = usage.input_tokens || 0;
        const output = usage.output_tokens || 0;
        const cc = usage.cache_creation_input_tokens || 0;
        const cr = usage.cache_read_input_tokens || 0;

        // Deduplicate: same message_id may appear multiple times (streaming chunks).
        // Only count when stop_reason is set (final chunk).
        if (entry.message?.stop_reason == null) continue;

        data.inputTokens += input;
        data.outputTokens += output;
        data.cacheCreation += cc;
        data.cacheRead += cr;
        data.turnCount++;

        // Count turns in the last 5 hours + record prompt event
        if (entry.timestamp) {
          const entryTime = new Date(entry.timestamp).getTime();
          if (!isNaN(entryTime)) {
            if (Date.now() - entryTime < FIVE_HOURS_MS) {
              data.turnsLast5h++;
            }
            data.promptEvents.push({ tsMs: entryTime, model, timestamp: entry.timestamp });
          }
        }

        // Model frequency
        const modelKey = model.split("-").slice(0, 3).join("-"); // normalize
        data.modelCounts[modelKey] = (data.modelCounts[modelKey] || 0) + 1;

        // Timestamps
        if (entry.timestamp) {
          data.timestamps.push(entry.timestamp);

          // Hour bucket for timeline
          const hour = entry.timestamp.slice(0, 13) + ":00"; // "2026-03-09T10:00"
          const bucket = data.hourBuckets[hour] || { inputTokens: 0, outputTokens: 0, cost: 0 };
          bucket.inputTokens += input;
          bucket.outputTokens += output;
          bucket.cost += estimateCost(model, input, output, cc, cr);
          data.hourBuckets[hour] = bucket;
        }

        // Count tool_use blocks in content
        if (Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block?.type === "tool_use") data.toolUseCount++;
          }
        }
      }

      // turn_duration entries
      if (entry.type === "system" && entry.subtype === "turn_duration" && entry.durationMs) {
        data.durationMs += entry.durationMs;
      }
    }
  } catch {
    return null;
  }

  if (data.turnCount === 0) return null;
  return data;
}

// ── Shared parse cache + aggregate all sessions ───────────────────────────────

interface ParsedFileResult {
  raw: RawSessionData;
  sessionId: string;
}

let parsedFilesCache: { results: ParsedFileResult[]; ts: number } | null = null;
const PARSED_FILES_TTL_MS = 10_000;

async function getAllParsedFiles(): Promise<ParsedFileResult[]> {
  const now = Date.now();
  if (parsedFilesCache && now - parsedFilesCache.ts < PARSED_FILES_TTL_MS) {
    return parsedFilesCache.results;
  }

  let files: string[];
  try {
    const entries = await readdir(JSONL_DIR);
    files = entries
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(JSONL_DIR, f));
  } catch {
    files = [];
  }

  const results: ParsedFileResult[] = [];
  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".jsonl");
    const raw = await parseJsonlFile(filePath);
    if (!raw) continue;
    results.push({ raw, sessionId });
  }

  parsedFilesCache = { results, ts: now };
  return results;
}

async function buildTokenUsage(): Promise<TokenUsageResponse> {
  const parsed = await getAllParsedFiles();

  const sessions: SessionUsage[] = [];
  const globalTimeline: Record<string, { inputTokens: number; outputTokens: number; cost: number }> = {};

  for (const { raw, sessionId } of parsed) {
    // Dominant model
    const model =
      Object.entries(raw.modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

    const ts = raw.timestamps.sort();
    const firstSeen = ts[0] || new Date().toISOString();
    const lastSeen = ts[ts.length - 1] || new Date().toISOString();

    const cost = estimateCost(
      model,
      raw.inputTokens,
      raw.outputTokens,
      raw.cacheCreation,
      raw.cacheRead
    );

    sessions.push({
      sessionId,
      sessionPrefix: sessionId.slice(0, 8),
      model,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      cacheCreation: raw.cacheCreation,
      cacheRead: raw.cacheRead,
      totalTokens: raw.inputTokens + raw.outputTokens,
      turnCount: raw.turnCount,
      toolUseCount: raw.toolUseCount,
      turnsLast5h: raw.turnsLast5h,
      estimatedCost: cost,
      firstSeen,
      lastSeen,
      durationMs: raw.durationMs,
    });

    // Merge into global timeline
    for (const [hour, bucket] of Object.entries(raw.hourBuckets)) {
      const g = globalTimeline[hour] || { inputTokens: 0, outputTokens: 0, cost: 0 };
      g.inputTokens += bucket.inputTokens;
      g.outputTokens += bucket.outputTokens;
      g.cost += bucket.cost;
      globalTimeline[hour] = g;
    }
  }

  // Sort sessions: total tokens descending
  sessions.sort((a, b) => b.totalTokens - a.totalTokens);

  // Grand totals
  const totals: TotalsUsage = {
    inputTokens: sessions.reduce((s, x) => s + x.inputTokens, 0),
    outputTokens: sessions.reduce((s, x) => s + x.outputTokens, 0),
    cacheCreation: sessions.reduce((s, x) => s + x.cacheCreation, 0),
    cacheRead: sessions.reduce((s, x) => s + x.cacheRead, 0),
    totalTokens: sessions.reduce((s, x) => s + x.totalTokens, 0),
    estimatedCost: sessions.reduce((s, x) => s + x.estimatedCost, 0),
    sessionCount: sessions.length,
    turnCount: sessions.reduce((s, x) => s + x.turnCount, 0),
    toolUseCount: sessions.reduce((s, x) => s + x.toolUseCount, 0),
    promptsLast5h: sessions.reduce((s, x) => s + x.turnsLast5h, 0),
  };

  // Timeline — sorted chronologically
  const timeline: TimelineEntry[] = Object.entries(globalTimeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, bucket]) => ({ hour, ...bucket }));

  return {
    sessions,
    totals,
    timeline,
    cachedAt: new Date().toISOString(),
  };
}

// ── Public: GET /api/token-usage ──────────────────────────────────────────────

export async function getTokenUsage(): Promise<TokenUsageResponse> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.data;

  const data = await buildTokenUsage();
  cache = { data, ts: now };
  return data;
}

// ── Usage Limits ──────────────────────────────────────────────────────────────

/**
 * Returns the most recent Friday at 23:00:00 local time strictly before `now`.
 * Day 5 = Friday in JS (0=Sun … 6=Sat).
 */
function lastFriday23h(now: Date): Date {
  const d = new Date(now);
  // Reset to midnight of current day
  d.setHours(23, 0, 0, 0);
  // Friday = 5
  const dayOfWeek = d.getDay();
  // Days to go back to reach the most recent Friday whose 23:00 < now
  // If today is Friday but before 23:00, we want LAST Friday
  let daysBack = (dayOfWeek - 5 + 7) % 7;
  if (daysBack === 0) {
    // Today is Friday — check if 23:00 has passed
    const todayFri23h = new Date(d);
    if (now < todayFri23h) {
      daysBack = 7; // use last Friday
    }
  }
  d.setDate(d.getDate() - daysBack);
  return d;
}

/**
 * Returns the NEXT Friday at 23:00:00 local time (>= now).
 */
function nextFriday23h(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 0, 0, 0);
  const dayOfWeek = d.getDay();
  let daysAhead = (5 - dayOfWeek + 7) % 7;
  if (daysAhead === 0) {
    // Today is Friday — if 23:00 hasn't passed yet, use today; else next Friday
    const todayFri23h = new Date(d);
    if (now >= todayFri23h) daysAhead = 7;
  }
  d.setDate(d.getDate() + daysAhead);
  return d;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}hr`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(" ");
}

function readNotificationStates(): boolean {
  try {
    const notifPath = path.join(
      MAW_CLAUDE_DIR,
      "config/notification_states.json"
    );
    const raw = fs.readFileSync(notifPath, "utf8");
    const parsed = JSON.parse(raw);
    // extra_usage / cost_will_exceed triggered → treat as extra usage enabled
    return parsed?.cost_will_exceed?.triggered === true;
  } catch {
    return false;
  }
}

async function buildUsageLimits(): Promise<UsageLimits> {
  const now = new Date();
  const nowMs = now.getTime();
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

  const weekStart = lastFriday23h(now);
  const weekStartMs = weekStart.getTime();

  const nextReset = nextFriday23h(now);
  const nextResetMs = nextReset.getTime();

  const parsed = await getAllParsedFiles();

  // Collect ALL prompt events across all sessions
  const allPrompts: Array<{ tsMs: number; model: string; timestamp: string; sessionId: string }> = [];

  for (const { raw, sessionId } of parsed) {
    for (const ev of raw.promptEvents) {
      allPrompts.push({ ...ev, sessionId });
    }
  }

  // --- Session window (5hr rolling) ---
  const sessionPrompts = allPrompts.filter((p) => nowMs - p.tsMs < FIVE_HOURS_MS);
  const sessionCount = sessionPrompts.length;

  // Oldest prompt → when the first slot frees up ("next capacity")
  const oldestInWindow = sessionPrompts.reduce<{ tsMs: number; timestamp: string } | null>(
    (min, p) => (min === null || p.tsMs < min.tsMs ? p : min),
    null
  );
  // Newest prompt → when the entire window clears ("resets at")
  const newestInWindow = sessionPrompts.reduce<{ tsMs: number; timestamp: string } | null>(
    (max, p) => (max === null || p.tsMs > max.tsMs ? p : max),
    null
  );

  // "Resets in/at" = newest prompt + 5h (when full window clears — matches Claude Settings)
  const sessionResetsAt = newestInWindow
    ? new Date(newestInWindow.tsMs + FIVE_HOURS_MS).toISOString()
    : new Date(nowMs + FIVE_HOURS_MS).toISOString();
  const sessionResetsInMs = newestInWindow
    ? Math.max(0, newestInWindow.tsMs + FIVE_HOURS_MS - nowMs)
    : FIVE_HOURS_MS;

  // "Next capacity" = oldest prompt + 5h (when first slot frees up)
  const nextCapacityAt = oldestInWindow
    ? new Date(oldestInWindow.tsMs + FIVE_HOURS_MS).toISOString()
    : new Date(nowMs + FIVE_HOURS_MS).toISOString();
  const nextCapacityInMs = oldestInWindow
    ? Math.max(0, oldestInWindow.tsMs + FIVE_HOURS_MS - nowMs)
    : FIVE_HOURS_MS;

  // --- Weekly window ---
  const weeklyPrompts = allPrompts.filter((p) => p.tsMs > weekStartMs);
  const weeklyAll = weeklyPrompts.length;
  const weeklySonnet = weeklyPrompts.filter((p) => !/opus|haiku/i.test(p.model)).length;
  const weeklyOpus = weeklyPrompts.filter((p) => /opus/i.test(p.model)).length;

  const weeklyResetsInMs = Math.max(0, nextResetMs - nowMs);

  // --- Per-session breakdown ---
  const sessionMap = new Map<string, {
    promptsLast5h: number;
    promptsThisWeek: number;
    model: string;
    lastActivity: number;
  }>();

  for (const p of allPrompts) {
    const entry = sessionMap.get(p.sessionId) || {
      promptsLast5h: 0,
      promptsThisWeek: 0,
      model: p.model,
      lastActivity: 0,
    };
    if (nowMs - p.tsMs < FIVE_HOURS_MS) entry.promptsLast5h++;
    if (p.tsMs > weekStartMs) entry.promptsThisWeek++;
    if (p.tsMs > entry.lastActivity) {
      entry.lastActivity = p.tsMs;
      entry.model = p.model;
    }
    sessionMap.set(p.sessionId, entry);
  }

  const perSession = Array.from(sessionMap.entries())
    .filter(([, v]) => v.promptsLast5h > 0 || v.promptsThisWeek > 0)
    .sort((a, b) => b[1].promptsLast5h - a[1].promptsLast5h)
    .map(([sessionId, v]) => ({
      sessionId,
      sessionPrefix: sessionId.slice(0, 8),
      promptsLast5h: v.promptsLast5h,
      promptsThisWeek: v.promptsThisWeek,
      model: v.model,
      lastActivity: new Date(v.lastActivity).toISOString(),
    }));

  return {
    session: {
      prompts: sessionCount,
      oldestPromptTime: oldestInWindow?.timestamp ?? null,
      newestPromptTime: newestInWindow?.timestamp ?? null,
      resetsIn: fmtCountdown(sessionResetsInMs),
      resetsAt: sessionResetsAt,
      nextCapacityIn: fmtCountdown(nextCapacityInMs),
      nextCapacityAt: nextCapacityAt,
    },
    weekly: {
      allModels: { prompts: weeklyAll },
      sonnetOnly: { prompts: weeklySonnet },
      opusOnly: { prompts: weeklyOpus },
      resetsAt: nextReset.toISOString(),
      resetsIn: fmtCountdown(weeklyResetsInMs),
    },
    extraUsage: {
      enabled: readNotificationStates(),
    },
    perSession,
  };
}

export async function getUsageLimits(): Promise<UsageLimits> {
  const now = Date.now();
  if (limitsCache && now - limitsCache.ts < LIMITS_CACHE_TTL_MS) return limitsCache.data;

  const data = await buildUsageLimits();
  limitsCache = { data, ts: now };
  return data;
}

// ── Agent Cost Attribution Types ─────────────────────────────────────────────

export type TimeRange = "7d" | "30d" | "mtd" | "all";

export interface AgentCost {
  agentName: string | null;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  sessionCount: number;
  turnCount: number;
  costShare: number;
}

export interface ProjectCost {
  project: string;
  estimatedCost: number;
  sessionCount: number;
  costShare: number;
}

export interface ByAgentResponse {
  agents: AgentCost[];
  projects: ProjectCost[];
  totalCost: number;
  totalSessions: number;
  range: TimeRange;
  cachedAt: string;
}

// ── Time range helper ─────────────────────────────────────────────────────────

function rangeStartDate(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case "7d":  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "mtd": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "all": return null;
  }
}

// ── Minimal tracker interface for project-label lookup ────────────────────────

export interface AgentLookup {
  getAll(): Array<{ sessionName: string; projectLabel?: string | null }>;
}

// ── By-agent aggregation cache (10s TTL, keyed by range) ─────────────────────

const byAgentCache = new Map<TimeRange, { data: ByAgentResponse; ts: number }>();
const BY_AGENT_CACHE_TTL_MS = 10_000;

// ── Project slug extraction ───────────────────────────────────────────────────

/**
 * Derives a human-readable project name from a JSONL directory path.
 * Examples:
 *   ~/.claude/projects/-Users-alice-Project-maw-js  → "maw-js"
 *   ~/.claude/projects/-Users-alice-documents       → "documents"
 */
function projectSlugFromDir(dir: string): string {
  const base = path.basename(dir);
  // Strip leading dashes produced by Claude Code's path encoding
  const cleaned = base.replace(/^-+/, "");
  // If the path looks like a flattened absolute path (contains hyphens for slashes)
  // extract the last segment by treating hyphens as separators only when
  // the segment after "Project-" or "project-" is present.
  const projectMarker = cleaned.match(/[Pp]roject-(.+)$/);
  if (projectMarker?.[1]) return projectMarker[1];
  // Fall back: last hyphen-separated token
  const parts = cleaned.split("-");
  const last = parts[parts.length - 1];
  return last || "default";
}

// ── Public: GET /api/token-usage/by-agent ────────────────────────────────────

async function buildTokenUsageByAgent(range: TimeRange, agentLookup?: AgentLookup): Promise<ByAgentResponse> {
  // 1. Resolve the time-range cutoff
  const rangeStart = rangeStartDate(range);

  // 2. Get the live prefix → session-name map from realtime tmux state
  const realtimeSessions = await getRealtimeSessions();
  const prefixToName = new Map<string, string>();
  for (const s of realtimeSessions) {
    prefixToName.set(s.sessionPrefix, s.sessionName);
  }

  // 3. Pull all parsed JSONL files from the shared 10s cache
  const parsed = await getAllParsedFiles();

  // 4. Determine the fallback project slug for this JSONL directory
  //    (Sprint 1: single project — all files share one directory)
  const fallbackProjectSlug = projectSlugFromDir(JSONL_DIR);

  // Build a sessionName → projectLabel lookup from the tracker
  const agentProjectLabels = new Map<string, string | null>();
  if (agentLookup) {
    for (const a of agentLookup.getAll()) {
      agentProjectLabels.set(a.sessionName, a.projectLabel ?? null);
    }
  }

  // 5. Aggregate: agentName → accumulated stats
  const agentMap = new Map<string | null, {
    estimatedCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheRead: number;
    sessionCount: number;
    turnCount: number;
  }>();

  // 6. Aggregate: project → accumulated stats
  const projectMap = new Map<string, {
    estimatedCost: number;
    sessionCount: number;
  }>();

  for (const { raw, sessionId } of parsed) {
    // Apply time-range filter on lastSeen
    if (rangeStart !== null) {
      const sortedTs = raw.timestamps.slice().sort();
      const lastSeen = sortedTs[sortedTs.length - 1];
      if (!lastSeen) continue;
      if (new Date(lastSeen).getTime() < rangeStart.getTime()) continue;
    }

    // Dominant model for cost estimation
    const model =
      Object.entries(raw.modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

    const sessionCost = estimateCost(
      model,
      raw.inputTokens,
      raw.outputTokens,
      raw.cacheCreation,
      raw.cacheRead
    );

    // Attribute to agent name via the 8-char session prefix
    const prefix = sessionId.slice(0, 8);
    const agentName: string | null = prefixToName.get(prefix) ?? null;

    const existing = agentMap.get(agentName) ?? {
      estimatedCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation: 0,
      cacheRead: 0,
      sessionCount: 0,
      turnCount: 0,
    };
    existing.estimatedCost += sessionCost;
    existing.inputTokens  += raw.inputTokens;
    existing.outputTokens += raw.outputTokens;
    existing.cacheCreation += raw.cacheCreation;
    existing.cacheRead    += raw.cacheRead;
    existing.sessionCount += 1;
    existing.turnCount    += raw.turnCount;
    agentMap.set(agentName, existing);

    // Accumulate into project bucket — prefer the agent's manual projectLabel,
    // fall back to the directory-derived slug.
    const agentProjectLabel = agentName != null ? (agentProjectLabels.get(agentName) ?? null) : null;
    const projectSlug = agentProjectLabel ?? fallbackProjectSlug;
    const projExisting = projectMap.get(projectSlug) ?? { estimatedCost: 0, sessionCount: 0 };
    projExisting.estimatedCost += sessionCost;
    projExisting.sessionCount  += 1;
    projectMap.set(projectSlug, projExisting);
  }

  // 7. Compute totals
  let totalCost = 0;
  let totalSessions = 0;
  for (const stats of agentMap.values()) {
    totalCost    += stats.estimatedCost;
    totalSessions += stats.sessionCount;
  }

  // 8. Build agents array, sorted by cost descending
  const agents: AgentCost[] = Array.from(agentMap.entries())
    .map(([agentName, stats]) => ({
      agentName,
      estimatedCost: stats.estimatedCost,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cacheCreation: stats.cacheCreation,
      cacheRead: stats.cacheRead,
      sessionCount: stats.sessionCount,
      turnCount: stats.turnCount,
      costShare: totalCost > 0 ? stats.estimatedCost / totalCost : 0,
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);

  // 9. Build projects array, sorted by cost descending
  const projects: ProjectCost[] = Array.from(projectMap.entries())
    .map(([project, stats]) => ({
      project,
      estimatedCost: stats.estimatedCost,
      sessionCount: stats.sessionCount,
      costShare: totalCost > 0 ? stats.estimatedCost / totalCost : 0,
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);

  return {
    agents,
    projects,
    totalCost,
    totalSessions,
    range,
    cachedAt: new Date().toISOString(),
  };
}

export async function getTokenUsageByAgent(range: TimeRange, agentLookup?: AgentLookup): Promise<ByAgentResponse> {
  const now = Date.now();
  const cached = byAgentCache.get(range);
  if (cached && now - cached.ts < BY_AGENT_CACHE_TTL_MS) return cached.data;

  const data = await buildTokenUsageByAgent(range, agentLookup);
  byAgentCache.set(range, { data, ts: now });
  return data;
}

// ── Real-time: parse tmux status bar ─────────────────────────────────────────

export interface RealtimeSession {
  sessionName: string;
  sessionPrefix: string;
  model: string;
  contextPercent: number | null;
  streamingTokens: number | null;
}

export async function getRealtimeSessions(): Promise<RealtimeSession[]> {
  // Import listSessions dynamically to avoid circular dep with ssh.ts at runtime
  const { listSessions } = await import("./ssh");
  let sessions: Session[];
  try {
    sessions = await listSessions();
  } catch {
    return [];
  }

  const results: RealtimeSession[] = [];

  for (const session of sessions) {
    // Capture last few lines of each session's first window
    const firstWindow = session.windows?.[0];
    if (!firstWindow) continue;
    const target = `${session.name}:${firstWindow.index}`;
    let text = "";
    try {
      text = await capture(target, 10);
    } catch {
      continue;
    }

    // Parse status bar patterns
    const ctxMatch = text.match(/ctx:(\d+)%/);
    const sessionMatch = text.match(/session:([a-f0-9]{8})/);
    const streamMatch = text.match(/↓\s*([\d.]+)k?\s*tokens/i);

    // Model extraction — common patterns in Claude Code status bar
    let model = "unknown";
    const modelMatch = text.match(/claude-(?:opus|sonnet|haiku)[\w.-]*/i);
    if (modelMatch) model = modelMatch[0].toLowerCase();

    const sessionPrefix = sessionMatch?.[1] || session.name.slice(0, 8);

    results.push({
      sessionName: session.name,
      sessionPrefix,
      model,
      contextPercent: ctxMatch ? parseInt(ctxMatch[1], 10) : null,
      streamingTokens: streamMatch
        ? parseFloat(streamMatch[1]) * (streamMatch[0].includes("k") ? 1000 : 1)
        : null,
    });
  }

  return results;
}
