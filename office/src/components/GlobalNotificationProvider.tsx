import { useEffect, useRef } from "react";
import type { AgentState } from "../lib/types";
import { useNotifications } from "../hooks/useNotifications";
import { NotificationSettings } from "./NotificationSettings";
import { extractActionName } from "./CommandCenter";

interface GlobalNotificationProviderProps {
  agents: AgentState[];
}

/**
 * GlobalNotificationProvider mounts once at the app level and is always active,
 * regardless of which page/route is currently visible. It:
 *  - Watches the shared `agents` list for permission state transitions.
 *  - Fires sound + browser push notifications when any agent enters "permission".
 *  - Deduplicates: one notification per permission event (clears when agent exits state).
 *  - Updates document.title with a pending-count badge so the browser tab reflects it.
 *  - Renders the notification bell icon in a fixed overlay (top-right, above all content).
 */
export function GlobalNotificationProvider({ agents }: GlobalNotificationProviderProps) {
  const {
    prefs,
    setPrefs,
    permissionGranted,
    requestBrowserPermission,
    notifyPermissionAgents,
    clearPermissionNotification,
  } = useNotifications();

  // Remember previous statuses so we only fire on transitions, not on every render.
  const prevStatuses = useRef<Record<string, string>>({});

  // Agents currently in "permission" state — drives badge count and bell colour.
  const permissionAgents = agents.filter((a) => a.status === "permission");
  const pendingCount = permissionAgents.length;

  // Detect permission state transitions on every agents update.
  useEffect(() => {
    const newlyPermission: string[] = [];
    const agentNames = new Map<string, string>();
    const agentPreviews = new Map<string, string>();

    for (const agent of agents) {
      const prev = prevStatuses.current[agent.target];

      if (agent.status === "permission" && prev !== "permission") {
        newlyPermission.push(agent.target);
      }

      // Clear dedup record when agent leaves permission state so the next
      // permission event on that target fires a fresh notification.
      if (prev === "permission" && agent.status !== "permission") {
        clearPermissionNotification(agent.target);
      }

      prevStatuses.current[agent.target] = agent.status;
      agentNames.set(agent.target, agent.name);
      // Prefer the extracted action name over the raw preview for notifications
      const actionName = agent.preview ? extractActionName(agent.preview) : "";
      agentPreviews.set(
        agent.target,
        actionName || agent.preview || "Permission requested"
      );
    }

    if (newlyPermission.length > 0) {
      notifyPermissionAgents(newlyPermission, agentNames, agentPreviews);
    }
  }, [agents, notifyPermissionAgents, clearPermissionNotification]);

  // Update browser tab title with pending badge count.
  useEffect(() => {
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) TigerSpace`;
    } else {
      document.title = "TigerSpace";
    }
  }, [pendingCount]);

  return (
    // Fixed overlay — always visible on all pages, does not affect page layout.
    <div
      className="fixed z-50"
      style={{ top: 14, right: 20 }}
      // Prevent clicks on the bell from bubbling up to the page beneath.
      onClick={(e) => e.stopPropagation()}
    >
      <NotificationSettings
        prefs={prefs}
        permissionGranted={permissionGranted}
        pendingCount={pendingCount}
        onToggleSound={(enabled) => setPrefs({ soundEnabled: enabled })}
        onToggleBrowserNotifications={(enabled) => setPrefs({ browserNotificationsEnabled: enabled })}
        onRequestPermission={requestBrowserPermission}
      />
    </div>
  );
}
