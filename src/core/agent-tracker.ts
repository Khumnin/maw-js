import { capture, listSessions } from "../services/ssh.js";
import { isWorker } from "../config.js";
import type { AgentStatus, AgentContext, TrackedAgent } from "../types/agent.js";

// Re-export so existing importers of agent-tracker.ts continue to work.
export type { AgentStatus, AgentContext, TrackedAgent };

// Detection patterns — ported from office/src/hooks/useSessions.ts
//
// SPINNER_RE: braille/dot chars that are ALWAYS mid-spin (no false positives).
const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏∴·◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷]/;
//
// ACTIVE_VERB_RE: ✢✻✶⏺ + * lines are active ONLY when they contain "…" or "..."
// (present-tense Claude activity like "✶ Vibing… (9m)" / "+ Proofing… (30m)").
// Completion lines like "✻ Worked for 8m 26s" do NOT have "…" and are excluded.
// ⏺ "Running N agents…" is always active if it has the ellipsis.
const ACTIVE_VERB_RE = /^[✢✻✶⏺+*]\s+\S.*[…\.]{1}/m;
//
const TOOL_RE    = /● \w+\(|\b(Read|Edit|Write|Bash|Grep|Glob|Agent)\b/;
const PROMPT_RE  = /\u276f|\n[$%] |\n[$%]$/;
// Permission prompt detection — requires BOTH the question AND numbered options to be present.
// This prevents false positives from words like "permission" appearing in normal text output
// (e.g. Thai text, log messages) or "accept edits on" from Claude Code's edit-mode hint.
// A real Claude Code permission prompt always has:
//   1. "Do you want to proceed?" — the confirmation question
//   2. Numbered options like "1. Yes" / "2. No"
function hasPermissionPrompt(text: string): boolean {
  const hasQuestion = /Do you want to proceed/i.test(text);
  const hasOptions  = /\d+\.\s*(Yes|No|Don't|don't|Allow)/i.test(text);
  return hasQuestion && hasOptions;
}
const ERROR_RE   = /\b(Error|SIGTERM|panic:|fatal:|command not found|exit status \d+)\b/i;
const BARE_SHELL_RE = /^(bash|zsh|sh)\s*$/m;

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function extractHeadline(capturedText: string): string {
  const lines = stripAnsi(capturedText).split("\n").filter((l) => l.trim());

  // Scan from bottom to top for meaningful content
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Spinner / thinking line: "✢ Pollinating… (59s · ↓ 2.2k tokens)" or "✶ Vibing…" or "⏺ Running…"
    if (/^[✢✻✶·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏∴◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷⏺]/.test(line)) {
      // Trim down to just the useful part — strip token counters if too long
      const simplified = line.replace(/·\s*[↑↓]\s*[\d.]+k?\s*tokens?/gi, "").trim();
      return simplified.slice(0, 80);
    }

    // Done line: "⎿  Done (17 tool uses · 42.5k tokens · 16m)"
    if (/Done \(/.test(line)) {
      const match = line.match(/Done \((.+?)\)/);
      return match ? `Completed (${match[1]})` : "Completed";
    }

    // Tool result lines starting with ⎿
    if (line.startsWith("⎿")) {
      const content = line.replace(/^⎿\s*/, "").trim();
      if (!content) continue;
      if (content.startsWith("Read "))      return `Reading ${content.slice(5, 65)}`;
      if (content.startsWith("Wrote "))     return `Writing ${content.slice(6, 64)}`;
      if (content.startsWith("Ran "))       return `Running ${content.slice(4, 64)}`;
      if (/^Searched?\b/i.test(content))    return content.slice(0, 80);
      return content.slice(0, 80);
    }

    // User prompt line with content: "❯ do something"
    if (/^❯\s+.+/.test(line)) {
      const userMsg = line.replace(/^❯\s+/, "");
      return `Task: ${userMsg.slice(0, 70)}`;
    }

    // Bare prompt — skip, keep searching upward
    if (/^❯\s*$/.test(line)) continue;

    // Tool invocation indicators (● Read(...) etc.)
    if (/^●\s+\w+\(/.test(line)) {
      return line.slice(0, 80);
    }
  }

  return "";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ── Context extraction helpers ────────────────────────────────────────────────

/**
 * Parse the working directory from captured terminal output.
 * Handles common shell prompt formats:
 *   ~/Project/maw-js $
 *   kanate@mac:~/Project/auth $
 *   /Users/kanate/Project/auth $
 *   cd /path/to/dir
 */
function extractWorkingDir(text: string): string | null {
  const lines = text.split("\n").filter((l) => l.trim());

  // Walk from bottom up looking for a prompt or cd command
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = stripAnsi(lines[i]).trim();

    // cd command
    const cdMatch = line.match(/^(?:\$\s+)?cd\s+([\S]+)/);
    if (cdMatch) return cdMatch[1];

    // user@host:dir $ or user@host:dir>
    const hostPrompt = line.match(/[@:](~[/\w.-]*|\/[\w./-]+)\s*[$%>#]\s*$/);
    if (hostPrompt) return hostPrompt[1];

    // bare dir $ or dir %  (e.g. ~/Project/maw-js $)
    const barePrompt = line.match(/^(~[/\w.-]*|\/[\w./-]+)\s*[$%>#]\s*$/);
    if (barePrompt) return barePrompt[1];

    // ❯ prompt line — look one line above for a path
    if (/^❯\s*$/.test(line) && i > 0) {
      const above = stripAnsi(lines[i - 1]).trim();
      const dirInAbove = above.match(/(~[/\w.-]+|\/[\w./-]{3,})/);
      if (dirInAbove) return dirInAbove[1];
    }
  }
  return null;
}

/**
 * Extract file paths referenced in tmux output.
 * Recognises patterns like: Read file: ..., Write to ..., Edit ...,
 * absolute paths (/Users/...), relative paths (src/..., ./...).
 */
function extractRecentFiles(text: string, existing: string[]): string[] {
  const found = new Set<string>(existing);

  // Named tool results from Claude Code (⎿ Read /path, ⎿ Wrote /path, etc.)
  const toolResultRe = /⎿\s+(?:Read|Wrote?|Edited?|Updated?)\s+([\w./~-][^\s,;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = toolResultRe.exec(text)) !== null) {
    found.add(m[1]);
  }

  // "Read file: ..." style
  const namedRe = /(?:Read(?:ing)?|Writ(?:e|ing|ten)|Edit(?:ing|ed)?|Open(?:ing|ed)?)\s+(?:file\s*:\s*)?([\w./~-][^\s,;'"]{3,})/gi;
  while ((m = namedRe.exec(text)) !== null) {
    const p = m[1];
    if (p.includes(".") || p.startsWith("/") || p.startsWith("~") || p.startsWith("./")) {
      found.add(p);
    }
  }

  // Absolute paths /Users/... or /home/... or /tmp/...
  const absRe = /(?:^|\s)(\/(?:Users|home|tmp|var|opt|etc|srv|app)\/[\w./~-]{3,})/gm;
  while ((m = absRe.exec(text)) !== null) {
    found.add(m[1].trim());
  }

  // Relative paths ./src/... or src/...
  const relRe = /(?:^|\s)(\.?\.?\/[\w./~-]{4,})/gm;
  while ((m = relRe.exec(text)) !== null) {
    const p = m[1].trim();
    if (p.includes(".") && !p.endsWith("/")) found.add(p);
  }

  // Keep only last 20 entries (oldest drop off)
  const arr = [...found];
  return arr.slice(-20);
}

const STACK_RULES: Array<{ ext: RegExp; stack: string; tags: string[] }> = [
  { ext: /\.(go|mod)$/i,          stack: "go",         tags: ["backend"] },
  { ext: /\.(ts|tsx|jsx)$/i,      stack: "typescript", tags: ["frontend"] },
  { ext: /\.js$/i,                stack: "javascript", tags: ["frontend"] },
  { ext: /\.py$/i,                stack: "python",     tags: ["backend"] },
  { ext: /\.(yml|yaml)$/i,        stack: "yaml",       tags: ["infra"] },
  { ext: /Dockerfile/i,           stack: "docker",     tags: ["infra"] },
  { ext: /\.tf$/i,                stack: "terraform",  tags: ["infra"] },
  { ext: /\.(css|scss|sass)$/i,   stack: "css",        tags: ["frontend"] },
  { ext: /\.html$/i,              stack: "html",       tags: ["frontend"] },
  { ext: /\.sql$/i,               stack: "sql",        tags: ["backend"] },
  { ext: /\.rs$/i,                stack: "rust",       tags: ["backend"] },
  { ext: /\.java$/i,              stack: "java",       tags: ["backend"] },
  { ext: /\.rb$/i,                stack: "ruby",       tags: ["backend"] },
  { ext: /\.php$/i,               stack: "php",        tags: ["backend"] },
  { ext: /\.sh$/i,                stack: "bash",       tags: ["infra"] },
];

function deriveStackAndTags(files: string[]): { stack: string[]; tags: string[] } {
  const stackSet = new Set<string>();
  const tagSet = new Set<string>();

  for (const f of files) {
    for (const rule of STACK_RULES) {
      if (rule.ext.test(f)) {
        stackSet.add(rule.stack);
        rule.tags.forEach((t) => tagSet.add(t));
      }
    }
  }

  return { stack: [...stackSet], tags: [...tagSet] };
}

function projectFromDir(dir: string | null): string | null {
  if (!dir) return null;
  const parts = dir.replace(/~/, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

function buildContext(
  text: string,
  existing: AgentContext | undefined,
  changed: boolean,
): AgentContext {
  const workingDir = extractWorkingDir(text) ?? existing?.workingDir ?? null;
  const existingFiles = existing?.recentFiles ?? [];
  const recentFiles = extractRecentFiles(text, existingFiles);
  const { stack, tags } = deriveStackAndTags(recentFiles);
  const projectName = projectFromDir(workingDir);
  const lastActiveAt = changed ? Date.now() : (existing?.lastActiveAt ?? Date.now());

  return { workingDir, recentFiles, detectedStack: stack, projectName, lastActiveAt, tags };
}

export class AgentTracker {
  private agents: Map<string, TrackedAgent> = new Map();
  private hashHistory: Record<string, { prev: number; curr: number; unchangedCount: number }> = {};
  private workingCooldown: Record<string, number> = {};

  async pollAll(): Promise<void> {
    let sessions: Awaited<ReturnType<typeof listSessions>>;
    try {
      sessions = await listSessions();
    } catch {
      return;
    }

    // Collect all targets from current sessions
    const currentTargets = new Set<string>();
    for (const session of sessions) {
      for (const window of session.windows) {
        currentTargets.add(`${session.name}:${window.index}`);
      }
    }

    // Remove stale agents no longer in sessions
    for (const target of this.agents.keys()) {
      if (!currentTargets.has(target)) {
        this.agents.delete(target);
        delete this.hashHistory[target];
        delete this.workingCooldown[target];
      }
    }

    // Poll all targets in batches of 4
    const targets = [...currentTargets];
    for (let i = 0; i < targets.length; i += 4) {
      const batch = targets.slice(i, i + 4);
      await Promise.allSettled(
        batch.map(async (target) => {
          // Find session/window info
          const [sessionName, windowIdxStr] = target.split(":");
          const session = sessions.find((s) => s.name === sessionName);
          if (!session) return;
          const windowIndex = parseInt(windowIdxStr, 10);
          const window = session.windows.find((w) => w.index === windowIndex);
          if (!window) return;

          let raw = "";
          try {
            raw = await capture(target, 80);
          } catch {
            return;
          }

          const text = stripAnsi(raw);

          // Exclude bottom 15% for hash (avoid status bar noise)
          const allLines = text.split("\n");
          const cutoff = Math.max(1, Math.floor(allLines.length * 0.85));
          const topPart = allLines.slice(0, cutoff).join("\n");
          const contentHash = hash(topPart);

          const entry = this.hashHistory[target] || { prev: 0, curr: 0, unchangedCount: 0 };
          entry.prev = entry.curr;
          entry.curr = contentHash;

          const changed = entry.prev !== 0 && entry.prev !== entry.curr;
          if (changed) {
            entry.unchangedCount = 0;
            this.workingCooldown[target] = 5;
          } else {
            entry.unchangedCount++;
            if ((this.workingCooldown[target] ?? 0) > 0) {
              this.workingCooldown[target]--;
            }
          }
          this.hashHistory[target] = entry;

          const lines = text.split("\n").filter((l) => l.trim());
          const bottom10 = lines.slice(-10).join("\n");
          const bottom5  = lines.slice(-5).join("\n");

          const hasPrompt      = PROMPT_RE.test("\n" + bottom5);
          // Tmux status bar (separator + ❯ + separator + info + edit-hint) consumes up to 5 lines,
          // so the actual Claude spinner can appear at position -6 or higher. Check bottom10
          // for spinner/tool detection so we never miss an active spinner above the status bar.
          // ACTIVE_VERB_RE matches ✢✻✶⏺+* ONLY when followed by "…" (present-tense activity);
          // this excludes completion lines like "✻ Worked for 8m 26s" (no ellipsis).
          const hasSpinner     = SPINNER_RE.test(bottom10) || ACTIVE_VERB_RE.test(bottom10) || TOOL_RE.test(bottom10);
          const hasPermission  = hasPermissionPrompt(bottom10);
          const hasError       = ERROR_RE.test(bottom5) || BARE_SHELL_RE.test(text.trim());

          let status: AgentStatus;
          if (hasPermission) {
            status = "permission";
          } else if (changed || hasSpinner) {
            status = "working";
          } else if ((this.workingCooldown[target] ?? 0) > 0) {
            status = "working";
          } else if (hasPrompt && entry.unchangedCount >= 5) {
            status = "waiting";
          } else if (hasError || entry.unchangedCount > 30) {
            status = "error";
          } else if (entry.unchangedCount <= 12) {
            status = hasPrompt ? "waiting" : "idle";
          } else {
            status = hasPrompt ? "waiting" : "idle";
          }

          const preview = (lines[lines.length - 1] || "").slice(0, 120);
          const headline = extractHeadline(raw);
          const existing = this.agents.get(target);

          const context = buildContext(text, existing?.context, changed);

          this.agents.set(target, {
            target,
            sessionName,
            windowIndex,
            windowName: window.name,
            status,
            isWorker: isWorker(sessionName),
            currentTaskId: existing?.currentTaskId,
            lastActivityAt: changed ? Date.now() : (existing?.lastActivityAt ?? Date.now()),
            preview,
            headline,
            context,
            projectLabel: existing?.projectLabel,
          });
        })
      );
    }

    // Apply any pending spawn-time project labels now that agents are in the map
    this.applyPendingProjectLabels();
  }

  getIdleWorkers(): TrackedAgent[] {
    return [...this.agents.values()].filter(
      (a) => a.isWorker && !a.currentTaskId && (a.status === "waiting" || a.status === "idle")
    );
  }

  getAll(): TrackedAgent[] {
    return [...this.agents.values()];
  }

  lockWorker(target: string, taskId: string): void {
    const agent = this.agents.get(target);
    if (agent) {
      agent.currentTaskId = taskId;
      this.agents.set(target, agent);
    }
  }

  unlockWorker(target: string): void {
    const agent = this.agents.get(target);
    if (agent) {
      agent.currentTaskId = undefined;
      this.agents.set(target, agent);
    }
  }

  // Refresh isWorker flags (called after config changes)
  refreshWorkerFlags(): void {
    for (const [target, agent] of this.agents) {
      agent.isWorker = isWorker(agent.sessionName);
      this.agents.set(target, agent);
    }
  }

  // Set the project label for an agent (manual assignment)
  setProjectLabel(target: string, project: string | null): boolean {
    const agent = this.agents.get(target);
    if (!agent) return false;
    agent.projectLabel = project;
    this.agents.set(target, agent);
    return true;
  }

  // Set initial project label at spawn time (before first poll)
  setSpawnProjectLabel(sessionName: string, project: string): void {
    // Called right after spawn — agent may not be in the map yet (poll hasn't run),
    // so we store it in a pending map and apply it on the next poll.
    this.pendingProjectLabels.set(sessionName, project);
  }

  private pendingProjectLabels: Map<string, string> = new Map();

  // Apply any pending spawn-time project labels after a poll populates the agents map
  private applyPendingProjectLabels(): void {
    for (const [sessionName, projectLabel] of this.pendingProjectLabels) {
      let applied = false;
      for (const [target, agent] of this.agents) {
        if (agent.sessionName === sessionName) {
          if (agent.projectLabel == null) {
            agent.projectLabel = projectLabel;
            this.agents.set(target, agent);
            applied = true;
          } else {
            // Agent already has a label — pending entry no longer needed
            applied = true;
          }
        }
      }
      if (applied) {
        this.pendingProjectLabels.delete(sessionName);
      }
    }
  }
}
