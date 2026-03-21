import { memo, useRef } from "react";
import {
  LayoutGrid,
  BarChart3,
  Globe,
  Terminal,
  KanbanSquare,
  Coins,
  Monitor,
  Target,
  GitBranch,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** When true, the item is shown on both mobile and desktop. When false, desktop only. */
  mobileVisible: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // New views — visible everywhere
  { id: "dashboard", label: "Dashboard", icon: BarChart3,     mobileVisible: true },
  { id: "tasks",     label: "Tasks",     icon: KanbanSquare,  mobileVisible: true },
  { id: "goals",     label: "Goals",     icon: Target,        mobileVisible: true },
  { id: "tokens",    label: "Costs",     icon: Coins,         mobileVisible: true },
  { id: "pipelines", label: "Pipelines", icon: GitBranch,     mobileVisible: true },
  { id: "timesheet", label: "Timesheet", icon: Clock,         mobileVisible: true },
  // Legacy views — desktop only
  { id: "office",    label: "Office",    icon: LayoutGrid,    mobileVisible: false },
  { id: "mission",   label: "Mission",   icon: Globe,         mobileVisible: false },
  { id: "command",   label: "Command",   icon: Terminal,      mobileVisible: false },
  { id: "terminal",  label: "Terminal",  icon: Monitor,       mobileVisible: false },
];

interface SidebarNavProps {
  /** Currently active hash route (without the "#") */
  activeRoute: string;
  /** Whether the sidebar is collapsed to icon-only mode */
  collapsed: boolean;
  /** Called after a nav item is clicked — used to close mobile overlay */
  onNavClick?: () => void;
  /**
   * When true, only items with `mobileVisible: true` are rendered and the
   * legacy-section separator is hidden. Pass `true` for the mobile overlay
   * sidebar and `false` (default) for the desktop sidebar.
   */
  mobile?: boolean;
}

/**
 * Vertical navigation list rendered inside the Sidebar.
 *
 * - Desktop (`mobile={false}`): renders all 8 items with a visual separator
 *   between the new views (Dashboard…Costs) and the legacy views
 *   (Office…Terminal).
 * - Mobile (`mobile={true}`): renders only the 4 new views — legacy views are
 *   hidden to reduce clutter on small screens.
 *
 * Each item navigates via hash route on click and supports full keyboard
 * navigation (Tab + Enter + Arrow keys).
 */
export const SidebarNav = memo(function SidebarNav({
  activeRoute,
  collapsed,
  onNavClick,
  mobile = false,
}: SidebarNavProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function navigate(id: string) {
    window.location.hash = id;
    onNavClick?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(id);
    }
    // Arrow up/down cycle within the visible buttons in the list
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = listRef.current;
      if (!list) return;
      const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button"));
      const idx = buttons.indexOf(e.currentTarget);
      const next =
        e.key === "ArrowDown"
          ? buttons[(idx + 1) % buttons.length]
          : buttons[(idx - 1 + buttons.length) % buttons.length];
      next?.focus();
    }
  }

  const visibleItems = mobile
    ? NAV_ITEMS.filter((item) => item.mobileVisible)
    : NAV_ITEMS;

  // Index of the first legacy item in the full list — used to insert the separator
  const firstLegacyIndex = visibleItems.findIndex((item) => !item.mobileVisible);

  return (
    <nav aria-label="Primary navigation">
      <ul ref={listRef} className="flex flex-col gap-0.5 px-2" role="list">
        {visibleItems.map(({ id, label, icon: Icon, mobileVisible }, index) => {
          const isActive = activeRoute === id;

          // Insert a separator before the first legacy item on desktop
          const showSeparator = !mobile && !mobileVisible && index === firstLegacyIndex;

          return (
            <li key={id}>
              {showSeparator && (
                <div
                  className="my-1.5 mx-1 h-px"
                  style={{ background: "var(--color-border-default)" }}
                  role="separator"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => navigate(id)}
                onKeyDown={(e) => handleKeyDown(e, id)}
                aria-label={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md px-3",
                  // Mobile: 44px touch target; desktop: compact
                  "min-h-[44px] md:min-h-0 md:py-2.5",
                  "text-left transition-all duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-surface)]",
                  isActive
                    ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]",
                  collapsed && "md:justify-center md:px-0"
                )}
              >
                <Icon
                  size={17}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-[var(--color-accent-primary)]"
                      : "text-[var(--color-text-muted)]"
                  )}
                />
                {!collapsed && (
                  <span className="text-[13px] font-medium leading-none whitespace-nowrap">
                    {label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
