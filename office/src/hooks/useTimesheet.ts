import { useState, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: number;
  username: string;
  email: string;
}

export interface SpaceInfo {
  id: string;
  name: string;
}

export interface MemberWeeklySummary {
  userId: number;
  username: string;
  email: string;
  /** Map of ISO date (YYYY-MM-DD) → hours logged */
  days: Record<string, number>;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  /** Map of client name → hours */
  byClient: Record<string, number>;
}

export interface ProjectSummary {
  spaceId: string;
  spaceName: string;
  totalHours: number;
  memberCount: number;
  avgHoursPerMember: number;
}

export interface TimesheetSummaryData {
  members: MemberWeeklySummary[];
  dateRange: { start: string; end: string };
}

export interface TimesheetByProjectData {
  projects: ProjectSummary[];
  dateRange: { start: string; end: string };
}

// ── Hook: useTimesheetMembers ─────────────────────────────────────────────────

export interface UseTimesheetMembersReturn {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTimesheetMembers(): UseTimesheetMembersReturn {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheet/members");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; members: TeamMember[] };
      if (aliveRef.current) {
        setMembers(json.members ?? []);
        setLoading(false);
      }
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
  }, []);

  return { members, loading, error, refetch };
}

// ── Hook: useTimesheetSpaces ──────────────────────────────────────────────────

export interface UseTimesheetSpacesReturn {
  spaces: SpaceInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTimesheetSpaces(): UseTimesheetSpacesReturn {
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheet/spaces");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; spaces: SpaceInfo[] };
      setSpaces(json.spaces ?? []);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  return { spaces, loading, error, refetch };
}

// ── Hook: useTimesheetSummary ─────────────────────────────────────────────────

export interface UseTimesheetSummaryReturn {
  data: TimesheetSummaryData | null;
  loading: boolean;
  error: string | null;
  refetch: (start: string, end: string, spaceId?: string) => void;
}

export function useTimesheetSummary(): UseTimesheetSummaryReturn {
  const [data, setData] = useState<TimesheetSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (start: string, end: string, spaceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (spaceId) params.set("space_id", spaceId);
      const res = await fetch(`/api/timesheet/summary?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean } & TimesheetSummaryData;
      setData({ members: json.members ?? [], dateRange: json.dateRange });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch };
}

// ── Hook: useTimesheetByProject ───────────────────────────────────────────────

export interface UseTimesheetByProjectReturn {
  data: TimesheetByProjectData | null;
  loading: boolean;
  error: string | null;
  refetch: (start: string, end: string, spaceId?: string) => void;
}

export function useTimesheetByProject(): UseTimesheetByProjectReturn {
  const [data, setData] = useState<TimesheetByProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (start: string, end: string, spaceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (spaceId) params.set("space_id", spaceId);
      const res = await fetch(`/api/timesheet/by-project?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean } & TimesheetByProjectData;
      setData({ projects: json.projects ?? [], dateRange: json.dateRange });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch };
}

// ── Task-level types ──────────────────────────────────────────────────────────

export interface TaskEntry {
  userId: number;
  userName: string;
  date: string;
  hours: number;
  description: string;
}

export interface TaskDetail {
  taskId: string;
  taskName: string;
  taskUrl: string;
  taskTags: string[];
  spaceName: string;
  folderName: string;
  listName: string;
  classification: "billable" | "non-billable";
  clientName: string;
  entries: TaskEntry[];
  totalHours: number;
}

export interface TimesheetTasksData {
  tasks: TaskDetail[];
  dateRange: { start: string; end: string };
}

// ── Billing rule types ────────────────────────────────────────────────────────

export interface BillingRule {
  id: number;
  ruleType: "space" | "folder" | "tag";
  matchId: string | null;
  matchName: string | null;
  classification: "billable" | "non-billable";
  clientName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Hook: useTimesheetTasks ───────────────────────────────────────────────────

export interface UseTimesheetTasksReturn {
  data: TimesheetTasksData | null;
  loading: boolean;
  error: string | null;
  refetch: (start: string, end: string, spaceId?: string) => void;
}

export function useTimesheetTasks(): UseTimesheetTasksReturn {
  const [data, setData] = useState<TimesheetTasksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (start: string, end: string, spaceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (spaceId) params.set("space_id", spaceId);
      const res = await fetch(`/api/timesheet/tasks?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean } & TimesheetTasksData;
      setData({ tasks: json.tasks ?? [], dateRange: json.dateRange });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch };
}

// ── Hook: useBillingRules ─────────────────────────────────────────────────────

export interface UseBillingRulesReturn {
  rules: BillingRule[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  updateRule: (id: number, patch: { classification?: "billable" | "non-billable"; clientName?: string; matchName?: string }) => Promise<boolean>;
  createRule: (input: { ruleType: "space" | "folder" | "tag"; matchId: string; matchName?: string; classification: "billable" | "non-billable"; clientName?: string }) => Promise<BillingRule | null>;
  deleteRule: (id: number) => Promise<boolean>;
  seedRules: () => Promise<{ seeded: number; skipped: boolean }>;
}

export function useBillingRules(): UseBillingRulesReturn {
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheet/billing-rules");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; rules: BillingRule[] };
      setRules(json.rules ?? []);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  const updateRule = useCallback(async (
    id: number,
    patch: { classification?: "billable" | "non-billable"; clientName?: string; matchName?: string }
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/timesheet/billing-rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { ok: boolean; rule: BillingRule };
      if (json.ok) {
        setRules((prev) => prev.map((r) => (r.id === id ? json.rule : r)));
      }
      return json.ok;
    } catch {
      return false;
    }
  }, []);

  const createRule = useCallback(async (input: {
    ruleType: "space" | "folder" | "tag";
    matchId: string;
    matchName?: string;
    classification: "billable" | "non-billable";
    clientName?: string;
  }): Promise<BillingRule | null> => {
    try {
      const res = await fetch("/api/timesheet/billing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { ok: boolean; rule: BillingRule };
      if (json.ok) {
        setRules((prev) => [...prev, json.rule]);
        return json.rule;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const deleteRule = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/timesheet/billing-rules/${id}`, { method: "DELETE" });
      if (!res.ok) return false;
      const json = (await res.json()) as { ok: boolean };
      if (json.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
      return json.ok;
    } catch {
      return false;
    }
  }, []);

  const seedRules = useCallback(async (): Promise<{ seeded: number; skipped: boolean }> => {
    const res = await fetch("/api/timesheet/billing-rules/seed", { method: "POST" });
    const json = (await res.json()) as { ok: boolean; seeded: number; skipped: boolean };
    if (json.ok && !json.skipped) {
      await refetch();
    }
    return { seeded: json.seeded ?? 0, skipped: json.skipped ?? false };
  }, [refetch]);

  return { rules, loading, error, refetch, updateRule, createRule, deleteRule, seedRules };
}

// ── Types for folder-level data ───────────────────────────────────────────────

export interface FolderWithRule {
  id: string;
  name: string;
  classification: "billable" | "non-billable" | null;
  clientName: string | null;
  ruleId: number | null;
}

// ── Hook: useSpaceFolders ─────────────────────────────────────────────────────

export interface UseSpaceFoldersReturn {
  folders: FolderWithRule[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSpaceFolders(spaceId: string): UseSpaceFoldersReturn {
  const [folders, setFolders] = useState<FolderWithRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timesheet/spaces/${encodeURIComponent(spaceId)}/folders`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; folders: FolderWithRule[] };
      setFolders(json.folders ?? []);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [spaceId]);

  return { folders, loading, error, refetch };
}
