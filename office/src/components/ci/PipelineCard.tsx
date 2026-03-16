import { memo, useMemo } from "react";
import { GitBranch, GitCommit, ArrowUpRight, Zap } from "lucide-react";
import type { PipelineInfo } from "@/hooks/usePipelines";
import { PipelineStatusBadge, getStatusConfig } from "./PipelineStatusBadge";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string.
 * e.g. "just now", "5m ago", "2h ago", "3d ago"
 */
function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Trims a commit SHA to 7 characters. */
function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Formats the pipeline source into a readable label. */
function formatSource(source: string): string {
  return source.replace(/_/g, " ");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineCardProps {
  pipeline: PipelineInfo;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * PipelineCard — single pipeline entry.
 *
 * Clicking anywhere on the card (or pressing Enter/Space while focused)
 * opens the pipeline's web URL in a new tab.
 *
 * Running pipelines receive a subtle ambient glow animation to draw attention.
 */
export const PipelineCard = memo(function PipelineCard({ pipeline }: PipelineCardProps) {
  const {
    projectName,
    ref,
    sha,
    status,
    source,
    updatedAt,
    webUrl,
  } = pipeline;

  const isRunning = status === "running";
  const cfg = getStatusConfig(status);

  const relativeTime = useMemo(() => timeAgo(updatedAt), [updatedAt]);

  function handleClick() {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${projectName} pipeline on ${ref} — ${status}`}
      className="group relative flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        background: "var(--color-bg-surface)",
        border: `1px solid ${isRunning ? cfg.border : "var(--color-border-default)"}`,
        focusVisibleOutlineColor: "var(--color-accent-primary)",
        // Running glow: subtle box-shadow that pulses via CSS animation class
        boxShadow: isRunning
          ? `0 0 0 1px ${cfg.border}, 0 0 16px ${cfg.bg}`
          : undefined,
      } as React.CSSProperties}
    >
      {/* Running pulse ring */}
      {isRunning && (
        <span
          className="absolute inset-0 rounded-lg pointer-events-none pipeline-running-glow"
          aria-hidden="true"
          style={{ border: `1px solid ${cfg.border}` }}
        />
      )}

      {/* Status badge — left-aligned block on mobile, shrinks to badge on desktop */}
      <div className="shrink-0">
        <PipelineStatusBadge status={status} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Project name + ref */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {projectName}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-mono shrink-0"
            style={{ color: "var(--color-accent-primary)" }}
          >
            <GitBranch size={10} aria-hidden="true" />
            {ref}
          </span>
        </div>

        {/* Meta row: SHA + source + time */}
        <div
          className="flex items-center gap-3 flex-wrap text-[11px] font-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          <span className="inline-flex items-center gap-1">
            <GitCommit size={10} aria-hidden="true" />
            <code style={{ fontFamily: "var(--font-mono)" }}>{shortSha(sha)}</code>
          </span>

          {source && (
            <span className="inline-flex items-center gap-1">
              <Zap size={10} aria-hidden="true" />
              {formatSource(source)}
            </span>
          )}

          <span
            className="ml-auto shrink-0"
            title={new Date(updatedAt).toLocaleString()}
          >
            {relativeTime}
          </span>
        </div>
      </div>

      {/* External link indicator */}
      <ArrowUpRight
        size={14}
        className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 hidden sm:block"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden="true"
      />
    </div>
  );
});
