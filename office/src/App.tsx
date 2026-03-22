import { useState, useCallback, useMemo, useEffect, lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useSessions } from "./hooks/useSessions";
import { AppShell } from "./components/layout/AppShell";
import { UniverseBg } from "./components/UniverseBg";
import { RoomGrid } from "./components/RoomGrid";
import { TerminalModal } from "./components/TerminalModal";
import { MissionControl } from "./components/MissionControl";
import { ShortcutOverlay } from "./components/ShortcutOverlay";
import { CommandCenter } from "./components/CommandCenter";
import { TerminalPage } from "./components/TerminalPage";
import { GlobalNotificationProvider } from "./components/GlobalNotificationProvider";
import { CommandPalette } from "./components/shared/CommandPalette";
import { ImageUploadButton } from "./components/ImageUploadButton";
import { unlockAudio, isAudioUnlocked } from "./lib/sounds";
import type { AgentState } from "./lib/types";

// ── ErrorBoundary ────────────────────────────────────────────────────────────
// Catches lazy-load failures and runtime errors so they don't crash the whole
// React tree (which would blank-out the page including the sidebar).

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class LazyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[LazyErrorBoundary] ${this.props.fallbackLabel ?? "Component"} failed:`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-3"
          style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
        >
          <p className="text-[13px] font-mono" style={{ color: "#f87171" }}>
            Failed to load {this.props.fallbackLabel ?? "component"}
          </p>
          <p className="text-[11px] font-mono max-w-md text-center opacity-70">
            {this.state.error.message}
          </p>
          <button
            className="mt-2 px-3 py-1.5 text-[11px] font-mono rounded border"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
              background: "var(--color-bg-surface)",
            }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DashboardView = lazy(() =>
  import("./components/dashboard/DashboardView").then((m) => ({ default: m.DashboardView }))
);

const CostBreakdownView = lazy(() =>
  import("./components/cost/CostBreakdownView").then((m) => ({ default: m.CostBreakdownView }))
);

const TaskBoardView = lazy(() =>
  import("./components/tasks/TaskBoardView").then((m) => ({ default: m.TaskBoardView }))
);

const GoalsPanel = lazy(() =>
  import("./components/goals/GoalsPanel").then((m) => ({ default: m.GoalsPanel }))
);

const PipelineView = lazy(() =>
  import("./components/ci/PipelineView").then((m) => ({ default: m.PipelineView }))
);

const TimesheetDashboard = lazy(() =>
  import("./components/timesheet/TimesheetDashboard").then((m) => ({ default: m.TimesheetDashboard }))
);

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || "command");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1) || "command");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

/** Unlock audio on first user interaction — small tick to confirm */
function useAudioUnlock() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handler = () => {
      if (!isAudioUnlocked()) {
        unlockAudio();
        setReady(true);
      }
    };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, []);
  return ready;
}

export function App() {
  useAudioUnlock();
  const route = useHashRoute();
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // "?" key opens shortcut overlay (only when no input is focused)
  // Cmd+Shift+K navigates to /#command (no longer toggles overlay)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        window.location.hash = "command";
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Forward all WS messages to CommandCenter via custom event
  const handleMessage = useCallback((data: unknown) => {
    window.dispatchEvent(new CustomEvent("maw-ws-message", { detail: data }));
    return data;
  }, []);

  const { sessions, agents, saiyanTargets, blinkTargets, eventLog, addEvent, handleMessage: handleSessionMessage } = useSessions();

  const combinedHandleMessage = useCallback((data: unknown) => {
    handleMessage(data);
    handleSessionMessage(data);
  }, [handleMessage, handleSessionMessage]);

  const { connected, send } = useWebSocket(combinedHandleMessage);

  const onSelectAgent = useCallback((agent: AgentState) => {
    setSelectedAgent(agent);
    send({ type: "select", target: agent.target });
  }, [send]);

  // Agents in the same session as the selected agent
  const siblings = useMemo(() => {
    if (!selectedAgent) return [];
    return agents.filter(a => a.session === selectedAgent.session);
  }, [agents, selectedAgent]);

  const onNavigate = useCallback((dir: -1 | 1) => {
    if (!selectedAgent || siblings.length <= 1) return;
    const idx = siblings.findIndex(a => a.target === selectedAgent.target);
    const next = siblings[(idx + dir + siblings.length) % siblings.length];
    setSelectedAgent(next);
    send({ type: "select", target: next.target });
  }, [selectedAgent, siblings, send]);

  const terminalModal = selectedAgent && (
    <TerminalModal
      agent={selectedAgent}
      send={send}
      onClose={() => setSelectedAgent(null)}
      onNavigate={onNavigate}
      onSelectSibling={onSelectAgent}
      siblings={siblings}
    />
  );

  // Global notification overlay — mounted on every route, always active.
  const globalNotifications = <GlobalNotificationProvider agents={agents} />;

  // Global image upload button — floating camera FAB, visible on every route.
  const imageUploadButton = <ImageUploadButton />;

  // Global command palette — mounted on every route, Cmd+K to open.
  const handleKillAgent = useCallback((target: string) => {
    send({ type: "kill-agent", target });
  }, [send]);

  const handleToggleWorker = useCallback((sessionName: string) => {
    send({ type: "toggle-worker", sessionName });
  }, [send]);

  const handleNavigate = useCallback((route: string) => {
    window.location.hash = route;
  }, []);

  const globalCommandPalette = (
    <CommandPalette
      agents={agents}
      onNavigate={handleNavigate}
      onOpenTerminal={(target) => {
        const agent = agents.find((a) => a.target === target);
        if (agent) onSelectAgent(agent);
      }}
      onKillAgent={handleKillAgent}
      onToggleWorker={handleToggleWorker}
    />
  );

  // ── Command Center ──────────────────────────────────────────────────────────
  if (route === "command") {
    const handleOpenTerminal = (agentTarget: string) => {
      const agent = agents.find((a) => a.target === agentTarget);
      if (agent) {
        setSelectedAgent(agent);
        send({ type: "select", target: agent.target });
      }
    };

    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="h-full flex flex-col" style={{ background: "var(--color-bg-base)" }}>
          <CommandCenter send={send} onOpenTerminal={handleOpenTerminal} />
        </div>
        {terminalModal}
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Mission Control ─────────────────────────────────────────────────────────
  if (route === "mission") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <MissionControl
          sessions={sessions}
          agents={agents}
          saiyanTargets={saiyanTargets}
          blinkTargets={blinkTargets}
          connected={connected}
          send={send}
          onSelectAgent={onSelectAgent}
          eventLog={eventLog}
          addEvent={addEvent}
        />
        {terminalModal}
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Cost Breakdown (formerly Token Usage) ───────────────────────────────────
  if (route === "tokens") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full" style={{ background: "var(--color-bg-base)" }}>
          <LazyErrorBoundary fallbackLabel="cost breakdown">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading costs…</p>
                </div>
              }
            >
              <CostBreakdownView sessions={sessions} />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Terminal ────────────────────────────────────────────────────────────────
  if (route === "terminal") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="flex flex-col h-full" style={{ background: "var(--color-bg-base)" }}>
          <TerminalPage sessions={sessions} agents={agents} send={send} />
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  if (route === "dashboard") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full">
          <LazyErrorBoundary fallbackLabel="dashboard">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading dashboard…</p>
                </div>
              }
            >
              <DashboardView onSelectAgent={onSelectAgent} />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {terminalModal}
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Task Board ───────────────────────────────────────────────────────────────
  if (route === "tasks") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full">
          <LazyErrorBoundary fallbackLabel="task board">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading task board…</p>
                </div>
              }
            >
              <TaskBoardView />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Goals ────────────────────────────────────────────────────────────────────
  if (route === "goals") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full">
          <LazyErrorBoundary fallbackLabel="goals">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading goals…</p>
                </div>
              }
            >
              <GoalsPanel />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── CI/CD Pipelines ──────────────────────────────────────────────────────────
  if (route === "pipelines") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full" style={{ background: "var(--color-bg-base)" }}>
          <LazyErrorBoundary fallbackLabel="pipelines">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading pipelines…</p>
                </div>
              }
            >
              <PipelineView />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Timesheet ────────────────────────────────────────────────────────────────
  if (route === "timesheet") {
    return (
      <AppShell route={route} agents={agents} connected={connected}>
        {globalNotifications}
        {globalCommandPalette}
        {imageUploadButton}
        <div className="overflow-y-auto h-full" style={{ background: "var(--color-bg-base)" }}>
          <LazyErrorBoundary fallbackLabel="timesheet">
            <Suspense
              fallback={
                <div
                  className="flex items-center justify-center h-full"
                  style={{ background: "var(--color-bg-base)", color: "var(--color-text-muted)" }}
                >
                  <p className="text-[12px] font-mono">Loading timesheet…</p>
                </div>
              }
            >
              <TimesheetDashboard />
            </Suspense>
          </LazyErrorBoundary>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </AppShell>
    );
  }

  // ── Office (default) ────────────────────────────────────────────────────────
  return (
    <AppShell route={route} agents={agents} connected={connected}>
      {globalNotifications}
      {globalCommandPalette}
      <div className="relative min-h-full" style={{ background: "var(--color-bg-base)" }}>
        <UniverseBg />
        <div className="relative z-10">
          <RoomGrid sessions={sessions} agents={agents} saiyanTargets={saiyanTargets} onSelectAgent={onSelectAgent} />
        </div>
      </div>
      {terminalModal}
      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </AppShell>
  );
}
