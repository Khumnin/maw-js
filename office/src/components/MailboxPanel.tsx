'use client';

import React, { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MailMessage {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  createdAt: number;
  read: boolean;
}

interface ComposeForm {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface MailboxPanelProps {
  /** List of agent sessions available for inbox selection and compose targeting. */
  agents: Array<{ sessionName: string; target: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(epochMs: number): string {
  try {
    const diff = Date.now() - epochMs;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return "";
  }
}

const BASE = "";

async function fetchMessages(agent: string, unreadOnly = false): Promise<MailMessage[]> {
  const url = `${BASE}/api/mailbox/${encodeURIComponent(agent)}${unreadOnly ? "?unread=true" : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailbox fetch failed: ${res.status}`);
  return res.json() as Promise<MailMessage[]>;
}

async function sendMessage(payload: ComposeForm): Promise<void> {
  const res = await fetch(`${BASE}/api/mailbox/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Send failed: ${res.status}`);
}

async function markRead(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/mailbox/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error(`Mark-read failed: ${res.status}`);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MessageCardProps {
  message: MailMessage;
  expanded: boolean;
  onToggle: (id: string) => void;
  onMarkRead: (id: string) => void;
}

function MessageCard({ message, expanded, onToggle, onMarkRead }: MessageCardProps) {
  const isUnread = !message.read;

  const handleClick = useCallback(() => {
    if (isUnread) onMarkRead(message.id);
    onToggle(message.id);
  }, [isUnread, message.id, onMarkRead, onToggle]);

  return (
    <div
      className="rounded-lg px-3 py-2.5 cursor-pointer transition-all"
      style={{
        background: isUnread ? "rgba(0,188,212,0.04)" : "rgba(255,255,255,0.03)",
        border: isUnread
          ? "1px solid rgba(0,188,212,0.22)"
          : "1px solid rgba(255,255,255,0.06)",
        borderLeft: isUnread ? "3px solid rgba(0,188,212,0.70)" : "3px solid transparent",
      }}
      onClick={handleClick}
      title={expanded ? "Click to collapse" : "Click to expand"}
    >
      {/* Row 1: sender + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span
          className="text-[10px] font-mono truncate"
          style={{ color: isUnread ? "#00bcd4" : "rgba(255,255,255,0.55)" }}
        >
          {isUnread && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
              style={{ background: "#00bcd4", boxShadow: "0 0 4px #00bcd4" }}
            />
          )}
          {message.sender}
        </span>
        <span
          className="text-[10px] font-mono shrink-0"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          {relTime(message.createdAt)}
        </span>
      </div>

      {/* Row 2: subject */}
      <div
        className="text-[11px] font-mono truncate mb-0.5"
        style={{ color: isUnread ? "#e0e0e0" : "rgba(255,255,255,0.45)" }}
      >
        {message.subject || <em style={{ fontStyle: "italic", opacity: 0.5 }}>(no subject)</em>}
      </div>

      {/* Row 3: body preview (collapsed) or full body (expanded) */}
      {expanded ? (
        <div
          className="font-mono text-[11px] mt-1.5"
          style={{
            background: "rgba(255,255,255,0.02)",
            padding: 8,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            maxHeight: 200,
            overflowY: "auto",
            color: "rgba(255,255,255,0.60)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {message.body}
        </div>
      ) : (
        <div
          className="text-[10px] font-mono truncate"
          style={{ color: "rgba(255,255,255,0.30)" }}
        >
          {message.body.replace(/\n/g, " ")}
        </div>
      )}
    </div>
  );
}

interface ComposeFormPanelProps {
  fromAgent: string;
  agents: Array<{ sessionName: string; target: string }>;
  onSend: (form: ComposeForm) => Promise<void>;
  onCancel: () => void;
}

function ComposeFormPanel({ fromAgent, agents, onSend, onCancel }: ComposeFormPanelProps) {
  const [form, setForm] = useState<ComposeForm>({
    from: fromAgent,
    to: agents[0]?.target ?? "",
    subject: "",
    body: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync `from` when parent agent changes
  useEffect(() => {
    setForm((prev) => ({ ...prev, from: fromAgent }));
  }, [fromAgent]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.to || !form.body.trim()) {
        setError("Recipient and body are required.");
        return;
      }
      setSending(true);
      setError(null);
      try {
        await onSend(form);
        // reset on success
        setForm((prev) => ({ ...prev, subject: "", body: "" }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Send failed.");
      } finally {
        setSending(false);
      }
    },
    [form, onSend]
  );

  const fieldLabel: React.CSSProperties = {
    color: "rgba(255,255,255,0.30)",
    fontSize: 10,
    fontFamily: "monospace",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 2,
  };

  const inputBase: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    color: "#e0e0e0",
    fontFamily: "monospace",
    fontSize: 11,
    outline: "none",
    width: "100%",
    padding: "4px 0",
    borderRadius: 0,
  };

  const selectBase: React.CSSProperties = {
    ...inputBase,
    background: "rgba(255,255,255,0.04)",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 4,
    padding: "4px 6px",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg flex flex-col gap-3 p-3"
      style={{
        background: "rgba(0,188,212,0.03)",
        border: "1px solid rgba(0,188,212,0.15)",
      }}
    >
      {/* From */}
      <div className="flex flex-col gap-0.5">
        <span style={fieldLabel}>From</span>
        <div
          className="text-[11px] font-mono px-0 py-1"
          style={{ color: "rgba(255,255,255,0.50)" }}
        >
          {form.from || <span style={{ opacity: 0.4 }}>(no agent selected)</span>}
        </div>
      </div>

      {/* To */}
      <div className="flex flex-col gap-0.5">
        <span style={fieldLabel}>To</span>
        <select
          value={form.to}
          onChange={(e) => setForm((prev) => ({ ...prev, to: e.target.value }))}
          style={selectBase}
          required
        >
          <option value="" disabled>
            — select recipient —
          </option>
          {agents.map((a) => (
            <option key={a.target} value={a.target}>
              {a.sessionName} ({a.target})
            </option>
          ))}
        </select>
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-0.5">
        <span style={fieldLabel}>Subject</span>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          placeholder="(optional)"
          style={inputBase}
        />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-0.5">
        <span style={fieldLabel}>Body</span>
        <textarea
          value={form.body}
          onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
          placeholder="Message body…"
          rows={4}
          style={{
            ...inputBase,
            resize: "vertical",
            borderBottom: "none",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 6,
            padding: "6px 8px",
            background: "rgba(255,255,255,0.03)",
          }}
          required
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-[10px] font-mono px-2 py-1 rounded"
          style={{ background: "rgba(239,83,80,0.10)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.20)" }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] font-mono px-3 py-1 rounded cursor-pointer transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending}
          className="text-[10px] font-mono px-3 py-1 rounded cursor-pointer transition-all"
          style={{
            background: sending ? "rgba(0,188,212,0.05)" : "rgba(0,188,212,0.12)",
            border: "1px solid rgba(0,188,212,0.30)",
            color: sending ? "rgba(0,188,212,0.40)" : "#00bcd4",
            cursor: sending ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Sending…" : "✉ Send"}
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * MailboxPanel — agent-to-agent message inbox for the CommandCenter right column.
 *
 * Features:
 * - Agent selector dropdown to switch between inboxes
 * - Unread filter toggle
 * - Message list with read/unread visual distinction
 * - Click-to-expand full body (also marks unread messages as read)
 * - Inline compose form
 * - Auto-refresh every 5 seconds
 */
export function MailboxPanel({ agents }: MailboxPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents[0]?.target ?? ""
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load messages for the selected agent
  const load = useCallback(async () => {
    if (!selectedAgent) return;
    try {
      const data = await fetchMessages(selectedAgent, unreadOnly);
      setMessages(data);
      setFetchError(null);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load messages.");
    }
  }, [selectedAgent, unreadOnly]);

  // Initial load + auto-refresh
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));

    intervalRef.current = setInterval(() => {
      load();
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // Update selectedAgent default when agents list changes (e.g. on first render)
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      setSelectedAgent(agents[0].target);
    }
  }, [agents, selectedAgent]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await markRead(id);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, read: true } : m))
        );
      } catch {
        // silent — message stays unread visually, will reconcile on next poll
      }
    },
    []
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSend = useCallback(
    async (form: ComposeForm) => {
      await sendMessage(form);
      setSendSuccess(true);
      setShowCompose(false);
      setTimeout(() => setSendSuccess(false), 3000);
      // Refresh inbox so sent replies appear if to === from
      await load();
    },
    [load]
  );

  const unreadCount = messages.filter((m) => !m.read).length;

  const selectedAgentObj = agents.find((a) => a.target === selectedAgent);

  return (
    <section className="flex flex-col gap-3">
      {/* ── Section header ── */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] tracking-[4px] font-mono uppercase"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Mailbox
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {/* Unread count badge */}
          {unreadCount > 0 && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(0,188,212,0.15)",
                color: "#00bcd4",
                border: "1px solid rgba(0,188,212,0.30)",
              }}
            >
              {unreadCount} unread
            </span>
          )}

          {/* Unread toggle */}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer transition-all"
            style={{
              background: unreadOnly ? "rgba(0,188,212,0.12)" : "rgba(255,255,255,0.05)",
              border: unreadOnly ? "1px solid rgba(0,188,212,0.30)" : "1px solid rgba(255,255,255,0.08)",
              color: unreadOnly ? "#00bcd4" : "rgba(255,255,255,0.40)",
            }}
            title={unreadOnly ? "Showing unread only — click to show all" : "Click to show unread only"}
          >
            {unreadOnly ? "unread" : "all"}
          </button>

          {/* Compose button */}
          <button
            onClick={() => setShowCompose((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded cursor-pointer transition-all"
            style={{
              background: showCompose ? "rgba(0,188,212,0.12)" : "rgba(255,255,255,0.05)",
              border: showCompose ? "1px solid rgba(0,188,212,0.30)" : "1px solid rgba(255,255,255,0.08)",
              color: showCompose ? "#00bcd4" : "rgba(255,255,255,0.55)",
            }}
            title={showCompose ? "Close compose" : "Compose a new message"}
          >
            ✉ Send
          </button>
        </div>
      </div>

      {/* ── Agent selector ── */}
      {agents.length > 0 && (
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono shrink-0"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            Inbox:
          </span>
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value);
              setShowCompose(false);
              setMessages([]);
              setExpandedId(null);
            }}
            className="flex-1 text-[11px] font-mono rounded px-2 py-1 cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#e0e0e0",
              outline: "none",
              minWidth: 0,
            }}
          >
            {agents.map((a) => (
              <option key={a.target} value={a.target}>
                {a.sessionName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Send success toast ── */}
      {sendSuccess && (
        <div
          className="text-[10px] font-mono px-3 py-1.5 rounded-lg"
          style={{
            background: "rgba(76,175,80,0.10)",
            border: "1px solid rgba(76,175,80,0.20)",
            color: "#4caf50",
          }}
        >
          Message sent.
        </div>
      )}

      {/* ── Compose form ── */}
      {showCompose && (
        <ComposeFormPanel
          fromAgent={selectedAgent}
          agents={agents.filter((a) => a.target !== selectedAgent)}
          onSend={handleSend}
          onCancel={() => setShowCompose(false)}
        />
      )}

      {/* ── Message list ── */}
      {loading && messages.length === 0 ? (
        <div
          className="px-4 py-6 rounded-xl text-center text-[10px] font-mono"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "rgba(255,255,255,0.25)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          Loading…
        </div>
      ) : fetchError ? (
        <div
          className="px-3 py-2 rounded-lg text-[10px] font-mono"
          style={{
            background: "rgba(239,83,80,0.08)",
            border: "1px solid rgba(239,83,80,0.18)",
            color: "#ef5350",
          }}
        >
          {fetchError}
        </div>
      ) : !selectedAgent ? (
        <div
          className="px-4 py-6 rounded-xl text-center text-[10px] font-mono"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "rgba(255,255,255,0.25)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          No agent selected.
        </div>
      ) : messages.length === 0 ? (
        <div
          className="px-4 py-6 rounded-xl text-center text-[10px] font-mono"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "rgba(255,255,255,0.25)",
            border: "1px dashed rgba(255,255,255,0.07)",
          }}
        >
          {unreadOnly
            ? `No unread messages for ${selectedAgentObj?.sessionName ?? selectedAgent}.`
            : `No messages for ${selectedAgentObj?.sessionName ?? selectedAgent}.`}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {messages.map((msg) => (
            <MessageCard
              key={msg.id}
              message={msg}
              expanded={expandedId === msg.id}
              onToggle={handleToggleExpand}
              onMarkRead={handleMarkRead}
            />
          ))}
        </div>
      )}

      {/* ── Footer: poll indicator ── */}
      {messages.length > 0 && (
        <div
          className="text-[9px] font-mono text-right"
          style={{ color: "rgba(255,255,255,0.18)" }}
        >
          auto-refresh every 5s
        </div>
      )}
    </section>
  );
}
