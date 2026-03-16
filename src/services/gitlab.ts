/**
 * GitLab API Service
 * Fetches pipeline data from GitLab for the CI/CD dashboard.
 * Uses a two-level cache: 5 min for project list, 10 s for dashboard pipelines.
 */

// ── Environment config ────────────────────────────────────────────────────────

const GITLAB_URL = process.env.GITLAB_URL || "https://gitlab.tigersoftcloud.com";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || "";

// ── Internal GitLab API shapes ────────────────────────────────────────────────

interface GitLabPipeline {
  id: number;
  iid: number;
  project_id: number;
  status: string; // "running" | "pending" | "success" | "failed" | "canceled" | "skipped" | "manual"
  source: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  web_url: string;
  duration: number | null;
  started_at: string | null;
  finished_at: string | null;
  runner?: { description: string } | null;
}

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  last_activity_at: string;
}

// ── Public types exported for the handler and frontend ────────────────────────

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
  duration?: number | null;
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

// ── GitLab HTTP helper ────────────────────────────────────────────────────────

async function gitlabFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${GITLAB_URL}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
  });
  if (!res.ok) throw new Error(`GitLab API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Project list (5-minute cache) ─────────────────────────────────────────────

let projectCache: { data: GitLabProject[]; ts: number } | null = null;
const PROJECT_CACHE_TTL = 5 * 60 * 1000;

export async function getProjects(): Promise<GitLabProject[]> {
  if (projectCache && Date.now() - projectCache.ts < PROJECT_CACHE_TTL) {
    return projectCache.data;
  }
  const projects = await gitlabFetch<GitLabProject[]>(
    "/projects?membership=true&per_page=100&simple=true&order_by=last_activity_at"
  );
  projectCache = { data: projects, ts: Date.now() };
  return projects;
}

// ── Per-project pipeline list ─────────────────────────────────────────────────

export async function getProjectPipelines(
  projectId: number,
  perPage = 10
): Promise<GitLabPipeline[]> {
  return gitlabFetch<GitLabPipeline[]>(
    `/projects/${projectId}/pipelines?per_page=${perPage}`
  );
}

// ── Pipeline job list ─────────────────────────────────────────────────────────

export async function getPipelineJobs(
  projectId: number,
  pipelineId: number
): Promise<GitLabJob[]> {
  return gitlabFetch<GitLabJob[]>(
    `/projects/${projectId}/pipelines/${pipelineId}/jobs?per_page=100`
  );
}

// ── Dashboard: pipelines across all active projects (10-second cache) ─────────

let dashboardCache: { data: PipelineInfo[]; ts: number } | null = null;
const DASHBOARD_CACHE_TTL = 10 * 1000;

export async function getDashboardPipelines(
  projectIds?: number[]
): Promise<PipelineInfo[]> {
  if (dashboardCache && Date.now() - dashboardCache.ts < DASHBOARD_CACHE_TTL) {
    return dashboardCache.data;
  }

  const projects = await getProjects();

  // When no explicit list is given, restrict to projects active in the last 7 days
  // to keep the dashboard focused and reduce API calls.
  const targetProjects = projectIds
    ? projects.filter((p) => projectIds.includes(p.id))
    : projects.filter((p) => {
        const lastActivity = new Date(p.last_activity_at).getTime();
        return Date.now() - lastActivity < 7 * 24 * 60 * 60 * 1000;
      });

  const allPipelines: PipelineInfo[] = [];

  // Fetch in parallel with a concurrency cap of 10 to avoid hammering GitLab
  const chunks: GitLabProject[][] = [];
  for (let i = 0; i < targetProjects.length; i += 10) {
    chunks.push(targetProjects.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (project) => {
        const pipelines = await getProjectPipelines(project.id, 5);
        return pipelines.map((p): PipelineInfo => ({
          id: p.id,
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path_with_namespace,
          status: p.status,
          ref: p.ref,
          sha: p.sha.slice(0, 8),
          webUrl: p.web_url,
          source: p.source,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        }));
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") allPipelines.push(...result.value);
    }
  }

  // Most recently created pipeline first
  allPipelines.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  dashboardCache = { data: allPipelines, ts: Date.now() };
  return allPipelines;
}

// ── Pipeline detail with jobs ─────────────────────────────────────────────────

export async function getPipelineDetail(
  projectId: number,
  pipelineId: number
): Promise<PipelineInfo> {
  const [pipeline, jobs, projects] = await Promise.all([
    gitlabFetch<GitLabPipeline>(`/projects/${projectId}/pipelines/${pipelineId}`),
    getPipelineJobs(projectId, pipelineId),
    getProjects(),
  ]);

  const project = projects.find((p) => p.id === projectId);

  return {
    id: pipeline.id,
    projectId,
    projectName: project?.name ?? `Project ${projectId}`,
    projectPath: project?.path_with_namespace ?? "",
    status: pipeline.status,
    ref: pipeline.ref,
    sha: pipeline.sha.slice(0, 8),
    webUrl: pipeline.web_url,
    source: pipeline.source,
    createdAt: pipeline.created_at,
    updatedAt: pipeline.updated_at,
    jobs: jobs.map((j): JobInfo => ({
      id: j.id,
      name: j.name,
      stage: j.stage,
      status: j.status,
      webUrl: j.web_url,
      duration: j.duration,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
      runner: j.runner?.description ?? null,
    })),
  };
}
