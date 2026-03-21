/**
 * ClickUp API Service
 * Fetches time tracking data from ClickUp for the Timesheet Dashboard.
 * Uses a multi-level cache: 5 min for members/spaces, 30 sec for time entries.
 */

// ── Environment config ────────────────────────────────────────────────────────

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || "";
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID || "";
const CLICKUP_BASE = "https://api.clickup.com/api/v2";

import { buildClassifier } from "./billing";

// ── Internal ClickUp API shapes ───────────────────────────────────────────────

interface ClickUpUser {
  id: number;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string | null;
}

interface ClickUpMember {
  user: ClickUpUser;
}

interface ClickUpTeamResponse {
  team: {
    id: string;
    name: string;
    members: ClickUpMember[];
  };
}

interface ClickUpSpace {
  id: string;
  name: string;
}

interface ClickUpSpacesResponse {
  spaces: ClickUpSpace[];
}

interface ClickUpFolder {
  id: string;
  name: string;
}

interface ClickUpFoldersResponse {
  folders: ClickUpFolder[];
}

interface ClickUpTask {
  id: string;
  name: string;
  status?: { status: string };
  url?: string;
  tags?: Array<{ name: string }>;
}

interface ClickUpTimeEntry {
  id: string;
  task: ClickUpTask | null;
  user: ClickUpUser;
  start: string; // millisecond timestamp as string
  end: string;   // millisecond timestamp as string
  duration: string; // milliseconds as string
  billable: boolean;
  description: string;
  tags: string[];
  source?: string;
  task_location?: {
    space_id: string;
    folder_id?: string;
    list_id?: string;
    /** ClickUp API does NOT return space_name in time entries — resolve via getSpaces() */
    space_name?: string;
    folder_name?: string;
    list_name?: string;
  } | null;
}

interface ClickUpTimeEntriesResponse {
  data: ClickUpTimeEntry[];
}

// ── Public types exported for the handler and frontend ────────────────────────

export interface TeamMember {
  id: number;
  username: string;
  email: string;
}

export interface SpaceInfo {
  id: string;
  name: string;
}

export interface DayHours {
  /** ISO date string YYYY-MM-DD */
  date: string;
  hours: number;
}

export interface MemberWeeklySummary {
  userId: number;
  username: string;
  email: string;
  /** Map of ISO date → hours logged */
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

export interface TimesheetSummaryResponse {
  members: MemberWeeklySummary[];
  dateRange: { start: string; end: string };
}

export interface TimesheetByProjectResponse {
  projects: ProjectSummary[];
  dateRange: { start: string; end: string };
}

export interface FolderInfo {
  id: string;
  name: string;
}

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

export interface TimesheetTasksResponse {
  tasks: TaskDetail[];
  dateRange: { start: string; end: string };
}

// ── ClickUp HTTP helper ───────────────────────────────────────────────────────

async function clickupFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CLICKUP_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: CLICKUP_TOKEN },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp API ${res.status}: ${res.statusText} — ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Team members (5-minute cache) ────────────────────────────────────────────

let membersCache: { data: TeamMember[]; ts: number } | null = null;
const MEMBERS_CACHE_TTL = 5 * 60 * 1000;

export async function getTeamMembers(): Promise<TeamMember[]> {
  if (membersCache && Date.now() - membersCache.ts < MEMBERS_CACHE_TTL) {
    return membersCache.data;
  }
  const resp = await clickupFetch<ClickUpTeamResponse>(`/team/${CLICKUP_TEAM_ID}`);
  const members: TeamMember[] = resp.team.members.map((m) => ({
    id: m.user.id,
    username: m.user.username,
    email: m.user.email,
  }));
  membersCache = { data: members, ts: Date.now() };
  return members;
}

// ── Spaces (5-minute cache) ───────────────────────────────────────────────────

let spacesCache: { data: SpaceInfo[]; ts: number } | null = null;
const SPACES_CACHE_TTL = 5 * 60 * 1000;

export async function getSpaces(): Promise<SpaceInfo[]> {
  if (spacesCache && Date.now() - spacesCache.ts < SPACES_CACHE_TTL) {
    return spacesCache.data;
  }
  const resp = await clickupFetch<ClickUpSpacesResponse>(
    `/team/${CLICKUP_TEAM_ID}/space`,
    { archived: "false" }
  );
  const spaces: SpaceInfo[] = resp.spaces.map((s) => ({ id: s.id, name: s.name }));
  spacesCache = { data: spaces, ts: Date.now() };
  return spaces;
}

