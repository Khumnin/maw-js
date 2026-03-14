import { memo, useState, useEffect, useCallback, useRef } from "react";
import type { TrackedAgent, Task, TaskPriority, QueueStatus, TaskChain, TaskChainStep, TaskAffinity } from "../lib/types";
import { ansiToHtml } from "../lib/ansi";
import { MailboxPanel } from "./MailboxPanel";
import { KvStorePanel } from "./KvStorePanel";
import { RpcPanel } from "./RpcPanel";

// ── Activity log entry ────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  ts: number;
  icon: string;
  message: string;
  color: string;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  message: string;
  color?: string;
}

// ── Relative time helper ──────────────────────────────────────────────────────

function relTime(ts: number | undefined): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function elapsedSec(ts: number | undefined): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 1000);
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function statusDot(status: string): { color: string; label: string } {
  switch (status) {
    case "working":    return { color: "#ffa726", label: "Working" };
    case "waiting":    return { color: "#4caf50", label: "Available" };
    case "idle":       return { color: "#4caf50", label: "Available" };
    case "permission": return { color: "#ff9800", label: "PERMISSION" };
    case "error":      return { color: "#ef5350", label: "Error" };
    default:           return { color: "#888", label: status };
  }
}

// ── Live elapsed counter ──────────────────────────────────────────────────────

