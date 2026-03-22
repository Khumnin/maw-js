import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ansiToHtml } from "../lib/ansi";
import type { AgentState, Session } from "../lib/types";

// ── helpers ────────────────────────────────────────────────────────────────────

function trimCapture(raw: string): string {
  const lines = raw.split("\n");
  while (lines.length > 0) {
    const stripped = lines[lines.length - 1].replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (stripped === "") lines.pop();
    else break;
  }
  return lines.join("\n");
}

function cleanName(name: string) {
  return name.replace(/-oracle$/, "").replace(/-/g, " ");
}

// ── Status dot config ──────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  working:    "#22c55e",
  waiting:    "#eab308",
  permission: "#f97316",
  error:      "#ef4444",
  idle:       "#6b7280",
};

const STATUS_DOT_ANIMATION: Record<string, string | undefined> = {
  working:    "status-blink 1s ease-in-out infinite",
  permission: "permission-pulse 1s ease-in-out infinite",
};

// ── Session sidebar item ───────────────────────────────────────────────────────

interface SessionItemProps {
  agent: AgentState;
  selected: boolean;
  onSelect: (agent: AgentState) => void;
  onKill: (agent: AgentState) => void;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onStartEdit: (agent: AgentState) => void;
}

function SessionItem({
  agent,
  selected,
  onSelect,
  onKill,
  isEditing,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  onStartEdit,
}: SessionItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); onEditSubmit(); }
    else if (e.key === "Escape") { e.preventDefault(); onEditCancel(); }
  }, [onEditSubmit, onEditCancel]);

  // Determine display name: use agent.name if it differs from session (custom rename), else session
  const displayName = agent.name && agent.name !== agent.session
    ? agent.name
    : agent.session.toUpperCase();

  return (
    <div
      className={`w-full flex items-center justify-between px-2 py-1 transition-all group ${
        selected
          ? "bg-cyan-400/8 text-white"
          : "text-white/60 hover:text-white/90 hover:bg-white/[0.04]"
      }`}
    >
      {/* Clickable / editable name area */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onEditCancel}
          className="flex-1 min-w-0 px-2 py-1.5 bg-transparent border-b border-cyan-400/50 font-mono text-[13px] uppercase tracking-wide font-bold text-white outline-none"
          spellCheck={false}
          autoComplete="off"
          maxLength={50}
        />
      ) : (
        <button
          onClick={() => onSelect(agent)}
          onDoubleClick={(e) => { e.preventDefault(); onStartEdit(agent); }}
          className="flex-1 flex items-center min-w-0 px-2 py-1.5 text-left cursor-pointer"
          title="Double-click to rename"
        >
          <span className="min-w-0 truncate font-mono text-[13px] uppercase tracking-wide font-bold">
            {displayName}
          </span>
        </button>
      )}

      {/* Right side: status dot + kill button */}
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{
            background: STATUS_DOT[agent.status] || "#6b7280",
            boxShadow: agent.status !== "idle" ? `0 0 6px ${STATUS_DOT[agent.status]}` : undefined,
            animation: STATUS_DOT_ANIMATION[agent.status],
          }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); onKill(agent); }}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
          title={`Kill ${agent.session}`}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M1 1 L7 7 M7 1 L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Session group (session name + its windows) ─────────────────────────────────

interface SessionGroupProps {
  session: Session;
  agents: AgentState[];
  selectedTarget: string | null;
  onSelect: (agent: AgentState) => void;
  onKill: (agent: AgentState) => void;
  editingTarget: string | null;
  editName: string;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onStartEdit: (agent: AgentState) => void;
}

function _SessionGroup({
  session,
  agents,
  selectedTarget,
  onSelect,
  onKill,
  editingTarget,
  editName,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  onStartEdit,
}: SessionGroupProps) {
  const sessionAgents = agents.filter((a) => a.session === session.name);
  if (sessionAgents.length === 0) return null;

  return (
    <div className="mb-1">
      {/* Session header */}
      <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
        {session.name}
      </div>
      {/* Windows */}
      {sessionAgents.map((agent) => (
        <SessionItem
          key={agent.target}
          agent={agent}
          selected={selectedTarget === agent.target}
          onSelect={onSelect}
          onKill={onKill}
          isEditing={editingTarget === agent.target}
          editValue={editName}
          onEditChange={onEditChange}
          onEditSubmit={onEditSubmit}
          onEditCancel={onEditCancel}
          onStartEdit={onStartEdit}
        />
      ))}
    </div>
  );
}

