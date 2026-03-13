import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Session, AgentState, PaneStatus, AgentEvent, TrackedAgent } from "../lib/types";
import { stripAnsi } from "../lib/ansi";
import { agentSortKey } from "../lib/constants";

// Simple string hash
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// Detection patterns
//
// SPINNER_RE: braille/dot chars that are ALWAYS mid-spin (no false positives).
const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏∴·◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷]/;
//
// ACTIVE_VERB_RE: ✢✻✶⏺ + * lines are active ONLY when they contain "…" or "..."
// (present-tense Claude activity like "✶ Vibing… (9m)" / "+ Proofing… (30m)").
// Completion lines like "✻ Worked for 8m 26s" do NOT have "…" and are excluded.
const ACTIVE_VERB_RE = /^[✢✻✶⏺+*]\s+\S.*[…\.]{1}/m;
//
const TOOL_RE    = /● \w+\(|\b(Read|Edit|Write|Bash|Grep|Glob|Agent)\b/;
// Strict prompt detection: ❯ (Claude/zsh) or "$ "/"% " at line start
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
// Error / crash indicators
const ERROR_RE   = /\b(Error|SIGTERM|panic:|fatal:|command not found|exit status \d+)\b/i;
// Window shows only a bare shell with no Claude Code running
const BARE_SHELL_RE = /^(bash|zsh|sh)\s*$/m;

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [captureData, setCaptureData] = useState<Record<string, { preview: string; status: PaneStatus }>>({});
  /** isWorker flags keyed by tmux target ("session:windowIndex") — sourced from agents-updated WS */
  const [workerFlags, setWorkerFlags] = useState<Record<string, boolean>>({});
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Track content hashes for change detection
  const hashHistory = useRef<Record<string, { prev: number; curr: number; unchangedCount: number }>>({});
  // Sticky-working cooldown: number of polls to force "working" regardless of stability
  const workingCooldown = useRef<Record<string, number>>({});
  // Track which targets just had content change (for update-blink)
  const [blinkTargets, setBlinkTargets] = useState<Set<string>>(new Set());
  const blinkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [saiyanTargets, setSaiyanTargets] = useState<Set<string>>(new Set());
  const saiyanTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [eventLog, setEventLog] = useState<AgentEvent[]>([]);
  const MAX_EVENTS = 200;

  const addEvent = useCallback((target: string, type: AgentEvent["type"], detail: string) => {
    setEventLog(prev => {
      const next = [...prev, { time: Date.now(), target, type, detail }];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const handleMessage = useCallback((data: any) => {
    if (data.type === "sessions") {
      setSessions(data.sessions);
    } else if (data.type === "agents-updated") {
      // Build a target → isWorker lookup from the TrackedAgent list
      const flags: Record<string, boolean> = {};
      const trackedAgents: TrackedAgent[] = data.agents ?? [];
      for (const a of trackedAgents) {
        flags[a.target] = a.isWorker;
      }
      setWorkerFlags(flags);
    }
  }, []);

  // Poll captures — detect busy by content change
  useEffect(() => {
    async function poll() {
      const targets: string[] = [];
      sessionsRef.current.forEach((s) =>
        s.windows.forEach((w) => targets.push(`${s.name}:${w.index}`))
      );
      for (let i = 0; i < targets.length; i += 4) {
        const batch = targets.slice(i, i + 4);
        await Promise.allSettled(
          batch.map(async (target) => {
            try {
              const res = await fetch(`/api/capture?target=${encodeURIComponent(target)}`);
              const data = await res.json();
              const raw = data.content || "";
              const text = stripAnsi(raw);

              // Exclude bottom 15% (status bar, prompt, timers, token counters)
              const allLines = text.split("\n");
              const cutoff = Math.max(1, Math.floor(allLines.length * 0.85));
              const topPart = allLines.slice(0, cutoff).join("\n");
              const contentHash = hash(topPart);

              // Track hash changes
              const entry = hashHistory.current[target] || { prev: 0, curr: 0, unchangedCount: 0 };
              entry.prev = entry.curr;
              entry.curr = contentHash;

              const changed = entry.prev !== 0 && entry.prev !== entry.curr;
              if (changed) {
                // Content changed → busy, reset stability counter and start sticky cooldown
                entry.unchangedCount = 0;
                workingCooldown.current[target] = 5; // stay working for 5 more polls (10s)
              } else {
                // Content same → increment stable count, decrement cooldown
                entry.unchangedCount++;
                if (workingCooldown.current[target] > 0) {
                  workingCooldown.current[target]--;
                }
              }
              hashHistory.current[target] = entry;

              // Check bottom 10 non-empty lines for indicators
              const lines = text.split("\n").filter((l: string) => l.trim());
              const bottom10 = lines.slice(-10).join("\n");
              const bottom5  = lines.slice(-5).join("\n");

              // Prepend newline so \n-anchored patterns match the first bottom line too
              const hasPrompt      = PROMPT_RE.test("\n" + bottom5);
              // Tmux status bar (separator + ❯ + separator + info + edit-hint) consumes up to 5 lines,
              // so the actual Claude spinner can appear at position -6 or higher. Check bottom10
              // for spinner/tool detection so we never miss an active spinner above the status bar.
              // ACTIVE_VERB_RE matches ✢✻✶⏺+* ONLY when followed by "…" (present-tense activity);
              // this excludes completion lines like "✻ Worked for 8m 26s" (no ellipsis).
              const hasSpinner     = SPINNER_RE.test(bottom10) || ACTIVE_VERB_RE.test(bottom10) || TOOL_RE.test(bottom10);
              const hasPermission  = hasPermissionPrompt(bottom10);
              const hasError       = ERROR_RE.test(bottom5) || BARE_SHELL_RE.test(text.trim());

              // Trigger update-blink on content change
              if (changed) {
                clearTimeout(blinkTimers.current[target]);
                setBlinkTargets(prev => new Set(prev).add(target));
                blinkTimers.current[target] = setTimeout(() => {
                  setBlinkTargets(prev => {
                    const next = new Set(prev);
                    next.delete(target);
                    return next;
                  });
                }, 500);
              }

              // ── 5-state classification (priority order) ───────────────────
              let status: PaneStatus;

              // 1. permission — highest priority, check first
              if (hasPermission) {
                status = "permission";
              }
              // 2. working — content actively changing or spinner/tool visible
              else if (changed || hasSpinner) {
                status = "working";
              }
              // 3. sticky-working cooldown — recent activity, hold "working" for up to 10s
              //    before allowing a downgrade to waiting/idle. This prevents false "waiting"
              //    flashes during Claude's think→output→think cycles (2-3s silent gaps).
              else if ((workingCooldown.current[target] ?? 0) > 0) {
                status = "working";
              }
              // 4. waiting — prompt visible and content stable for 5+ polls (10s)
              else if (hasPrompt && entry.unchangedCount >= 5) {
                status = "waiting";
              }
              // 5. error — crash indicators or very long idle without prompt
              else if (hasError || entry.unchangedCount > 30) {
                status = "error";
              }
              // 6. cooling (6–12 polls, no cooldown) → waiting if prompt, else idle
              else if (entry.unchangedCount <= 12) {
                status = hasPrompt ? "waiting" : "idle";
              }
              // 7. long stable — use prompt to differentiate
              else {
                status = hasPrompt ? "waiting" : "idle";
              }

              const preview = (lines[lines.length - 1] || "").slice(0, 120);

              setCaptureData((p) => {
                const existing = p[target];
                if (existing && existing.preview === preview && existing.status === status) return p;
                // Log status change
                if (existing && existing.status !== status) {
                  addEvent(target, "status", `${existing.status} → ${status}`);
                }
                // Saiyan burst animation on transition to working
                if (status === "working" && existing?.status !== "working") {
                  // 10s saiyan burst animation
                  clearTimeout(saiyanTimers.current[target]);
                  setSaiyanTargets(prev => new Set(prev).add(target));
                  saiyanTimers.current[target] = setTimeout(() => {
                    setSaiyanTargets(prev => {
                      const next = new Set(prev);
                      next.delete(target);
                      return next;
                    });
                  }, 10000);
                }
                return { ...p, [target]: { preview, status } };
              });
            } catch {}
          })
        );
      }
      pollTimer.current = setTimeout(poll, 2000);
    }
    poll();
    return () => clearTimeout(pollTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive flat agent list (memoized to prevent re-renders)
  const agents: AgentState[] = useMemo(() => {
    const list = sessions.flatMap((s) =>
      s.windows.map((w) => {
        const key = `${s.name}:${w.index}`;
        const cd = captureData[key];
        return {
          target: key,
          name: w.name,
          session: s.name,
          windowIndex: w.index,
          active: w.active,
          preview: cd?.preview || "",
          status: cd?.status || "idle",
          isWorker: workerFlags[key] ?? false,
        };
      })
    );
    list.sort((a, b) => agentSortKey(a.name) - agentSortKey(b.name));
    return list;
  }, [sessions, captureData, workerFlags]);

  return { sessions, agents, saiyanTargets, blinkTargets, eventLog, addEvent, handleMessage };
}
