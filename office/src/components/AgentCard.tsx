import { memo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AgentAvatar } from "./AgentAvatar";
import { WorkerToggle } from "./agents/WorkerToggle";
import { RenameInline } from "./agents/RenameInline";
import { ConfirmKillDialog } from "./agents/ConfirmKillDialog";
import type { AgentState } from "../lib/types";

interface AgentCardProps {
  agent: AgentState;
  accent: string;
  saiyan?: boolean;
  onClick: () => void;
}

export const AgentCard = memo(function AgentCard({ agent, accent, saiyan, onClick }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [killDialog, setKillDialog] = useState<"window" | "session" | null>(null);
  const [killing, setKilling] = useState(false);

  const displayName = agent.name.replace(/-oracle$/, "").replace(/-/g, " ");

  async function handleKillConfirm() {
    if (!killDialog || killing) return;
    setKilling(true);
    try {
      if (killDialog === "window") {
        const res = await fetch(`/api/agents/${encodeURIComponent(agent.target)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        toast.success("Window killed");
      } else {
        const res = await fetch(`/api/sessions/${encodeURIComponent(agent.session)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        toast.success("Session killed");
      }
      setKillDialog(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Kill failed: ${msg}`);
    } finally {
      setKilling(false);
    }
  }

  return (
    <>
      <div
        className="relative flex flex-col items-center gap-1 cursor-pointer group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ── Action bar (visible on hover or keyboard focus) ─────── */}
        <div
          className="absolute top-0 right-0 flex items-center gap-0.5 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
        >
          {/* Worker toggle */}
          <WorkerToggle sessionName={agent.session} isWorker={agent.isWorker} />

          {/* Kill window */}
          <button
            type="button"
            aria-label={`Kill window ${agent.target}`}
            onClick={(e) => {
              e.stopPropagation();
              setKillDialog("window");
            }}
            className="h-6 w-6 flex items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          >
            <X className="size-3" />
          </button>

          {/* Kill session */}
          <button
            type="button"
            aria-label={`Kill session ${agent.session}`}
            onClick={(e) => {
              e.stopPropagation();
              setKillDialog("session");
            }}
            className="h-6 w-6 flex items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          >
            <Trash2 className="size-3" />
          </button>
        </div>

        {/* ── Avatar ─────────────────────────────────────────────── */}
        <svg
          width={100}
          height={85}
          viewBox="-55 -55 110 88"
          style={{ overflow: "visible" }}
          onClick={onClick}
        >
          <AgentAvatar
            name={agent.name}
            target={agent.target}
            status={agent.status}
            preview={agent.preview}
            accent={accent}
            saiyan={saiyan}
            onClick={onClick}
          />
        </svg>

        {/* Worker badge pip — shown persistently when worker */}
        {agent.isWorker && (
          <span
            className="absolute top-[52px] left-1/2 -translate-x-1/2 text-[8px] font-bold px-1 py-px rounded-full leading-none"
            style={{
              background: "rgba(251,191,36,0.15)",
              color: "var(--color-accent-warning)",
              border: "1px solid rgba(251,191,36,0.30)",
            }}
          >
            W
          </span>
        )}

        {/* ── Name (inline rename) ────────────────────────────────── */}
        <div style={{ color: accent }}>
          <RenameInline target={agent.target} displayName={displayName} />
        </div>

        {/* ── Hover tooltip ──────────────────────────────────────── */}
        {hovered && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 px-4 py-2.5 rounded-xl border whitespace-nowrap pointer-events-none"
            style={{
              background: "rgba(8,8,16,0.95)",
              borderColor: `${accent}44`,
              boxShadow: `0 0 20px ${accent}25, 0 4px 12px rgba(0,0,0,0.5)`,
            }}
          >
            <div className="text-sm font-bold" style={{ color: accent }}>{displayName}</div>
            <div className="text-xs text-white/70 mt-0.5">
              {agent.status} · {agent.target}
              {agent.isWorker && (
                <span className="ml-1.5 text-amber-400/80">· worker</span>
              )}
            </div>
            {agent.preview && (
              <div className="text-[10px] text-white/50 mt-1 max-w-[250px] truncate">
                {agent.preview.slice(0, 60)}
              </div>
            )}
            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "6px solid rgba(8,8,16,0.95)",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Kill confirmation dialog ──────────────────────────────── */}
      {killDialog != null && (
        <ConfirmKillDialog
          open={killDialog != null}
          type={killDialog}
          target={agent.target}
          name={killDialog === "session" ? agent.session : displayName}
          onConfirm={handleKillConfirm}
          onCancel={() => setKillDialog(null)}
        />
      )}
    </>
  );
});
