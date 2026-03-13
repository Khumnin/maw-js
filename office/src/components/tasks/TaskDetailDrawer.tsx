import { XIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { hour12: false });
}

function relTime(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  high:   { label: "High",   className: "bg-red-500/15 text-red-400 border-red-500/25" },
  normal: { label: "Normal", className: "bg-gray-500/15 text-gray-300 border-gray-500/25" },
  low:    { label: "Low",    className: "bg-gray-500/10 text-gray-500 border-gray-500/15" },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  assigned:  { label: "Assigned",  className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-400 border-green-500/20" },
  failed:    { label: "Failed",    className: "bg-red-500/15 text-red-400 border-red-500/20" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskDetailDrawer — slides in from the right to display all task metadata.
 *
 * Shows: full command, status/priority, timestamps, assigned agent,
 * dispatch reason, affinity details, retry info, and raw output.
 */
export function TaskDetailDrawer({ task, open, onClose }: TaskDetailDrawerProps) {
  const priorityCfg = task ? PRIORITY_CONFIG[task.priority] : null;
  const statusCfg = task ? STATUS_CONFIG[task.status] : null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] overflow-y-auto border-l flex flex-col gap-0 p-0"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border-default)",
        }}
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader
          className="p-5 border-b shrink-0"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle
                className="text-[13px] font-semibold font-mono"
                style={{ color: "var(--color-text-primary)" }}
              >
                Task Details
              </SheetTitle>
              <SheetDescription
                className="text-[11px] font-mono mt-0.5 truncate"
                style={{ color: "var(--color-text-muted)" }}
              >
                {task?.id ?? "—"}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {priorityCfg && (
                <Badge variant="outline" className={["text-[10px] font-mono", priorityCfg.className].join(" ")}>
                  {priorityCfg.label}
                </Badge>
              )}
              {statusCfg && (
                <Badge variant="outline" className={["text-[10px] font-mono", statusCfg.className].join(" ")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current mr-1" />
                  {statusCfg.label}
                </Badge>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 transition-colors hover:bg-white/[0.08]"
                aria-label="Close task details"
                style={{ color: "var(--color-text-muted)" }}
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        {task ? (
          <div className="flex flex-col gap-5 p-5">

            {/* Command */}
            <TaskSection title="Command">
              <pre
                className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed p-3 rounded-md"
                style={{
                  background: "var(--color-bg-base)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                {task.command}
              </pre>
            </TaskSection>

            {/* Timing */}
            <TaskSection title="Timing">
              <FieldRow label="Created" value={fmtTs(task.createdAt)} />
              <FieldRow label="Age" value={relTime(task.createdAt)} />
              {task.assignedAt && <FieldRow label="Assigned" value={fmtTs(task.assignedAt)} />}
              {task.completedAt && <FieldRow label="Completed" value={fmtTs(task.completedAt)} />}
              <FieldRow label="Timeout" value={`${Math.round(task.timeout / 1000)}s`} />
            </TaskSection>

            {/* Assignment */}
            {(task.assignedTo || task.assignedToName) && (
              <TaskSection title="Assignment">
                {task.assignedToName && (
                  <FieldRow label="Agent session" value={task.assignedToName} mono />
                )}
                {task.assignedTo && (
                  <FieldRow label="Agent target" value={task.assignedTo} mono />
                )}
              </TaskSection>
            )}

            {/* Dispatch reason */}
            {task.dispatchReason && (
              <TaskSection title="Dispatch Reason">
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {task.dispatchReason}
                </p>
              </TaskSection>
            )}

            {/* Affinity */}
            {task.affinity && (
              <TaskSection title="Affinity">
                {task.affinity.tags && task.affinity.tags.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {task.affinity.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] font-mono bg-violet-500/10 text-violet-400 border-violet-500/20"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {task.affinity.projectName && (
                  <FieldRow label="Project" value={task.affinity.projectName} mono />
                )}
                {task.affinity.preferAgent && (
                  <FieldRow label="Preferred agent" value={task.affinity.preferAgent} mono />
                )}
                {task.affinity.filePaths && task.affinity.filePaths.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Related files
                    </span>
                    {task.affinity.filePaths.map((p) => (
                      <span
                        key={p}
                        className="text-[10px] font-mono truncate"
                        style={{ color: "var(--color-text-secondary)" }}
                        title={p}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </TaskSection>
            )}

            {/* Chain info */}
            {task.chainId && (
              <TaskSection title="Chain">
                <FieldRow label="Chain ID" value={task.chainId} mono />
                {task.chainIndex !== undefined && (
                  <FieldRow label="Step index" value={String(task.chainIndex)} />
                )}
              </TaskSection>
            )}

            {/* Retries */}
            <TaskSection title="Retries">
              <FieldRow label="Retry count" value={String(task.retryCount)} />
              <FieldRow label="Max retries" value={String(task.maxRetries)} />
            </TaskSection>

            {/* Output */}
            <TaskSection title="Output">
              {task.output ? (
                <div
                  className="rounded-md overflow-auto"
                  style={{
                    background: "var(--color-bg-base)",
                    border: "1px solid var(--color-border-default)",
                    maxHeight: "320px",
                  }}
                >
                  <pre
                    className="p-3 text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {task.output}
                  </pre>
                </div>
              ) : (
                <p
                  className="text-[11px] italic"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {task.status === "pending"
                    ? "No output yet — task is pending"
                    : "No output captured"}
                </p>
              )}
            </TaskSection>
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center text-[12px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            No task selected
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TaskSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-[9px] font-medium uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </p>
      <div
        className="rounded-lg border px-3 py-2.5 flex flex-col gap-2"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[10px] shrink-0"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        className={["text-[11px] truncate text-right", mono ? "font-mono" : ""].join(" ")}
        style={{ color: "var(--color-text-secondary)" }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
