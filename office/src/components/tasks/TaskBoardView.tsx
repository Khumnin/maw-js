import { useState, useEffect, useCallback, useRef } from "react";
import { LinkIcon, XIcon, CheckCircle2Icon, AlertCircleIcon, LoaderIcon, ClockIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { useAgents } from "@/hooks/useAgents";
import { KanbanBoard } from "./KanbanBoard";
import { TaskSubmitForm } from "./TaskSubmitForm";
import { ChainBuilderDialog } from "./ChainBuilderDialog";
import { cn } from "@/lib/cn";
import { fetchGoals, updateGoal } from "@/lib/goals-api";
import type { TaskChain, ChainStatus, Goal } from "@/lib/types";

// ── Chain status helpers ───────────────────────────────────────────────────────

function chainStatusIcon(status: ChainStatus) {
  switch (status) {
    case "running":  return <LoaderIcon className="size-3 animate-spin" />;
    case "completed": return <CheckCircle2Icon className="size-3" />;
    case "failed":   return <AlertCircleIcon className="size-3" />;
    default:         return <ClockIcon className="size-3" />;
  }
}

function chainStatusColor(status: ChainStatus): string {
  switch (status) {
    case "running":   return "var(--color-status-working)";
    case "completed": return "var(--color-accent-success)";
    case "failed":    return "var(--color-accent-danger)";
    default:          return "var(--color-status-waiting)";
  }
}

// ── useChains ──────────────────────────────────────────────────────────────────

/**
 * Maintains a live list of task chains.
 * - Fetches initial state from GET /api/chain on mount.
 * - Subscribes to `maw-ws-message` CustomEvents for live chain updates.
 */
function useChains() {
  const [chains, setChains] = useState<TaskChain[]>([]);

  const upsertChain = useCallback((chain: TaskChain) => {
    setChains((prev) => {
      const idx = prev.findIndex((c) => c.id === chain.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = chain;
        return next;
      }
      return [chain, ...prev];
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chain");
        if (!res.ok) return;
        const data = (await res.json()) as { chains?: TaskChain[] };
        if (!cancelled && Array.isArray(data.chains)) {
          setChains(data.chains);
        }
      } catch {
        // Non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // WS listener
  useEffect(() => {
    function handleEvent(e: Event) {
      const data = (e as CustomEvent<unknown>).detail;
      if (data === null || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;

      switch (msg.type) {
        case "chain-submitted":
        case "chain-created":
        case "chain-updated":
        case "chain-completed":
        case "chain-failed": {
          const chain = (msg as { chain?: TaskChain }).chain;
          if (chain) upsertChain(chain);
          break;
        }
        case "chain-cancel-result": {
          const { ok, chainId } = msg as { ok: boolean; chainId: string };
          if (ok) {
            setChains((prev) => prev.filter((c) => c.id !== chainId));
          }
          break;
        }
      }
    }

    window.addEventListener("maw-ws-message", handleEvent);
    return () => window.removeEventListener("maw-ws-message", handleEvent);
  }, [upsertChain]);

  return { chains, upsertChain };
}

// ── LinkToGoalButton ───────────────────────────────────────────────────────────

interface LinkToGoalButtonProps {
  chainId: string;
  goals: Goal[];
  linkedGoalId: string | null;
  onLinked: (goalId: string, chainId: string) => void;
}

/**
 * Small dropdown button that lets the user link a chain to a goal.
 * Shows which goal the chain is already linked to, if any.
 */
function LinkToGoalButton({ chainId, goals, linkedGoalId, onLinked }: LinkToGoalButtonProps) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const linkedGoal = goals.find((g) => g.id === linkedGoalId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleSelect = useCallback(async (goalId: string) => {
    setOpen(false);
    if (goalId === linkedGoalId) return;
    setLinking(true);
    try {
      await updateGoal(goalId, { linkChainId: chainId });
      onLinked(goalId, chainId);
      const goal = goals.find((g) => g.id === goalId);
      toast.success("Chain linked to goal", { description: goal?.title });
    } catch (err) {
      toast.error("Failed to link chain", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLinking(false);
    }
  }, [linkedGoalId, chainId, goals, onLinked]);

  const inProgressGoals = goals.filter((g) => g.status === "in_progress");

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={linkedGoal ? `Linked to goal: ${linkedGoal.title}` : "Link to goal"}
        disabled={linking}
        className={cn(
          "flex items-center justify-center rounded w-6 h-6 border flex-shrink-0",
          "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        style={
          linkedGoal
            ? {
                background: "var(--color-accent-success-chip)",
                borderColor: "var(--color-accent-success-chip-border)",
                color: "var(--color-accent-success)",
              }
            : {
                background: "transparent",
                borderColor: "var(--color-border-strong)",
                color: "var(--color-text-muted)",
              }
        }
      >
        {linking ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <TargetIcon className="size-3" />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select goal to link"
          className="absolute right-0 top-full mt-1 z-50 rounded-lg border shadow-xl overflow-hidden min-w-[200px] max-w-[280px]"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-strong)",
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 border-b"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            <p
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Link to goal
            </p>
            {linkedGoal && (
              <p
                className="text-[10px] truncate mt-0.5"
                style={{ color: "var(--color-accent-success)" }}
              >
                Currently: {linkedGoal.title}
              </p>
            )}
          </div>

          {inProgressGoals.length === 0 ? (
            <div
              className="px-3 py-4 text-center text-[10px] italic"
              style={{ color: "var(--color-text-muted)" }}
            >
              No in-progress goals
            </div>
          ) : (
            <ul className="flex flex-col py-1 max-h-48 overflow-y-auto">
              {inProgressGoals.map((goal) => {
                const isLinked = goal.id === linkedGoalId;
                return (
                  <li key={goal.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isLinked}
                      onClick={() => handleSelect(goal.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]",
                        "transition-colors hover:bg-white/[0.05]"
                      )}
                      style={{
                        color: isLinked
                          ? "var(--color-accent-success)"
                          : "var(--color-text-primary)",
                      }}
                    >
                      <TargetIcon
                        className="size-3 shrink-0"
                        style={{
                          color: isLinked
                            ? "var(--color-accent-success)"
                            : "var(--color-text-muted)",
                        }}
                      />
                      <span className="truncate">{goal.title}</span>
                      {isLinked && (
                        <CheckCircle2Icon
                          className="size-3 shrink-0 ml-auto"
                          style={{ color: "var(--color-accent-success)" }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskBoardView — route container for `#tasks`.
 *
 * Composes:
 * - TaskSubmitForm  (top — enhanced submission with affinity detection + templates)
 * - ChainBuilderDialog  (via "New Chain" button)
 * - Active chains panel (visible chains below submit form)
 * - KanbanBoard     (main — 4-column Pending/Assigned/Completed/Failed)
 *
 * Live data via useTaskQueue (WS + initial GET /api/queue).
 * Chain data via useChains (WS + initial GET /api/chain).
 * Lazy-loaded by App.tsx via React.lazy.
 */
export function TaskBoardView() {
  const queue = useTaskQueue();
  const agents = useAgents();
  const { chains, upsertChain } = useChains();
  const [chainDialogOpen, setChainDialogOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Goals data for the "Link to Goal" feature
  const [goals, setGoals] = useState<Goal[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchGoals()
      .then((g) => { if (!cancelled) setGoals(g); })
      .catch(() => {
        // Non-fatal — goals linking is a convenience feature
      });
    return () => { cancelled = true; };
  }, []);

  // Build a map of chainId → goalId for quick lookup
  const chainGoalMap = goals.reduce<Record<string, string>>((acc, goal) => {
    for (const chainId of goal.linkedChainIds) {
      acc[chainId] = goal.id;
    }
    return acc;
  }, {});

  const handleGoalLinked = useCallback((goalId: string, chainId: string) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id === goalId) {
          return {
            ...g,
            linkedChainIds: g.linkedChainIds.includes(chainId)
              ? g.linkedChainIds
              : [...g.linkedChainIds, chainId],
          };
        }
        return g;
      })
    );
  }, []);

  const totalActive = queue.pending.length + queue.assigned.length;

  // Active chains are those that are pending or running
  const activeChains = chains.filter((c) => c.status === "pending" || c.status === "running");
  const recentChains = chains.filter((c) => c.status === "completed" || c.status === "failed").slice(0, 5);
  const visibleChains = [...activeChains, ...recentChains];

  const handleCancelChain = useCallback(async (chainId: string) => {
    setCancellingId(chainId);
    try {
      const res = await fetch(`/api/chain/${chainId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Chain cancelled");
    } catch (err) {
      toast.error("Failed to cancel chain", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCancellingId(null);
    }
  }, []);

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
            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
          >
            Task Board
          </h1>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {totalActive > 0 ? (
              <>
                <span style={{ color: "var(--color-accent-primary)" }}>{totalActive}</span>
                {" active · "}
                <span style={{ color: "var(--color-status-waiting)" }}>{queue.pending.length}</span>
                {" pending · "}
                <span style={{ color: "var(--color-status-working)" }}>{queue.assigned.length}</span>
                {" assigned"}
              </>
            ) : (
              "No active tasks"
            )}
          </p>
        </div>

        {/* New Chain button */}
        <button
          type="button"
          onClick={() => setChainDialogOpen(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-mono",
            "transition-all hover:opacity-90"
          )}
          style={{
            background: "var(--color-accent-primary-subtle-sm)",
            borderColor: "var(--color-accent-primary-border)",
            color: "var(--color-accent-primary)",
          }}
        >
          <LinkIcon className="size-3.5" />
          New Chain
        </button>
      </div>

      {/* Submission form */}
      <TaskSubmitForm agents={agents} />

      {/* Active chains panel */}
      {visibleChains.length > 0 && (
        <div
          className="rounded-xl border p-4 flex flex-col gap-3"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <p
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Chains · {activeChains.length} active
          </p>
          <div className="flex flex-col gap-2">
            {visibleChains.map((chain) => (
              <div
                key={chain.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
                style={{
                  background: "var(--color-bg-elevated)",
                  borderColor: "var(--color-border-default)",
                }}
              >
                {/* Status icon */}
                <span style={{ color: chainStatusColor(chain.status) }}>
                  {chainStatusIcon(chain.status)}
                </span>

                {/* Name + progress */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[11px] font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {chain.name}
                  </p>
                  <p
                    className="text-[10px] font-mono"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    step {chain.currentStep + 1} / {chain.steps.length}
                    {" · "}
                    <span style={{ color: chainStatusColor(chain.status) }}>
                      {chain.status}
                    </span>
                  </p>
                </div>

                {/* Step progress bar */}
                <div
                  className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                  style={{ background: "var(--color-border-default)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(((chain.currentStep) / chain.steps.length) * 100)}%`,
                      background: chainStatusColor(chain.status),
                    }}
                  />
                </div>

                {/* Link to Goal button */}
                <LinkToGoalButton
                  chainId={chain.id}
                  goals={goals}
                  linkedGoalId={chainGoalMap[chain.id] ?? null}
                  onLinked={handleGoalLinked}
                />

                {/* Cancel button (active chains only) */}
                {(chain.status === "pending" || chain.status === "running") && (
                  <button
                    type="button"
                    onClick={() => handleCancelChain(chain.id)}
                    disabled={cancellingId === chain.id}
                    aria-label={`Cancel chain "${chain.name}"`}
                    className={cn(
                      "flex items-center justify-center rounded w-6 h-6 border flex-shrink-0",
                      "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    style={{
                      background: "transparent",
                      borderColor: "var(--color-accent-danger-border)",
                      color: "var(--color-accent-danger)",
                    }}
                  >
                    {cancellingId === chain.id ? (
                      <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                    ) : (
                      <XIcon className="size-3" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex-1">
        <p
          className="text-[11px] font-medium uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Queue
        </p>
        <KanbanBoard queue={queue} />
      </div>

      {/* Chain builder dialog */}
      <ChainBuilderDialog
        open={chainDialogOpen}
        onOpenChange={setChainDialogOpen}
        onChainCreated={upsertChain}
      />
    </div>
  );
}
