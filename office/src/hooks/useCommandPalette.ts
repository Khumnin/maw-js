import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommandAction {
  id: string;
  label: string;
  group: "navigation" | "agents" | "quick-actions";
  /** Short keyboard hint to display in the item row */
  shortcut?: string;
  /** Execute the action */
  onSelect: () => void;
}

export interface UseCommandPaletteReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  actions: CommandAction[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useCommandPalette — manages open/close state for the global command palette.
 *
 * - Registers a Cmd+K / Ctrl+K global keyboard shortcut that toggles the palette.
 * - Escape closes the palette (handled by the Dialog component).
 * - Returns the `actions` array so the palette component can render grouped items.
 *   Actions that require runtime data (agent list, navigation) are passed in via
 *   the `actions` parameter so this hook stays pure.
 */
export function useCommandPalette(actions: CommandAction[]): UseCommandPaletteReturn {
  const [open, setOpen] = useState(false);

  // Register Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        // Don't hijack Cmd+K inside inputs/textareas unless the palette is already open
        if (!open && (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const stableSetOpen = useCallback((value: boolean) => {
    setOpen(value);
  }, []);

  return { open, setOpen: stableSetOpen, actions };
}
