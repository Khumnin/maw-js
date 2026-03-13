// ── Task types — shared between backend and frontend ──────────────────────────

export type TaskPriority = "high" | "normal" | "low";
export type TaskStatus = "pending" | "assigned" | "completed" | "failed";
export type ChainStatus = "pending" | "running" | "completed" | "failed";

export interface TaskAffinity {
  tags?: string[];        // preferred tags: ['backend', 'frontend', 'infra']
  projectName?: string;  // preferred project name
  filePaths?: string[];  // related file paths
  preferAgent?: string;  // explicitly prefer a specific agent target
}

export interface Task {
  id: string;
  command: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;      // worker target (e.g. "worker-1:0")
  assignedToName?: string;  // worker session name (e.g. "worker-1")
  assignedAt?: number;
  completedAt?: number;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;          // ms, default 300_000 (5 min)
  output?: string;
  affinity?: TaskAffinity;
  dispatchReason?: string;  // human-readable explanation of why this agent was chosen
  // Chain fields
  chainId?: string;
  chainIndex?: number;
}

export interface TaskChainStep {
  prompt: string;
  targetTag?: string;  // 'backend' | 'frontend' | 'any' — currently unused, for future routing
  dependsOn?: number;  // step index this depends on (currently sequential only)
}

export interface TaskChain {
  id: string;
  name: string;
  steps: TaskChainStep[];
  status: ChainStatus;
  currentStep: number;
  taskIds: string[];   // task IDs created for each step (sparse — only submitted steps)
  priority: TaskPriority;
  createdAt: number;
  completedAt?: number;
}

export interface QueueStatus {
  pending: Task[];
  assigned: Task[];
  history: Task[];
}