// ── Folders (5-minute cache per space) ───────────────────────────────────────

const foldersCache = new Map<string, { data: ClickUpFolder[]; ts: number }>();
const FOLDERS_CACHE_TTL = 5 * 60 * 1000;

export async function getFoldersForSpace(spaceId: string): Promise<ClickUpFolder[]> {
  const cached = foldersCache.get(spaceId);
  if (cached && Date.now() - cached.ts < FOLDERS_CACHE_TTL) {
    return cached.data;
  }
  try {
    const resp = await clickupFetch<ClickUpFoldersResponse>(
      `/space/${spaceId}/folder`,
      { archived: "false" }
    );
    const folders = resp.folders ?? [];
    foldersCache.set(spaceId, { data: folders, ts: Date.now() });
    return folders;
  } catch {
    // Return empty on error — folder names are best-effort enrichment
    foldersCache.set(spaceId, { data: [], ts: Date.now() });
    return [];
  }
}

/**
 * Builds a Map<folder_id, folder_name> for all spaces that appear in the
 * given set of space IDs.
 */
async function buildFolderNameMap(spaceIds: Set<string>): Promise<Map<string, string>> {
  const results = await Promise.all(
    Array.from(spaceIds).map((sid) => getFoldersForSpace(sid))
  );
  const map = new Map<string, string>();
  for (const folders of results) {
    for (const f of folders) {
      map.set(f.id, f.name);
    }
  }
  return map;
}

// ── Time entries (30-second cache) ───────────────────────────────────────────

interface TimeEntriesKey {
  startMs: number;
  endMs: number;
  spaceId?: string;
}

interface TimeEntriesCache {
  key: TimeEntriesKey;
  data: ClickUpTimeEntry[];
  ts: number;
}

let timeEntriesCache: TimeEntriesCache | null = null;
const TIME_ENTRIES_CACHE_TTL = 30 * 1000;

function cacheKeyMatches(a: TimeEntriesKey, b: TimeEntriesKey): boolean {
  return a.startMs === b.startMs && a.endMs === b.endMs && a.spaceId === b.spaceId;
}

