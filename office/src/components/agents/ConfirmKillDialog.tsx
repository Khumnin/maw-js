import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmKillDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** "window" kills the single window; "session" kills all windows in the session */
  type: "window" | "session";
  /** Window target (e.g. "main:0") or session name, used for display */
  target: string;
  /** Human-readable name shown in the confirmation message */
  name: string;
  /** Called when the user confirms — the parent handles the actual DELETE call */
  onConfirm: () => void;
  /** Called when the user cancels or closes the dialog */
  onCancel: () => void;
}

/**
 * ConfirmKillDialog — destructive confirmation before killing a window or session.
 *
 * The parent component is responsible for executing the API call inside onConfirm.
 */
export function ConfirmKillDialog({
  open,
  type,
  target,
  name,
  onConfirm,
  onCancel,
}: ConfirmKillDialogProps) {
  const isSession = type === "session";

  const title = isSession
    ? `Kill session "${name}"?`
    : `Kill window ${target}?`;

  const description = isSession
    ? "This will close all windows in the session. Running agents will be terminated."
    : "This window will be closed. Any running agent in it will be terminated.";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-strong)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-base font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            className="bg-red-600/80 hover:bg-red-600 text-white border-0"
          >
            {isSession ? "Kill session" : "Kill window"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
