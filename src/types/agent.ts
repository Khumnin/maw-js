// ── Agent types — shared between backend and frontend ─────────────────────────

export type AgentStatus = "working" | "waiting" | "permission" | "error" | "idle";

export interface AgentContext {
  workingDir: string | null;       // parsed from shell prompt or cd commands
  recentFiles: string[];           // files mentioned in output (last 20)
  detectedStack: string[];         // ['go', 'typescript', 'python', etc.]
  projectName: string | null;      // inferred from workingDir last component
  lastActiveAt: number;            // timestamp of last activity
  tags: string[];                  // auto-detected: ['backend', 'frontend', 'infra']
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
