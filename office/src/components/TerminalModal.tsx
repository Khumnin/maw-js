import { useState, useEffect, useRef, useCallback } from "react";
import { ansiToHtml } from "../lib/ansi";
import type { AgentState } from "../lib/types";

function trimCapture(raw: string): string {
  const lines = raw.split("\n");
  while (lines.length > 0) {
    const stripped = lines[lines.length - 1].replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (stripped === "") lines.pop();
    else break;
  }
  return lines.join("\n");
}

interface TerminalModalProps {
  agent: AgentState;
  send: (msg: object) => void;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  onSelectSibling: (agent: AgentState) => void;
  siblings: AgentState[];
}

function cleanName(name: string) {
  return name.replace(/-oracle$/, "").replace(/-/g, " ");
}

const STATUS_DOT: Record<string, string> = {
  working:    "#22c55e",
  waiting:    "#eab308",
  permission: "#f97316",
  error:      "#ef4444",
  idle:       "#6b7280",
};

export function TerminalModal({ agent, send, onClose, onNavigate, onSelectSibling, siblings }: TerminalModalProps) {
  const [inputBuf, setInputBuf] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelecting = useRef(false);
  const pendingHtml = useRef<string | null>(null);
  const isFirstContent = useRef(true);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Direct DOM update — bypasses React render to avoid selection race ──
  const updateTerminalDom = useCallback((html: string) => {
    const el = termRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = html;
    if (isFirstContent.current) {
      isFirstContent.current = false;
      el.scrollTop = el.scrollHeight;
    } else if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const flushPending = useCallback(() => {
    if (pendingHtml.current !== null) {
      updateTerminalDom(pendingHtml.current);
      pendingHtml.current = null;
    }
  }, [updateTerminalDom]);

  // Auto-focus input on open + when switching agents
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [agent.target]);

  // Refocus input when clicking anywhere in the modal,
  // but skip when the user is starting a drag-selection inside the terminal output.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const refocus = (e: MouseEvent) => {
      if (termRef.current && termRef.current.contains(e.target as Node)) return;
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    el.addEventListener("mousedown", refocus);
    return () => el.removeEventListener("mousedown", refocus);
  }, []);

  // Poll — writes directly to DOM, never through React state
  useEffect(() => {
    send({ type: "subscribe", target: agent.target });
    isFirstContent.current = true;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/capture?target=${encodeURIComponent(agent.target)}&lines=2000`);
        const data = await res.json();
        const html = ansiToHtml(trimCapture(data.content || ""));
        if (isSelecting.current) {
          pendingHtml.current = html;
        } else {
          pendingHtml.current = null;
          updateTerminalDom(html);
        }
      } catch {}
    }, 200);
    return () => { clearInterval(poll); send({ type: "subscribe", target: "" }); };
  }, [agent.target, send, updateTerminalDom]);

  // Reset first-content flag when switching agents
  useEffect(() => {
    isFirstContent.current = true;
  }, [agent.target]);

  // Track mouse selection state — pause DOM updates while selecting
  const handleMouseDown = useCallback(() => {
    if (selectionTimer.current) { clearTimeout(selectionTimer.current); selectionTimer.current = null; }
    isSelecting.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.toString().trim();

    if (hasSelection) {
      const termEl = termRef.current;
      if (termEl && termEl.contains(selection.anchorNode)) {
        navigator.clipboard.writeText(selection.toString()).then(() => {
          setCopiedFeedback(true);
          setTimeout(() => setCopiedFeedback(false), 1500);
        }).catch(() => {});
      }
      selectionTimer.current = setTimeout(() => {
        isSelecting.current = false;
        flushPending();
        selectionTimer.current = null;
      }, 2000);
    } else {
      isSelecting.current = false;
      flushPending();
    }
  }, [flushPending]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Shift+Tab → send ECMA-48 reverse-tab escape sequence to the terminal process
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      send({ type: "send", target: agent.target, text: "\x1b[Z" });
      return;
    }
    // Ctrl+Escape closes the modal; plain Escape sends \x1b to the tmux agent
    if (e.key === "Escape") {
      e.preventDefault();
      if (e.ctrlKey) { onClose(); return; }
      send({ type: "send", target: agent.target, text: "\x1b" });
      return;
    }
    // Alt+Arrow to navigate between agents in same room
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); onNavigate(-1); return; }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); onNavigate(1); return; }
    // Alt+1-9 to jump to sibling by index
    if (e.altKey && e.key >= "1" && e.key <= "9") {
      const idx = parseInt(e.key) - 1;
      if (idx < siblings.length) { e.preventDefault(); onSelectSibling(siblings[idx]); }
      return;
    }
    // Arrow keys → send escape sequences to tmux
    if (e.key === "ArrowUp") { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[A" }); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[B" }); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[D" }); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[C" }); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputBuf) {
        send({ type: "send", target: agent.target, text: inputBuf });
        setInputBuf("");
      } else {
        // Empty buffer: send bare carriage return so tmux prompts (y/n, etc.) can be confirmed
        send({ type: "send", target: agent.target, text: "\r" });
      }
      return;
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault(); setInputBuf("");
    }
  }, [inputBuf, agent.target, send, onClose, onNavigate]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const blob = imageItem.getAsFile();
      if (blob) {
        try {
          const fd = new FormData();
          fd.append("image", blob, "paste.png");
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const data = await res.json() as { path?: string; error?: string };
          if (data.path) setInputBuf((b) => b + data.path);
        } catch {}
      }
      return;
    }
    const text = e.clipboardData.getData("text");
    if (text) setInputBuf((b) => b + text);
  }, []);

  const _displayName = cleanName(agent.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      ref={wrapperRef}
    >
      <div className="terminal-modal-panel w-full sm:w-[90vw] sm:max-w-[900px] h-[92dvh] sm:h-[80vh] bg-[#0a0a0f] border-0 sm:border border-white/[0.06] rounded-t-2xl sm:rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-[#0e0e18] border-b border-white/[0.06]">
          <div className="flex gap-1.5 shrink-0">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 cursor-pointer" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>

          {/* Agent tab bar */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none mx-2">
            {siblings.map((s, i) => {
              const active = s.target === agent.target;
              return (
                <button
                  key={s.target}
                  onClick={() => onSelectSibling(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono whitespace-nowrap cursor-pointer transition-all ${
                    active
                      ? "bg-white/10 text-white/90"
                      : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: STATUS_DOT[s.status] || "#555",
                      animation:
                        s.status === "permission"
                          ? "permission-pulse 1s ease-in-out infinite"
                          : s.status === "working"
                          ? "status-blink 1s ease-in-out infinite"
                          : undefined,
                    }}
                  />
                  {i < 9 && (
                    <span className="text-[9px] text-white/20">{i + 1}</span>
                  )}
                  {cleanName(s.name)}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {siblings.length > 1 && (
              <span className="hidden sm:inline text-[9px] text-white/20 tracking-wider">Alt+1-{Math.min(9, siblings.length)}</span>
            )}
            <button onClick={onClose} title="Close (Ctrl+Esc)" className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto text-white/40 hover:text-white/70 text-xl cursor-pointer rounded-lg hover:bg-white/[0.05] transition-colors">
              &times;
            </button>
          </div>
        </div>

        {/* Terminal output */}
        <div className="relative flex-1 min-h-0">
          {/* Copied! feedback badge */}
          <div
            className="absolute top-2 right-3 z-10 px-2.5 py-1 rounded-full font-mono text-[10px] text-white bg-[#1e1e2e] border border-white/10 shadow-lg pointer-events-none select-none transition-opacity duration-300"
            style={{ opacity: copiedFeedback ? 1 : 0 }}
          >
            Copied!
          </div>
          <div
            ref={termRef}
            className="h-full px-3 sm:px-4 py-3 overflow-y-auto overflow-x-auto font-mono text-[12px] sm:text-[13px] leading-[1.35] text-[#cdd6f4] whitespace-pre bg-[#0a0a0f]"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={(e: React.MouseEvent) => {
              const target = e.target as HTMLElement;
              const fileLink = target.closest(".file-link") as HTMLElement | null;
              if (fileLink) {
                e.preventDefault();
                const path = fileLink.dataset.path;
                if (path) {
                  fetch("/api/open-file", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path }),
                  }).catch(() => {});
                }
              }
            }}
          />
        </div>

        {/* Input */}
        <div
          className="flex items-center gap-2 px-4 py-2 bg-[#0e0e18] border-t border-white/[0.06] font-mono text-xs cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <span className="text-cyan-400 font-semibold shrink-0">&#x276f;</span>
          <div className="relative flex-1 min-h-[20px]">
            <input
              ref={inputRef}
              type="text"
              value={inputBuf}
              onChange={(e) => setInputBuf(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="absolute inset-0 w-full bg-transparent text-white/90 outline-none caret-cyan-400 font-mono text-xs"
              style={{ caretColor: "#22d3ee" }}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  );
}
