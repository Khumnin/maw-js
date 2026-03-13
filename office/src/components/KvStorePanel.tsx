import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KvEntry {
  key: string;
  updatedBy: string;
  updatedAt: number;
}

interface KvState {
  entries: KvEntry[];
  /** key → fetched value string (cached after first expand) */
  values: Record<string, string>;
  /** key → true while value is being fetched */
  loadingValue: Record<string, boolean>;
}

// ── Relative time helper ──────────────────────────────────────────────────────

function relTime(ts: number | undefined): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiListKeys(): Promise<KvEntry[]> {
  const res = await fetch("/api/kv");
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json() as Promise<KvEntry[]>;
}

async function apiGetValue(key: string): Promise<string> {
  const res = await fetch(`/api/kv/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Get failed: ${res.status}`);
  const raw: unknown = await res.json();
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    return String((raw as { value: unknown }).value);
  }
  return JSON.stringify(raw, null, 2);
}

async function apiPutValue(key: string, value: string, author?: string): Promise<void> {
  const body: { value: string; author?: string } = { value };
  if (author) body.author = author;
  const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Put failed: ${res.status}`);
}

async function apiDeleteKey(key: string): Promise<void> {
  const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AddKeyFormProps {
  onSave: (key: string, value: string) => Promise<void>;
  onCancel: () => void;
}

function AddKeyForm({ onSave, onCancel }: AddKeyFormProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keyRef.current?.focus();
  }, []);

  const handleSave = async () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) { setError("Key is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedKey, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2 mt-1"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(34,211,238,0.25)" }}
      onKeyDown={handleKeyDown}
    >
      <span className="text-[9px] font-mono uppercase tracking-[3px]" style={{ color: "rgba(34,211,238,0.5)" }}>
        New Entry
      </span>

      {/* Key input */}
      <input
        ref={keyRef}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="key"
        spellCheck={false}
        className="w-full px-2.5 py-1.5 rounded-lg font-mono text-[11px] outline-none"
        style={{
          background: "rgba(0,0,0,0.30)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#22d3ee",
          caretColor: "#22d3ee",
        }}
      />

      {/* Value textarea */}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value"
        rows={3}
        spellCheck={false}
        className="w-full px-2.5 py-1.5 rounded-lg font-mono text-[11px] outline-none resize-none"
        style={{
          background: "rgba(0,0,0,0.30)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.75)",
          caretColor: "rgba(255,255,255,0.75)",
        }}
      />

      {error && (
        <span className="text-[10px] font-mono" style={{ color: "#ef5350" }}>
          {error}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-[10px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all"
          style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[10px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all"
          style={{
            background: saving ? "rgba(34,211,238,0.06)" : "rgba(34,211,238,0.12)",
            border: "1px solid rgba(34,211,238,0.25)",
            color: saving ? "rgba(34,211,238,0.4)" : "#22d3ee",
          }}
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
    </div>
  );
}

// ── Inline edit form ──────────────────────────────────────────────────────────

interface EditValueFormProps {
  initial: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}

function EditValueForm({ initial, onSave, onCancel }: EditValueFormProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const len = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(len, len);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full px-2 py-1.5 rounded-lg font-mono text-[11px] outline-none resize-none"
        style={{
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(34,211,238,0.20)",
          color: "rgba(255,255,255,0.80)",
          caretColor: "rgba(255,255,255,0.80)",
        }}
      />
      {error && (
        <span className="text-[10px] font-mono" style={{ color: "#ef5350" }}>{error}</span>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer"
          style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer"
          style={{
            background: saving ? "rgba(34,211,238,0.06)" : "rgba(34,211,238,0.12)",
            border: "1px solid rgba(34,211,238,0.25)",
            color: saving ? "rgba(34,211,238,0.4)" : "#22d3ee",
          }}
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * KvStorePanel — compact utility panel that surfaces the shared Key-Value store.
 * Designed for CommandCenter's right column.
 *
 * Features:
 * - Lists all KV entries with updatedBy + relative timestamp
 * - Click to expand and view/edit the value inline
 * - Add new key/value pairs via an inline form
 * - Delete keys with a single-click confirm step
 * - Polls for new entries every 10 seconds
 */
export function KvStorePanel() {
  const [state, setState] = useState<KvState>({
    entries: [],
    values: {},
    loadingValue: {},
  });

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number>(0);

  // Keep expandedKey in a ref so poll callback doesn't go stale
  const expandedKeyRef = useRef<string | null>(null);
  expandedKeyRef.current = expandedKey;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    try {
      const entries = await apiListKeys();
      setLoadError(null);
      setLastRefreshed(Date.now());
      setState((prev) => ({ ...prev, entries }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load keys");
    }
  }, []);

  const loadValue = useCallback(async (key: string) => {
    setState((prev) => ({
      ...prev,
      loadingValue: { ...prev.loadingValue, [key]: true },
    }));
    try {
      const value = await apiGetValue(key);
      setState((prev) => ({
        ...prev,
        values: { ...prev.values, [key]: value },
        loadingValue: { ...prev.loadingValue, [key]: false },
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        values: { ...prev.values, [key]: "[error loading value]" },
        loadingValue: { ...prev.loadingValue, [key]: false },
      }));
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    loadEntries();
    const id = setInterval(loadEntries, 10_000);
    return () => clearInterval(id);
  }, [loadEntries]);

  // Load value when a key is expanded (if not already cached)
  useEffect(() => {
    if (expandedKey && !(expandedKey in state.values) && !state.loadingValue[expandedKey]) {
      loadValue(expandedKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleExpand = (key: string) => {
    setEditingKey(null);
    setConfirmDeleteKey(null);
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const handleAddKey = async (key: string, value: string) => {
    await apiPutValue(key, value);
    setShowAddForm(false);
    // Refresh list and pre-cache the value
    await loadEntries();
    setState((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
    setExpandedKey(key);
  };

  const handleSaveEdit = async (key: string, value: string) => {
    await apiPutValue(key, value);
    setEditingKey(null);
    // Update cached value immediately
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [key]: value },
    }));
    // Refresh list so updatedAt/updatedBy reflect the change
    await loadEntries();
  };

  const handleDeleteConfirm = async (key: string) => {
    try {
      await apiDeleteKey(key);
      setConfirmDeleteKey(null);
      if (expandedKey === key) setExpandedKey(null);
      if (editingKey === key) setEditingKey(null);
      setState((prev) => {
        const { [key]: _v, ...restValues } = prev.values;
        const { [key]: _l, ...restLoading } = prev.loadingValue;
        return {
          entries: prev.entries.filter((e) => e.key !== key),
          values: restValues,
          loadingValue: restLoading,
        };
      });
    } catch (e) {
      // Surface delete error briefly — re-render is safe here
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const { entries, values, loadingValue } = state;

  return (
    <section className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] tracking-[4px] font-mono uppercase"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            KV Store
          </span>
          {entries.length > 0 && (
            <span
              className="text-[9px] font-mono px-1.5 py-px rounded-full"
              style={{ background: "rgba(34,211,238,0.10)", color: "rgba(34,211,238,0.55)" }}
            >
              {entries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed > 0 && (
            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.18)" }}>
              {relTime(lastRefreshed)}
            </span>
          )}
          {!showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setExpandedKey(null);
                setEditingKey(null);
                setConfirmDeleteKey(null);
              }}
              className="text-[10px] font-mono px-2 py-0.5 rounded-lg cursor-pointer transition-all"
              style={{
                background: "rgba(34,211,238,0.10)",
                border: "1px solid rgba(34,211,238,0.20)",
                color: "rgba(34,211,238,0.70)",
              }}
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Add key form */}
      {showAddForm && (
        <AddKeyForm
          onSave={handleAddKey}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Error banner */}
      {loadError && (
        <div
          className="rounded-lg px-3 py-1.5 text-[10px] font-mono"
          style={{ background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.20)", color: "#ef5350" }}
        >
          {loadError}
        </div>
      )}

      {/* Empty state */}
      {!loadError && entries.length === 0 && !showAddForm && (
        <div
          className="rounded-xl px-3 py-4 text-center text-[10px] font-mono"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.20)" }}
        >
          no keys stored
        </div>
      )}

      {/* Key list */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) => {
            const isExpanded = expandedKey === entry.key;
            const isEditing = editingKey === entry.key;
            const isConfirmingDelete = confirmDeleteKey === entry.key;
            const cachedValue = values[entry.key];
            const isLoadingVal = loadingValue[entry.key] ?? false;

            return (
              <div
                key={entry.key}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: isExpanded
                    ? "1px solid rgba(34,211,238,0.20)"
                    : "1px solid rgba(255,255,255,0.06)",
                  transition: "border-color 0.15s",
                }}
              >
                {/* Row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                  style={isExpanded ? { borderBottom: "1px solid rgba(34,211,238,0.10)" } : undefined}
                  onClick={() => handleToggleExpand(entry.key)}
                >
                  {/* Expand chevron */}
                  <span
                    className="text-[9px] font-mono shrink-0 transition-transform"
                    style={{
                      color: "rgba(34,211,238,0.40)",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    ▶
                  </span>

                  {/* Key name */}
                  <span
                    className="font-mono text-[11px] flex-1 truncate"
                    style={{ color: "#22d3ee" }}
                    title={entry.key}
                  >
                    {entry.key}
                  </span>

                  {/* Meta — updatedBy + time */}
                  <span
                    className="text-[9px] font-mono truncate shrink-0 hidden sm:block"
                    style={{ color: "rgba(255,255,255,0.25)", maxWidth: 80 }}
                    title={entry.updatedBy}
                  >
                    {entry.updatedBy}
                  </span>
                  <span
                    className="text-[9px] font-mono shrink-0"
                    style={{ color: "rgba(255,255,255,0.20)" }}
                  >
                    {relTime(entry.updatedAt)}
                  </span>

                  {/* Delete button — stop propagation so it doesn't toggle expand */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteKey((prev) => (prev === entry.key ? null : entry.key));
                    }}
                    title="Delete key"
                    className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-all"
                    style={{
                      color: isConfirmingDelete ? "#ef5350" : "rgba(255,255,255,0.20)",
                      background: isConfirmingDelete ? "rgba(239,83,80,0.10)" : "transparent",
                      border: isConfirmingDelete ? "1px solid rgba(239,83,80,0.20)" : "1px solid transparent",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Confirm delete strip */}
                {isConfirmingDelete && (
                  <div
                    className="px-3 py-1.5 flex items-center gap-2"
                    style={{ background: "rgba(239,83,80,0.06)", borderTop: "1px solid rgba(239,83,80,0.10)" }}
                  >
                    <span className="text-[9px] font-mono flex-1" style={{ color: "rgba(239,83,80,0.70)" }}>
                      Delete &quot;{entry.key}&quot;?
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteKey(null); }}
                      className="text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer"
                      style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      keep
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(entry.key); }}
                      className="text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer"
                      style={{ color: "#ef5350", background: "rgba(239,83,80,0.12)", border: "1px solid rgba(239,83,80,0.25)" }}
                    >
                      delete
                    </button>
                  </div>
                )}

                {/* Expanded value section */}
                {isExpanded && (
                  <div className="px-3 py-2 flex flex-col gap-2">
                    {isEditing ? (
                      <EditValueForm
                        initial={cachedValue ?? ""}
                        onSave={(val) => handleSaveEdit(entry.key, val)}
                        onCancel={() => setEditingKey(null)}
                      />
                    ) : (
                      <>
                        {/* Value display */}
                        <div
                          className="rounded-lg px-2.5 py-2"
                          style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          {isLoadingVal ? (
                            <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                              loading…
                            </span>
                          ) : (
                            <pre
                              className="font-mono text-[11px] whitespace-pre-wrap break-all m-0"
                              style={{ color: "rgba(255,255,255,0.70)" }}
                            >
                              {cachedValue ?? ""}
                            </pre>
                          )}
                        </div>

                        {/* Edit button */}
                        {!isLoadingVal && (
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingKey(entry.key);
                              }}
                              className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer transition-all"
                              style={{
                                color: "rgba(167,139,250,0.70)",
                                background: "rgba(167,139,250,0.08)",
                                border: "1px solid rgba(167,139,250,0.18)",
                              }}
                            >
                              edit
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
