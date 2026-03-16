import { useState, memo } from "react";
import { RefreshCw, GitBranch } from "lucide-react";
import { usePipelines } from "@/hooks/usePipelines";
import { PipelineCard } from "./PipelineCard";
import { ProjectFilter } from "./ProjectFilter";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PipelineCardSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3 animate-pulse"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-default)",
      }}
      aria-hidden="true"
    >
      <div
        className="h-5 w-16 rounded-md shrink-0"
        style={{ background: "var(--color-bg-elevated)" }}
      />
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div
          className="h-3 w-40 rounded"
          style={{ background: "var(--color-bg-elevated)" }}
        />
        <div
          className="h-2.5 w-64 rounded"
          style={{ background: "var(--color-bg-elevated)" }}
        />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 gap-3 text-center"
      style={{ color: "var(--color-text-muted)" }}
    >
      <GitBranch size={32} className="opacity-30" aria-hidden="true" />
      <p className="text-[13px] font-mono">No pipelines found.</p>
      <p className="text-[11px] font-mono opacity-60">
        Pipelines will appear here once CI runs are triggered.
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * PipelineView — route container for the `#pipelines` hash route.
 *
 * Layout (desktop):
 *   - Header bar: page title + pipeline count + refresh button
 *   - ProjectFilter chip row for scoping the list
 *   - Scrollable pipeline card list
 *
 * On mobile, the header stacks and chips scroll horizontally.
 * Polls every 30 seconds via `usePipelines`.
 */
export const PipelineView = memo(function PipelineView() {
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  const { pipelines, projects, loading, error, refetch } = usePipelines(
    selectedProjectIds.length > 0 ? selectedProjectIds : undefined
  );

  const displayPipelines = pipelines;
  const pipelineCount = displayPipelines.length;

  // Count running pipelines for the header badge
  const runningCount = displayPipelines.filter((p) => p.status === "running").length;

  return (
    <div
      className="flex flex-col gap-4 p-4 sm:p-6 pb-12 max-w-[1400px] mx-auto"
      style={{ color: "var(--color-text-primary)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Title + counts */}
        <div>
          <h1
            className="text-[11px] font-mono font-semibold tracking-[3px] uppercase mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            CI/CD PIPELINES
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-[22px] font-semibold leading-none"
              style={{ color: "var(--color-text-primary)" }}
            >
              {loading ? "—" : pipelineCount}
            </span>
            <span
              className="text-[13px] font-mono"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {pipelineCount === 1 ? "pipeline" : "pipelines"}
            </span>

            {/* Running badge */}
            {runningCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md px-2 py-0.5"
                style={{
                  color: "#3b82f6",
                  background: "rgba(59,130,246,0.1)",
                  border: "1px solid rgba(59,130,246,0.25)",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "#3b82f6" }}
                  aria-hidden="true"
                />
                {runningCount} running
              </span>
            )}
          </div>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          aria-label="Refresh pipelines"
          className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-mono font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            color: "var(--color-text-secondary)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--color-border-default)",
            focusVisibleOutlineColor: "var(--color-accent-primary)",
          } as React.CSSProperties}
        >
          <RefreshCw
            size={13}
            className={loading ? "animate-spin" : undefined}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      {/* ── Project filter ───────────────────────────────────────────────── */}
      {projects.length > 1 && (
        <ProjectFilter
          projects={projects}
          selectedIds={selectedProjectIds}
          onChange={setSelectedProjectIds}
        />
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          className="rounded-md px-4 py-3 text-[12px] font-mono"
          style={{
            background: "var(--color-accent-danger-subtle)",
            border: "1px solid var(--color-accent-danger-border)",
            color: "var(--color-accent-danger)",
          }}
          role="alert"
        >
          Failed to load pipelines: {error}
        </div>
      )}

      {/* ── Pipeline list ────────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-2"
        role="list"
        aria-label="Pipeline list"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          // Skeleton loading state
          Array.from({ length: 6 }).map((_, i) => (
            <PipelineCardSkeleton key={i} />
          ))
        ) : displayPipelines.length === 0 ? (
          <EmptyState />
        ) : (
          displayPipelines.map((pipeline) => (
            <div key={`${pipeline.projectId}-${pipeline.id}`} role="listitem">
              <PipelineCard pipeline={pipeline} />
            </div>
          ))
        )}
      </div>
    </div>
  );
});
