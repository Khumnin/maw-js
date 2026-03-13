import { useState, useCallback, useRef, useEffect } from "react";
import { BookmarkIcon, Trash2Icon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { getTemplates, deleteTemplate } from "@/lib/task-templates";
import type { TaskTemplate } from "@/lib/task-templates";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskTemplatesPickerProps {
  /** Called when the user selects a template — caller populates the form */
  onSelect: (template: TaskTemplate) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TaskTemplatesPicker — dropdown list of saved task templates.
 *
 * - Click a template → fires onSelect (caller populates TaskSubmitForm)
 * - Delete button per template (with inline confirmation)
 * - "No templates saved" empty state
 * - Dropdown closes on outside click / Escape
 */
export function TaskTemplatesPicker({ onSelect }: TaskTemplatesPickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reload templates whenever dropdown opens
  const loadTemplates = useCallback(() => {
    setTemplates(getTemplates());
  }, []);

  const handleOpen = useCallback(() => {
    loadTemplates();
    setOpen(true);
    setConfirmDeleteId(null);
  }, [loadTemplates]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setConfirmDeleteId(null);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  // ── Delete handling ────────────────────────────────────────────────────────

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      // Second click — confirm
      deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
      toast.success("Template deleted");
    } else {
      setConfirmDeleteId(id);
    }
  }, [confirmDeleteId]);

  // ── Select handling ────────────────────────────────────────────────────────

  const handleSelect = useCallback((template: TaskTemplate) => {
    onSelect(template);
    handleClose();
    toast.success("Template loaded", { description: template.name });
  }, [onSelect, handleClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={open ? handleClose : handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 h-8 rounded-lg border px-2.5 text-[10px] font-mono",
          "transition-all hover:opacity-90"
        )}
        style={{
          background: open ? "var(--color-accent-primary-subtle)" : "var(--color-bg-elevated)",
          borderColor: open ? "var(--color-accent-primary-border-md)" : "var(--color-border-default)",
          color: open ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
        }}
      >
        <BookmarkIcon className="size-3" />
        Templates
        <ChevronDownIcon
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Task templates"
          className="absolute left-0 top-full mt-1 z-50 rounded-lg border shadow-xl overflow-hidden min-w-[280px] max-w-[360px]"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-strong)",
          }}
        >
          {templates.length === 0 ? (
            <div
              className="px-4 py-5 text-center text-[11px] italic"
              style={{ color: "var(--color-text-muted)" }}
            >
              No templates saved
            </div>
          ) : (
            <ul className="flex flex-col py-1 max-h-64 overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id} className="relative">
                  {/* Outer is a div (role=option) to avoid nesting <button> inside <button>) */}
                  <div
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    onClick={() => handleSelect(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect(t);
                      }
                    }}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-2.5 text-left cursor-pointer",
                      "transition-colors hover:bg-white/[0.05] group"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[11px] font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {t.name}
                      </p>
                      <p
                        className="text-[10px] font-mono truncate mt-0.5"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {t.command.slice(0, 60)}{t.command.length > 60 ? "…" : ""}
                      </p>
                      {t.affinity?.tags && t.affinity.tags.length > 0 && (
                        <p
                          className="text-[9px] font-mono mt-0.5"
                          style={{ color: "var(--color-accent-primary)", opacity: 0.7 }}
                        >
                          {t.affinity.tags.join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Delete button — valid standalone <button>, not nested inside another */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, t.id)}
                      aria-label={confirmDeleteId === t.id ? "Confirm delete" : "Delete template"}
                      className={cn(
                        "flex-shrink-0 flex items-center justify-center rounded w-6 h-6 border",
                        "transition-all mt-0.5",
                        confirmDeleteId === t.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                      )}
                      style={
                        confirmDeleteId === t.id
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
                      <Trash2Icon className="size-3" />
                    </button>
                  </div>
                  {confirmDeleteId === t.id && (
                    <p
                      className="px-3 pb-1.5 text-[9px] italic"
                      style={{ color: "var(--color-accent-danger)" }}
                    >
                      Click again to confirm delete
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
