import { useState, useEffect, useRef } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

const MAX_PROJECT_LENGTH = 64;

interface ProjectInlineProps {
  /** tmux target identifier (e.g. "main:0") — used in the PATCH URL */
  target: string;
  /** current project label (null = unassigned) */
  projectLabel: string | null;
}

/**
 * ProjectInline — inline project-assignment control for an agent.
 *
 * Display mode: shows the project label (or "—" if unset) + folder icon on hover.
 * Edit mode:    auto-focused input; Enter saves, Escape cancels.
 *
 * PATCH /api/agents/:target/project  { project }
 *
 * On success the agent state updates via the next `agents-updated` WS push.
 */
export function ProjectInline({ target, projectLabel }: ProjectInlineProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(projectLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);

  // Sync external label changes while not editing
  useEffect(() => {
    if (!editing) setValue(projectLabel ?? "");
  }, [projectLabel, editing]);

  function startEditing() {
    setValue(projectLabel ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setValue(projectLabel ?? "");
    setError(null);
  }

  async function commitProject() {
    const trimmed = value.trim();
    if (trimmed.length > MAX_PROJECT_LENGTH) {
      setError(`Max ${MAX_PROJECT_LENGTH} characters`);
      return;
    }
    setError(null);
    savingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(target)}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      toast.success(trimmed ? `Project set to "${trimmed}"` : "Project label cleared");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to set project: ${msg}`);
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitProject();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  const displayLabel = projectLabel ?? "—";

  if (editing) {
    return (
      <div className="flex flex-col items-start gap-0.5 w-full">
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!savingRef.current) cancelEditing(); }}
          disabled={loading}
          maxLength={MAX_PROJECT_LENGTH}
          placeholder="project name…"
          aria-label="Set project label"
          aria-invalid={error != null}
          className={cn(
            "w-full rounded px-1.5 py-0.5 text-xs",
            "bg-white/10 border outline-none transition-colors",
            error
              ? "border-red-500/60 text-red-300"
              : "border-white/20 text-white focus:border-white/40",
            loading && "opacity-50"
          )}
        />
        {error && (
          <span className="text-[9px] text-red-400 leading-tight">{error}</span>
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
      <span className={cn("text-xs truncate", !projectLabel && "text-white/40")}>
        {displayLabel}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEditing();
        }}
        aria-label={projectLabel ? `Change project (${projectLabel})` : "Assign project"}
        className={cn(
          "flex-shrink-0 rounded p-0.5 transition-opacity",
          "text-white/40 hover:text-white/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40",
          hovered ? "opacity-100" : "opacity-0"
        )}
      >
        <FolderOpen className="size-3" />
      </button>
    </div>
  );
}
