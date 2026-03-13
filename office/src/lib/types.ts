// ── Shared types — imported from the backend /src/types/ via @shared alias ────
//
// All types used across backend and frontend are defined in /src/types/*.ts.
// This file re-exports everything so existing component imports continue to work
// without any changes to the component files.

export type {
  AgentStatus,
  AgentContext,
  TrackedAgent,
} from "@shared/agent";

export type {
  TaskPriority,
  TaskStatus,
  ChainStatus,
  TaskAffinity,
  Task,
  TaskChainStep,
  TaskChain,
  QueueStatus,
} from "@shared/task";

export type {
  RpcCall,
  AgentDefinition,
} from "@shared/api";

export type {
  ServerToClientMsg,
  ClientToServerMsg,
} from "@shared/ws";

// ── Frontend-only types (not shared with backend) ─────────────────────────────
//
// These types are used only within the React office app and have no backend
// counterpart. They are defined here rather than in /src/types/ to avoid
// pulling React/browser-only concerns into the Bun backend.

export interface Window {
  index: number;
  name: string;
  active: boolean;
}

export interface Session {
  name: string;
  windows: Window[];
}

/** UI-level status type used by useSessions — matches AgentStatus but kept
 *  as an alias to give components a semantic name for the polling hook. */
export type PaneStatus = AgentStatus;

// Re-import to satisfy the PaneStatus alias above without a circular reference
import type { AgentStatus } from "@shared/agent";

export interface AgentState {
  target: string;
  name: string;
  session: string;
  windowIndex: number;
  active: boolean;
  preview: string;
  status: PaneStatus;
  /** Worker flag sourced from the `agents-updated` WebSocket push */
  isWorker: boolean;
}

export interface AgentEvent {
  time: number;
  target: string;
  type: "status" | "command" | "saiyan";
  detail: string;
}
