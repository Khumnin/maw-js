import { useEffect, useRef, useCallback } from "react";
import {
  LayoutGridIcon,
  BarChart3Icon,
  GlobeIcon,
  TerminalIcon,
  KanbanSquareIcon,
  CoinsIcon,
  MonitorIcon,
  TargetIcon,
  PlusCircleIcon,
  SendIcon,
  ZapIcon,
  SkullIcon,
  ToggleRightIcon,
  InfoIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import type { CommandAction } from "@/hooks/useCommandPalette";
import type { AgentState } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  /** Live agents list from App.tsx */
  agents: AgentState[];
  /** Navigate to a hash route */
  onNavigate: (route: string) => void;
  /** Open terminal modal for a specific agent target */
  onOpenTerminal: (target: string) => void;
  /** Kill an agent by target */
  onKillAgent?: (target: string) => void;
  /** Toggle worker status for a session */
  onToggleWorker?: (sessionName: string) => void;
  /** Open the spawn agent dialog */
  onSpawnAgent?: () => void;
  /** Open the task submit form (focus it) */
  onSubmitTask?: () => void;
}

// ── Navigation items ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  // New views — primary navigation
  { id: "dashboard", label: "Go to Dashboard",  icon: BarChart3Icon,     shortcut: "G D" },
  { id: "tasks",     label: "Go to Tasks",      icon: KanbanSquareIcon,  shortcut: "G T" },
  { id: "goals",     label: "Go to Goals",      icon: TargetIcon,        shortcut: "G G" },
  { id: "tokens",    label: "Go to Costs",      icon: CoinsIcon,         shortcut: "G K" },
  // Legacy views — power user / desktop
  { id: "office",    label: "Go to Office",     icon: LayoutGridIcon,    shortcut: "G O" },
  { id: "mission",   label: "Go to Mission",    icon: GlobeIcon,         shortcut: "G M" },
  { id: "command",   label: "Go to Command",    icon: TerminalIcon,      shortcut: "G C" },
  { id: "terminal",  label: "Go to Terminal",   icon: MonitorIcon,       shortcut: "G R" },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * CommandPalette — global Cmd+K command palette.
 *
 * Always mounted at app root. Opens on Cmd+K / Ctrl+K from any view.
 *
 * Action groups:
 * 1. Navigation — route links
 * 2. Agents — per-agent actions (terminal, kill, toggle worker, details)
 * 3. Quick Actions — spawn agent, submit task
 *
 * Focus returns to the previously focused element on close.
 */
