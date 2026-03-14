import { useState, useEffect } from "react";

/**
 * ClockWidget — live time and date display for the sidebar.
 *
 * Renders a compact status-bar-style block showing:
 *   - Current time: HH:MM:SS (updates every second)
 *   - Current date: e.g. "Sat, 15 Mar 2025"
 *
 * Visibility:
 *   - Desktop only: hidden on mobile via `hidden md:block`
 *   - Collapses to nothing when `collapsed` is true (icon-only sidebar mode)
 *
 * Uses design tokens from index.css exclusively — no hard-coded colours.
 */
interface ClockWidgetProps {
  /** When true the sidebar is in icon-only mode; hide the widget entirely */
  collapsed: boolean;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClockWidget({ collapsed }: ClockWidgetProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Collapsed sidebar shows only icons — hide the widget entirely
  if (collapsed) return null;

  return (
    <div
      // Desktop-only: the mobile sidebar is a temporary overlay; a live
      // clock there would be distracting and take up precious touch space.
      className="hidden md:flex flex-col items-center gap-0.5 py-2 px-3 select-none"
      aria-label="Current time and date"
      role="status"
      aria-live="off"
    >
      {/* Time */}
      <span
        className="text-[13px] leading-none tabular-nums tracking-widest"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-primary)",
          letterSpacing: "0.12em",
        }}
      >
        {formatTime(now)}
      </span>

      {/* Date */}
      <span
        className="text-[10px] leading-none"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-muted)",
          letterSpacing: "0.04em",
        }}
      >
        {formatDate(now)}
      </span>
    </div>
  );
}
