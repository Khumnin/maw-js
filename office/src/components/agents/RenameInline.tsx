import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

const MAX_NAME_LENGTH = 64;

interface RenameInlineProps {
  /** tmux target identifier (e.g. "main:0") — used in the PATCH URL */
  target: string;
  /** current display name (already processed by the parent) */
  displayName: string;
}

/**
 * RenameInline — inline rename control for an agent window name.
 *
 * Display mode: shows the name + pencil icon on hover.
 * Edit mode:    auto-focused input; Enter saves, Escape cancels.
 *
 * PATCH /api/agents/:target/name  { name }
 *
 * On success the card headline updates via the next `agents-updated` WS push.
 */
export function RenameInline({ target, displayName }: RenameInlineProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external name changes while not editing
  useEffect(() => {
    if (!editing) setValue(displayName);
  }, [displayName, editing]);

  function startEditing() {
    setValue(displayName);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setValue(displayName);
    setError(null);
  }

  async function commitRename() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Max ${MAX_NAME_LENGTH} characters`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(target)}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      toast.success("Agent renamed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Rename failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!loading) cancelEditing(); }}
          disabled={loading}
          maxLength={MAX_NAME_LENGTH}
          aria-label="Rename agent"
          aria-invalid={error != null}
          className={cn(
            "w-[96px] rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-center",
            "bg-white/10 border outline-none transition-colors",
            error
              ? "border-red-500/60 text-red-300"
              : "border-white/20 text-white focus:border-white/40",
            loading && "opacity-50"
          )}
        />
        {error && (
          <span className="text-[9px] text-red-400 max-w-[100px] text-center leading-tight">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="text-[11px] font-bold tracking-wide truncate max-w-[88px] text-center"
        // colour is inherited from parent AgentCard via inline style
      >
        {displayName}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEditing();
        }}
        aria-label={`Rename ${displayName}`}
        className={cn(
          "flex-shrink-0 rounded p-0.5 transition-opacity",
          "text-white/40 hover:text-white/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40",
          hovered ? "opacity-100" : "opacity-0"
        )}
      >
        <Pencil className="size-3" />
      </button>
    </div>
  );
}
