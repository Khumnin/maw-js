import { useState, useRef, useEffect } from "react";
import type { NotificationPreferences } from "../hooks/useNotifications";

interface NotificationSettingsProps {
  prefs: NotificationPreferences;
  permissionGranted: boolean;
  pendingCount: number;
  onToggleSound: (enabled: boolean) => void;
  onToggleBrowserNotifications: (enabled: boolean) => void;
  onRequestPermission: () => void;
}

export function NotificationSettings({
  prefs,
  permissionGranted,
  pendingCount,
  onToggleSound,
  onToggleBrowserNotifications,
  onRequestPermission,
}: NotificationSettingsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const bellColor = pendingCount > 0 ? "#ff9800" : "rgba(255,255,255,0.35)";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-all"
        title="Notification settings"
        style={{
          background: open ? "rgba(255,255,255,0.08)" : "transparent",
          border: `1px solid ${open ? "rgba(255,255,255,0.15)" : "transparent"}`,
        }}
      >
        {/* Bell icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={bellColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Badge */}
        {pendingCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[9px] font-mono font-bold"
            style={{
              background: "#ff9800",
              color: "#000",
              minWidth: 15,
              height: 15,
              padding: "0 3px",
            }}
          >
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-xl overflow-hidden z-50"
          style={{
            background: "#0e0e1e",
            border: "1px solid rgba(255,255,255,0.10)",
            minWidth: 260,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <span className="text-[10px] tracking-[3px] font-mono uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              Notifications
            </span>
            {pendingCount > 0 && (
              <span
                className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,152,0,0.20)", color: "#ff9800" }}
              >
                {pendingCount} pending
              </span>
            )}
          </div>

          {/* Settings rows */}
          <div className="px-4 py-3 flex flex-col gap-3">
            {/* Sound toggle */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Alert Sound
                </div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Chime when permission needed
                </div>
              </div>
              <button
                onClick={() => onToggleSound(!prefs.soundEnabled)}
                className="relative shrink-0 w-10 h-5 rounded-full cursor-pointer transition-all"
                style={{
                  background: prefs.soundEnabled ? "rgba(76,175,80,0.6)" : "rgba(255,255,255,0.10)",
                  border: `1px solid ${prefs.soundEnabled ? "rgba(76,175,80,0.8)" : "rgba(255,255,255,0.15)"}`,
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: prefs.soundEnabled ? "#4caf50" : "rgba(255,255,255,0.35)",
                    left: prefs.soundEnabled ? "calc(100% - 18px)" : 2,
                  }}
                />
              </button>
            </div>

            {/* Browser notifications toggle */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Browser Notifications
                </div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Push notify even when tab hidden
                </div>
              </div>
              <button
                onClick={() => onToggleBrowserNotifications(!prefs.browserNotificationsEnabled)}
                className="relative shrink-0 w-10 h-5 rounded-full cursor-pointer transition-all"
                style={{
                  background: prefs.browserNotificationsEnabled ? "rgba(76,175,80,0.6)" : "rgba(255,255,255,0.10)",
                  border: `1px solid ${prefs.browserNotificationsEnabled ? "rgba(76,175,80,0.8)" : "rgba(255,255,255,0.15)"}`,
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: prefs.browserNotificationsEnabled ? "#4caf50" : "rgba(255,255,255,0.35)",
                    left: prefs.browserNotificationsEnabled ? "calc(100% - 18px)" : 2,
                  }}
                />
              </button>
            </div>

            {/* Permission grant button (only when not yet granted) */}
            {!permissionGranted && (
              <button
                onClick={onRequestPermission}
                className="mt-1 w-full py-2 rounded-lg text-[11px] font-mono cursor-pointer transition-all"
                style={{
                  background: "rgba(100,181,246,0.12)",
                  border: "1px solid rgba(100,181,246,0.30)",
                  color: "#64b5f6",
                }}
              >
                Grant browser permission
              </button>
            )}
            {permissionGranted && (
              <div className="text-[10px] font-mono flex items-center gap-1" style={{ color: "rgba(76,175,80,0.7)" }}>
                <span>✓</span>
                <span>Browser permission granted</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