async function getTimeEntries(
  startMs: number,
  endMs: number,
  spaceId?: string
): Promise<ClickUpTimeEntry[]> {
  const key: TimeEntriesKey = { startMs, endMs, spaceId };
  if (
    timeEntriesCache &&
    Date.now() - timeEntriesCache.ts < TIME_ENTRIES_CACHE_TTL &&
    cacheKeyMatches(timeEntriesCache.key, key)
  ) {
    return timeEntriesCache.data;
  }

  // Must pass all member IDs to get entries for everyone
  const members = await getTeamMembers();
  const assigneeIds = members.map((m) => String(m.id)).join(",");

  const params: Record<string, string> = {
    start_date: String(startMs),
    end_date: String(endMs),
    assignee: assigneeIds,
  };
  if (spaceId) {
    params.space_id = spaceId;
  }

  const resp = await clickupFetch<ClickUpTimeEntriesResponse>(
    `/team/${CLICKUP_TEAM_ID}/time_entries`,
    params
  );
  const entries = resp.data ?? [];
  timeEntriesCache = { key, data: entries, ts: Date.now() };
  return entries;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateParam(dateStr: string): Date {
  // Expect YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the local date string (YYYY-MM-DD) for a Unix millisecond timestamp. */
function msToLocalDate(ms: number): string {
  return toISODate(new Date(ms));
}

// ── Aggregate: weekly summary (person × day) ─────────────────────────────────

export async function getTimesheetSummary(
  startDate: string,
  endDate: string,
  spaceId?: string
): Promise<TimesheetSummaryResponse> {
  const start = parseDateParam(startDate);
  const end = parseDateParam(endDate);
  // end-of-day for end date
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);

  const [entries, members] = await Promise.all([
    getTimeEntries(start.getTime(), endOfDay.getTime(), spaceId),
    getTeamMembers(),
  ]);

  // Build folder name map for billing enrichment
  const spaceIds = new Set<string>();
  for (const e of entries) {
    if (e.task_location?.space_id) spaceIds.add(e.task_location.space_id);
  }
  const folderNameMap = await buildFolderNameMap(spaceIds);

  // Build billing classifier
  const classifier = buildClassifier();

  // Build member lookup map
  const memberMap = new Map<number, TeamMember>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // Aggregate hours per user per day + billing breakdown
  const userDayMap     = new Map<number, Record<string, number>>();
  const userBillable   = new Map<number, number>();
  const userNonBillable= new Map<number, number>();
  const userByClient   = new Map<number, Record<string, number>>();

  for (const entry of entries) {
    const userId = entry.user.id;
    const durationMs = Number(entry.duration);
    if (!durationMs || durationMs <= 0) continue;
    const durationHours = durationMs / 3_600_000;

    // Use start timestamp to determine the day
    const startMs = Number(entry.start);
    const dateKey = msToLocalDate(startMs);

    if (!userDayMap.has(userId)) {
      userDayMap.set(userId, {});
    }
    const dayMap = userDayMap.get(userId)!;
    dayMap[dateKey] = (dayMap[dateKey] ?? 0) + durationHours;

    // Billing classification
    const sid = entry.task_location?.space_id ?? "";
    const fid = entry.task_location?.folder_id;
    const taskTags = entry.task?.tags?.map((t) => t.name) ?? [];
    const classification = classifier.classify(sid, fid, taskTags);
    const client = classifier.clientFor(sid, fid);

    if (classification === "billable") {
      userBillable.set(userId, (userBillable.get(userId) ?? 0) + durationHours);
    } else {
      userNonBillable.set(userId, (userNonBillable.get(userId) ?? 0) + durationHours);
    }

    if (!userByClient.has(userId)) userByClient.set(userId, {});
    const clientMap = userByClient.get(userId)!;
    clientMap[client] = (clientMap[client] ?? 0) + durationHours;
  }

  // Suppress unused variable warning — folderNameMap used in task detail, not here
  void folderNameMap;

  // Build result — include only members who are in our team
  const result: MemberWeeklySummary[] = [];

  for (const member of members) {
    const days            = userDayMap.get(member.id) ?? {};
    const totalHours      = Object.values(days).reduce((sum, h) => sum + h, 0);
    const billableHours   = userBillable.get(member.id) ?? 0;
    const nonBillableHours= userNonBillable.get(member.id) ?? 0;
    const byClient        = userByClient.get(member.id) ?? {};
    result.push({
      userId: member.id,
      username: member.username,
      email: member.email,
      days,
      totalHours,
      billableHours,
      nonBillableHours,
      byClient,
    });
  }

  // Sort by total hours desc, then by username asc
  result.sort((a, b) => {
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
    return a.username.localeCompare(b.username);
  });

  return {
    members: result,
    dateRange: { start: startDate, end: endDate },
  };
}

// ── Aggregate: by project/space ───────────────────────────────────────────────

export async function getTimesheetByProject(
  startDate: string,
  endDate: string,
  spaceId?: string
): Promise<TimesheetByProjectResponse> {
  const start = parseDateParam(startDate);
  const end = parseDateParam(endDate);
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);

  const [entries, spaces] = await Promise.all([
    getTimeEntries(start.getTime(), endOfDay.getTime(), spaceId),
    getSpaces(),
  ]);

  // Build space ID → name lookup from the spaces endpoint (task_location in time
  // entries does not include space_name — the field must be resolved separately).
  const spaceNameLookup = new Map<string, string>(spaces.map((s) => [s.id, s.name]));

  // Aggregate hours per space per user
  const spaceUserHours = new Map<string, Map<number, number>>();
  const spaceNames = new Map<string, string>();

  for (const entry of entries) {
    const durationMs = Number(entry.duration);
    if (!durationMs || durationMs <= 0) continue;
    const durationHours = durationMs / 3_600_000;

    const sid = entry.task_location?.space_id ?? "unknown";
    // Prefer the spaces-cache name; fall back to whatever the entry carries (future-proofing)
    const sname =
      spaceNameLookup.get(sid) ??
      entry.task_location?.space_name ??
      "Unknown Space";
    spaceNames.set(sid, sname);

    if (!spaceUserHours.has(sid)) {
      spaceUserHours.set(sid, new Map());
    }
    const userHours = spaceUserHours.get(sid)!;
    userHours.set(entry.user.id, (userHours.get(entry.user.id) ?? 0) + durationHours);
  }

  const projects: ProjectSummary[] = [];
  for (const [sid, userHours] of spaceUserHours.entries()) {
    const totalHours = Array.from(userHours.values()).reduce((s, h) => s + h, 0);
    const memberCount = userHours.size;
    projects.push({
      spaceId: sid,
      spaceName: spaceNames.get(sid) ?? "Unknown Space",
      totalHours,
      memberCount,
      avgHoursPerMember: memberCount > 0 ? totalHours / memberCount : 0,
    });
  }

  projects.sort((a, b) => b.totalHours - a.totalHours);

  return {
    projects,
    dateRange: { start: startDate, end: endDate },
  };
}

