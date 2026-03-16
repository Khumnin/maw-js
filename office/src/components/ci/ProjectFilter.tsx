import { memo, useRef } from "react";
import type { GitLabProject } from "@/hooks/usePipelines";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectFilterProps {
  /** All available projects derived from pipeline data */
  projects: GitLabProject[];
  /** Currently selected project IDs. Empty array means "All". */
  selectedIds: number[];
  /** Called when the selection changes */
  onChange: (ids: number[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ProjectFilter — horizontally scrollable row of project filter chips.
 *
 * - "All" chip resets the filter to show every project.
 * - Clicking an active project chip removes it from the selection.
 * - Multiple projects can be selected simultaneously.
 * - Keyboard: Arrow Left/Right to move between chips; Space/Enter to toggle.
 */
export const ProjectFilter = memo(function ProjectFilter({
  projects,
  selectedIds,
  onChange,
}: ProjectFilterProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const isAll = selectedIds.length === 0;

  function toggleProject(id: number) {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((x) => x !== id);
      onChange(next);
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number // -1 for "All", 0-N for projects
  ) {
    const list = listRef.current;
    if (!list) return;
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button"));
    let next: HTMLButtonElement | undefined;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = buttons[(index + 1 + 1) % buttons.length]; // +1 offset for "All" at index 0
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const total = buttons.length;
      next = buttons[(index + 1 - 1 + total) % total];
    } else if (e.key === "Home") {
      e.preventDefault();
      next = buttons[0];
    } else if (e.key === "End") {
      e.preventDefault();
      next = buttons[buttons.length - 1];
    }

    next?.focus();
  }

  return (
    <div
      ref={listRef}
      role="group"
      aria-label="Filter by project"
      className="flex items-center gap-2 overflow-x-auto pb-0.5"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
    >
      {/* All chip */}
      <button
        type="button"
        aria-pressed={isAll}
        onClick={() => onChange([])}
        onKeyDown={(e) => handleKeyDown(e, -1)}
        className="shrink-0 px-3 py-1 rounded-full text-[11px] font-mono font-medium whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={{
          color: isAll ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
          background: isAll ? "var(--color-accent-primary-subtle)" : "rgba(255,255,255,0.04)",
          border: isAll
            ? "1px solid var(--color-accent-primary-border)"
            : "1px solid var(--color-border-default)",
          focusVisibleOutlineColor: "var(--color-accent-primary)",
        } as React.CSSProperties}
      >
        All
      </button>

      {projects.map((project, index) => {
        const isActive = selectedIds.includes(project.id);
        return (
          <button
            key={project.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => toggleProject(project.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            title={project.path}
            className="shrink-0 px-3 py-1 rounded-full text-[11px] font-mono font-medium whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 max-w-[160px] truncate"
            style={{
              color: isActive ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
              background: isActive
                ? "var(--color-accent-primary-subtle)"
                : "rgba(255,255,255,0.04)",
              border: isActive
                ? "1px solid var(--color-accent-primary-border)"
                : "1px solid var(--color-border-default)",
              focusVisibleOutlineColor: "var(--color-accent-primary)",
            } as React.CSSProperties}
          >
            {project.name}
          </button>
        );
      })}
    </div>
  );
});
