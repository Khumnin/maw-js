import { memo } from "react";

interface CostHeaderProps {
  /** Total cost in USD for the selected range. null = loading. */
  totalCost: number | null;
  /** Human-readable label for the range, e.g. "Last 7 Days" */
  rangeLabel: string;
}

/**
 * CostHeader — displays the total estimated cost for the selected time range.
 *
 * Shows a large dollar figure styled with the accent color.
 * While data is loading (totalCost === null), renders an animated skeleton.
 */
export const CostHeader = memo(function CostHeader({
  totalCost,
  rangeLabel,
}: CostHeaderProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className="text-[11px] font-mono"
        style={{ color: "var(--color-text-muted)" }}
      >
        {rangeLabel}
      </p>
      {totalCost === null ? (
        <div
          className="h-8 w-28 rounded-md animate-pulse"
          style={{ background: "var(--color-bg-elevated)" }}
          aria-label="Loading cost..."
        />
      ) : (
        <p
          className="text-[28px] font-mono font-semibold leading-none"
          style={{ color: "var(--color-accent-primary)" }}
        >
          ${totalCost.toFixed(2)}
        </p>
      )}
    </div>
  );
});