// ── Aggregate: task-level detail ─────────────────────────────────────────────

export async function getTimesheetTasks(
  startDate: string,
  endDate: string,
  spaceId?: string
): Promise<TimesheetTasksResponse> {
  const start = parseDateParam(startDate);
  const end = parseDateParam(endDate);
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);

  const [entries, spaces, members] = await Promise.all([
    getTimeEntries(start.getTime(), endOfDay.getTime(), spaceId),
    getSpaces(),
    getTeamMembers(),
  ]);

  // Build space name lookup
  const spaceNameLookup = new Map<string, string>(spaces.map((s) => [s.id, s.name]));

  // Build folder name map
  const spaceIds = new Set<string>();
  for (const e of entries) {
    if (e.task_location?.space_id) spaceIds.add(e.task_location.space_id);
  }
  const folderNameMap = await buildFolderNameMap(spaceIds);

  // Build member ID → username lookup
  const memberNameMap = new Map<number, string>();
  for (const m of members) memberNameMap.set(m.id, m.username);

  // Build billing classifier
  const classifier = buildClassifier();

  // Group entries by task ID
  const taskMap = new Map<
    string,
    {
      task: ClickUpTask;
      spaceId: string;
      folderId: string;
      listId: string;
      entries: TaskEntry[];
    }
  >();

  for (const entry of entries) {
    const durationMs = Number(entry.duration);
    if (!durationMs || durationMs <= 0) continue;
    const durationHours = durationMs / 3_600_000;

    const taskId = entry.task?.id ?? `no-task-${entry.id}`;
    const taskObj: ClickUpTask = entry.task ?? {
      id: taskId,
      name: entry.description || "No Task",
    };

    const sid = entry.task_location?.space_id ?? "";
    const fid = entry.task_location?.folder_id ?? "";
    const lid = entry.task_location?.list_id ?? "";

    if (!taskMap.has(taskId)) {
      taskMap.set(taskId, {
        task: taskObj,
        spaceId: sid,
        folderId: fid,
        listId: lid,
        entries: [],
      });
    }

    const taskData = taskMap.get(taskId)!;
    taskData.entries.push({
      userId:      entry.user.id,
      userName:    memberNameMap.get(entry.user.id) ?? entry.user.username,
      date:        msToLocalDate(Number(entry.start)),
      hours:       durationHours,
      description: entry.description ?? "",
    });
  }

  // Build the response
  const tasks: TaskDetail[] = [];

  for (const [, data] of taskMap.entries()) {
    const { task, spaceId: sid, folderId: fid, entries: taskEntries } = data;
    const spaceName  = spaceNameLookup.get(sid) ?? "Unknown Space";
    const folderName = (fid && folderNameMap.get(fid)) || "—";
    const taskTags   = task.tags?.map((t) => t.name) ?? [];
    const classification = classifier.classify(sid, fid, taskTags);
    const clientName = classifier.clientFor(sid, fid);
    const totalHours = taskEntries.reduce((s, e) => s + e.hours, 0);

    tasks.push({
      taskId:         task.id,
      taskName:       task.name,
      taskUrl:        task.url ?? `https://app.clickup.com/t/${task.id}`,
      taskTags,
      spaceName,
      folderName,
      listName:       data.listId ? data.listId : "—",
      classification,
      clientName,
      entries:        taskEntries,
      totalHours,
    });
  }

  // Sort by totalHours desc
  tasks.sort((a, b) => b.totalHours - a.totalHours);

  return {
    tasks,
    dateRange: { start: startDate, end: endDate },
  };
}