// ── Terminal panel ─────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  agent: AgentState | null;
  send: (msg: object) => void;
  selectedHost?: string;
}

function TerminalPanel({ agent, send, selectedHost }: TerminalPanelProps) {
  const [inputBuf, setInputBuf] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstContent = useRef(true);
  const isSelecting = useRef(false);
  const pendingHtml = useRef<string | null>(null);
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

  // Track mouse/touch selection state — pause DOM updates while selecting
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
      // Keep DOM frozen for 2s so the selection stays visible
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

  // Focus input when agent changes
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [agent?.target]);

  // Poll terminal capture — writes directly to DOM, never through React state
  useEffect(() => {
    if (!agent) {
      if (termRef.current) termRef.current.innerHTML = "";
      return;
    }

    send({ type: "subscribe", target: agent.target, host: selectedHost });
    isFirstContent.current = true;

    const poll = setInterval(async () => {
      try {
        const hostParam = selectedHost ? `&host=${encodeURIComponent(selectedHost)}` : "";
        const res = await fetch(`/api/capture?target=${encodeURIComponent(agent.target)}&lines=2000${hostParam}`);
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

    return () => {
      clearInterval(poll);
      send({ type: "subscribe", target: "", host: selectedHost });
    };
  }, [agent?.target, send, updateTerminalDom, selectedHost]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!agent) return;

    if (e.key === "Escape") {
      e.preventDefault();
      send({ type: "send", target: agent.target, text: "\x1b", host: selectedHost });
      return;
    }
    if (e.key === "ArrowUp")    { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[A", host: selectedHost }); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[B", host: selectedHost }); return; }
    if (e.key === "ArrowLeft")  { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[D", host: selectedHost }); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); send({ type: "send", target: agent.target, text: "\x1b[C", host: selectedHost }); return; }

    if (e.key === "Enter") {
      e.preventDefault();
      if (inputBuf) {
        send({ type: "send", target: agent.target, text: inputBuf, host: selectedHost });
        setInputBuf("");
      } else {
        send({ type: "send", target: agent.target, text: "\r", host: selectedHost });
      }
      return;
    }

    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInputBuf("");
      return;
    }
  }, [inputBuf, agent, send, selectedHost]);

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

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/20 font-mono text-sm">Select a session from the sidebar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Agent header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0e0e18] border-b border-white/[0.06] shrink-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: STATUS_DOT[agent.status] || "#6b7280",
            boxShadow: agent.status !== "idle" ? `0 0 4px ${STATUS_DOT[agent.status]}` : undefined,
            animation: STATUS_DOT_ANIMATION[agent.status],
          }}
        />
        <span className="font-mono text-[12px] text-white/70 uppercase tracking-wide">{cleanName(agent.name)}</span>
        <span className="ml-2 font-mono text-[10px] text-white/25">{agent.target}</span>
        {selectedHost && (
          <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400/70 border border-cyan-400/20">
            {selectedHost}
          </span>
        )}
        <span
          className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: `${STATUS_DOT[agent.status]}22`,
            color: STATUS_DOT[agent.status] || "#6b7280",
          }}
        >
          {agent.status}
        </span>
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
          className="h-full px-3 sm:px-4 py-3 overflow-y-auto overflow-x-auto font-mono text-[12px] sm:text-[13px] leading-[1.35] text-[#cdd6f4] whitespace-pre bg-[#0a0a0f] cursor-text"
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
              return;
            }
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) inputRef.current?.focus();
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      </div>

      {/* Input line */}
      <div
        className="flex items-center gap-2 px-4 py-2 bg-[#0e0e18] border-t border-white/[0.06] font-mono text-xs cursor-text shrink-0"
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
          />
        </div>
      </div>
    </div>
  );
}

// ── Host type ──────────────────────────────────────────────────────────────────

interface Host {
  id: string;
  name: string;
  address: string;
  isLocal: boolean;
}

