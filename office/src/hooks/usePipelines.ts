import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineInfo {
  id: number;
  projectId: number;
  projectName: string;
  projectPath: string;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  jobs?: JobInfo[];
}

export interface JobInfo {
  id: number;
  name: string;
  stage: string;
  status: string;
  webUrl: string;
  duration: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  runner: string | null;
}

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  nameWithNamespace?: string;
}

export interface UsePipelinesReturn {
  pipelines: PipelineInfo[];
  projects: GitLabProject[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * usePipelines — fetches GET /api/ci/pipelines on mount and polls every 30s.
 * Re-fetches immediately when `projectIds` changes.
 *
 * - `projectIds`: optional array of project IDs to filter by.
 *   When undefined or empty, all pipelines are fetched.
 * - `loading` is only true on the initial load to avoid re-poll flicker.
 * - Unique projects are extracted from pipeline data (no separate API call
 *   needed for the filter list).
 */
export function usePipelines(projectIds?: number[]): UsePipelinesReturn {
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aliveRef = useRef(true);
  const isInitialRef = useRef(true);

  // Stable serialised key so useCallback re-creates only when filter changes
  const filterKey = projectIds?.length ? projectIds.slice().sort().join(",") : "";

  const doFetch = useCallback(async () => {
    const url =
      filterKey
        ? `/api/ci/pipelines?projects=${filterKey}`
        : "/api/ci/pipelines";

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; pipelines: PipelineInfo[] };

      if (aliveRef.current) {
        const fetched = json.pipelines ?? [];
        setPipelines(fetched);

        // Derive unique projects from the returned pipeline list
        const projectMap = new Map<number, GitLabProject>();
        for (const p of fetched) {
          if (!projectMap.has(p.projectId)) {
            projectMap.set(p.projectId, {
              id: p.projectId,
              name: p.projectName,
              path: p.projectPath,
            });
          }
        }
        setProjects(Array.from(projectMap.values()));
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
  }, [filterKey]);

  useEffect(() => {
    aliveRef.current = true;
    isInitialRef.current = true;
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

  return { pipelines, projects, loading, error, refetch: doFetch };
}