// ── Week grouping helper ──────────────────────────────────────────────────────

interface WeekGroup {
  label: string;
  dates: string[];
}

/**
 * Groups the dates in [startDate, endDate] into Mon–Sun ISO weeks.
 * Partial weeks at the start/end are included as-is.
 */
function groupDatesByWeek(startDate: string, endDate: string): WeekGroup[] {
  const startD = parseDateParam(startDate);
  const endD = parseDateParam(endDate);

  const groups: WeekGroup[] = [];
  const cur = new Date(startD);

  while (cur <= endD) {
    const weekGroup: string[] = [];
    // Find the Monday of this week
    const dayOfWeek = cur.getDay(); // 0=Sun,...,6=Sat
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekMon = new Date(cur);
    weekMon.setDate(weekMon.getDate() - daysFromMon);

    // Walk Mon through Sun but only include dates within [startD, endD]
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekMon);
      d.setDate(d.getDate() + i);
      if (d >= startD && d <= endD) {
        weekGroup.push(toISODate(d));
      }
    }

    if (weekGroup.length > 0) {
      const first = weekGroup[0];
      const last = weekGroup[weekGroup.length - 1];
      const firstDate = new Date(first + "T12:00:00");
      const lastDate = new Date(last + "T12:00:00");
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      groups.push({ label: `${fmt(firstDate)} – ${fmt(lastDate)}`, dates: weekGroup });
    }

    // Advance cur to the Monday after this week's Sunday
    const nextMon = new Date(weekMon);
    nextMon.setDate(nextMon.getDate() + 7);
    cur.setTime(nextMon.getTime());
  }

  return groups;
}

/** Returns true when the date range spans more than 7 days (monthly export mode). */
function isMonthlyRange(startDate: string, endDate: string): boolean {
  const startD = parseDateParam(startDate);
  const endD = parseDateParam(endDate);
  const diffMs = endD.getTime() - startD.getTime();
  return diffMs > 7 * 24 * 60 * 60 * 1000;
}

// ── CSV export ────────────────────────────────────────────────────────────────