// ── TerminalPage ───────────────────────────────────────────────────────────────

export interface TerminalPageProps {
  sessions: Session[];
  agents: AgentState[];
  send: (msg: object) => void;
}

export function TerminalPage({ sessions: _sessions, agents: propAgents, send }: TerminalPageProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Host selection ──────────────────────────────────────────────────────
  const [hosts, setHosts] = useState<Host[]>([
    { id: "local", name: "Local", address: "local", isLocal: true },
  ]);
  const [selectedHost, setSelectedHost] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/hosts")
      .then((r) => r.json())
      .then((data: { hosts: Host[] }) => {
        if (data.hosts?.length) setHosts(data.hosts);
      })
      .catch(() => {});
  }, []);

  // ── Remote host sessions ──────────────────────────────────────────────
  // When a remote host is selected, fetch agent data from the peer's maw-js
  // instance via federation API (which has proper status tracking), falling back
  // to raw SSH tmux sessions if federation is unavailable.
  const [remoteAgents, setRemoteAgents] = useState<AgentState[]>([]);

  useEffect(() => {
    if (!selectedHost) {
      setRemoteAgents([]);
      return;
    }
    let cancelled = false;

    async function fetchRemote() {
      try {
        // Try federation first — peer's maw-js has proper agent status
        const fedRes = await fetch("/api/federation/agents");
        if (fedRes.ok) {
          const fedData = await fedRes.json() as {
            agents: Array<{
              sessionName: string;
              target: string;
              status: string;
              peerId: string;
              peerName: string;
            }>;
          };
          // Filter to agents from the selected host's peer
          // selectedHost is the host's `address` (e.g. "asus-rog"), but federation
          // peers use their own id/name (e.g. "g35dx"/"G35DX"). We need to match
          // via the hosts list which maps address → name.
          const selectedHostObj = hosts.find((h) => h.address === selectedHost);
          const hostName = selectedHostObj?.name?.toLowerCase() ?? "";
          const hostAddr = (selectedHost ?? "").toLowerCase();
          const hostId = hostAddr.replace(/\s+/g, "-");
          const peerAgents = (fedData.agents ?? []).filter(
            (a) => a.peerName?.toLowerCase() === hostName ||
                   a.peerName?.toLowerCase() === hostAddr ||
                   a.peerId === hostId ||
                   a.peerId === hostName.replace(/\s+/g, "-")
          );
          if (!cancelled && peerAgents.length > 0) {
            setRemoteAgents(
              peerAgents.map((a) => ({
                target: a.target,
                name: a.sessionName,
                session: a.sessionName,
                windowIndex: 0,
                active: true,
                preview: "",
                status: (a.status || "idle") as AgentState["status"],
                isWorker: false,
                projectLabel: null,
              }))
            );
            return;
          }
        }

        // Fallback: raw SSH tmux session listing
        const res = await fetch(`/api/sessions?host=${encodeURIComponent(selectedHost)}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setRemoteAgents(
            (data as Session[]).flatMap((s) =>
              s.windows.map((w) => ({
                target: `${s.name}:${w.index}`,
                name: w.name,
                session: s.name,
                windowIndex: w.index,
                active: w.active,
                preview: "",
                status: "idle" as const,
                isWorker: false,
                projectLabel: null,
              }))
            )
          );
        }
      } catch {}
    }

    fetchRemote();
    const interval = setInterval(fetchRemote, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedHost, hosts]);

  // Use remote agents when a host is selected, otherwise local agents
  const agents = useMemo(() => {
    if (!selectedHost) return propAgents;
    return remoteAgents;
  }, [selectedHost, propAgents, remoteAgents]);

  // Optimistically hidden targets — removed on kill, cleaned up by next poll cycle
  const [killedTargets, setKilledTargets] = useState<Set<string>>(new Set());
  // Inline rename state
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Sync: if a killed target reappears in agents list (e.g. respawn), un-hide it
  useEffect(() => {
    if (killedTargets.size === 0) return;
    const liveTargets = new Set(agents.map((a) => a.target));
    setKilledTargets((prev) => {
      const next = new Set(prev);
      for (const t of prev) {
        if (!liveTargets.has(t)) next.delete(t); // it's gone — clean up
      }
      return next.size === prev.size ? prev : next;
    });
  }, [agents, killedTargets.size]);

  const visibleAgents = agents.filter((a) => !killedTargets.has(a.target));

  // Auto-select first agent on mount or when agent list populates
  useEffect(() => {
    if (!selectedTarget && visibleAgents.length > 0) {
      setSelectedTarget(visibleAgents[0].target);
    }
  }, [visibleAgents, selectedTarget]);

  const selectedAgent = visibleAgents.find((a) => a.target === selectedTarget) ?? null;

  const handleSelect = useCallback((agent: AgentState) => {
    setSelectedTarget(agent.target);
    setSidebarOpen(false); // close sidebar on mobile after selection
  }, []);

  const handleKill = useCallback(async (agent: AgentState) => {
    if (!window.confirm(`Kill agent "${agent.session}"? This will close the tmux window.`)) return;
    try {
      await fetch(`/api/agents/${encodeURIComponent(agent.target)}`, { method: "DELETE" });
      setKilledTargets((prev) => new Set(prev).add(agent.target));
      if (selectedTarget === agent.target) setSelectedTarget(null);
    } catch {
      // silently ignore — poll will reconcile
    }
  }, [selectedTarget]);

  const handleStartEdit = useCallback((agent: AgentState) => {
    setEditingTarget(agent.target);
    setEditName(agent.name || agent.session);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingTarget(null);
    setEditName("");
  }, []);

  const handleEditSubmit = useCallback(async () => {
    if (!editingTarget || !editName.trim()) { handleEditCancel(); return; }
    try {
      await fetch(`/api/agents/${encodeURIComponent(editingTarget)}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
    } catch {
      // silently ignore — tmux name update best-effort
    }
    setEditingTarget(null);
    setEditName("");
  }, [editingTarget, editName, handleEditCancel]);

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed sm:relative inset-y-0 left-0 z-50 sm:z-auto
          w-56 shrink-0
          bg-[#0d0d14] border-r border-white/[0.06]
          overflow-y-auto
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Sessions</span>
          <span className="text-[10px] font-mono text-white/25">{visibleAgents.length}</span>
        </div>

        {/* Host selector — only shown when multiple hosts are available */}
        {hosts.length > 1 && (
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <label className="block text-[9px] font-mono uppercase tracking-wider mb-1 text-white/30">
              Machine
            </label>
            <select
              value={selectedHost ?? ""}
              onChange={(e) => {
                setSelectedHost(e.target.value || undefined);
                setSelectedTarget(null);
              }}
              className="w-full text-[11px] font-mono rounded px-2 py-1 outline-none appearance-none cursor-pointer"
              style={{
                background: "#1a1a28",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.isLocal ? "" : h.address}>
                  {h.name}{!h.isLocal ? ` (${h.address})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Session list — flat list like old Terminal */}
        <nav className="py-1">
          {visibleAgents.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-white/20 font-mono">No sessions</p>
          ) : (
            visibleAgents.map((agent) => (
              <SessionItem
                key={agent.target}
                agent={agent}
                selected={selectedTarget === agent.target}
                onSelect={handleSelect}
                onKill={handleKill}
                isEditing={editingTarget === agent.target}
                editValue={editName}
                onEditChange={setEditName}
                onEditSubmit={handleEditSubmit}
                onEditCancel={handleEditCancel}
                onStartEdit={handleStartEdit}
              />
            ))
          )}
        </nav>
      </aside>

      {/* ── Main terminal area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0a0a0f]">
        {/* Mobile toolbar: hamburger + session name */}
        <div className="flex sm:hidden items-center gap-2 px-3 py-2 bg-[#0e0e18] border-b border-white/[0.06] shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Open session list"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75"/>
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75"/>
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75"/>
            </svg>
          </button>
          <span className="font-mono text-[11px] text-white/50 uppercase tracking-wide">
            {selectedAgent ? cleanName(selectedAgent.name) : "Select session"}
          </span>
        </div>

        <TerminalPanel agent={selectedAgent} send={send} selectedHost={selectedHost} />
      </div>
    </div>
  );
}
