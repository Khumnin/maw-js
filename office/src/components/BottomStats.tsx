import { memo } from "react";
import type { AgentState } from "../lib/types";

interface BottomStatsProps {
  agents: AgentState[];
}

export const BottomStats = memo(function BottomStats({ agents }: BottomStatsProps) {
  const workingCount    = agents.filter((a) => a.status === "working").length;
  const waitingCount    = agents.filter((a) => a.status === "waiting").length;
  const permissionCount = agents.filter((a) => a.status === "permission").length;
  const errorCount      = agents.filter((a) => a.status === "error").length;
  const idleCount       = agents.filter((a) => a.status === "idle").length;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-5 px-6 py-2 rounded-xl bg-black/40 backdrop-blur border border-white/[0.04]">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
        <strong className="text-xs" style={{ color: "#22c55e" }}>{workingCount}</strong>
        <span className="text-[10px] text-white/50">working</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: "#eab308" }} />
        <strong className="text-xs" style={{ color: "#eab308" }}>{waitingCount}</strong>
        <span className="text-[10px] text-white/50">waiting</span>
      </span>
      {permissionCount > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#f97316", animation: "permission-pulse 1s ease-in-out infinite" }} />
          <strong className="text-xs" style={{ color: "#f97316" }}>{permissionCount}</strong>
          <span className="text-[10px] text-white/50">permission</span>
        </span>
      )}
      {errorCount > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} />
          <strong className="text-xs" style={{ color: "#ef4444" }}>{errorCount}</strong>
          <span className="text-[10px] text-white/50">error</span>
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-white/30" />
        <strong className="text-white/50 text-xs">{idleCount}</strong>
        <span className="text-[10px] text-white/50">idle</span>
      </span>
      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(100, (workingCount / Math.max(1, agents.length)) * 100)}%`,
            background: permissionCount > 0 ? "#f97316" : workingCount > 5 ? "#ef4444" : workingCount > 2 ? "#eab308" : "#22c55e",
          }}
        />
      </div>
    </div>
  );
});