export async function getTimesheetCsv(
  startDate: string,
  endDate: string,
  spaceId?: string
): Promise<string> {
  const [summaryData, projectData, taskData] = await Promise.all([
    getTimesheetSummary(startDate, endDate, spaceId),
    getTimesheetByProject(startDate, endDate, spaceId),
    getTimesheetTasks(startDate, endDate, spaceId),
  ]);

  const monthly = isMonthlyRange(startDate, endDate);
  const csvLines: string[] = [];

  if (monthly) {
    // ── Monthly export: group by week, show weekly subtotals per person ────────

    const weeks = groupDatesByWeek(startDate, endDate);
    const weekLabels = weeks.map((w) => w.label);

    csvLines.push("# Monthly Timesheet Summary");
    csvLines.push(`# Period: ${startDate} to ${endDate}`);
    csvLines.push("");

    // Header: Name, Email, Week1, Week2, ..., Total, Billable, Non-Billable, Bill%, Status
    const header = ["Name", "Email", ...weekLabels, "Total", "Billable", "Non-Billable", "Bill%", "Status"].join(",");
    csvLines.push(header);

    for (const member of summaryData.members) {
      const weekCells = weeks.map((week) => {
        const weekHours = week.dates.reduce((sum, d) => sum + (member.days[d] ?? 0), 0);
        return weekHours > 0 ? weekHours.toFixed(2) : "0";
      });

      // Determine per-week status (flag weeks that are full Mon–Sun and under 40h)
      const weekStatuses = weeks.map((week) => {
        if (week.dates.length < 7) return null;
        const weekHours = week.dates.reduce((sum, d) => sum + (member.days[d] ?? 0), 0);
        return weekHours < 40 ? "Under 40h" : "OK";
      });
      const overallStatus = member.totalHours >= 40 ? "OK" : "Under 40h";
      const flaggedWeeks = weekStatuses
        .map((s, i) => (s === "Under 40h" ? `Week ${i + 1}` : null))
        .filter(Boolean);
      const statusNote =
        flaggedWeeks.length > 0
          ? `Under 40h (${flaggedWeeks.join(", ")})`
          : overallStatus;

      const billPct = member.totalHours > 0
        ? `${((member.billableHours / member.totalHours) * 100).toFixed(1)}%`
        : "0%";

      const row = [
        `"${member.username}"`,
        `"${member.email}"`,
        ...weekCells,
        member.totalHours.toFixed(2),
        member.billableHours.toFixed(2),
        member.nonBillableHours.toFixed(2),
        billPct,
        `"${statusNote}"`,
      ].join(",");
      csvLines.push(row);
    }
  } else {
    // ── Weekly export: one column per day ─────────────────────────────────────

    const startD = parseDateParam(startDate);
    const endD = parseDateParam(endDate);
    const dates: string[] = [];
    const cur = new Date(startD);
    while (cur <= endD) {
      dates.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const dayLabels = dates.map((d) => {
      const day = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
      return `${day} (${d})`;
    });

    csvLines.push("# Weekly Timesheet Summary");
    csvLines.push(`# Period: ${startDate} to ${endDate}`);
    csvLines.push("");
    const header = ["Name", "Email", ...dayLabels, "Total", "Billable", "Non-Billable", "Bill%", "Status"].join(",");
    csvLines.push(header);

    for (const member of summaryData.members) {
      const dayCells = dates.map((d) => {
        const h = member.days[d] ?? 0;
        return h > 0 ? h.toFixed(2) : "0";
      });
      const status = member.totalHours >= 40 ? "OK" : "Under 40h";
      const billPct = member.totalHours > 0
        ? `${((member.billableHours / member.totalHours) * 100).toFixed(1)}%`
        : "0%";
      const row = [
        `"${member.username}"`,
        `"${member.email}"`,
        ...dayCells,
        member.totalHours.toFixed(2),
        member.billableHours.toFixed(2),
        member.nonBillableHours.toFixed(2),
        billPct,
        status,
      ].join(",");
      csvLines.push(row);
    }
  }

  csvLines.push("");

  // Section 2: Project breakdown
  csvLines.push("# Project Breakdown");
  csvLines.push("");
  csvLines.push(["Project / Space", "Total Hours", "# People", "Avg Hours/Person"].join(","));

  for (const proj of projectData.projects) {
    const row = [
      `"${proj.spaceName}"`,
      proj.totalHours.toFixed(2),
      String(proj.memberCount),
      proj.avgHoursPerMember.toFixed(2),
    ].join(",");
    csvLines.push(row);
  }

  csvLines.push("");

  // Section 3: Client breakdown
  const clientTotals = new Map<string, { hours: number; people: Set<number> }>();
  for (const member of summaryData.members) {
    for (const [client, hours] of Object.entries(member.byClient)) {
      if (!clientTotals.has(client)) clientTotals.set(client, { hours: 0, people: new Set() });
      const ct = clientTotals.get(client)!;
      ct.hours += hours;
      ct.people.add(member.userId);
    }
  }

  csvLines.push("# By Client");
  csvLines.push("");
  csvLines.push(["Client Name", "Total Hours", "# People"].join(","));
  const sortedClients = Array.from(clientTotals.entries()).sort((a, b) => b[1].hours - a[1].hours);
  for (const [client, data] of sortedClients) {
    csvLines.push([`"${client}"`, data.hours.toFixed(2), String(data.people.size)].join(","));
  }

  csvLines.push("");

  // Section 4: Task detail
  csvLines.push("# Task Detail");
  csvLines.push("");
  csvLines.push(["Task Name", "Space", "Folder", "Classification", "Client", "Person", "Date", "Hours", "Tags"].join(","));

  for (const task of taskData.tasks) {
    for (const entry of task.entries) {
      const row = [
        `"${task.taskName.replace(/"/g, '""')}"`,
        `"${task.spaceName}"`,
        `"${task.folderName}"`,
        task.classification,
        `"${task.clientName}"`,
        `"${entry.userName}"`,
        entry.date,
        entry.hours.toFixed(2),
        `"${task.taskTags.join(", ")}"`,
      ].join(",");
      csvLines.push(row);
    }
  }

  return csvLines.join("\n");
}
