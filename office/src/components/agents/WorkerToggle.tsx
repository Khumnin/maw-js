import { useState } from "react";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";

interface WorkerToggleProps {
  /** tmux session name — sent as `sessionName` to the worker API */
  sessionName: string;
  /** current worker status */
  isWorker: boolean;
}

/**
 * WorkerToggle — promotes or demotes a session as a task-worker.
 *
 * POST /api/agents/worker  { sessionName, action: "add"|"remove" }
 *
 * - Pressed / active = worker enabled (rendered with amber accent)
 * - Optimistic toggle is NOT applied — state only updates on next WS push
 * - Badge state does NOT change on error (spec requirement)
 */
export function WorkerToggle({ sessionName, isWorker }: WorkerToggleProps) {
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    const action = isWorker ? "remove" : "add";
    try {
      const res = await fetch("/api/agents/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionName, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      toast.success("Worker status updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update worker status: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Toggle
      pressed={isWorker}
      onPressedChange={handleToggle}
      disabled={loading}
      size="sm"
      aria-label={isWorker ? "Remove worker role" : "Add worker role"}
      className={cn(
        "h-6 w-6 p-0 rounded-md border transition-colors",
        isWorker
          ? "border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-400"
          : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60",
        loading && "opacity-50 cursor-wait"
      )}
    >
      <Wrench className="size-3" />
    </Toggle>
  );
}
