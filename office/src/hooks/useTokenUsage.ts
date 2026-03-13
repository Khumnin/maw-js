import { useState, useEffect, useRef } from "react";

/** One bar in the 7-day chart */
export interface DayCost {
  /** Short day name, e.g. "Mon" */
  day: string;
  /** ISO date string "YYYY-MM-DD" — used to detect today's partial bar */
  date: string;
  cost: number;
}

interface UseTokenUsageReturn {
  data: DayCost[];
  totalCost: number;
  loading: boolean;
  error: string | null;
}

const DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Generates an array of the last 7 calendar days (oldest first, today last).
 */
function last7Days(): { date: string; day: string }[] {
  const result: { date: string; day: string }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    result.push({ date: iso, day: DAY_ABBRS[d.getDay()] });
  }
  return result;
}

interface TimelineEntry {
  hour: string;
  cost: number;
}

interface TokenUsageApiResponse {
  timeline?: TimelineEntry[];
  totals?: { estimatedCost?: number };
}

/**
 * useTokenUsage — fetches GET /api/token-usage every 30 seconds.
 * Normalises the hourly timeline into last-7-days daily buckets.
 */
export function useTokenUsage(): UseTokenUsageReturn {
  const [data, setData] = useState<DayCost[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    async function fetch_() {
      try {
        const res = await fetch("/api/token-usage");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: TokenUsageApiResponse = await res.json();

        const days = last7Days();
        // Build a day → cost map from hourly timeline
        const dayCostMap: Record<string, number> = {};
        for (const entry of json.timeline ?? []) {
          // entry.hour format: "2026-03-09T10:00"
          const date = entry.hour.slice(0, 10);
          dayCostMap[date] = (dayCostMap[date] ?? 0) + entry.cost;
        }

        const normalized: DayCost[] = days.map(({ date, day }) => ({
          day,
          date,
          cost: dayCostMap[date] ?? 0,
        }));

        if (alive) {
          setData(normalized);
          setTotalCost(json.totals?.estimatedCost ?? 0);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    function schedule() {
      fetch_().finally(() => {
        if (alive) timerRef.current = setTimeout(schedule, 30_000);
      });
    }

    schedule();

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  return { data, totalCost, loading, error };
}
