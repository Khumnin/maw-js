import { useCallback } from "react";
import { FileIcon, FolderIcon, ClockIcon, CpuIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { TrackedAgent } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { hour12: false });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentDetailDrawerProps {
  /** The agent to display. Pass null to close the drawer. */
  agent: TrackedAgent | null;
  /** Controls open state — caller manages so parent can close from outside */
  open: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * AgentDetailDrawer — slides in from the right to show deep agent context.
 *
 * Displays: session/window names, status, working directory, detected stack,
 * recent files (clickable via POST /api/open-file), project name, last activity,
 * and current task ID if assigned.
 */
export function AgentDetailDrawer({ agent, open, onClose }: AgentDetailDrawerProps) {
  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/open-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("File opened", { description: path });
    } catch {
      toast.error("Failed to open file", { description: path });
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] overflow-y-auto border-l flex flex-col gap-0 p-0"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border-default)",
        }}
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader className="p-5 border-b" style={{ borderColor: "var(--color-border-default)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle
                className="text-[13px] font-semibold font-mono truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {agent?.windowName ?? "Agent"}
              </SheetTitle>
              <SheetDescription
                className="text-[11px] font-mono mt-0.5 truncate"
                style={{ color: "var(--color-text-muted)" }}
              >
                {agent?.sessionName ?? "—"} · {agent?.target ?? "—"}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {agent && <StatusBadge status={agent.status} />}
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 transition-colors hover:bg-white/[0.08]"
                aria-label="Close agent details"
                style={{ color: "var(--color-text-muted)" }}
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        {agent ? (
          <div className="flex flex-col gap-5 p-5 flex-1">

            {/* Identity */}
            <Section title="Identity">
              <Field label="Session" value={agent.sessionName} mono />
              <Field label="Window" value={agent.windowName} mono />
              <Field label="Target" value={agent.target} mono />
              <Field label="Worker" value={agent.isWorker ? "Yes" : "No"} />
            </Section>

            {/* Activity */}
            <Section title="Activity">
              <Field
                label="Last activity"
                value={relTime(agent.lastActivityAt)}
                icon={<ClockIcon className="size-3" />}
              />
              <Field
                label="Last active at"
                value={fmtTimestamp(agent.lastActivityAt)}
              />
              {agent.currentTaskId && (
                <Field
                  label="Current task"
                  value={agent.currentTaskId}
                  mono
                  icon={<CpuIcon className="size-3" />}
                />
              )}
            </Section>

            {/* Context */}
            {agent.context && (
              <>
                <Section title="Context">
                  {agent.context.projectName && (
                    <Field
                      label="Project"
                      value={agent.context.projectName}
                      mono
                    />
                  )}
                  {agent.context.workingDir && (
                    <Field
                      label="Working dir"
                      value={agent.context.workingDir}
                      mono
                      icon={<FolderIcon className="size-3" />}
                    />
                  )}
                </Section>

                {/* Detected stack */}
                {agent.context.detectedStack.length > 0 && (
                  <Section title="Detected Stack">
                    <div className="flex flex-wrap gap-1.5">
                      {agent.context.detectedStack.map((tech) => (
                        <Badge
                          key={tech}
                          variant="outline"
                          className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        >
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Tags */}
                {agent.context.tags.length > 0 && (
                  <Section title="Affinity Tags">
                    <div className="flex flex-wrap gap-1.5">
                      {agent.context.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] font-mono bg-violet-500/10 text-violet-400 border-violet-500/20"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Recent files */}
                {agent.context.recentFiles.length > 0 && (
                  <Section title="Recent Files">
                    <ul className="flex flex-col gap-0.5">
                      {agent.context.recentFiles.slice(0, 10).map((path) => (
                        <li key={path}>
                          <button
                            type="button"
                            onClick={() => handleOpenFile(path)}
                            title={`Open ${path}`}
                            className="flex items-center gap-2 w-full text-left rounded px-2 py-1 transition-colors hover:bg-white/[0.06] group"
                          >
                            <FileIcon
                              className="size-3 shrink-0 transition-colors"
                              style={{ color: "var(--color-accent-primary)" }}
                            />
                            <span
                              className="text-[11px] font-mono truncate group-hover:text-white transition-colors"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {path}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}

            {/* Headline preview */}
            {agent.headline && (
              <Section title="Last Output">
                <p
                  className="text-[11px] font-mono break-all leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {agent.headline}
                </p>
              </Section>
            )}
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center text-[12px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            No agent selected
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}

function Field({ label, value, mono, icon }: FieldProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[10px] shrink-0"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        className={[
          "text-[11px] truncate text-right flex items-center gap-1",
          mono ? "font-mono" : "",
        ].join(" ")}
        style={{ color: "var(--color-text-secondary)" }}
        title={value}
      >
        {icon && (
          <span style={{ color: "var(--color-accent-primary)" }}>{icon}</span>
        )}
        {value}
      </span>
    </div>
  );
}
