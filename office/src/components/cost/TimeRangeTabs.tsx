import { memo, useRef } from "react";
import type { TimeRange } from "@/hooks/useCostBreakdown";
import { RANGE_LABELS } from "@/hooks/useCostBreakdown";

interface TimeRangeTabsProps {
  /** Currently active range value */
  activeRange: TimeRange;
  /** Called when the user selects a different range */
  onRangeChange: (range: TimeRange) => void;
}

const RANGES: TimeRange[] = ["7d", "30d", "mtd", "all"];

/**
 * TimeRangeTabs — horizontal tab bar for selecting a time range.
 *
 * Renders a `role="tablist"` with `role="tab"` buttons.
 * Active tab is highlighted with the accent color and an underline indicator.
 * The container is horizontally scrollable on mobile (no-scrollbar).
 *
 * Keyboard navigation follows the WAI-ARIA Tab Pattern:
 * - ArrowRight: focus (and activate) next tab, wrapping to first.
 * - ArrowLeft:  focus (and activate) previous tab, wrapping to last.
 * - Home:       focus (and activate) first tab.
 * - End:        focus (and activate) last tab.
 */
export const TimeRangeTabs = memo(function TimeRangeTabs({
  activeRange,
  onRangeChange,
}: TimeRangeTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % RANGES.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + RANGES.length) % RANGES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = RANGES.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    onRangeChange(RANGES[nextIndex]);
  }

  return (
    <div
      role="tablist"
      aria-label="Time range filter"
      className="flex overflow-x-auto gap-1"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      } as React.CSSProperties}
    >
      {RANGES.map((range, index) => {
        const isActive = range === activeRange;
        return (
          <button
            key={range}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            type="button"
            onClick={() => onRangeChange(range)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className="shrink-0 px-3 py-1.5 text-[12px] font-mono font-medium rounded-md whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{
              color: isActive
                ? "var(--color-accent-primary)"
                : "var(--color-text-secondary)",
              background: isActive
                ? "var(--color-accent-primary-subtle)"
                : "transparent",
              border: isActive
                ? "1px solid var(--color-accent-primary-border)"
                : "1px solid transparent",
              focusVisibleOutlineColor: "var(--color-accent-primary)",
            } as React.CSSProperties}
          >
            {RANGE_LABELS[range]}
          </button>
        );
      })}
    </div>
  );
});
