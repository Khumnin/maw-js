import { Badge } from "@/components/ui/badge";
import { useActivityFeed, type ActivityColor } from "@/hooks/useActivityFeed";
import { cn } from "@/lib/cn";

const MAX_DISPLAY = 100;

const COLOR_CLASSES: Record<ActivityColor, string> = {
  green:  "bg-green-500/15 text-green-400 border-green-500/20",
  red:    "bg-red-500/15 text-red-400 border-red-500/20",
  cyan:   "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  muted:  "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * ActivityTimeline — scrollable list of all WebSocket events.
 * New events prepend to the top. Capped at 100 items.
 */
export function ActivityTimeline() {
  const feed = useActivityFeed();
  const capped = feed.length >= MAX_DISPLAY;

  return (
    <div
      className="rounded-lg border overflow-hidden flex flex-col"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-default)",
        maxHeight: 320,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <p
          className="text-[12px] font-medium uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Activity Feed
        </p>
        {capped && (
          <span
            className="text-[10px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Showing last {MAX_DISPLAY} events
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1">
        {feed.length === 0 && (
          <div
            className="flex items-center justify-center py-8 text-[12px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Waiting for events…
          </div>
        )}

        {feed.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              "flex items-start gap-2 px-4 py-2 border-b",
              "transition-colors hover:bg-white/[0.03]"
            )}
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            {/* Timestamp */}
            <span
              className="text-[10px] font-mono shrink-0 mt-px"
              style={{ color: "var(--color-text-muted)" }}
            >
              {formatTime(entry.timestamp)}
            </span>

            {/* Event type badge */}
            <Badge
              variant="outline"
              className={cn("text-[9px] shrink-0 px-1.5 py-0", COLOR_CLASSES[entry.color])}
            >
              {entry.type}
            </Badge>

            {/* Description */}
            <span
              className="text-[11px] leading-tight truncate"
              style={{ color: "var(--color-text-secondary)" }}
              title={entry.description}
            >
              {entry.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