export function CommandPalette({
  agents,
  onNavigate,
  onOpenTerminal,
  onKillAgent,
  onToggleWorker,
  onSpawnAgent,
  onSubmitTask,
}: CommandPaletteProps) {
  // Track the element that was focused before the palette opened
  const previousFocusRef = useRef<Element | null>(null);

  // Build actions array for the hook (navigation + quick-actions; agents built inline)
  const navActions: CommandAction[] = NAV_ITEMS.map((item) => ({
    id: `nav-${item.id}`,
    label: item.label,
    group: "navigation" as const,
    shortcut: item.shortcut,
    onSelect: () => onNavigate(item.id),
  }));

  const quickActions: CommandAction[] = [
    ...(onSpawnAgent
      ? [{
          id: "spawn-agent",
          label: "Spawn Agent",
          group: "quick-actions" as const,
          onSelect: onSpawnAgent,
        }]
      : []),
    ...(onSubmitTask
      ? [{
          id: "submit-task",
          label: "Submit Task",
          group: "quick-actions" as const,
          onSelect: () => { onNavigate("tasks"); onSubmitTask(); },
        }]
      : []),
  ];

  const { open, setOpen } = useCommandPalette([...navActions, ...quickActions]);

  // Save previous focus on open
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    }
  }, [open]);

  // Restore focus on close
  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value && previousFocusRef.current instanceof HTMLElement) {
      // Defer to next tick so the dialog has time to unmount
      setTimeout(() => {
        (previousFocusRef.current as HTMLElement | null)?.focus();
      }, 0);
    }
  }, [setOpen]);

  const handleSelect = useCallback((action: () => void) => {
    setOpen(false);
    // Small delay so the dialog close animation doesn't interrupt the action
    setTimeout(action, 60);
  }, [setOpen]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 max-w-[560px] w-full"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-strong)",
        }}
        aria-label="Command palette"
      >
        <Command
          className="[&_[cmdk-group-heading]]:text-[var(--color-text-muted)]"
          style={{ background: "transparent" }}
        >
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* ── Navigation ──────────────────────────────────────────────── */}
            <CommandGroup heading="Navigation">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => handleSelect(() => onNavigate(item.id))}
                >
                  <item.icon
                    className="size-4 shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                  <span>{item.label}</span>
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* ── Agents ──────────────────────────────────────────────────── */}
            {agents.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Agents">
                  {agents.map((agent) => {
                    const kill = onKillAgent;
                    const toggle = onToggleWorker;
                    return (
                      <AgentCommandItems
                        key={agent.target}
                        agent={agent}
                        onOpenTerminal={() => handleSelect(() => onOpenTerminal(agent.target))}
                        onKillAgent={kill ? () => handleSelect(() => kill(agent.target)) : undefined}
                        onToggleWorker={toggle ? () => handleSelect(() => toggle(agent.session)) : undefined}
                      />
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {/* ── Quick Actions ────────────────────────────────────────────── */}
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              {onSpawnAgent && (
                <CommandItem
                  value="Spawn Agent"
                  onSelect={() => { const fn = onSpawnAgent; handleSelect(() => { onNavigate("office"); fn(); }); }}
                >
                  <PlusCircleIcon
                    className="size-4 shrink-0"
                    style={{ color: "var(--color-accent-primary)" }}
                  />
                  <span>Spawn Agent</span>
                </CommandItem>
              )}
              <CommandItem
                value="Submit Task"
                onSelect={() => handleSelect(() => { onNavigate("tasks"); onSubmitTask?.(); })}
              >
                <SendIcon
                  className="size-4 shrink-0"
                  style={{ color: "var(--color-accent-primary)" }}
                />
                <span>Submit Task</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>

          {/* Footer hint */}
          <div
            className="flex items-center justify-between px-3 py-2 border-t text-[10px] font-mono"
            style={{
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-muted)",
            }}
          >
            <span>
              <kbd
                className="rounded px-1 py-0.5 mr-1 text-[9px]"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)" }}
              >
                ↑↓
              </kbd>
              navigate
            </span>
            <span>
              <kbd
                className="rounded px-1 py-0.5 mr-1 text-[9px]"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)" }}
              >
                ↵
              </kbd>
              select
            </span>
            <span>
              <kbd
                className="rounded px-1 py-0.5 mr-1 text-[9px]"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)" }}
              >
                Esc
              </kbd>
              close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ── AgentCommandItems ──────────────────────────────────────────────────────────

interface AgentCommandItemsProps {
  agent: AgentState;
  onOpenTerminal: () => void;
  onKillAgent?: () => void;
  onToggleWorker?: () => void;
}

/** Renders up to 3 command items for a single agent. */
function AgentCommandItems({ agent, onOpenTerminal, onKillAgent, onToggleWorker }: AgentCommandItemsProps) {
  const displayName = agent.name || agent.target;

  return (
    <>
      <CommandItem
        value={`${displayName} open terminal`}
        onSelect={onOpenTerminal}
      >
        <ZapIcon
          className="size-4 shrink-0"
          style={{ color: "var(--color-status-working)" }}
        />
        <span>
          Open Terminal —{" "}
          <span style={{ color: "var(--color-text-muted)" }}>{displayName}</span>
        </span>
      </CommandItem>

      {onToggleWorker && (
        <CommandItem
          value={`${displayName} toggle worker`}
          onSelect={onToggleWorker}
        >
          <ToggleRightIcon
            className="size-4 shrink-0"
            style={{ color: "var(--color-status-waiting)" }}
          />
          <span>
            Toggle Worker —{" "}
            <span style={{ color: "var(--color-text-muted)" }}>{displayName}</span>
          </span>
          {agent.isWorker && (
            <span
              className="ml-auto text-[9px] font-mono rounded px-1 py-0.5"
              style={{
                background: "var(--color-accent-primary-badge)",
                color: "var(--color-accent-primary)",
                border: "1px solid var(--color-accent-primary-border)",
              }}
            >
              worker
            </span>
          )}
        </CommandItem>
      )}

      {onKillAgent && (
        <CommandItem
          value={`${displayName} kill agent`}
          onSelect={onKillAgent}
        >
          <SkullIcon
            className="size-4 shrink-0"
            style={{ color: "var(--color-accent-danger)" }}
          />
          <span>
            Kill Agent —{" "}
            <span style={{ color: "var(--color-text-muted)" }}>{displayName}</span>
          </span>
        </CommandItem>
      )}

      <CommandItem
        value={`${displayName} show details`}
        onSelect={onOpenTerminal}
      >
        <InfoIcon
          className="size-4 shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        />
        <span>
          Show Details —{" "}
          <span style={{ color: "var(--color-text-muted)" }}>{displayName}</span>
        </span>
      </CommandItem>
    </>
  );
}
