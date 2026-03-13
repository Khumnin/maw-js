import { useState } from "react";
import { toast } from "sonner";
import { FolderSearch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AgentDefPicker } from "./AgentDefPicker";
import { DirectoryBrowser } from "./DirectoryBrowser";
import { cn } from "@/lib/cn";

/** Validation regex: starts with alphanumeric, followed by up to 62 alphanumeric/_/- chars */
const SESSION_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

interface SpawnAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SpawnPayload {
  name: string;
  workDir?: string;
  project?: string;
  agentName?: string;
  initialPrompt?: string;
}

interface FieldErrors {
  sessionName?: string;
  workDir?: string;
  project?: string;
}

/**
 * SpawnAgentDialog — modal form to spawn a new agent session.
 *
 * Fields:
 * - Session name (validated against SESSION_NAME_RE)
 * - Working directory (text input + DirectoryBrowser picker)
 * - Agent definition (AgentDefPicker dropdown)
 * - Initial prompt (optional textarea)
 *
 * On success: toasts "Spawned {name}" and closes.
 * On error: toasts the error message.
 */
export function SpawnAgentDialog({ open, onOpenChange }: SpawnAgentDialogProps) {
  const [sessionName, setSessionName] = useState("");
  const [workDir, setWorkDir] = useState("");
  const [project, setProject] = useState("");
  const [agentName, setAgentName] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!sessionName.trim()) {
      errors.sessionName = "Session name is required";
    } else if (!SESSION_NAME_RE.test(sessionName)) {
      errors.sessionName =
        "Must start with a letter or digit, and contain only a–z, A–Z, 0–9, _ or - (max 63 chars)";
    }
    if (workDir.trim()) {
      if (!workDir.trim().startsWith("/")) {
        errors.workDir = "Working directory must be an absolute path";
      } else if (workDir.includes("..")) {
        errors.workDir = "Working directory must not contain '..'";
      } else if (workDir.includes("\0")) {
        errors.workDir = "Working directory contains invalid characters";
      }
    }
    if (project.length > 64) {
      errors.project = "Project label must not exceed 64 characters";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: SpawnPayload = { name: sessionName };
      if (workDir.trim()) payload.workDir = workDir.trim();
      if (project.trim()) payload.project = project.trim();
      if (agentName) payload.agentName = agentName;
      if (initialPrompt.trim()) payload.initialPrompt = initialPrompt.trim();

      const res = await fetch("/api/agents/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      toast.success(`Spawned ${sessionName}`);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setSessionName("");
    setWorkDir("");
    setProject("");
    setAgentName("");
    setInitialPrompt("");
    setShowBrowser(false);
    setFieldErrors({});
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="dialog-panel overflow-hidden flex flex-col p-0"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-strong)",
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle
            className="text-[15px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Spawn Agent
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto px-6 pt-4 pb-6 min-h-0">
          {/* Session name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="spawn-session-name"
              className="text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Session name <span style={{ color: "var(--color-accent-danger)" }}>*</span>
            </label>
            <input
              id="spawn-session-name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={sessionName}
              onChange={(e) => {
                setSessionName(e.target.value);
                if (fieldErrors.sessionName) setFieldErrors((p) => ({ ...p, sessionName: undefined }));
              }}
              placeholder="my-agent-01"
              className={cn(
                "w-full rounded-md border px-3 py-2 text-[12px] font-mono outline-none",
                "transition-colors focus:ring-1",
                fieldErrors.sessionName
                  ? "border-red-500/60 focus:ring-red-500/40"
                  : "focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)]"
              )}
              style={{
                background: "var(--color-bg-elevated)",
                borderColor: fieldErrors.sessionName ? undefined : "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
            {fieldErrors.sessionName && (
              <p className="text-[11px]" style={{ color: "var(--color-accent-danger)" }}>
                {fieldErrors.sessionName}
              </p>
            )}
          </div>

          {/* Working directory */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="spawn-work-dir"
              className="text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Working directory
            </label>
            <div className="flex gap-1.5">
              <input
                id="spawn-work-dir"
                type="text"
                spellCheck={false}
                value={workDir}
                onChange={(e) => {
                  setWorkDir(e.target.value);
                  if (fieldErrors.workDir) setFieldErrors((p) => ({ ...p, workDir: undefined }));
                }}
                placeholder="/Users/you/project"
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-[12px] font-mono outline-none",
                  "transition-colors focus:ring-1",
                  fieldErrors.workDir
                    ? "border-red-500/60 focus:ring-red-500/40"
                    : "focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)]"
                )}
                style={{
                  background: "var(--color-bg-elevated)",
                  borderColor: fieldErrors.workDir ? undefined : "var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                type="button"
                aria-label="Browse directories"
                onClick={() => setShowBrowser((v) => !v)}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-md border shrink-0",
                  "transition-colors hover:bg-white/[0.08]",
                  showBrowser && "border-[var(--color-accent-primary)]"
                )}
                style={{
                  background: "var(--color-bg-elevated)",
                  borderColor: showBrowser ? undefined : "var(--color-border-default)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <FolderSearch size={14} />
              </button>
            </div>
            {fieldErrors.workDir && (
              <p className="text-[11px]" style={{ color: "var(--color-accent-danger)" }}>
                {fieldErrors.workDir}
              </p>
            )}
            {showBrowser && (
              <DirectoryBrowser
                initialPath={workDir || undefined}
                onSelect={(path) => {
                  setWorkDir(path);
                  setShowBrowser(false);
                }}
                onCancel={() => setShowBrowser(false)}
              />
            )}
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="spawn-project"
              className="text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Project <span className="text-[10px] opacity-50">(optional)</span>
            </label>
            <input
              id="spawn-project"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                if (fieldErrors.project) setFieldErrors((p) => ({ ...p, project: undefined }));
              }}
              placeholder="e.g. tigersoft-auth"
              maxLength={64}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-[12px] font-mono outline-none",
                "transition-colors focus:ring-1",
                fieldErrors.project
                  ? "border-red-500/60 focus:ring-red-500/40"
                  : "focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)]"
              )}
              style={{
                background: "var(--color-bg-elevated)",
                borderColor: fieldErrors.project ? undefined : "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
            {fieldErrors.project && (
              <p className="text-[11px]" style={{ color: "var(--color-accent-danger)" }}>
                {fieldErrors.project}
              </p>
            )}
          </div>

          {/* Agent definition */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Agent definition
            </label>
            <AgentDefPicker
              value={agentName}
              onChange={setAgentName}
            />
          </div>

          {/* Initial prompt */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="spawn-initial-prompt"
              className="text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Initial prompt <span className="text-[10px] opacity-50">(optional)</span>
            </label>
            <textarea
              id="spawn-initial-prompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="Describe what this agent should do…"
              rows={3}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-[12px] outline-none resize-none",
                "transition-colors focus:ring-1 focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-accent-primary)]"
              )}
              style={{
                background: "var(--color-bg-elevated)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          <DialogFooter className="pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className={cn(
                "px-4 py-2 rounded-md text-[12px] transition-colors",
                "hover:bg-white/[0.06] disabled:opacity-50"
              )}
              style={{ color: "var(--color-text-secondary)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (sessionName.length > 0 && !SESSION_NAME_RE.test(sessionName))}
              className={cn(
                "px-4 py-2 rounded-md text-[12px] font-medium transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              style={{
                background: "var(--color-accent-primary)",
                color: "var(--color-text-inverted)",
              }}
            >
              {submitting ? "Spawning…" : "Spawn Agent"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
