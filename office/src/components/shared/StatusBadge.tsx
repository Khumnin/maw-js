import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

type AgentStatus = "working" | "waiting" | "permission" | "error" | "idle";

const STATUS_CONFIG: Record<AgentStatus, { label: string; className: string }> = {
  working:    { label: "Working",    className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  waiting:    { label: "Waiting",    className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  permission: { label: "Permission", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  error:      { label: "Error",      className: "bg-red-500/15 text-red-400 border-red-500/20" },
  idle:       { label: "Idle",       className: "bg-gray-500/15 text-gray-400 border-gray-500/20" },
};

/**
 * StatusBadge — displays an agent status with a colour-coded dot and label.
 * Uses the maw-js dark-mode design token palette.
 */
export function StatusBadge({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-xs font-medium", config.className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
