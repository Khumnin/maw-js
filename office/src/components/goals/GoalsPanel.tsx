import { useState, useEffect, useCallback, useRef } from "react";
import {
  TargetIcon,
  PlusIcon,
  Trash2Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  LinkIcon,
  LoaderIcon,
} from "lucide-react";
import { toast } from "sonner";
import { fetchGoals, createGoal, updateGoal, deleteGoal } from "@/lib/goals-api";
import { cn } from "@/lib/cn";
import type { Goal } from "@/lib/types";

// ── GoalCard ──────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  onMarkComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function GoalCard({ goal, onMarkComplete, onDelete }: GoalCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear confirm state after 3s if user doesn't follow through
  useEffect(() => {
    if (!confirmDelete) return;
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [confirmDelete]);

  const handleDeleteClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirmDelete) {
        setConfirmDelete(true);
        return;
      }
      setDeleting(true);
      setConfirmDelete(false);
      try {
        await onDelete(goal.id);
      } finally {
        setDeleting(false);
      }
    },
    [confirmDelete, goal.id, onDelete]
  );

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await onMarkComplete(goal.id);
    } finally {
      setCompleting(false);
    }
  }, [goal.id, onMarkComplete]);

  const chainCount = goal.linkedChainIds.length;
  const isCompleted = goal.status === "completed";

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3 transition-all"
      style={{
        background: "var(--color-bg-elevated)",
        borderColor: isCompleted
          ? "var(--color-accent-success-border)"
          : "var(--color-border-default)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div
          className="mt-0.5 w-2 h-2 rounded-full shrink-0"
          style={{
            background: isCompleted
              ? "var(--color-accent-success)"
              : "var(--color-accent-primary)",
            boxShadow: isCompleted
              ? "0 0 6px var(--color-accent-success)"
              : "0 0 6px var(--color-accent-primary)",
          }}
        />

        {/* Title */}
        <p
          className={cn(
            "flex-1 text-[12px] font-medium leading-relaxed",
            isCompleted && "line-through opacity-60"
          )}
          style={{ color: "var(--color-text-primary)" }}
        >
          {goal.title}
        </p>

        {/* Status badge */}
        <span
          className="shrink-0 text-[9px] font-mono uppercase tracking-wider rounded px-1.5 py-0.5 border"
          style={
            isCompleted
              ? {
                  background: "var(--color-accent-success-subtle)",
                  borderColor: "var(--color-accent-success-muted-border)",
                  color: "var(--color-accent-success)",
                }
              : {
                  background: "var(--color-accent-primary-subtle-sm)",
                  borderColor: "var(--color-accent-primary-border)",
                  color: "var(--color-accent-primary)",
                }
          }
        >
          {isCompleted ? "completed" : "in progress"}
        </span>
      </div>

      {/* Chain link count */}
      <div className="flex items-center gap-1.5">
        <LinkIcon
          className="size-3 shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        />
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          {chainCount === 0
            ? "No chains linked"
            : `${chainCount} chain${chainCount === 1 ? "" : "s"} linked`}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--color-border-default)" }}
        role="progressbar"
        aria-valuenow={isCompleted ? 100 : chainCount > 0 ? 50 : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Goal progress: ${isCompleted ? "completed" : "in progress"}`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: isCompleted ? "100%" : chainCount > 0 ? "50%" : "0%",
            background: isCompleted
              ? "var(--color-accent-success)"
              : "var(--color-accent-primary)",
          }}
        />
      </div>

      {/* Action row */}
      {!isCompleted && (
        <div className="flex items-center gap-2 pt-0.5">
          {/* Mark complete */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={completing}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-mono",
              "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            style={{
              background: "var(--color-accent-success-faint)",
              borderColor: "var(--color-accent-success-faint-border)",
              color: "var(--color-accent-success)",
            }}
          >
            {completing ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <CheckCircle2Icon className="size-3" />
            )}
            Mark Complete
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Delete */}
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting}
            aria-label={confirmDelete ? "Confirm delete goal" : "Delete goal"}
            className={cn(
              "flex items-center justify-center rounded-lg border w-7 h-7",
              "transition-all disabled:opacity-40 disabled:cursor-not-allowed",
              confirmDelete ? "opacity-100" : "opacity-40 hover:opacity-80"
            )}
            style={
              confirmDelete
                ? {
                    background: "var(--color-accent-danger-active)",
                    borderColor: "var(--color-accent-danger-active-border)",
                    color: "var(--color-accent-danger)",
                  }
                : {
                    background: "transparent",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-accent-danger)",
                  }
            }
          >
            {deleting ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <Trash2Icon className="size-3" />
            )}
          </button>
        </div>
      )}

      {/* Confirm hint */}
      {confirmDelete && (
        <p
          className="text-[9px] italic"
          style={{ color: "var(--color-accent-danger)" }}
        >
          Click again to confirm delete
        </p>
      )}

      {/* Completed goal — delete only */}
      {isCompleted && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting}
            aria-label={confirmDelete ? "Confirm delete goal" : "Delete goal"}
            className={cn(
              "flex items-center justify-center rounded-lg border w-7 h-7",
              "transition-all disabled:opacity-40 disabled:cursor-not-allowed",
              confirmDelete ? "opacity-100" : "opacity-40 hover:opacity-80"
            )}
            style={
              confirmDelete
                ? {
                    background: "var(--color-accent-danger-active)",
                    borderColor: "var(--color-accent-danger-active-border)",
                    color: "var(--color-accent-danger)",
                  }
                : {
                    background: "transparent",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-accent-danger)",
                  }
            }
          >
            {deleting ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <Trash2Icon className="size-3" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── CreateForm ─────────────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: (goal: Goal) => void;
}

function CreateForm({ onCreated }: CreateFormProps) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = title.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 200;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || saving) return;
      setSaving(true);
      try {
        const goal = await createGoal(trimmed);
        onCreated(goal);
        setTitle("");
        toast.success("Goal created", { description: goal.title });
        inputRef.current?.focus();
      } catch (err) {
        toast.error("Failed to create goal", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setSaving(false);
      }
    },
    [isValid, saving, trimmed, onCreated]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2"
      aria-label="Create new goal"
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New goal title…"
        maxLength={200}
        aria-label="Goal title"
        className={cn(
          "flex-1 h-9 rounded-lg border px-3 text-[12px] outline-none",
          "transition-all placeholder:opacity-40",
          "focus:ring-1 focus:ring-[var(--color-accent-primary)]"
        )}
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border-strong)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-sans)",
        }}
      />
      <button
        type="submit"
        disabled={!isValid || saving}
        className={cn(
          "flex items-center gap-1.5 h-9 rounded-lg border px-3 text-[11px] font-mono shrink-0",
          "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        style={{
          background: "var(--color-accent-primary-subtle-md)",
          borderColor: "var(--color-accent-primary-border-md)",
          color: "var(--color-accent-primary)",
        }}
      >
        {saving ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <PlusIcon className="size-3" />
        )}
        Save
      </button>
    </form>
  );
}

// ── CompletedSection ───────────────────────────────────────────────────────────

interface CompletedSectionProps {
  goals: Goal[];
  onDelete: (id: string) => Promise<void>;
}

function CompletedSection({ goals, onDelete }: CompletedSectionProps) {
  const [open, setOpen] = useState(false);

  // Completed goals cannot be marked complete again — stable no-op passed to GoalCard.
  // Declared before the early return to satisfy rules-of-hooks ordering.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noopMarkComplete = useCallback(async (_id: string) => {}, []);

  if (goals.length === 0) return null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-surface)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2Icon
            className="size-3.5"
            style={{ color: "var(--color-accent-success)" }}
          />
          <span
            className="text-[11px] font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Completed · {goals.length}
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform",
            open && "rotate-180"
          )}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: "var(--color-border-default)" }}>
          <div className="pt-3 flex flex-col gap-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onMarkComplete={noopMarkComplete}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── GoalsPanel ─────────────────────────────────────────────────────────────────

/**
 * GoalsPanel — route container for `#goals`.
 *
 * - Create form at top (title 1-200 chars, Save button)
 * - "In Progress" section with GoalCards
 * - Collapsible "Completed" section at bottom
 * - All mutations show toast feedback
 */
export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchGoals()
      .then((data) => {
        if (!cancelled) {
          setGoals(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load goals";
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Mutation helpers ──────────────────────────────────────────────────────

  const handleCreated = useCallback((goal: Goal) => {
    setGoals((prev) => [goal, ...prev]);
  }, []);

  const handleMarkComplete = useCallback(async (id: string) => {
    try {
      const updated = await updateGoal(id, { status: "completed" });
      setGoals((prev) =>
        prev.map((g) => (g.id === id ? updated : g))
      );
      toast.success("Goal completed", { description: updated.title });
    } catch (err) {
      toast.error("Failed to update goal", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteGoal(id);
      setGoals((prev) => {
        const goal = prev.find((g) => g.id === id);
        toast.success("Goal deleted", { description: goal?.title });
        return prev.filter((g) => g.id !== id);
      });
    } catch (err) {
      toast.error("Failed to delete goal", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const inProgress = goals.filter((g) => g.status === "in_progress");
  const completed = goals.filter((g) => g.status === "completed");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col gap-5 p-5 min-h-full"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Page heading */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1
            className="text-[14px] font-semibold tracking-[1.5px] uppercase"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Goals
          </h1>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {loading ? (
              "Loading…"
            ) : (
              <>
                <span style={{ color: "var(--color-accent-primary)" }}>
                  {inProgress.length}
                </span>
                {" in progress · "}
                <span style={{ color: "var(--color-accent-success)" }}>
                  {completed.length}
                </span>
                {" completed"}
              </>
            )}
          </p>
        </div>

        <TargetIcon
          className="size-5 shrink-0 mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        />
      </div>

      {/* Create form */}
      <CreateForm onCreated={handleCreated} />

      {/* Error state */}
      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-[11px] font-mono"
          style={{
            background: "var(--color-accent-danger-subtle)",
            borderColor: "var(--color-accent-danger-border)",
            color: "var(--color-accent-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-xl border h-24 animate-pulse"
              style={{
                background: "var(--color-bg-elevated)",
                borderColor: "var(--color-border-default)",
              }}
            />
          ))}
        </div>
      )}

      {/* In Progress section */}
      {!loading && (
        <div className="flex flex-col gap-3">
          <p
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            In Progress · {inProgress.length}
          </p>

          {inProgress.length === 0 ? (
            <div
              className="rounded-xl border px-4 py-8 flex flex-col items-center gap-2"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-subtle)",
              }}
            >
              <TargetIcon
                className="size-6"
                style={{ color: "var(--color-text-muted)", opacity: 0.4 }}
              />
              <p
                className="text-[11px] italic"
                style={{ color: "var(--color-text-muted)" }}
              >
                No goals in progress — add one above
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {inProgress.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onMarkComplete={handleMarkComplete}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed (collapsible) */}
      {!loading && (
        <CompletedSection goals={completed} onDelete={handleDelete} />
      )}
    </div>
  );
}
