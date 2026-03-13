import { useState, useCallback, useMemo, useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useSessions } from "./hooks/useSessions";
import { UniverseBg } from "./components/UniverseBg";
import { StatusBar } from "./components/StatusBar";
import { RoomGrid } from "./components/RoomGrid";
import { TerminalModal } from "./components/TerminalModal";
import { MissionControl } from "./components/MissionControl";
import { TokenUsage } from "./components/TokenUsage";
import { ShortcutOverlay } from "./components/ShortcutOverlay";
import { CommandCenter } from "./components/CommandCenter";
import { TerminalPage } from "./components/TerminalPage";
import { GlobalNotificationProvider } from "./components/GlobalNotificationProvider";
import { unlockAudio, isAudioUnlocked } from "./lib/sounds";
import type { AgentState } from "./lib/types";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || "office");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1) || "office");
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
      if (e.key === "?" && !(e.target instanceof HTMLInputElement)) {
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
  const handleMessage = useCallback((data: any) => {
    window.dispatchEvent(new CustomEvent("maw-ws-message", { detail: data }));
    return data;
  }, []);

  const { sessions, agents, saiyanTargets, blinkTargets, eventLog, addEvent, handleMessage: handleSessionMessage } = useSessions();

  const combinedHandleMessage = useCallback((data: any) => {
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

  // ── Command Center: full-page route /#command ──────────────────────────────

  if (route === "command") {
    const handleOpenTerminal = (agentTarget: string) => {
      const agent = agents.find((a) => a.target === agentTarget);
      if (agent) {
        setSelectedAgent(agent);
        send({ type: "select", target: agent.target });
      }
    };

    return (
      <div className="relative min-h-screen" style={{ background: "#020208" }}>
        {globalNotifications}
        <div className="relative z-10">
          <StatusBar
            connected={connected}
            agentCount={agents.length}
            sessionCount={sessions.length}
            activeView="command"
          />
          <CommandCenter send={send} onOpenTerminal={handleOpenTerminal} />
        </div>
        {terminalModal}
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </div>
    );
  }

  if (route === "mission") {
    return (
      <div className="relative min-h-screen" style={{ background: "#020208" }}>
        {globalNotifications}
        <div className="relative z-10">
          <StatusBar connected={connected} agentCount={agents.length} sessionCount={sessions.length} activeView="mission" />
        </div>
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
      </div>
    );
  }

  if (route === "tokens") {
    return (
      <div className="relative min-h-screen" style={{ background: "#020208" }}>
        {globalNotifications}
        <div className="relative z-10">
          <StatusBar connected={connected} agentCount={agents.length} sessionCount={sessions.length} activeView="tokens" />
          <div className="relative z-10 overflow-y-auto" style={{ height: "calc(100dvh - 80px)" }}>
            <TokenUsage sessions={sessions} />
          </div>
        </div>
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </div>
    );
  }

  if (route === "terminal") {
    return (
      <div className="flex flex-col h-dvh" style={{ background: "#020208" }}>
        {globalNotifications}
        <StatusBar connected={connected} agentCount={agents.length} sessionCount={sessions.length} activeView="terminal" flush />
        <TerminalPage sessions={sessions} agents={agents} send={send} />
        {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {globalNotifications}
      <UniverseBg />
      <div className="relative z-10">
        <StatusBar connected={connected} agentCount={agents.length} sessionCount={sessions.length} activeView="office" />
        <RoomGrid sessions={sessions} agents={agents} saiyanTargets={saiyanTargets} onSelectAgent={onSelectAgent} />
      </div>
      {terminalModal}
      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
