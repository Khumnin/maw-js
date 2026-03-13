import { useState, useCallback, useRef } from "react";

export interface NotificationPreferences {
  soundEnabled: boolean;
  browserNotificationsEnabled: boolean;
}

const STORAGE_KEY = "maw-notification-prefs";

const DEFAULT_PREFS: NotificationPreferences = {
  soundEnabled: true,
  browserNotificationsEnabled: true,
};

function loadPrefs(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function savePrefs(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

/** Generate a permission alert tone using Web Audio API */
function playPermissionTone(audioCtx: AudioContext): void {
  try {
    // Two-note chime: high note then slightly lower
    const frequencies = [880, 660];
    let startTime = audioCtx.currentTime;

    for (const freq of frequencies) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
      startTime += 0.18;
    }
  } catch {}
}

export function useNotifications() {
  const [prefs, setPrefsState] = useState<NotificationPreferences>(loadPrefs);
  const [permissionGranted, setPermissionGranted] = useState(
    typeof Notification !== "undefined" ? Notification.permission === "granted" : false,
  );
  // Track which agent targets we've already notified for the current permission event
  // so we don't spam on every poll cycle
  const notifiedTargets = useRef<Set<string>>(new Set());
  // AudioContext ref — shared across calls
  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioCtx(): AudioContext | null {
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext();
      } catch {
        return null;
      }
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  const setPrefs = useCallback((update: Partial<NotificationPreferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...update };
      savePrefs(next);
      return next;
    });
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      setPermissionGranted(true);
      return;
    }
    const result = await Notification.requestPermission();
    setPermissionGranted(result === "granted");
  }, []);

  /**
   * Call this whenever agents list is updated.
   * Triggers notifications for newly-entered permission state.
   * agentTargetsInPermission: Set of targets currently in permission status
   */
  const notifyPermissionAgents = useCallback(
    (newlyPermissionTargets: string[], agentNames: Map<string, string>, agentPreviews: Map<string, string>) => {
      for (const target of newlyPermissionTargets) {
        if (notifiedTargets.current.has(target)) continue;
        notifiedTargets.current.add(target);

        const name = agentNames.get(target) ?? target;
        const preview = agentPreviews.get(target) ?? "Permission requested";

        // Sound
        if (prefs.soundEnabled) {
          const ctx = getAudioCtx();
          if (ctx) playPermissionTone(ctx);
        }

        // Browser notification
        if (prefs.browserNotificationsEnabled && permissionGranted) {
          try {
            new Notification(`${name}: needs permission`, {
              body: preview.slice(0, 120),
              icon: "/tigersoft-logo.png",
              tag: `maw-permission-${target}`,
              requireInteraction: false,
            });
          } catch {}
        }
      }
    },
    [prefs.soundEnabled, prefs.browserNotificationsEnabled, permissionGranted],
  );

  /**
   * Clear a target from the notified set when it leaves permission state,
   * so the next permission event triggers a fresh notification.
   */
  const clearPermissionNotification = useCallback((target: string) => {
    notifiedTargets.current.delete(target);
  }, []);

  return {
    prefs,
    setPrefs,
    permissionGranted,
    requestBrowserPermission,
    notifyPermissionAgents,
    clearPermissionNotification,
  };
}
