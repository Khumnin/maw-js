import { useState, useCallback, useEffect } from "react";
import { SendIcon, XIcon, PlusIcon, BookmarkPlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { TrackedAgent, TaskPriority } from "@/lib/types";
import { saveTemplate } from "@/lib/task-templates";
import type { TaskTemplate } from "@/lib/task-templates";
import { TaskTemplatesPicker } from "./TaskTemplatesPicker";

// ── Auto-detect affinity tags ─────────────────────────────────────────────────

const AFFINITY_RULES: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(deploy|kubernetes|docker|nginx|helm|k8s|ingress|ecr|eks|infra|devops|terraform|ansible|ci|pipeline)\b/i, tag: "infra" },
  { re: /\b(react|css|component|frontend|ui|tailwind|vue|svelte|html|tsx?|jsx?|nextjs|next\.js|vite|style)\b/i, tag: "frontend" },
  { re: /\b(api|database|migration|backend|go|grpc|rest|endpoint|db|sql|model|repository|server|query)\b/i, tag: "backend" },
];

const ALL_TAGS = ["backend", "frontend", "infra"] as const;
type AffinityTag = (typeof ALL_TAGS)[number];

function detectTags(command: string): Set<AffinityTag> {
  const detected = new Set<AffinityTag>();
  for (const { re, tag } of AFFINITY_RULES) {
    if (re.test(command)) detected.add(tag as AffinityTag);
  }
  return detected;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskSubmitFormProps {
  agents: TrackedAgent[];
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskSubmitForm — enhanced task submission with:
 * - Multi-line command textarea
 * - Priority select (High / Normal / Low)
 * - Affinity tag chips (auto-detected + manual)
 * - Project name input
 * - Preferred agent select (from live agents list)
 * - Auto-detects infra/frontend/backend from command text
 *
 * Submits to POST /api/queue/submit
 */
export function TaskSubmitForm({ agents }: TaskSubmitFormProps) {
  const [command, setCommand] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [tags, setTags] = useState<Set<AffinityTag>>(new Set());
  const [projectName, setProjectName] = useState("");
  const [preferAgent, setPreferAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── Auto-detect tags from command ─────────────────────────────────────────

  useEffect(() => {
    if (!command.trim()) {
      setTags(new Set());
      return;
    }
    const detected = detectTags(command);
    setTags((prev) => {
      // Only add auto-detected tags — do not remove manually added ones
      const merged = new Set(prev);
      detected.forEach((t) => merged.add(t));
      return merged;
    });
  }, [command]);

  const toggleTag = useCallback((tag: AffinityTag) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = command.trim();
      if (!trimmed) return;

      setSubmitting(true);
      try {
        const affinity: {
          tags?: string[];
          projectName?: string;
          preferAgent?: string;
        } = {};

        if (tags.size > 0) affinity.tags = Array.from(tags);
        if (projectName.trim()) affinity.projectName = projectName.trim();
        if (preferAgent) affinity.preferAgent = preferAgent;

        const body: {
          command: string;
          priority: TaskPriority;
          affinity?: typeof affinity;
        } = { command: trimmed, priority };

        if (Object.keys(affinity).length > 0) body.affinity = affinity;

        const res = await fetch("/api/queue/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        toast.success("Task submitted", { description: trimmed.slice(0, 60) });

        // Reset form
        setCommand("");
        setPriority("normal");
        setTags(new Set());
        setProjectName("");
        setPreferAgent("");
      } catch (err) {
        toast.error("Failed to submit task", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [command, priority, tags, projectName, preferAgent]
  );

  // ── Template integration ─────────────────────────────────────────────────

  /** Populate form fields from a saved template */
  const handleLoadTemplate = useCallback((template: TaskTemplate) => {
    setCommand(template.command);
    if (template.affinity?.tags) {
      const validTags = template.affinity.tags.filter((t): t is AffinityTag =>
        (ALL_TAGS as readonly string[]).includes(t)
      );
      setTags(new Set(validTags));
    }
    if (template.affinity?.projectName) setProjectName(template.affinity.projectName);
    if (template.affinity?.preferAgent) setPreferAgent(template.affinity.preferAgent);
  }, []);

  /** Prompt for a name and save the current form state as a template */
  const handleSaveAsTemplate = useCallback(() => {
    const trimmed = command.trim();
    if (!trimmed) {
      toast.error("Enter a command before saving as template");
      return;
    }
    const templateName = window.prompt("Template name:");
    if (!templateName?.trim()) return;

    setSavingTemplate(true);
    try {
      const affinity: TaskTemplate["affinity"] = {};
      if (tags.size > 0) affinity.tags = Array.from(tags);
      if (projectName.trim()) affinity.projectName = projectName.trim();
      if (preferAgent) affinity.preferAgent = preferAgent;

      saveTemplate({
        name: templateName.trim(),
        command: trimmed,
        affinity: Object.keys(affinity).length > 0 ? affinity : undefined,
      });
      toast.success("Template saved", { description: templateName.trim() });
    } catch (err) {
      toast.error("Failed to save template", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingTemplate(false);
    }
  }, [command, tags, projectName, preferAgent]);

  const canSubmit = command.trim().length > 0 && !submitting;

  // Worker agents only (isWorker = true) shown in preferred agent list
  const workerAgents = agents.filter((a) => a.isWorker);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Section heading + template controls */}
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[10px] font-medium uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Submit Task
        </p>
        <div className="flex items-center gap-2">
          <TaskTemplatesPicker onSelect={handleLoadTemplate} />
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            disabled={!command.trim() || savingTemplate}
            aria-label="Save as template"
            title="Save as template"
            className={cn(
              "flex items-center gap-1.5 h-8 rounded-lg border px-2.5 text-[10px] font-mono",
              "transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            )}
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
          >
            <BookmarkPlusIcon className="size-3" />
            Save
          </button>
        </div>
      </div>

      {/* Command */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="task-command"
          className="text-[10px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Command <span style={{ color: "var(--color-accent-danger)" }}>*</span>
        </label>
        <textarea
          id="task-command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command or instructions for the agent…"
          rows={4}
          className={cn(
            "w-full resize-y rounded-lg border px-3 py-2 text-[11px] font-mono leading-relaxed",
            "placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2",
            "focus:ring-cyan-500/30 transition-[box-shadow,border-color]"
          )}
          style={{
            background: "var(--color-bg-elevated)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
            minHeight: "96px",
          }}
          disabled={submitting}
        />
      </div>

      {/* Row: Priority + Preferred agent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <SelectItem value="high" className="text-[11px] font-mono">
                High
              </SelectItem>
              <SelectItem value="normal" className="text-[11px] font-mono">
                Normal
              </SelectItem>
              <SelectItem value="low" className="text-[11px] font-mono">
                Low
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Preferred agent */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Preferred agent
          </label>
          <Select
            value={preferAgent}
            onValueChange={setPreferAgent}
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
              <SelectValue placeholder="Any worker" />
            </SelectTrigger>
            <SelectContent>
              {workerAgents.length === 0 ? (
                <div
                  className="px-3 py-2 text-[10px] italic"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No workers online
                </div>
              ) : (
                workerAgents.map((a) => (
                  <SelectItem
                    key={a.target}
                    value={a.target}
                    className="text-[11px] font-mono"
                  >
                    {a.sessionName || a.windowName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="task-project"
          className="text-[10px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Project name
          <span
            className="ml-1 italic"
            style={{ color: "var(--color-text-muted)", opacity: 0.6 }}
          >
            optional
          </span>
        </label>
        <input
          id="task-project"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. maw-js, auth-admin-ui"
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
          disabled={submitting}
        />
      </div>

      {/* Affinity tags */}
      <div className="flex flex-col gap-2">
        <span
          className="text-[10px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Affinity tags
          {command.trim() && tags.size > 0 && (
            <span
              className="ml-1 italic"
              style={{ color: "var(--color-accent-primary)", opacity: 0.8 }}
            >
              auto-detected
            </span>
          )}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TAGS.map((tag) => {
            const active = tags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                disabled={submitting}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono border transition-all"
                style={
                  active
                    ? {
                        background: `var(--color-tag-${tag}-subtle)`,
                        borderColor: `var(--color-tag-${tag}-border)`,
                        color: `var(--color-tag-${tag})`,
                      }
                    : {
                        background: "transparent",
                        borderColor: "var(--color-border-default)",
                        color: "var(--color-text-muted)",
                      }
                }
              >
                {active ? (
                  <XIcon className="size-2.5" />
                ) : (
                  <PlusIcon className="size-2.5" />
                )}
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current tags chips (active summary) */}
      {tags.size > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from(tags).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[9px] font-mono"
              style={{
                background: `var(--color-tag-${tag}-muted)`,
                borderColor: `var(--color-tag-${tag}-muted-border)`,
                color: `var(--color-tag-${tag})`,
              }}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "flex items-center justify-center gap-2 w-full rounded-lg py-2 text-[11px] font-medium",
          "transition-all border",
          canSubmit
            ? "hover:opacity-90 cursor-pointer"
            : "opacity-40 cursor-not-allowed"
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
            <span
              className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
            />
            Submitting…
          </>
        ) : (
          <>
            <SendIcon className="size-3" />
            Submit Task
          </>
        )}
      </button>
    </form>
  );
}
