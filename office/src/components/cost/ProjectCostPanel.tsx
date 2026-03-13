import { memo } from "react";
import type { ProjectCost } from "@/hooks/useCostBreakdown";

// ── ProjectCostRow ────────────────────────────────────────────────────────────

interface ProjectCostRowProps {
  project: ProjectCost;
}

const ProjectCostRow = memo(function ProjectCostRow({
  project,
}: ProjectCostRowProps) {
  const barBg = "var(--color-accent-primary-subtle)";
  const pct = (project.costShare * 100).toFixed(1);

  return (
    <li
      className="relative overflow-hidden"
      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
    >
      {/* Cost share bar */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${project.costShare * 100}%`,
          background: barBg,
        }}
      />

      <div
        className="relative flex items-center gap-3 px-4 py-3"
        aria-label={`Project ${project.project}: $${project.estimatedCost.toFixed(2)}, ${pct}% of total`}
      >
        {/* Project name + session count */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-mono truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {project.project}
          </p>
          <p
            className="text-[11px] font-mono mt-0.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Cost — right aligned */}
        <p
          className="shrink-0 text-[14px] font-mono font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          ${project.estimatedCost.toFixed(2)}
        </p>
      </div>
    </li>
  );
});

// ── ProjectCostPanel ──────────────────────────────────────────────────────────

interface ProjectCostPanelProps {
  projects: ProjectCost[];
  /** Whether data is still loading (shows skeleton rows) */
  loading: boolean;
}

/**
 * ProjectCostPanel — ranked list of project cost contributions.
 *
 * Projects are rendered in the order provided (backend sorts by cost desc).
 * Shows a "No project data" placeholder when the array is empty (not an error).
 */
export const ProjectCostPanel = memo(function ProjectCostPanel({
  projects,
  loading,
}: ProjectCostPanelProps) {
  return (
    <section
      className="rounded-[var(--radius-md)] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)" }}
      >
        <h2
          className="text-[13px] font-mono font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          By Project
        </h2>
        {!loading && projects.length > 0 && (
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <ul aria-label="Loading projects..." className="divide-y divide-transparent">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3 w-28 rounded animate-pulse"
                  style={{ background: "var(--color-bg-elevated)" }}
                />
                <div
                  className="h-2.5 w-16 rounded animate-pulse"
                  style={{ background: "var(--color-bg-elevated)" }}
                />
              </div>
              <div
                className="shrink-0 h-4 w-14 rounded animate-pulse"
                style={{ background: "var(--color-bg-elevated)" }}
              />
            </li>
          ))}
        </ul>
      ) : projects.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p
            className="text-[12px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            No project data
          </p>
        </div>
      ) : (
        <ul aria-label="Project cost breakdown">
          {projects.map((project) => (
            <ProjectCostRow key={project.project} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
});
