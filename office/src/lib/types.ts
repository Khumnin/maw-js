export interface Window {
  index: number;
  name: string;
  active: boolean;
}

export interface Session {
  name: string;
  windows: Window[];
}

export type PaneStatus = "working" | "waiting" | "permission" | "error" | "idle";

export interface AgentState {
  target: string;
  name: string;
  session: string;
  windowIndex: number;
  active: boolean;
  preview: string;
  status: PaneStatus;
}

export interface AgentEvent {
  time: number;
  target: string;
  type: "status" | "command" | "saiyan";
  detail: string;
}

// ── Command Center types ───────────────────────────────────────────────────────

export type AgentStatus = "working" | "waiting" | "permission" | "error" | "idle";
export type TaskPriority = "high" | "normal" | "low";
export type TaskStatus = "pending" | "assigned" | "completed" | "failed";

export interface AgentContext {
  workingDir: string | null;
  recentFiles: string[];
  detectedStack: string[];
  projectName: string | null;
  lastActiveAt: number;
  tags: string[];
}

export interface TrackedAgent {
  target: string;
  sessionName: string;
  windowIndex: number;
  windowName: string;
  status: AgentStatus;
  isWorker: boolean;
  currentTaskId?: string;
  lastActivityAt: number;
  preview: string;
  headline: string;
  context?: AgentContext;
}

export interface TaskAffinity {
  tags?: string[];
  projectName?: string;
  filePaths?: string[];
  preferAgent?: string;
}

export interface Task {
  id: string;
  command: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: number;
  completedAt?: number;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  output?: string;
  affinity?: TaskAffinity;
  dispatchReason?: string;
  // Chain linkage
  chainId?: string;
  chainIndex?: number;
}

export interface QueueStatus {
  pending: Task[];
  assigned: Task[];
  history: Task[];
}

// ── Task Chain types ──────────────────────────────────────────────────────────

export type ChainStatus = "pending" | "running" | "completed" | "failed";

export interface TaskChainStep {
  prompt: string;
  targetTag?: string;  // 'backend' | 'frontend' | 'any'
  dependsOn?: number;  // step index this depends on
}

export interface TaskChain {
  id: string;
  name: string;
  steps: TaskChainStep[];
  status: ChainStatus;
  currentStep: number;
  taskIds: string[];
  priority: TaskPriority;
  createdAt: number;
  completedAt?: number;
}
