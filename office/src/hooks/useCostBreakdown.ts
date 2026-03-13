import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimeRange = "7d" | "30d" | "mtd" | "all";

export interface AgentCost {
  agentName: string | null;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  sessionCount: number;
  turnCount: number;
  costShare: number;
}

export interface ProjectCost {
  project: string;
  estimatedCost: number;
  sessionCount: number;
  costShare: number;
}

export interface ByAgentResponse {
  agents: AgentCost[];
  projects: ProjectCost[];
  totalCost: number;
  totalSessions: number;
  range: TimeRange;
  cachedAt: string;
}

export const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "mtd": "Month to Date",
  "all": "All Time",
};

export interface UseCostBreakdownReturn {
  data: ByAgentResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useCostBreakdown — fetches GET /api/token-usage/by-agent?range=${range}
 * every 30 seconds. Re-fetches immediately when `range` changes.
 * Returns loading=true only on the initial load to avoid re-poll flicker.
 */
export function useCostBreakdown(range: TimeRange): UseCostBreakdownReturn {
  const [data, setData] = useState<ByAgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aliveRef = useRef(true);
  const isInitialRef = useRef(true);

  const doFetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/token-usage/by-agent?range=${range}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json: ByAgentResponse = await res.json();
      if (aliveRef.current) {
        setData(json);
        setError(null);
        setLoading(false);
        isInitialRef.current = false;
      }
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        isInitialRef.current = false;
      }
    }
  }, [range]);

  useEffect(() => {
    aliveRef.current = true;
    isInitialRef.current = true;
    // Show loading spinner only on the first load for this range
    setLoading(true);

    function schedule() {
      doFetch().finally(() => {
        if (aliveRef.current) {
          timerRef.current = setTimeout(schedule, 30_000);
        }
      });
    }

    schedule();

    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [doFetch]);

  return { data, loading, error, refetch: doFetch };
}
