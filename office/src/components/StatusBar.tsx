import { memo, useState, useEffect } from "react";

interface StatusBarProps {
  connected: boolean;
  agentCount: number;
  sessionCount: number;
  activeView?: string;
  flush?: boolean;
}

const NAV_ITEMS = [
  { href: "/office/#office", label: "Office", id: "office" },
  { href: "/office/#mission", label: "Mission", id: "mission" },
  { href: "/office/#tokens", label: "Tokens", id: "tokens" },
  { href: "/office/#command", label: "Command", id: "command" },
  { href: "/office/#terminal", label: "Terminal", id: "terminal" },
  { href: "/dashboard", label: "Orbital", id: "orbital" },
];

const VIEW_TITLES: Record<string, string> = {
  office: "TigerSpace",
  mission: "Mission Control",
  tokens: "Token Usage",
  command: "Command Center",
  terminal: "Terminal",
  orbital: "Tiger Orbital",
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export const StatusBar = memo(function StatusBar({ connected, agentCount, sessionCount, activeView = "office", flush = false }: StatusBarProps) {
  const pageTitle = VIEW_TITLES[activeView] || "TigerSpace";
  const now = useClock();

  const dateStr = now.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const headerClass = flush
    ? "sticky top-0 z-20 bg-black/50 backdrop-blur-xl border-b border-white/[0.06] shrink-0"
    : "sticky top-0 z-20 mx-2 sm:mx-6 mt-2 sm:mt-4 rounded-xl sm:rounded-2xl bg-black/50 backdrop-blur-xl border border-white/[0.06] shadow-[0_4px_30px_rgba(0,0,0,0.4)]";

  return (
    <header className={headerClass}>
      {/* Top row: logo + title + clock + status */}
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3">
        {/* Brand mark — logo + page title */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <img
            src="/office/tigersoft-logo-trimmed.png"
            alt="TigerSoft"
            style={{ height: 26, width: "auto", objectFit: "contain" }}
            className="sm:h-8"
          />
          <span className="text-[13px] sm:text-[15px] font-bold tracking-[2px] uppercase" style={{ color: "#F4001A" }}>{pageTitle}</span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-5 text-sm text-white/70">
          {/* Clock — time always visible, date hidden on mobile */}
          <div className="flex flex-col items-end leading-tight shrink-0">
            <span className="text-[12px] sm:text-[13px] font-mono font-bold text-white/80 tabular-nums">{timeStr}</span>
            <span className="hidden sm:block text-[10px] font-mono text-white/35">{dateStr}</span>
          </div>

          <span className="hidden sm:block w-px h-5 bg-white/10" />

          {/* Connection status — dot only on mobile, text on desktop */}
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-emerald-400 shadow-[0_0_6px_#4caf50]" : "bg-red-400 animate-pulse"}`} />
            <span className="hidden sm:inline">{connected ? "LIVE" : "RECONNECTING"}</span>
          </span>

          {/* Agent/room counts — hidden on small mobile */}
          <span className="hidden xs:inline sm:inline"><strong className="text-cyan-400">{agentCount}</strong><span className="hidden sm:inline"> agents</span></span>
          <span className="hidden xs:inline sm:inline"><strong className="text-purple-400">{sessionCount}</strong><span className="hidden sm:inline"> rooms</span></span>
        </div>
      </div>

      {/* Nav row — horizontally scrollable on mobile */}
      <div className="flex items-center gap-1 px-3 sm:px-6 pb-2 sm:pb-3 overflow-x-auto scrollbar-none border-t border-white/[0.04] sm:border-0 sm:pt-0 pt-1.5">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[12px] sm:text-sm transition-colors whitespace-nowrap ${
              activeView === item.id
                ? "text-cyan-400 font-bold bg-cyan-400/10"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </header>
  );
});
