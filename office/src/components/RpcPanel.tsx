import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RpcCall {
  id: string;
  from: string;
  to: string;
  prompt: string;
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  output?: string;
  createdAt: number;
  completedAt?: number;
  timeout: number;
}

export interface RpcPanelProps {
  agents: Array<{ sessionName: string; target: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcStatusMeta(status: RpcCall["status"]): {
  color: string;
  label: string;
  blink: boolean;
} {
  switch (status) {
    case "pending":
      return { color: "#ffa726", label: "queued", blink: false };
    case "running":
      return { color: "#4caf50", label: "running", blink: true };
    case "completed":
      return { color: "#4caf50", label: "done", blink: false };
    case "failed":
      return { color: "#ef5350", label: "failed", blink: false };
    case "timeout":
      return { color: "#ef5350", label: "timeout", blink: false };
    default:
      return { color: "#888", label: status, blink: false };
  }
}

/** Format elapsed seconds into a human-readable string. */
function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ── Live elapsed counter ──────────────────────────────────────────────────────

function ElapsedCounter({ since }: { since: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{fmtElapsed(Date.now() - since)}</span>;
}

// ── Blinking dot ──────────────────────────────────────────────────────────────

function StatusDot({
  color,
  blink,
}: {
  color: string;
  blink: boolean;
}) {
  return (
    <span
      className={blink ? "animate-pulse" : ""}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// ── Call form ─────────────────────────────────────────────────────────────────

interface CallFormState {
  from: string;
  to: string;
  prompt: string;
  timeout: string;
}

interface CallFormProps {
  agents: RpcPanelProps["agents"];
  onSubmit: (payload: {
    from: string;
    to: string;
    prompt: string;
    timeout?: number;
  }) => Promise<void>;
  onCancel: () => void;
}

function CallForm({ agents, onSubmit, onCancel }: CallFormProps) {
  const [form, setForm] = useState<CallFormState>({
    from: agents[0]?.sessionName ?? "",
    to: agents[1]?.sessionName ?? agents[0]?.sessionName ?? "",
    prompt: "",
    timeout: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  const selectStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "monospace",
    padding: "4px 6px",
    width: "100%",
    outline: "none",
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    resize: "none" as const,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.from || !form.to || !form.prompt.trim()) return;
    if (form.from === form.to) {
      setError("'from' and 'to' must differ");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        from: form.from,
        to: form.to,
        prompt: form.prompt.trim(),
        timeout: form.timeout ? parseInt(form.timeout, 10) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(100,181,246,0.25)",
      }}
    >
      {/* from / to row */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label
            className="text-[9px] font-mono uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            from
          </label>
          <select
            style={selectStyle}
            value={form.from}
            onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
          >
            {agents.map((a) => (
              <option key={a.sessionName} value={a.sessionName}>
                {a.sessionName}
              </option>
            ))}
          </select>
        </div>

        {/* arrow */}
        <span
          className="text-[14px] mt-4 shrink-0"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          →
        </span>

        <div className="flex flex-col gap-1 flex-1">
          <label
            className="text-[9px] font-mono uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            to
          </label>
          <select
            style={selectStyle}
            value={form.to}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
          >
            {agents.map((a) => (
              <option key={a.sessionName} value={a.sessionName}>
                {a.sessionName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* prompt */}
      <div className="flex flex-col gap-1">
        <label
          className="text-[9px] font-mono uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          prompt
        </label>
        <textarea
          ref={promptRef}
          rows={3}
          style={inputStyle}
          placeholder="Describe what you need from the target agent…"
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
        />
      </div>

      {/* timeout */}
      <div className="flex flex-col gap-1">
        <label
          className="text-[9px] font-mono uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          timeout (s) — default 120
        </label>
        <input
          type="number"
          min={5}
          max={3600}
          style={{ ...inputStyle, width: 90 }}
          placeholder="120"
          value={form.timeout}
          onChange={(e) => setForm((f) => ({ ...f, timeout: e.target.value }))}
        />
      </div>

      {/* error */}
      {error && (
        <span
          className="text-[10px] font-mono"
          style={{ color: "#ef5350" }}
        >
          {error}
        </span>
      )}

      {/* actions */}
      <div className="flex gap-2 justify-end mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] font-mono px-3 py-1 rounded cursor-pointer"
          style={{
            color: "rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={busy || !form.from || !form.to || !form.prompt.trim()}
          className="text-[10px] font-mono px-3 py-1 rounded cursor-pointer disabled:opacity-40"
          style={{
            color: "#64b5f6",
            background: "rgba(100,181,246,0.10)",
            border: "1px solid rgba(100,181,246,0.25)",
          }}
        >
          {busy ? "calling…" : "call"}
        </button>
      </div>
    </form>
  );
}

// ── Call card ─────────────────────────────────────────────────────────────────

interface CallCardProps {
  call: RpcCall;
}

function CallCard({ call }: CallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = rpcStatusMeta(call.status);
  const isTerminal = call.status === "completed" || call.status === "failed" || call.status === "timeout";
  const hasOutput = call.status === "completed" && call.output;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${meta.color}33`,
      }}
    >
      {/* header row */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: expanded ? `1px solid ${meta.color}1a` : undefined }}
      >
        <StatusDot color={meta.color} blink={meta.blink} />

        {/* from → to */}
        <span className="flex items-center gap-1 font-mono text-[10px] flex-1 min-w-0">
          <span
            className="truncate max-w-[70px]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {call.from}
          </span>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>→</span>
          <span
            className="truncate max-w-[70px]"
            style={{ color: "rgba(100,181,246,0.85)" }}
          >
            {call.to}
          </span>
        </span>

        {/* status badge */}
        <span
          className="text-[9px] font-mono px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {meta.label}
        </span>

        {/* elapsed / duration */}
        <span
          className="text-[9px] font-mono shrink-0"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          {call.status === "running" ? (
            <ElapsedCounter since={call.createdAt} />
          ) : isTerminal && call.completedAt ? (
            fmtElapsed(call.completedAt - call.createdAt)
          ) : null}
        </span>

        {/* expand toggle for completed */}
        {hasOutput && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer shrink-0"
            style={{
              color: "rgba(100,181,246,0.6)",
              background: "rgba(100,181,246,0.08)",
              border: "1px solid rgba(100,181,246,0.15)",
            }}
            aria-label={expanded ? "Collapse output" : "Expand output"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* prompt preview */}
      <div
        className="px-3 py-1.5 font-mono text-[10px] truncate"
        style={{ color: "rgba(255,255,255,0.4)" }}
        title={call.prompt}
      >
        {call.prompt}
      </div>

      {/* expanded output */}
      {expanded && hasOutput && (
        <div
          className="mx-3 mb-3 rounded overflow-auto font-mono text-[10px] whitespace-pre-wrap"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.75)",
            padding: "8px 10px",
            maxHeight: 240,
            lineHeight: 1.5,
          }}
        >
          {call.output}
        </div>
      )}

      {/* failed / timeout detail */}
      {(call.status === "failed" || call.status === "timeout") && call.output && (
        <div
          className="mx-3 mb-3 rounded font-mono text-[10px] whitespace-pre-wrap overflow-auto"
          style={{
            background: "rgba(239,83,80,0.06)",
            border: "1px solid rgba(239,83,80,0.15)",
            color: "rgba(239,83,80,0.8)",
            padding: "6px 10px",
            maxHeight: 120,
          }}
        >
          {call.output}
        </div>
      )}
    </div>
  );
}

// ── RpcPanel ──────────────────────────────────────────────────────────────────

/**
 * Displays active Agent-to-Agent RPC calls and provides an inline form
 * to initiate new calls. Polls GET /api/rpc every 3 seconds and also
 * reacts to WebSocket events forwarded via the "maw-ws-message" custom event.
 */
export function RpcPanel({ agents }: RpcPanelProps) {
  const [calls, setCalls] = useState<RpcCall[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch active calls ────────────────────────────────────────────────────

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/rpc");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RpcCall[] = await res.json();
      setCalls(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load RPC calls");
    }
  }, []);

  // initial load + 3-second poll
  useEffect(() => {
    fetchCalls();
    pollRef.current = setInterval(fetchCalls, 3000);
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [fetchCalls]);

  // ── WebSocket event handler ───────────────────────────────────────────────

  const handleWsMessage = useCallback(
    (data: { type: string; call?: RpcCall; callId?: string }) => {
      if (
        data.type === "rpc-initiated" ||
        data.type === "rpc-completed" ||
        data.type === "rpc-failed"
      ) {
        if (data.call) {
          setCalls((prev) => {
            const idx = prev.findIndex((c) => c.id === data.call!.id);
            if (idx === -1) return [data.call!, ...prev];
            const next = [...prev];
            next[idx] = data.call!;
            return next;
          });
        } else {
          // Re-fetch to pick up the latest state when no inline payload
          fetchCalls();
        }
      }
    },
    [fetchCalls],
  );

  useEffect(() => {
    const handler = (e: CustomEvent) => handleWsMessage(e.detail);
    window.addEventListener("maw-ws-message" as never, handler);
    return () => window.removeEventListener("maw-ws-message" as never, handler);
  }, [handleWsMessage]);

  // ── Submit new RPC call ───────────────────────────────────────────────────

  const submitCall = useCallback(
    async (payload: {
      from: string;
      to: string;
      prompt: string;
      timeout?: number;
    }) => {
      const res = await fetch("/api/rpc/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text || `HTTP ${res.status}`);
      }
      const newCall: RpcCall = await res.json();
      setCalls((prev) => [newCall, ...prev]);
      setShowForm(false);
    },
    [],
  );

  // ── Partition calls by terminal / active ──────────────────────────────────

  const activeCalls = calls.filter(
    (c) => c.status === "pending" || c.status === "running",
  );
  const doneCalls = calls.filter(
    (c) => c.status === "completed" || c.status === "failed" || c.status === "timeout",
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="flex flex-col gap-3">
      {/* section header */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] tracking-[4px] font-mono uppercase"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          RPC Calls
        </span>
        {!showForm && agents.length >= 1 && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer"
            style={{
              color: "rgba(100,181,246,0.7)",
              background: "rgba(100,181,246,0.08)",
              border: "1px solid rgba(100,181,246,0.18)",
            }}
          >
            + Call
          </button>
        )}
      </div>

      {/* inline call form */}
      {showForm && (
        <CallForm
          agents={agents}
          onSubmit={submitCall}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* load error */}
      {loadError && (
        <span
          className="text-[10px] font-mono"
          style={{ color: "#ef5350" }}
        >
          {loadError}
        </span>
      )}

      {/* active calls */}
      {activeCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeCalls.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
        </div>
      )}

      {/* completed / failed calls */}
      {doneCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeCalls.length > 0 && (
            <span
              className="text-[9px] tracking-[3px] font-mono uppercase"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              Recent
            </span>
          )}
          {doneCalls.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
        </div>
      )}

      {/* empty state */}
      {calls.length === 0 && !loadError && !showForm && (
        <span
          className="text-[10px] font-mono"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          No active RPC calls
        </span>
      )}
    </section>
  );
}
