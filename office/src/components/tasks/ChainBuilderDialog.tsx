import { useState, useCallback } from "react";
import { PlusIcon, Trash2Icon, ChevronUpIcon, ChevronDownIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { TaskChain, TaskPriority } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChainStep {
  /** Local UI key — not sent to backend */
  key: string;
  command: string;
}

interface ChainBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a chain is successfully submitted */
  onChainCreated?: (chain: TaskChain) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(): ChainStep {
  return { key: crypto.randomUUID(), command: "" };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ChainBuilderDialog — create and submit a multi-step task chain.
 *
 * Features:
 * - Chain name input (required)
 * - Dynamic step list with textarea per step
 * - Up / Down reorder buttons (no drag-and-drop)
 * - Remove button per step
 * - Add Step button
 * - Priority select (High / Normal / Low)
 * - Submit disabled when 0 steps or name is empty
 * - Posts to POST /api/chain/submit
 */
export function ChainBuilderDialog({ open, onOpenChange, onChainCreated }: ChainBuilderDialogProps) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<ChainStep[]>([makeStep()]);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [submitting, setSubmitting] = useState(false);

  // ── Step mutations ──────────────────────────────────────────────────────────

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, makeStep()]);
  }, []);

  const removeStep = useCallback((key: string) => {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const updateStep = useCallback((key: string, command: string) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, command } : s)));
  }, []);

  const moveStep = useCallback((key: string, direction: -1 | 1) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return prev;
      const next = idx + direction;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }, []);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setName("");
    setSteps([makeStep()]);
    setPriority("normal");
  }, []);

  const handleClose = useCallback(() => {
    if (!submitting) {
      resetForm();
      onOpenChange(false);
    }
  }, [submitting, resetForm, onOpenChange]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName || steps.length === 0) return;

    const validSteps = steps.filter((s) => s.command.trim());
    if (validSteps.length === 0) {
      toast.error("Add at least one step with content");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/chain/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          steps: validSteps.map((s) => ({ prompt: s.command.trim() })),
          priority,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { ok: boolean; chain: TaskChain };
      toast.success("Chain submitted", {
        description: `"${trimmedName}" — ${validSteps.length} step${validSteps.length !== 1 ? "s" : ""}`,
      });
      onChainCreated?.(data.chain);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to submit chain", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, steps, priority, onChainCreated, resetForm, onOpenChange]);

  // ── Validation ──────────────────────────────────────────────────────────────

  const hasValidName = name.trim().length > 0;
  const hasSteps = steps.length > 0;
  const hasValidSteps = steps.some((s) => s.command.trim().length > 0);
  const canSubmit = hasValidName && hasSteps && hasValidSteps && !submitting;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-strong)",
          color: "var(--color-text-primary)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 text-[13px] font-semibold tracking-[1px] uppercase"
            style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
          >
            <LinkIcon className="size-3.5" style={{ color: "var(--color-accent-primary)" }} />
            New Task Chain
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex flex-col gap-5 overflow-y-auto flex-1 pr-1">

          {/* Chain name + priority */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="chain-name"
                className="text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Chain name <span style={{ color: "var(--color-accent-danger)" }}>*</span>
              </label>
              <input
                id="chain-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Deploy + smoke test"
                disabled={submitting}
                className={cn(
                  "w-full rounded-lg border px-3 py-1.5 text-[11px] font-mono h-8",
                  "placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2",
                  "focus:ring-cyan-500/30 transition-[box-shadow,border-color]"
                )}
                style={{
                  background: "var(--color-bg-elevated)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Priority
              </label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
                disabled={submitting}
              >
                <SelectTrigger
                  className="h-8 text-[11px] font-mono w-full"
                  style={{
                    background: "var(--color-bg-elevated)",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high" className="text-[11px] font-mono">High</SelectItem>
                  <SelectItem value="normal" className="text-[11px] font-mono">Normal</SelectItem>
                  <SelectItem value="low" className="text-[11px] font-mono">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] font-medium uppercase tracking-widest"
                style={{ color: "var(--color-text-muted)" }}
              >
                Steps ({steps.length})
              </span>
              <button
                type="button"
                onClick={addStep}
                disabled={submitting}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-mono border",
                  "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                )}
                style={{
                  background: "var(--color-accent-primary-subtle)",
                  borderColor: "var(--color-accent-primary-border)",
                  color: "var(--color-accent-primary)",
                }}
              >
                <PlusIcon className="size-3" />
                Add Step
              </button>
            </div>

            {steps.length === 0 && (
              <p
                className="text-[11px] italic py-4 text-center"
                style={{ color: "var(--color-accent-danger)" }}
              >
                Add at least one step
              </p>
            )}

            <div className="flex flex-col gap-2">
              {steps.map((step, idx) => (
                <div
                  key={step.key}
                  className="flex gap-2 items-start rounded-lg border p-3"
                  style={{
                    background: "var(--color-bg-elevated)",
                    borderColor: "var(--color-border-default)",
                  }}
                >
                  {/* Step number */}
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold mt-0.5"
                    style={{
                      background: "var(--color-accent-primary-subtle-md)",
                      color: "var(--color-accent-primary)",
                      border: "1px solid var(--color-accent-primary-border)",
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={step.command}
                    onChange={(e) => updateStep(step.key, e.target.value)}
                    placeholder={`Step ${idx + 1} prompt…`}
                    rows={3}
                    disabled={submitting}
                    className={cn(
                      "flex-1 resize-y rounded-md border px-2.5 py-1.5 text-[11px] font-mono leading-relaxed",
                      "placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1",
                      "focus:ring-cyan-500/30 transition-[box-shadow,border-color]"
                    )}
                    style={{
                      background: "var(--color-bg-base)",
                      borderColor: "var(--color-border-subtle)",
                      color: "var(--color-text-primary)",
                      minHeight: "72px",
                    }}
                  />

                  {/* Controls: up / down / remove */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => moveStep(step.key, -1)}
                      disabled={submitting || idx === 0}
                      aria-label="Move step up"
                      className={cn(
                        "flex items-center justify-center rounded w-6 h-6 border transition-all",
                        "hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
                      )}
                      style={{
                        background: "transparent",
                        borderColor: "var(--color-border-default)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <ChevronUpIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(step.key, 1)}
                      disabled={submitting || idx === steps.length - 1}
                      aria-label="Move step down"
                      className={cn(
                        "flex items-center justify-center rounded w-6 h-6 border transition-all",
                        "hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
                      )}
                      style={{
                        background: "transparent",
                        borderColor: "var(--color-border-default)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <ChevronDownIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(step.key)}
                      disabled={submitting}
                      aria-label="Remove step"
                      className={cn(
                        "flex items-center justify-center rounded w-6 h-6 border transition-all",
                        "hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
                      )}
                      style={{
                        background: "transparent",
                        borderColor: "var(--color-accent-danger-border)",
                        color: "var(--color-accent-danger)",
                      }}
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 pt-3 border-t" style={{ borderColor: "var(--color-border-default)" }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border",
              "transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            style={{
              background: "transparent",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border",
              "transition-all",
              canSubmit ? "hover:opacity-90 cursor-pointer" : "opacity-40 cursor-not-allowed"
            )}
            style={
              canSubmit
                ? {
                    background: "var(--color-accent-primary)",
                    borderColor: "var(--color-accent-primary)",
                    color: "var(--color-text-inverted)",
                  }
                : {
                    background: "transparent",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-muted)",
                  }
            }
          >
            {submitting ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <LinkIcon className="size-3" />
                Submit Chain
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