function ElapsedCounter({ since }: { since: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = elapsedSec(since);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return <span>{m > 0 ? `${m}m ` : ""}{sec}s</span>;
}

// ── Permission menu parser ────────────────────────────────────────────────────

interface MenuInfo {
  optionCount: number;      // 2 or 3
  cursorPosition: number;   // 1, 2, or 3 (which option the cursor is on)
  hasAlwaysOption: boolean; // true when "don't ask again" option exists
}

/** Strip ANSI escape codes from a string. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Parse the raw terminal capture of a Claude Code permission menu.
 *
 * Handles both menu shapes:
 *   2-option  — cursor starts on option 1 (Yes)
 *   3-option  — cursor starts on option 2 (Yes, don't ask again)
 */
function parsePermissionMenu(capturedText: string): MenuInfo {
  const lines = capturedText.split("\n");
  let optionCount = 0;
  let cursorPosition = 1;
  let hasAlwaysOption = false;

  for (const line of lines) {
    const stripped = stripAnsi(line);
    // Match lines like: "❯ 1. Yes", "  2. Yes, and don't ask again…", "  3. No"
    const optionMatch = stripped.match(/^\s*[❯›>]?\s*(\d+)\.\s+(.+)/);
    if (!optionMatch) continue;

    const num = parseInt(optionMatch[1], 10);
    const label = optionMatch[2];

    optionCount = Math.max(optionCount, num);

    // Detect cursor marker before or around the number
    if (/[❯›>]/.test(stripped.slice(0, stripped.indexOf(`${num}.`) + 2))) {
      cursorPosition = num;
    }

    if (
      label.toLowerCase().includes("don't ask again") ||
      label.toLowerCase().includes("dont ask again") ||
      label.toLowerCase().includes("don't ask again")
    ) {
      hasAlwaysOption = true;
    }
  }

  return {
    optionCount: optionCount || 2,
    cursorPosition,
    hasAlwaysOption,
  };
}

/**
 * Extract the action description from a Claude Code permission prompt.
 *
 * Claude Code structures permission prompts as:
 *   <action description line(s)>
 *   [optional warning lines starting with "Contains"]
 *   Do you want to proceed?
 *   › 1. Yes
 *     2. No
 *
 * This function walks backwards from "Do you want to proceed?" skipping
 * warning lines and returns the first meaningful action line found.
 */
export function extractActionName(capturedText: string): string {
  const lines = capturedText
    .split("\n")
    .map((l) => stripAnsi(l).trim())
    .filter((l) => l.length > 0);

  // Find the "Do you want to proceed?" line index
  const proceedIdx = lines.findIndex((l) =>
    /do you want to proceed/i.test(l)
  );
  if (proceedIdx <= 0) return "";

  // Walk backwards, skipping warning/menu lines to find the action description
  for (let i = proceedIdx - 1; i >= 0; i--) {
    const line = lines[i];
    // Skip empty lines
    if (line.length === 0) continue;
    // Skip "Do you want to proceed?" itself (in case it appears again)
    if (/do you want to proceed/i.test(line)) continue;
    // Skip Claude Code warning patterns (case-insensitive)
    if (/contains/i.test(line)) continue;
    if (/obfuscation/i.test(line)) continue;
    if (/could separate/i.test(line)) continue;
    // Skip Esc/Tab hint lines
    if (/^esc\s+to/i.test(line) || /^tab\s+to/i.test(line)) continue;
    // Skip menu option lines (› 1. Yes, 2. No, etc.)
    if (/^\s*[❯›>]?\s*\d+\.\s/.test(line)) continue;
    if (/^[❯›>]\s/.test(line)) continue;
    // Truncate at 120 chars to prevent very long lines
    return line.length > 120 ? line.slice(0, 117) + "…" : line;
  }
  return "";
}

/**
 * Return the arrow key sequence needed to move from currentPos to targetPos.
 * Down arrow = \x1b[B, Up arrow = \x1b[A.
 */
function getArrowKeys(currentPos: number, targetPos: number): string[] {
  const diff = targetPos - currentPos;
  if (diff === 0) return [];
  const key = diff > 0 ? "\x1b[B" : "\x1b[A";
  return Array(Math.abs(diff)).fill(key);
}

// ── Permission preview card ───────────────────────────────────────────────────

interface PermissionCardProps {
  agent: TrackedAgent;
  send: (msg: object) => void;
  onAllowAll: () => void;
}

function PermissionCard({ agent, send, onAllowAll }: PermissionCardProps) {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [actionName, setActionName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [menuInfo, setMenuInfo] = useState<MenuInfo>({
    optionCount: 2,
    cursorPosition: 1,
    hasAlwaysOption: false,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Use lines=30 with -S scrollback so the permission prompt is never cut
        // off regardless of how much blank space is below the cursor.
        const res = await fetch(`/api/capture?target=${encodeURIComponent(agent.target)}&lines=30`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const text: string = data.content || "";
        if (!text.trim()) return;
        // Keep only non-blank lines, take last 15, convert ANSI → HTML for colors
        const lines = text.split("\n").filter((l) => l.trim()).slice(-15);
        const joined = lines.join("\n");
        setRawText(joined);
        setPreviewHtml(ansiToHtml(joined));
        setMenuInfo(parsePermissionMenu(joined));
        // Extract the action name from the full captured text (use all 30 lines)
        const fullLines = text.split("\n").filter((l) => l.trim()).slice(-30);
        setActionName(extractActionName(fullLines.join("\n")));
      } catch {}
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Re-fetch every 3s while permission is active
    const interval = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [agent.target]);

  /**
   * Send arrow keys to move the cursor from its current position to targetOption,
   * then send Enter to confirm.  A 50 ms delay between keys prevents tmux from
   * dropping rapid-fire escape sequences.
   */
  const sendToOption = useCallback(async (targetOption: number) => {
    const arrows = getArrowKeys(menuInfo.cursorPosition, targetOption);
    for (const arrow of arrows) {
      send({ type: "send", target: agent.target, text: arrow });
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    send({ type: "send", target: agent.target, text: "\r" });
  }, [menuInfo.cursorPosition, agent.target, send]);

  // Allow — always option 1 (Yes)
  const allow = () => sendToOption(1);

  // Allow Always — option 2 (Yes, don't ask again); only shown for 3-option menus
  const allowAlways = () => sendToOption(2);

  // Deny — always the last option
  const deny = () => sendToOption(menuInfo.optionCount);

  // Suppress unused-variable warning; rawText is kept for debugging convenience.
  void rawText;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid rgba(255,152,0,0.40)",
        background: "rgba(255,152,0,0.06)",
      }}
    >
      {/* Agent header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,152,0,0.20)" }}
      >
        <span style={{ fontSize: 14 }}>🧑‍💻</span>
        <span className="font-mono text-sm font-bold" style={{ color: "#ffa726" }}>
          {agent.sessionName || agent.windowName}
        </span>
        <span
          className="ml-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: "rgba(255,152,0,0.20)", color: "#ff9800" }}
        >
          PERMISSION REQUEST ⚠️
        </span>
        {/* Menu shape indicator */}
        <span
          className="ml-auto text-[9px] font-mono"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          {menuInfo.optionCount}-opt · cur@{menuInfo.cursorPosition}
        </span>
      </div>

      {/* Action name — the key line describing what the agent wants to do */}
      {actionName && (
        <div
          className="px-4 pt-2.5 pb-1"
          style={{ borderBottom: "1px solid rgba(255,152,0,0.12)" }}
        >
          <div
            className="text-xs font-mono font-bold leading-snug"
            style={{ color: "#ffffff" }}
            title={actionName}
          >
            {actionName}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="px-4 py-2">
        {loading ? (
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
            Loading preview...
          </div>
        ) : !previewHtml ? (
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
            No preview available
          </div>
        ) : (
          <div
            className="rounded-lg px-3 py-2 overflow-x-auto"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.06)",
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            <pre
              className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
              style={{ color: "rgba(255,255,255,0.75)", margin: 0 }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-4 pb-3 pt-1">
        <button
          onClick={allow}
          className="w-full sm:w-auto px-4 py-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-mono font-bold cursor-pointer transition-all"
          style={{ background: "rgba(76,175,80,0.20)", border: "1px solid rgba(76,175,80,0.50)", color: "#4caf50" }}
        >
          Yes
        </button>
        {menuInfo.hasAlwaysOption && (
          <button
            onClick={allowAlways}
            className="w-full sm:w-auto px-4 py-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-mono font-bold cursor-pointer transition-all"
            style={{ background: "rgba(100,181,246,0.15)", border: "1px solid rgba(100,181,246,0.45)", color: "#64b5f6" }}
          >
            Yes, don't ask again
          </button>
        )}
        <button
          onClick={deny}
          className="w-full sm:w-auto px-4 py-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-mono font-bold cursor-pointer transition-all"
          style={{ background: "rgba(239,83,80,0.15)", border: "1px solid rgba(239,83,80,0.40)", color: "#ef5350" }}
        >
          No
        </button>
        <button
          onClick={onAllowAll}
          className="w-full sm:w-auto px-4 py-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-mono cursor-pointer transition-all"
          style={{ background: "rgba(100,181,246,0.10)", border: "1px solid rgba(100,181,246,0.25)", color: "#64b5f6" }}
        >
          Allow All
        </button>
        {/* Cancel — sends Escape (\x1b) to the agent, equivalent to "Esc to cancel" in Claude Code prompts */}
        <button
          onClick={() => send({ type: "send", target: agent.target, text: "\x1b" })}
          className="w-full sm:w-auto sm:ml-auto px-4 py-3 sm:py-1.5 rounded-lg text-sm sm:text-xs font-mono cursor-pointer transition-all"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.45)" }}
          title="Send Escape to cancel the prompt"
        >
          Esc / Cancel
        </button>
      </div>
    </div>
  );
}

// ── Spawn Dialog ──────────────────────────────────────────────────────────────

interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  file: string;
}

interface SpawnDialogProps {
  onClose: () => void;
  onSpawn: (name: string, workDir: string, prompt: string, role: "worker" | "personal", agentName?: string) => void;
  onAddExisting: (sessionName: string, role: "worker" | "personal") => Promise<void>;
  agents: TrackedAgent[];
}

function SpawnDialog({ onClose, onSpawn, onAddExisting, agents }: SpawnDialogProps) {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  // ── Existing sessions state ────────────────────────────────────────────────
  const [sessions, setSessions] = useState<{ name: string; windows: { index: number; name: string; active: boolean }[] }[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [addingSession, setAddingSession] = useState<string | null>(null);
  const [addError, setAddError] = useState("");

  // Set of session names already tracked as agents
  const trackedSessionNames = new Set(agents.map((a) => a.sessionName));

  useEffect(() => {
    if (tab !== "existing") return;
    setSessionsLoading(true);
    setSessionsError("");
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(Array.isArray(data) ? data : []);
        setSessionsLoading(false);
      })
      .catch((e) => {
        setSessionsError(e.message ?? "Failed to load sessions");
        setSessionsLoading(false);
      });
  }, [tab]);

  const handleAddExisting = async (sessionName: string, role: "worker" | "personal") => {
    setAddingSession(sessionName);
    setAddError("");
    try {
      await onAddExisting(sessionName, role);
      onClose();
    } catch (e: any) {
      setAddError(e.message ?? "Failed to add session");
      setAddingSession(null);
    }
  };

  // ── New session state ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [workDir, setWorkDir] = useState("~");
  const [prompt, setPrompt] = useState("");
  const [role, setRole] = useState<"worker" | "personal">("worker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Browse state ───────────────────────────────────────────────────────────
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [browseDirs, setBrowseDirs] = useState<string[]>([]);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const browseRef = useRef<HTMLDivElement>(null);

  const fetchBrowse = useCallback(async (path: string) => {
    setBrowseLoading(true);
    setBrowseError("");
    try {
      const params = new URLSearchParams({ path });
      const res = await fetch(`/api/browse?${params}`);
      const data = await res.json();
      if (data.error) {
        setBrowseError(data.error);
      } else {
        setBrowsePath(data.current);
        setBrowseParent(data.parent ?? null);
        setBrowseDirs(data.dirs ?? []);
      }
    } catch (e: any) {
      setBrowseError(e.message ?? "Failed to load directory");
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  // Open the browser: seed from current workDir value or fall back to server default
  const openBrowse = () => {
    setBrowseOpen(true);
    fetchBrowse(workDir || "~");
  };

  // Close when clicking outside the popover
  useEffect(() => {
    if (!browseOpen) return;
    const handler = (e: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(e.target as Node)) {
        setBrowseOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [browseOpen]);

  // ── Agent definitions state ────────────────────────────────────────────────
  const [agentDefs, setAgentDefs] = useState<AgentDefinition[]>([]);
  const [agentDefsLoading, setAgentDefsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null); // null = default claude

  useEffect(() => {
    if (tab !== "new") return;
    setAgentDefsLoading(true);
    fetch("/api/agent-definitions")
      .then((r) => r.json())
      .then((data) => {
        setAgentDefs(Array.isArray(data) ? data : []);
        setAgentDefsLoading(false);
      })
      .catch(() => setAgentDefsLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab === "new") {
      setTimeout(() => nameRef.current?.focus(), 60);
    }
  }, [tab]);

  const handleSpawn = async () => {
    if (!name.trim()) { setError("Session name is required"); return; }
    setLoading(true);
    setError("");
    try {
      await onSpawn(name.trim(), workDir.trim() || "~", prompt.trim(), role, selectedAgent ?? undefined);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Spawn failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Model badge color ──────────────────────────────────────────────────────
  function modelBadgeStyle(model: string): React.CSSProperties {
    if (model === "opus") return { background: "rgba(167,139,250,0.18)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.35)" };
    if (model === "haiku") return { background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.30)" };
    // sonnet + default
    return { background: "rgba(100,181,246,0.15)", color: "#64b5f6", border: "1px solid rgba(100,181,246,0.30)" };
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#e0e0e0",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dialog-panel p-6 flex flex-col gap-4"
        style={{
          background: "#0e0e1e",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="font-mono text-sm font-bold" style={{ color: "#64b5f6" }}>
            Spawn Agent
          </span>
          <button onClick={onClose} className="text-xs font-mono cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
            ✕ close
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3 }}>
          {(["existing", "new"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-[9px] text-xs font-mono font-bold cursor-pointer transition-all"
              style={{
                background: tab === t ? "rgba(100,181,246,0.18)" : "transparent",
                border: tab === t ? "1px solid rgba(100,181,246,0.35)" : "1px solid transparent",
                color: tab === t ? "#64b5f6" : "rgba(255,255,255,0.35)",
              }}
            >
              {t === "existing" ? "Existing Sessions" : "New Session"}
            </button>
          ))}
        </div>

        {/* ── Tab: Existing Sessions ────────────────────────────────────────── */}
        {tab === "existing" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {sessionsLoading && (
              <div className="text-center py-8 font-mono text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>
                Loading sessions...
              </div>
            )}
            {sessionsError && (
              <div className="text-[11px] font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,83,80,0.10)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.20)" }}>
                {sessionsError}
              </div>
            )}
            {addError && (
              <div className="text-[11px] font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,83,80,0.10)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.20)" }}>
                {addError}
              </div>
            )}
            {!sessionsLoading && !sessionsError && sessions.length === 0 && (
              <div className="text-center py-8 font-mono text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                No tmux sessions found.
                <br />
                <span style={{ color: "rgba(255,255,255,0.15)" }}>Switch to "New Session" to create one.</span>
              </div>
            )}
            {!sessionsLoading && sessions.length > 0 && (
              <div className="overflow-y-auto flex flex-col gap-2 pr-1" style={{ flex: 1 }}>
                {sessions.map((s) => {
                  const isTracked = trackedSessionNames.has(s.name);
                  const isAdding = addingSession === s.name;
                  const agentForSession = agents.find((a) => a.sessionName === s.name);
                  const isWorker = agentForSession?.isWorker ?? false;

                  return (
                    <div
                      key={s.name}
                      className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{
                        background: isTracked ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${isTracked ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)"}`,
                        opacity: isTracked ? 0.65 : 1,
                      }}
                    >
                      {/* Session info */}
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold truncate" style={{ color: isTracked ? "rgba(255,255,255,0.45)" : "#e0e0e0" }}>
                            {s.name}
                          </span>
                          {isTracked && (
                            <span
                              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                background: isWorker ? "rgba(255,167,38,0.15)" : "rgba(100,181,246,0.12)",
                                color: isWorker ? "#ffa726" : "#64b5f6",
                                border: `1px solid ${isWorker ? "rgba(255,167,38,0.30)" : "rgba(100,181,246,0.25)"}`,
                              }}
                            >
                              {isWorker ? "WORKER" : "PERSONAL"}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                          {s.windows.length} window{s.windows.length !== 1 ? "s" : ""}
                          {s.windows.length > 0 && ` — ${s.windows.map((w) => w.name).join(", ")}`}
                        </span>
                      </div>

                      {/* Actions */}
                      {isTracked ? (
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                          Already added
                        </span>
                      ) : (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleAddExisting(s.name, "worker")}
                            disabled={isAdding}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all"
                            style={{
                              background: isAdding ? "rgba(255,167,38,0.08)" : "rgba(255,167,38,0.15)",
                              border: "1px solid rgba(255,167,38,0.35)",
                              color: isAdding ? "rgba(255,167,38,0.40)" : "#ffa726",
                            }}
                          >
                            {isAdding ? "Adding..." : "+ Worker"}
                          </button>
                          <button
                            onClick={() => handleAddExisting(s.name, "personal")}
                            disabled={isAdding}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all"
                            style={{
                              background: isAdding ? "rgba(100,181,246,0.06)" : "rgba(100,181,246,0.12)",
                              border: "1px solid rgba(100,181,246,0.30)",
                              color: isAdding ? "rgba(100,181,246,0.35)" : "#64b5f6",
                            }}
                          >
                            {isAdding ? "Adding..." : "+ Personal"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="flex-shrink-0">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs font-mono cursor-pointer transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: New Session ──────────────────────────────────────────────── */}
        {tab === "new" && (
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0">
            {/* Role selector */}
            <div className="flex gap-2 flex-shrink-0">
              {(["worker", "personal"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="flex-1 py-2 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all capitalize"
                  style={{
                    background: role === r ? (r === "worker" ? "rgba(255,167,38,0.20)" : "rgba(100,181,246,0.15)") : "rgba(255,255,255,0.04)",
                    border: `1px solid ${role === r ? (r === "worker" ? "rgba(255,167,38,0.50)" : "rgba(100,181,246,0.40)") : "rgba(255,255,255,0.08)"}`,
                    color: role === r ? (r === "worker" ? "#ffa726" : "#64b5f6") : "rgba(255,255,255,0.35)",
                  }}
                >
                  {r === "worker" ? "Robot Worker" : "Personal"}
                </button>
              ))}
            </div>

            {/* Agent selector */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                Agent Definition
              </label>

              {agentDefsLoading ? (
                <div className="text-[11px] font-mono py-3 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Loading agents...
                </div>
              ) : (
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: "1fr 1fr", maxHeight: 220, overflowY: "auto", paddingRight: 2 }}
                >
                  {/* Default option */}
                  <button
                    onClick={() => setSelectedAgent(null)}
                    className="flex flex-col gap-1 px-2.5 py-2 rounded-xl text-left cursor-pointer transition-all"
                    style={{
                      background: selectedAgent === null ? "rgba(100,181,246,0.12)" : "rgba(255,255,255,0.04)",
                      border: selectedAgent === null
                        ? "1px solid rgba(100,181,246,0.55)"
                        : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: selectedAgent === null ? "0 0 10px rgba(100,181,246,0.18)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold" style={{ color: selectedAgent === null ? "#64b5f6" : "#e0e0e0" }}>
                        None
                      </span>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.12)" }}
                      >
                        default
                      </span>
                    </div>
                    <span className="text-[10px] font-mono leading-tight" style={{ color: "rgba(255,255,255,0.30)" }}>
                      Plain claude, no persona
                    </span>
                  </button>

                  {agentDefs.map((def) => {
                    const isSelected = selectedAgent === def.name;
                    return (
                      <button
                        key={def.name}
                        onClick={() => setSelectedAgent(def.name)}
                        className="flex flex-col gap-1 px-2.5 py-2 rounded-xl text-left cursor-pointer transition-all"
                        style={{
                          background: isSelected ? "rgba(100,181,246,0.12)" : "rgba(255,255,255,0.04)",
                          border: isSelected
                            ? "1px solid rgba(100,181,246,0.55)"
                            : "1px solid rgba(255,255,255,0.08)",
                          boxShadow: isSelected ? "0 0 10px rgba(100,181,246,0.18)" : "none",
                        }}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="font-mono text-[11px] font-bold truncate"
                            style={{ color: isSelected ? "#64b5f6" : "#e0e0e0", maxWidth: 110 }}
                          >
                            {def.name}
                          </span>
                          <span
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={modelBadgeStyle(def.model)}
                          >
                            {def.model}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-mono leading-tight line-clamp-2"
                          style={{ color: "rgba(255,255,255,0.30)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >
                          {def.description.length > 80 ? def.description.slice(0, 80) + "…" : def.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected agent description */}
              {selectedAgent && (() => {
                const def = agentDefs.find((d) => d.name === selectedAgent);
                if (!def) return null;
                return (
                  <div
                    className="px-3 py-2 rounded-lg text-[11px] font-mono leading-relaxed"
                    style={{ background: "rgba(100,181,246,0.06)", border: "1px solid rgba(100,181,246,0.15)", color: "rgba(255,255,255,0.55)" }}
                  >
                    <span style={{ color: "#64b5f6", fontWeight: "bold" }}>{def.name}</span>: {def.description}
                  </div>
                );
              })()}
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-3 flex-shrink-0">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Session Name *
                </label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSpawn(); if (e.key === "Escape") onClose(); }}
                  placeholder="e.g. worker-3"
                  className="px-3 py-2.5 rounded-xl font-mono text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex flex-col gap-1" ref={browseRef}>
                <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Working Directory
                </label>
                {/* Input + Browse button row */}
                <div className="flex gap-1.5">
                  <input
                    value={workDir}
                    onChange={(e) => setWorkDir(e.target.value)}
                    placeholder="~ (home directory)"
                    className="flex-1 px-3 py-2.5 rounded-xl font-mono text-sm outline-none"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={openBrowse}
                    title="Browse directories"
                    className="px-2.5 rounded-xl flex items-center justify-center cursor-pointer transition-all flex-shrink-0"
                    style={{
                      background: browseOpen ? "rgba(100,181,246,0.18)" : "rgba(255,255,255,0.05)",
                      border: browseOpen ? "1px solid rgba(100,181,246,0.45)" : "1px solid rgba(255,255,255,0.10)",
                      color: browseOpen ? "#64b5f6" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {/* Folder SVG icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </div>

                {/* Directory picker popover */}
                {browseOpen && (
                  <div
                    className="rounded-xl overflow-hidden flex flex-col"
                    style={{
                      background: "#0e0e1e",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.60)",
                      maxHeight: 280,
                    }}
                  >
                    {/* Current path header */}
                    <div
                      className="px-3 py-2 flex items-center gap-2 flex-shrink-0"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(100,181,246,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span
                        className="font-mono text-[10px] truncate flex-1"
                        style={{ color: "rgba(255,255,255,0.50)", direction: "rtl", textAlign: "left" }}
                        title={browsePath}
                      >
                        {browsePath || "Loading..."}
                      </span>
                      {browseLoading && (
                        <span className="font-mono text-[9px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>...</span>
                      )}
                    </div>

                    {/* Directory list */}
                    <div className="overflow-y-auto flex flex-col flex-1">
                      {browseError ? (
                        <div className="px-3 py-3 font-mono text-[11px]" style={{ color: "#ef5350" }}>
                          {browseError}
                        </div>
                      ) : (
                        <>
                          {/* Parent (..) entry */}
                          {browseParent !== null && (
                            <button
                              type="button"
                              onClick={() => fetchBrowse(browseParent!)}
                              className="px-3 py-1.5 text-left font-mono text-xs cursor-pointer transition-colors flex items-center gap-2 flex-shrink-0"
                              style={{ color: "rgba(255,255,255,0.45)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                              <span>..</span>
                            </button>
                          )}

                          {/* Subdirectory entries */}
                          {!browseLoading && browseDirs.length === 0 && !browseError && (
                            <div className="px-3 py-3 font-mono text-[10px] text-center" style={{ color: "rgba(255,255,255,0.20)" }}>
                              No subdirectories
                            </div>
                          )}
                          {browseDirs.map((dir) => {
                            const fullPath = browsePath.endsWith("/")
                              ? `${browsePath}${dir}`
                              : `${browsePath}/${dir}`;
                            return (
                              <button
                                key={dir}
                                type="button"
                                onClick={() => fetchBrowse(fullPath)}
                                className="px-3 py-1.5 text-left font-mono text-xs cursor-pointer transition-colors flex items-center gap-2"
                                style={{ color: "#e0e0e0" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(100,181,246,0.60)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                <span className="truncate">{dir}</span>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>

                    {/* Footer: Select button */}
                    <div
                      className="px-3 py-2 flex-shrink-0"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (browsePath) {
                            setWorkDir(browsePath);
                          }
                          setBrowseOpen(false);
                        }}
                        disabled={!browsePath}
                        className="w-full py-1.5 rounded-lg font-mono text-xs font-bold cursor-pointer transition-all"
                        style={{
                          background: browsePath ? "rgba(100,181,246,0.18)" : "rgba(255,255,255,0.04)",
                          border: browsePath ? "1px solid rgba(100,181,246,0.40)" : "1px solid rgba(255,255,255,0.08)",
                          color: browsePath ? "#64b5f6" : "rgba(255,255,255,0.20)",
                        }}
                      >
                        Select This Directory
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Initial Prompt (optional)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="First message to send to claude..."
                  rows={3}
                  className="px-3 py-2.5 rounded-xl font-mono text-sm outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <div className="text-[11px] font-mono px-3 py-2 rounded-lg flex-shrink-0" style={{ background: "rgba(239,83,80,0.10)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.20)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1 flex-shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-xs font-mono cursor-pointer transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSpawn}
                disabled={loading || !name.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all"
                style={{
                  background: name.trim() && !loading ? "#64b5f6" : "rgba(100,181,246,0.12)",
                  color: name.trim() && !loading ? "#0a0a14" : "rgba(100,181,246,0.35)",
                }}
              >
                {loading ? "Spawning..." : (selectedAgent ? `Spawn ${selectedAgent}` : "Spawn Agent")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chain Builder ─────────────────────────────────────────────────────────────

interface ChainBuilderProps {
  onClose: () => void;
  onSubmit: (name: string, steps: TaskChainStep[], priority: TaskPriority) => void;
}

function ChainBuilder({ onClose, onSubmit }: ChainBuilderProps) {
  const [chainName, setChainName] = useState("");
  const [steps, setSteps] = useState<TaskChainStep[]>([{ prompt: "" }]);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [error, setError] = useState("");

  const addStep = () => setSteps((prev) => [...prev, { prompt: "" }]);

  const removeStep = (idx: number) =>
    setSteps((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const updateStep = (idx: number, value: string) =>
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, prompt: value } : s));

  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    setSteps((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const handleSubmit = () => {
    if (!chainName.trim()) { setError("Chain name is required"); return; }
    const filled = steps.filter((s) => s.prompt.trim());
    if (filled.length === 0) { setError("At least one step with a prompt is required"); return; }
    onSubmit(chainName.trim(), filled, priority);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dialog-panel p-6 flex flex-col gap-4"
        style={{
          background: "#0e0e1e",
          border: "1px solid rgba(255,255,255,0.10)",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold" style={{ color: "#a78bfa" }}>
            New Task Chain
          </span>
          <button onClick={onClose} className="text-xs font-mono cursor-pointer" style={{ color: "rgba(255,255,255,0.3)" }}>
            ✕ close
          </button>
        </div>

        {/* Chain name */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
            Chain Name *
          </label>
          <input
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
            placeholder="e.g. Build and Test Feature X"
            className="px-3 py-2.5 rounded-xl font-mono text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "#e0e0e0" }}
          />
        </div>

        {/* Priority */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30 font-mono">Priority:</span>
          {(["high", "normal", "low"] as TaskPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className="px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
              style={{
                background: priority === p
                  ? p === "high" ? "rgba(239,83,80,0.25)" : p === "normal" ? "rgba(100,181,246,0.20)" : "rgba(100,100,120,0.20)"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${priority === p
                  ? p === "high" ? "rgba(239,83,80,0.5)" : p === "normal" ? "rgba(100,181,246,0.4)" : "rgba(150,150,170,0.3)"
                  : "rgba(255,255,255,0.06)"}`,
                color: priority === p
                  ? p === "high" ? "#ef5350" : p === "normal" ? "#64b5f6" : "#aaa"
                  : "rgba(255,255,255,0.30)",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
              Steps ({steps.length})
            </span>
            <button
              onClick={addStep}
              className="text-[10px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all"
              style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}
            >
              + Add Step
            </button>
          </div>
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0"
                  style={{ background: "rgba(167,139,250,0.20)", color: "#a78bfa" }}
                >
                  {idx + 1}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Step {idx + 1}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => moveStep(idx, -1)}
                    disabled={idx === 0}
                    className="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                    style={{ color: idx === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.45)" }}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx === steps.length - 1}
                    className="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                    style={{ color: idx === steps.length - 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.45)" }}
                    title="Move down"
                  >
                    ↓
                  </button>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                      style={{ color: "rgba(239,83,80,0.6)" }}
                      title="Remove step"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={step.prompt}
                onChange={(e) => updateStep(idx, e.target.value)}
                placeholder={`Command / prompt for step ${idx + 1}...`}
                rows={2}
                className="px-3 py-2 rounded-lg font-mono text-xs outline-none resize-none w-full"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="text-[11px] font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,83,80,0.10)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.20)" }}>
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-mono cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl text-xs font-mono font-bold cursor-pointer"
            style={{ background: "#a78bfa", color: "#0a0a14" }}
          >
            Submit Chain
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Active Chains panel ───────────────────────────────────────────────────────

interface ActiveChainsProps {
  chains: TaskChain[];
  onCancel: (chainId: string) => void;
}

function chainStatusColor(status: string): string {
  switch (status) {
    case "running":   return "#ffa726";
    case "completed": return "#4caf50";
    case "failed":    return "#ef5350";
    default:          return "#64b5f6";
  }
}

function ActiveChains({ chains, onCancel }: ActiveChainsProps) {
  if (chains.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <span
        className="text-[10px] tracking-[4px] font-mono uppercase"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Active Chains
      </span>
      <div className="flex flex-col gap-2">
        {chains.map((chain) => {
          const color = chainStatusColor(chain.status);
          const progress = chain.steps.length > 0 ? Math.round((chain.currentStep / chain.steps.length) * 100) : 0;
          const isActive = chain.status === "pending" || chain.status === "running";
          return (
            <div
              key={chain.id}
              className="rounded-xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: `1px solid ${color}33`,
              }}
            >
              {/* Chain header */}
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${color}1a` }}>
                <span className="text-xs font-mono font-bold truncate flex-1" style={{ color }}>
                  {chain.name}
                </span>
                <span
                  className="text-[9px] font-mono px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${color}22`, color }}
                >
                  {chain.status}
                </span>
                {isActive && (
                  <button
                    onClick={() => onCancel(chain.id)}
                    className="text-[9px] px-1.5 py-0.5 rounded font-mono cursor-pointer shrink-0"
                    style={{ color: "rgba(239,83,80,0.6)", background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.15)" }}
                  >
                    cancel
                  </button>
                )}
              </div>
              {/* Step nodes */}
              <div className="px-3 py-2 flex items-center gap-1 flex-wrap">
                {chain.steps.map((step, idx) => {
                  const isDone     = idx < chain.currentStep;
                  const isCurrent  = idx === chain.currentStep && chain.status === "running";
                  const isFailed   = chain.status === "failed" && idx === chain.currentStep;
                  let nodeColor = "rgba(255,255,255,0.15)";
                  if (isDone)       nodeColor = "#4caf50";
                  if (isCurrent)    nodeColor = "#ffa726";
                  if (isFailed)     nodeColor = "#ef5350";
                  return (
                    <div key={idx} className="flex items-center gap-1">
                      {idx > 0 && (
                        <div className="w-4 h-px" style={{ background: isDone ? "#4caf5066" : "rgba(255,255,255,0.10)" }} />
                      )}
                      <div
                        className="rounded-full flex items-center justify-center text-[9px] font-mono font-bold"
                        style={{
                          width: 20,
                          height: 20,
                          background: `${nodeColor}22`,
                          border: `1px solid ${nodeColor}`,
                          color: nodeColor,
                        }}
                        title={step.prompt.slice(0, 80)}
                      >
                        {isDone ? "✓" : idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Progress bar */}
              {isActive && (
                <div className="mx-3 mb-2 rounded-full overflow-hidden" style={{ height: 2, background: "rgba(255,255,255,0.07)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: color }}
                  />
                </div>
              )}
              {/* Current step preview */}
              {chain.status === "running" && chain.currentStep < chain.steps.length && (
                <div
                  className="mx-3 mb-2 px-2 py-1 rounded text-[10px] font-mono truncate"
                  style={{ background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.45)" }}
                  title={chain.steps[chain.currentStep].prompt}
                >
                  Step {chain.currentStep + 1}: {chain.steps[chain.currentStep].prompt.slice(0, 60)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CommandCenter component ───────────────────────────────────────────────────

interface CommandCenterProps {
  send: (msg: object) => void;
  onOpenTerminal?: (agentTarget: string) => void;
}

export const CommandCenter = memo(function CommandCenter({ send, onOpenTerminal }: CommandCenterProps) {
  const [agents, setAgents] = useState<TrackedAgent[]>([]);
  const [queue, setQueue] = useState<QueueStatus>({ pending: [], assigned: [], history: [] });
  const [chains, setChains] = useState<TaskChain[]>([]);
  const [command, setCommand] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [affinityTag, setAffinityTag] = useState<string>("any");
  const [detectedTags, setDetectedTags] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [showChainBuilder, setShowChainBuilder] = useState(false);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; path: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  // Track previous headlines per agent to detect changes for activity log
  const prevHeadlines = useRef<Record<string, string>>({});

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Load initial state via REST
  useEffect(() => {
    const load = async () => {
      try {
        const [agentsRes, queueRes, chainsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/queue"),
          fetch("/api/chain"),
        ]);
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (queueRes.ok) setQueue(await queueRes.json());
        if (chainsRes.ok) setChains(await chainsRes.json());
      } catch {}
    };
    load();
  }, []);

  // Activity log helper
  const addLog = useCallback((icon: string, message: string, color = "rgba(255,255,255,0.55)") => {
    const entry: LogEntry = {
      id: crypto.randomUUID().slice(0, 8),
      ts: Date.now(),
      icon,
      message,
      color,
    };
    setActivityLog((prev) => {
      const next = [...prev, entry];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  // Scroll activity log to bottom on new entry
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  // Toast helper
  const showToast = useCallback((message: string, color?: string) => {
    const id = crypto.randomUUID().slice(0, 8);
    setToasts((prev) => [...prev, { id, message, color }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((data: any) => {
    if (data.type === "agents-updated") {
      const newAgents: TrackedAgent[] = data.agents ?? [];
      setAgents((prev) => {
        // Track previous statuses for activity log transitions
        const prevStatuses = new Map(prev.map((a) => [a.target, a.status]));

        newAgents.forEach((a) => {
          const prevStatus = prevStatuses.get(a.target);

          if (a.status === "permission" && prevStatus !== "permission") {
            addLog("🟠", `${a.sessionName} needs permission!`, "#ff9800");
            showToast(`🟠 ${a.sessionName} needs permission!`, "#ff9800");
          }

          // Log headline changes (skip empty, skip identical to previous)
          const prevHL = prevHeadlines.current[a.target] ?? "";
          if (a.headline && a.headline !== prevHL) {
            prevHeadlines.current[a.target] = a.headline;
            addLog(
              a.isWorker ? "🤖" : "🧑‍💻",
              `${a.sessionName}: ${a.headline}`,
              a.isWorker ? "rgba(255,167,38,0.75)" : "rgba(255,255,255,0.40)",
            );
          }
        });

        return newAgents;
      });
    } else if (data.type === "chain-created" || data.type === "chain-updated" || data.type === "chain-completed" || data.type === "chain-failed") {
      const chain: TaskChain = data.chain;
      setChains((prev) => {
        const idx = prev.findIndex((c) => c.id === chain.id);
        if (idx === -1) return [...prev, chain];
        const next = [...prev];
        next[idx] = chain;
        return next;
      });
      if (data.type === "chain-completed") {
        addLog("⛓️", `Chain "${chain.name}" completed (${chain.steps.length} steps)`, "#4caf50");
        showToast(`⛓️ Chain "${chain.name}" completed!`, "#4caf50");
      } else if (data.type === "chain-failed") {
        addLog("⛓️", `Chain "${chain.name}" failed at step ${chain.currentStep + 1}`, "#ef5350");
      }
    } else if (data.type === "task-submitted") {
      const task: Task = data.task;
      setQueue((q) => ({ ...q, pending: [...q.pending, task] }));
      addLog("📋", `Task #${task.id} submitted: "${task.command.slice(0, 60)}"`, "#64b5f6");
    } else if (data.type === "task-assigned") {
      const task: Task = data.task;
      const workerName = data.worker?.name ?? task.assignedToName ?? task.assignedTo ?? "worker";
      const reason: string = data.dispatchReason ?? task.dispatchReason ?? "";
      showToast(`🤖 ${workerName} picked up: ${task.command.slice(0, 40)}`, "#ffa726");
      addLog("🤖", `Dispatched to ${workerName} (${reason || "first available"}): "${task.command.slice(0, 50)}" (#${task.id})`, "#ffa726");
      setQueue((q) => ({
        pending: q.pending.filter((t) => t.id !== task.id),
        assigned: [...q.assigned.filter((t) => t.id !== task.id), task],
        history: q.history,
      }));
    } else if (data.type === "task-completed") {
      const task: Task = data.task;
      const workerName = task.assignedToName ?? task.assignedTo ?? "worker";
      const took = task.assignedAt ? elapsedSec(task.assignedAt) : 0;
      showToast(`✅ ${workerName} completed: ${task.command.slice(0, 35)} (${took}s)`, "#4caf50");
      addLog("✅", `${workerName} completed: "${task.command.slice(0, 50)}" (#${task.id}) in ${took}s`, "#4caf50");
      setQueue((q) => ({
        pending: q.pending.filter((t) => t.id !== task.id),
        assigned: q.assigned.filter((t) => t.id !== task.id),
        history: [task, ...q.history].slice(0, 50),
      }));
    } else if (data.type === "task-failed" || data.type === "task-timeout") {
      const task: Task = data.task;
      addLog("✕", `Task #${task.id} ${data.type === "task-timeout" ? "timed out" : "failed"}: "${task.command.slice(0, 50)}"`, "#ef5350");
      setQueue((q) => ({
        pending: q.pending.filter((t) => t.id !== task.id),
        assigned: q.assigned.filter((t) => t.id !== task.id),
        history: [task, ...q.history].slice(0, 50),
      }));
    } else if (data.type === "queue-status") {
      setQueue({ pending: data.pending ?? [], assigned: data.assigned ?? [], history: data.history ?? [] });
    } else if (data.type === "worker-added") {
      addLog("➕", `Worker added: ${data.sessionName}`, "#64b5f6");
    } else if (data.type === "worker-removed") {
      addLog("➖", `Worker removed: ${data.sessionName}`, "#888");
    } else if (data.type === "agent-renamed") {
      const { target, name } = data;
      setAgents((prev) =>
        prev.map((a) => a.target === target ? { ...a, windowName: name } : a)
      );
      addLog("✏️", `Agent renamed: ${name}`, "#64b5f6");
    }
  }, [showToast, addLog]);

  // Listen for WS messages forwarded via custom event from App.tsx
  useEffect(() => {
    const handler = (e: CustomEvent) => handleWsMessage(e.detail);
    window.addEventListener("maw-ws-message" as any, handler);
    return () => window.removeEventListener("maw-ws-message" as any, handler);
  }, [handleWsMessage]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWorkerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-detect tags from command text for display as hint chips
  const autoDetectTags = useCallback((text: string): string[] => {
    const tags: string[] = [];
    if (/\b(go|api|endpoint|database|migration|db|model|repository|service|handler|sql|query|server|grpc|rest|backend)\b/i.test(text)) tags.push("backend");
    if (/\b(component|page|ui|style|css|react|nextjs|vue|svelte|html|tailwind|frontend|tsx?|jsx?)\b/i.test(text)) tags.push("frontend");
    if (/\b(deploy|docker|ci|pipeline|k8s|kubernetes|helm|terraform|nginx|ingress|infra|devops|aws|gcp|ecr|eks)\b/i.test(text)) tags.push("infra");
    return tags;
  }, []);

  const submitCommand = useCallback(() => {
    let cmd = command.trim();
    if (!cmd && attachedFiles.length === 0) return;
    if (!cmd) cmd = "(see attached files)";
    if (attachedFiles.length > 0) {
      const paths = attachedFiles.map((f) => f.path).join(", ");
      cmd = `${cmd} [attached: ${paths}]`;
    }
    // Build affinity from selected tag
    const affinity: TaskAffinity | undefined = affinityTag !== "any"
      ? { tags: [affinityTag] }
      : undefined;
    send({ type: "submit-task", command: cmd, priority, affinity });
    setCommand("");
    setAffinityTag("any");
    setDetectedTags([]);
    setAttachedFiles([]);
  }, [command, priority, affinityTag, send, attachedFiles]);

  // Upload a browser File object to /api/upload, return the saved path
  const uploadFile = useCallback(async (file: File): Promise<{ name: string; path: string } | null> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) return null;
      const data = await res.json();
      return { name: data.originalName ?? file.name, path: data.path };
    } catch {
      return null;
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploadingCount((n) => n + list.length);
    const results = await Promise.all(list.map(uploadFile));
    setUploadingCount((n) => n - list.length);
    const uploaded = results.filter((r): r is { name: string; path: string } => r !== null);
    if (uploaded.length > 0) {
      setAttachedFiles((prev) => [...prev, ...uploaded]);
    }
  }, [uploadFile]);

  const cancelTask = useCallback((taskId: string) => {
    send({ type: "cancel-task", taskId });
    setQueue((q) => ({
      ...q,
      pending: q.pending.filter((t) => t.id !== taskId),
    }));
  }, [send]);

  const toggleWorker = useCallback((sessionName: string) => {
    send({ type: "toggle-worker", sessionName });
    setShowWorkerDropdown(false);
  }, [send]);

  const allowAllPermissions = useCallback(async () => {
    const permAgents = agents.filter((a) => a.status === "permission");
    for (const a of permAgents) {
      try {
        // Fetch the current terminal capture for this agent so we can
        // parse which option the cursor is sitting on before navigating.
        const res = await fetch(`/api/capture?target=${encodeURIComponent(a.target)}&lines=30`);
        let cursorPos = 1; // safe default: cursor on option 1
        if (res.ok) {
          const data = await res.json();
          const text: string = data.content || "";
          if (text.trim()) {
            const lines = text.split("\n").filter((l) => l.trim()).slice(-15);
            const info = parsePermissionMenu(lines.join("\n"));
            cursorPos = info.cursorPosition;
          }
        }
        // Navigate to option 1 (Yes) from wherever the cursor is.
        const arrows = getArrowKeys(cursorPos, 1);
        for (const arrow of arrows) {
          send({ type: "send", target: a.target, text: arrow });
          await new Promise<void>((r) => setTimeout(r, 50));
        }
        send({ type: "send", target: a.target, text: "\r" });
      } catch {
        // If capture fails, fall back to pressing Enter (works when cursor is already on Yes).
        send({ type: "send", target: a.target, text: "\r" });
      }
    }
  }, [agents, send]);

  // ── Spawn handler ─────────────────────────────────────────────────────────────

  const handleSpawn = useCallback(async (
    name: string,
    workDir: string,
    initialPrompt: string,
    role: "worker" | "personal",
    agentName?: string,
  ) => {
    const res = await fetch("/api/agents/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, workDir, initialPrompt, agentName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Spawn failed");
    const label = agentName ? `${name} (${agentName})` : name;
    addLog("🚀", `Spawned new agent: ${label}`, "#64b5f6");
    showToast(`🚀 Agent "${label}" spawned!`, "#64b5f6");
    // If role is worker, register it as a worker after a short delay
    if (role === "worker") {
      setTimeout(() => {
        send({ type: "toggle-worker", sessionName: name });
      }, 2500);
    }
  }, [addLog, showToast, send]);

  // ── Add existing session handler ───────────────────────────────────────────

  const handleAddExisting = useCallback(async (
    sessionName: string,
    role: "worker" | "personal",
  ) => {
    if (role === "worker") {
      const res = await fetch("/api/agents/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionName, action: "add" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add worker");
      addLog("🔗", `Added existing session as worker: ${sessionName}`, "#ffa726");
      showToast(`Added "${sessionName}" as worker`, "#ffa726");
    } else {
      // Personal: just ensure it is being tracked (poll will pick it up automatically,
      // but we can also force a tracker refresh via the worker endpoint with a no-op
      // or simply rely on the WebSocket poll). For now, inform via log only.
      addLog("🔗", `Watching existing session: ${sessionName}`, "#64b5f6");
      showToast(`Now watching "${sessionName}"`, "#64b5f6");
    }
  }, [addLog, showToast]);

  // ── Chain handlers ────────────────────────────────────────────────────────────

  const handleChainSubmit = useCallback((name: string, steps: TaskChainStep[], chainPriority: TaskPriority) => {
    send({ type: "submit-chain", name, steps, priority: chainPriority });
    addLog("⛓️", `Chain "${name}" submitted with ${steps.length} steps`, "#a78bfa");
  }, [send, addLog]);

  const handleChainCancel = useCallback((chainId: string) => {
    send({ type: "cancel-chain", chainId });
    setChains((prev) => prev.map((c) =>
      c.id === chainId ? { ...c, status: "failed" as const } : c,
    ));
  }, [send]);

  // ── Permission / worker derivations ───────────────────────────────────────────

  const permissionAgents = agents.filter((a) => a.status === "permission");

  const workers = agents.filter((a) => a.isWorker);
  const personal = agents.filter((a) => !a.isWorker);
  const personalSessions = [...new Set(personal.map((a) => a.sessionName))];
  const activeChains = chains.filter((c) => c.status === "pending" || c.status === "running");
  const allChains = chains;

  const allTasks: Task[] = [
    ...queue.assigned,
    ...queue.pending,
    ...queue.history,
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col"
      style={{
        height: "calc(100dvh - 80px)",
        background: "#020208",
        position: "relative",
      }}
    >
      {/* Spawn dialog */}
      {showSpawnDialog && (
        <SpawnDialog
          onClose={() => setShowSpawnDialog(false)}
          onSpawn={handleSpawn}
          onAddExisting={handleAddExisting}
          agents={agents}
        />
      )}
      {/* Chain builder dialog */}
      {showChainBuilder && (
        <ChainBuilder onClose={() => setShowChainBuilder(false)} onSubmit={handleChainSubmit} />
      )}

      {/* Toast notifications — top of page */}
      <div
        className="fixed top-24 right-6 z-50 flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 360 }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-mono"
            style={{
              background: "rgba(8,8,20,0.97)",
              border: `1px solid ${t.color ? t.color + "44" : "rgba(100,181,246,0.25)"}`,
              color: "#e0e0e0",
              animation: "fadeSlideIn 0.25s ease-out",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Main 2-column body — stacks on mobile */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-0 overflow-y-auto md:overflow-hidden">

        {/* ── Left column: Command input + Task Queue ── */}
        <div className="cmd-col-left">
          {/* Section: Command Input */}
          <section className="flex flex-col gap-3">
            <div
              className="text-[10px] tracking-[4px] font-mono uppercase"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Command Input
            </div>

            {/* Input area — supports drag & drop and paste */}
            <div
              className="flex flex-col gap-2"
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => {
                // Only clear when leaving the outer container, not child elements
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files.length > 0) {
                  handleFiles(e.dataTransfer.files);
                }
              }}
            >
              {/* Textarea + Send row */}
              <div className="flex gap-2 items-end relative">
                {/* Drop overlay */}
                {isDragOver && (
                  <div
                    className="absolute inset-0 z-10 rounded-xl flex items-center justify-center pointer-events-none"
                    style={{
                      background: "rgba(0,188,212,0.10)",
                      border: "2px dashed rgba(0,188,212,0.70)",
                      color: "#00bcd4",
                      fontFamily: "monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: 1,
                    }}
                  >
                    Drop files to attach
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={command}
                  rows={1}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCommand(val);
                    setDetectedTags(autoDetectTags(val));
                    // Auto-grow: reset height then set to scrollHeight (max 4 lines ≈ 96px)
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitCommand();
                    }
                  }}
                  onPaste={(e) => {
                    const files = e.clipboardData?.files;
                    if (files && files.length > 0) {
                      e.preventDefault();
                      handleFiles(files);
                    }
                    // Otherwise let default text paste proceed
                  }}
                  placeholder="Enter command… (Shift+Enter for new line, drop or paste files to attach)"
                  className="flex-1 px-4 py-3 rounded-xl font-mono text-sm outline-none resize-none"
                  style={{
                    background: isDragOver ? "rgba(0,188,212,0.06)" : "rgba(255,255,255,0.04)",
                    border: isDragOver
                      ? "1px dashed rgba(0,188,212,0.60)"
                      : "1px solid rgba(255,255,255,0.10)",
                    color: "#e0e0e0",
                    minHeight: 44,
                    maxHeight: 96,
                    lineHeight: "1.5",
                    transition: "border-color 0.15s, background 0.15s",
                    overflowY: "auto",
                  }}
                />
                <button
                  onClick={submitCommand}
                  disabled={((!command.trim() && attachedFiles.length === 0) || workers.length === 0) && uploadingCount === 0}
                  className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all cursor-pointer self-end"
                  style={{
                    background: (command.trim() || attachedFiles.length > 0) && workers.length > 0 ? "#64b5f6" : "rgba(100,181,246,0.12)",
                    color: (command.trim() || attachedFiles.length > 0) && workers.length > 0 ? "#0a0a14" : "rgba(100,181,246,0.35)",
                    height: 44,
                  }}
                >
                  {uploadingCount > 0 ? "..." : "Send"}
                </button>
              </div>

              {/* Attached file chips */}
              {(attachedFiles.length > 0 || uploadingCount > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {attachedFiles.map((f, i) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px]"
                      style={{
                        background: "rgba(100,181,246,0.10)",
                        border: "1px solid rgba(100,181,246,0.25)",
                        color: "#90caf9",
                        maxWidth: 240,
                      }}
                    >
                      <span style={{ fontSize: 11 }}>📎</span>
                      <span
                        className="truncate"
                        style={{ maxWidth: 180 }}
                        title={f.path}
                      >
                        {f.name}
                      </span>
                      <button
                        onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-0.5 cursor-pointer"
                        style={{ color: "rgba(144,202,249,0.55)", lineHeight: 1 }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {uploadingCount > 0 && (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px]"
                      style={{
                        background: "rgba(255,167,38,0.10)",
                        border: "1px solid rgba(255,167,38,0.25)",
                        color: "#ffa726",
                      }}
                    >
                      <span style={{ fontSize: 11 }}>⏳</span>
                      Uploading {uploadingCount} file{uploadingCount > 1 ? "s" : ""}…
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Priority selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/30 font-mono">Priority:</span>
              {(["high", "normal", "low"] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className="px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                  style={{
                    background: priority === p
                      ? p === "high" ? "rgba(239,83,80,0.25)" : p === "normal" ? "rgba(100,181,246,0.20)" : "rgba(100,100,120,0.20)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${priority === p
                      ? p === "high" ? "rgba(239,83,80,0.5)" : p === "normal" ? "rgba(100,181,246,0.4)" : "rgba(150,150,170,0.3)"
                      : "rgba(255,255,255,0.06)"}`,
                    color: priority === p
                      ? p === "high" ? "#ef5350" : p === "normal" ? "#64b5f6" : "#aaa"
                      : "rgba(255,255,255,0.30)",
                  }}
                >
                  {p}
                </button>
              ))}
              {workers.length === 0 && (
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,100,100,0.6)" }}>
                  No workers — add one from the right panel
                </span>
              )}
            </div>

            {/* Affinity tag selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/30 font-mono">Route to:</span>
              {(["any", "backend", "frontend", "infra"] as const).map((tag) => {
                const tagColors: Record<string, { bg: string; border: string; color: string }> = {
                  any:      { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.50)" },
                  backend:  { bg: "rgba(100,181,246,0.15)", border: "rgba(100,181,246,0.45)", color: "#64b5f6" },
                  frontend: { bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.45)", color: "#a78bfa" },
                  infra:    { bg: "rgba(255,167,38,0.15)",  border: "rgba(255,167,38,0.45)",  color: "#ffa726" },
                };
                const active = affinityTag === tag;
                const colors = tagColors[tag];
                return (
                  <button
                    key={tag}
                    onClick={() => setAffinityTag(tag)}
                    className="px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                    style={{
                      background: active ? colors.bg : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? colors.border : "rgba(255,255,255,0.06)"}`,
                      color: active ? colors.color : "rgba(255,255,255,0.25)",
                    }}
                  >
                    {tag === "any" ? "Any" : tag}
                  </button>
                );
              })}
              {/* Auto-detected tag chips from command text */}
              {detectedTags.length > 0 && (
                <span className="text-[10px] font-mono flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                  detected:
                  {detectedTags.map((t) => (
                    <span
                      key={t}
                      onClick={() => setAffinityTag(t)}
                      className="px-1.5 py-0.5 rounded font-mono text-[9px] uppercase cursor-pointer"
                      style={{ background: "rgba(52,209,134,0.15)", border: "1px solid rgba(52,209,134,0.30)", color: "#34d186" }}
                      title="Click to apply"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </section>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          {/* Section: Task Queue */}
          <section className="flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[10px] tracking-[4px] font-mono uppercase"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                Task Queue
              </span>
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
                {queue.pending.length} pending · {queue.assigned.length} running · {queue.history.length} history
              </span>
              <button
                onClick={() => setShowChainBuilder(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all"
                style={{
                  background: "rgba(167,139,250,0.08)",
                  border: "1px solid rgba(167,139,250,0.20)",
                  color: "rgba(167,139,250,0.70)",
                }}
              >
                ⛓ Chain
              </button>
            </div>

            {allTasks.length === 0 ? (
              <div
                className="px-4 py-8 rounded-xl text-center text-xs font-mono"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.25)",
                  border: "1px dashed rgba(255,255,255,0.07)",
                }}
              >
                No tasks yet. Submit a command above.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {allTasks.map((task) => {
                  const isPending  = task.status === "pending";
                  const isAssigned = task.status === "assigned";
                  const isDone     = task.status === "completed";
                  const isFailed   = task.status === "failed";

                  let statusIcon: string;
                  let statusColor: string;
                  let statusText: string;

                  if (isPending) {
                    statusIcon = "⏳"; statusColor = "#64b5f6"; statusText = "Pending";
                  } else if (isAssigned) {
                    statusIcon = "⚙"; statusColor = "#ffa726";
                    statusText = task.assignedToName ?? task.assignedTo ?? "";
                  } else if (isDone) {
                    statusIcon = "✓"; statusColor = "#4caf50";
                    statusText = `${task.assignedToName ?? task.assignedTo ?? ""} · ${relTime(task.completedAt)}`;
                  } else {
                    statusIcon = "✕"; statusColor = "#ef5350";
                    statusText = `Failed${task.retryCount > 0 ? ` (${task.retryCount} retries)` : ""}`;
                  }

                  const priorityColor = task.priority === "high" ? "#ef5350" : task.priority === "low" ? "#888" : "#64b5f6";

                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                      style={{
                        background: isDone || isFailed ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isDone || isFailed ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`,
                        opacity: isDone || isFailed ? 0.6 : 1,
                      }}
                    >
                      {/* Priority bar */}
                      <div
                        className="w-0.5 h-7 rounded-full shrink-0"
                        style={{ background: priorityColor, opacity: 0.6 }}
                      />

                      <span className="text-sm" style={{ color: statusColor }}>{statusIcon}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                            #{task.id}
                          </span>
                          <span className="text-xs font-mono truncate" style={{ color: "#e0e0e0" }}>
                            "{task.command.slice(0, 60)}"
                          </span>
                        </div>
                        <div className="text-[10px] font-mono mt-0.5 flex items-center gap-2" style={{ color: statusColor, opacity: 0.8 }}>
                          <span>{statusText}</span>
                          {isAssigned && task.assignedAt && (
                            <span style={{ color: "rgba(255,167,38,0.6)" }}>
                              · <ElapsedCounter since={task.assignedAt} />
                            </span>
                          )}
                          {task.dispatchReason && (isAssigned || isDone) && (
                            <span
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.28)" }}
                              title={task.dispatchReason}
                            >
                              {task.dispatchReason.slice(0, 40)}
                            </span>
                          )}
                        </div>
                      </div>

                      {isPending && (
                        <button
                          onClick={() => cancelTask(task.id)}
                          className="text-[10px] px-2.5 py-1 rounded font-mono cursor-pointer shrink-0"
                          title="Cancel task"
                          style={{
                            background: "rgba(239,83,80,0.10)",
                            border: "1px solid rgba(239,83,80,0.20)",
                            color: "rgba(239,83,80,0.7)",
                          }}
                        >
                          × cancel
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Right column: Agent Overview ── */}
        <div className="cmd-col-right">

          {/* Workers section */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[10px] tracking-[4px] font-mono uppercase"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                Workers
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {/* Spawn new agent */}
                <button
                  onClick={() => setShowSpawnDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer"
                  style={{
                    background: "rgba(76,175,80,0.10)",
                    border: "1px solid rgba(76,175,80,0.20)",
                    color: "#4caf50",
                  }}
                  title="Spawn new agent session"
                >
                  + Spawn
                </button>
              </div>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowWorkerDropdown((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer"
                  style={{
                    background: "rgba(100,181,246,0.10)",
                    border: "1px solid rgba(100,181,246,0.20)",
                    color: "#64b5f6",
                  }}
                >
                  + Add Worker
                </button>
                {showWorkerDropdown && (
                  <div
                    className="absolute right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{
                      background: "#0e0e1e",
                      border: "1px solid rgba(255,255,255,0.10)",
                      minWidth: 180,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    }}
                  >
                    {personalSessions.length === 0 ? (
                      <div
                        className="px-4 py-3 text-[11px] font-mono"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                      >
                        No personal sessions available
                      </div>
                    ) : (
                      personalSessions.map((name) => (
                        <button
                          key={name}
                          onClick={() => toggleWorker(name)}
                          className="w-full text-left px-4 py-2.5 text-xs font-mono hover:bg-white/[0.06] transition-colors cursor-pointer"
                          style={{ color: "#e0e0e0" }}
                        >
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {workers.length === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center text-xs font-mono"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.25)",
                  border: "1px dashed rgba(255,255,255,0.07)",
                }}
              >
                No workers. Tag a session as a worker to dispatch tasks.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {workers.map((agent) => {
                  const dot = statusDot(agent.status);
                  const assignedTask = allTasks.find((t) => t.assignedTo === agent.target && t.status === "assigned");
                  const isPermission = agent.status === "permission";
                  return (
                    <div key={agent.target}>
                      <div
                        className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                        style={{
                          background: isPermission ? "rgba(255,152,0,0.06)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isPermission ? "rgba(255,152,0,0.30)" : "rgba(255,255,255,0.05)"}`,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span style={{ color: "#aaa", fontSize: 14, flexShrink: 0 }}>🤖</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-sm font-mono truncate"
                                style={{ color: "#e0e0e0", cursor: onOpenTerminal ? "pointer" : "default" }}
                                title={onOpenTerminal ? "Double-click to open terminal" : undefined}
                                onDoubleClick={() => onOpenTerminal?.(agent.target)}
                              >
                                {agent.sessionName || agent.windowName}
                              </span>
                              {assignedTask && (
                                <span
                                  className="text-[10px] font-mono shrink-0"
                                  style={{ color: "#ffa726" }}
                                >
                                  · Task #{assignedTask.id}
                                </span>
                              )}
                            </div>
                            {agent.headline && (
                              <div
                                className="text-[10px] font-mono truncate"
                                style={{ color: "rgba(255,255,255,0.35)", marginTop: 1 }}
                                title={agent.headline}
                              >
                                {agent.headline}
                              </div>
                            )}
                            {/* Context chips */}
                            {agent.context && (
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                {agent.context.projectName && (
                                  <span
                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                    style={{ background: "rgba(100,181,246,0.10)", border: "1px solid rgba(100,181,246,0.20)", color: "#64b5f6" }}
                                    title={agent.context.workingDir ?? ""}
                                  >
                                    {agent.context.projectName}
                                  </span>
                                )}
                                {agent.context.tags.map((t) => {
                                  const tagStyle: Record<string, { bg: string; color: string }> = {
                                    backend:  { bg: "rgba(100,181,246,0.10)", color: "#64b5f6" },
                                    frontend: { bg: "rgba(167,139,250,0.10)", color: "#a78bfa" },
                                    infra:    { bg: "rgba(255,167,38,0.10)",  color: "#ffa726" },
                                  };
                                  const s = tagStyle[t] ?? { bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.40)" };
                                  return (
                                    <span
                                      key={t}
                                      className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                                      style={{ background: s.bg, border: `1px solid ${s.color}33`, color: s.color }}
                                    >
                                      {t}
                                    </span>
                                  );
                                })}
                                {agent.context.detectedStack.slice(0, 3).map((s) => (
                                  <span
                                    key={s}
                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.30)" }}
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: dot.color, boxShadow: `0 0 5px ${dot.color}80` }}
                            />
                            <span className="text-[10px] font-mono" style={{ color: dot.color }}>
                              {dot.label}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleWorker(agent.sessionName)}
                            className="text-[10px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
                            title="Remove from worker pool"
                            style={{
                              background: "rgba(239,83,80,0.08)",
                              border: "1px solid rgba(239,83,80,0.20)",
                              color: "rgba(239,83,80,0.55)",
                            }}
                          >
                            remove
                          </button>
                          <button
                            onClick={() => {
                              const current = agent.sessionName || agent.windowName;
                              const next = window.prompt("New name for agent:", current);
                              if (next && next.trim()) {
                                fetch(`/api/agents/${encodeURIComponent(agent.target)}/name`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: next.trim() }),
                                }).catch(() => {});
                              }
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all"
                            title={`Rename ${agent.sessionName}`}
                            style={{
                              background: "rgba(100,181,246,0.10)",
                              border: "1px solid rgba(100,181,246,0.25)",
                              color: "rgba(100,181,246,0.60)",
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                              <path d="M7.5 2.5 L9.5 4.5 L4 10 L2 10 L2 8 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
                              <path d="M6.5 3.5 L8.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Kill agent "${agent.sessionName}"? This will close the tmux window.`)) {
                                fetch(`/api/agents/${encodeURIComponent(agent.target)}`, { method: "DELETE" }).catch(() => {});
                              }
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all"
                            title={`Kill ${agent.sessionName}`}
                            style={{
                              background: "rgba(239,83,80,0.10)",
                              border: "1px solid rgba(239,83,80,0.25)",
                              color: "rgba(239,83,80,0.60)",
                            }}
                          >
                            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1 L7 7 M7 1 L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      {/* Inline permission card for workers */}
                      {isPermission && (
                        <div className="mt-1.5">
                          <PermissionCard
                            agent={agent}
                            send={send}
                            onAllowAll={allowAllPermissions}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          {/* Personal agents section */}
          <section className="flex flex-col gap-3">
            <span
              className="text-[10px] tracking-[4px] font-mono uppercase"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Personal
            </span>

            {personal.length === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center text-xs font-mono"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.25)",
                  border: "1px dashed rgba(255,255,255,0.07)",
                }}
              >
                No personal sessions detected.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {personal.map((agent) => {
                  const dot = statusDot(agent.status);
                  const isPermission = agent.status === "permission";
                  return (
                    <div key={agent.target}>
                      <div
                        className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                        style={{
                          background: isPermission ? "rgba(255,152,0,0.06)" : "rgba(255,255,255,0.018)",
                          border: `1px solid ${isPermission ? "rgba(255,152,0,0.30)" : "rgba(255,255,255,0.04)"}`,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span style={{ color: "#888", fontSize: 13, flexShrink: 0 }}>🧑‍💻</span>
                          <div className="min-w-0 flex-1">
                            <span
                              className="text-xs font-mono"
                              style={{ color: "rgba(255,255,255,0.55)", cursor: onOpenTerminal ? "pointer" : "default" }}
                              title={onOpenTerminal ? "Double-click to open terminal" : undefined}
                              onDoubleClick={() => onOpenTerminal?.(agent.target)}
                            >
                              {agent.sessionName || agent.windowName}
                            </span>
                            {(agent.headline || agent.preview) && (
                              <div
                                className="text-[10px] font-mono truncate"
                                style={{ color: "rgba(255,255,255,0.30)", marginTop: 1 }}
                                title={agent.headline || agent.preview}
                              >
                                {agent.headline || agent.preview}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: dot.color }}
                            />
                            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.30)" }}>
                              {dot.label}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleWorker(agent.sessionName)}
                            className="text-[10px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
                            title="Convert to worker"
                            style={{
                              background: "rgba(100,181,246,0.08)",
                              border: "1px solid rgba(100,181,246,0.20)",
                              color: "rgba(100,181,246,0.55)",
                            }}
                          >
                            → worker
                          </button>
                          <button
                            onClick={() => {
                              const current = agent.sessionName || agent.windowName;
                              const next = window.prompt("New name for agent:", current);
                              if (next && next.trim()) {
                                fetch(`/api/agents/${encodeURIComponent(agent.target)}/name`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: next.trim() }),
                                }).catch(() => {});
                              }
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all"
                            title={`Rename ${agent.sessionName}`}
                            style={{
                              background: "rgba(100,181,246,0.10)",
                              border: "1px solid rgba(100,181,246,0.25)",
                              color: "rgba(100,181,246,0.60)",
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                              <path d="M7.5 2.5 L9.5 4.5 L4 10 L2 10 L2 8 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
                              <path d="M6.5 3.5 L8.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Kill agent "${agent.sessionName}"? This will close the tmux window.`)) {
                                fetch(`/api/agents/${encodeURIComponent(agent.target)}`, { method: "DELETE" }).catch(() => {});
                              }
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all"
                            title={`Kill ${agent.sessionName}`}
                            style={{
                              background: "rgba(239,83,80,0.10)",
                              border: "1px solid rgba(239,83,80,0.25)",
                              color: "rgba(239,83,80,0.60)",
                            }}
                          >
                            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1 L7 7 M7 1 L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      {/* Permission card for personal agents */}
                      {isPermission && (
                        <div className="mt-1.5">
                          <PermissionCard
                            agent={agent}
                            send={send}
                            onAllowAll={allowAllPermissions}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Allow All (if multiple permission agents) */}
          {permissionAgents.length > 1 && (
            <button
              onClick={allowAllPermissions}
              className="w-full py-2.5 rounded-xl text-sm font-mono font-bold cursor-pointer transition-all"
              style={{
                background: "rgba(76,175,80,0.15)",
                border: "1px solid rgba(76,175,80,0.40)",
                color: "#4caf50",
              }}
            >
              Allow All ({permissionAgents.length}) Permission Requests
            </button>
          )}

          {/* Active chains panel */}
          <ActiveChains chains={allChains} onCancel={handleChainCancel} />

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          {/* Agent-to-Agent Communication panels */}
          <RpcPanel agents={agents.map((a) => ({ sessionName: a.sessionName, target: a.target }))} />

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          <MailboxPanel agents={agents.map((a) => ({ sessionName: a.sessionName, target: a.target }))} />

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          <KvStorePanel />

          {/* Divider before chain button */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          {/* Chain builder button */}
          <div className="flex items-center justify-between">
            <div
              className="flex-1 px-4 py-3 rounded-xl text-xs font-mono"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.20)",
              }}
            >
              Spawn agent from UI with{" "}
              <button
                onClick={() => setShowSpawnDialog(true)}
                className="cursor-pointer underline"
                style={{ color: "rgba(76,175,80,0.7)", background: "none", border: "none", padding: 0 }}
              >
                + Spawn
              </button>
              {" "}or chain tasks with{" "}
              <button
                onClick={() => setShowChainBuilder(true)}
                className="cursor-pointer underline"
                style={{ color: "rgba(167,139,250,0.7)", background: "none", border: "none", padding: 0 }}
              >
                New Chain
              </button>
            </div>
            <button
              onClick={() => setShowChainBuilder(true)}
              className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-mono transition-all cursor-pointer shrink-0"
              style={{
                background: "rgba(167,139,250,0.10)",
                border: "1px solid rgba(167,139,250,0.25)",
                color: "#a78bfa",
              }}
              title="Create a new task chain"
            >
              ⛓ New Chain
              {activeChains.length > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ background: "rgba(167,139,250,0.25)", color: "#a78bfa" }}
                >
                  {activeChains.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Activity Log strip ── */}
      <div
        className="shrink-0 flex flex-col"
        style={{
          height: 180,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span
            className="text-[10px] tracking-[4px] font-mono uppercase"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Activity Log
          </span>
          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
            {activityLog.length} entries · last 100
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 flex flex-col gap-0.5">
          {activityLog.length === 0 ? (
            <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.20)" }}>
              No activity yet. Actions will appear here in real-time.
            </div>
          ) : (
            activityLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 text-[11px] font-mono leading-relaxed">
                <span style={{ color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {fmtTs(entry.ts)}
                </span>
                <span style={{ flexShrink: 0 }}>{entry.icon}</span>
                <span style={{ color: entry.color }}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Footer hint */}
      <div
        className="flex items-center gap-4 px-6 py-2.5 shrink-0 text-[10px] font-mono"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.18)",
        }}
      >
        <span>
          <kbd className="opacity-60">Enter</kbd> submit
        </span>
        <span>
          <kbd className="opacity-60">⌘⇧K</kbd> navigate here from any view
        </span>
        <span style={{ marginLeft: "auto" }}>
          {workers.length} workers · {queue.pending.length + queue.assigned.length} active tasks
          {activeChains.length > 0 && ` · ${activeChains.length} chains`}
          {permissionAgents.length > 0 && (
            <span style={{ color: "#ff9800", marginLeft: 6 }}>
              · {permissionAgents.length} awaiting permission
            </span>
          )}
        </span>
      </div>
    </div>
  );
});
