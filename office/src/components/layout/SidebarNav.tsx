import { memo, useRef } from "react";
import {
  LayoutGrid,
  BarChart3,
  Globe,
  Terminal,
  KanbanSquare,
  Coins,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "office",    label: "Office",    icon: LayoutGrid },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "mission",   label: "Mission",   icon: Globe },
  { id: "command",   label: "Command",   icon: Terminal },
  { id: "tasks",     label: "Tasks",     icon: KanbanSquare },
  { id: "tokens",    label: "Tokens",    icon: Coins },
  { id: "terminal",  label: "Terminal",  icon: Monitor },
];

interface SidebarNavProps {
  /** Currently active hash route (without the "#") */
  activeRoute: string;
  /** Whether the sidebar is collapsed to icon-only mode */
  collapsed: boolean;
}

/**
 * Vertical navigation list rendered inside the Sidebar.
 * Each item navigates via hash route on click and supports full keyboard
 * navigation (Tab + Enter).
 */
export const SidebarNav = memo(function SidebarNav({ activeRoute, collapsed }: SidebarNavProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function navigate(id: string) {
    window.location.hash = id;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(id);
    }
    // Arrow up/down cycle within the list
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = listRef.current;
      if (!list) return;
      const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button"));
      const idx = buttons.indexOf(e.currentTarget);
      const next = e.key === "ArrowDown"
        ? buttons[(idx + 1) % buttons.length]
        : buttons[(idx - 1 + buttons.length) % buttons.length];
      next?.focus();
    }
  }

  return (
    <nav aria-label="Primary navigation">
      <ul ref={listRef} className="flex flex-col gap-0.5 px-2" role="list">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeRoute === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => navigate(id)}
                onKeyDown={(e) => handleKeyDown(e, id)}
                aria-label={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md px-3 py-2.5",
                  "text-left transition-all duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-surface)]",
                  isActive
                    ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]",
                  collapsed && "justify-center px-0"
                )}
              >
                <Icon
                  size={17}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-muted)]"
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
