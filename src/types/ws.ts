// ── WebSocket message types — server-to-client and client-to-server ───────────
//
// All messages are discriminated unions on the `type` field.

import type { TrackedAgent } from "./agent.js";
import type { Task, TaskChain, QueueStatus } from "./task.js";
import type { RpcCall } from "./api.js";

// ── Server → Client messages ──────────────────────────────────────────────────

export interface WsSessionsMsg {
  type: "sessions";
  sessions: Array<{ name: string; windows: Array<{ index: number; name: string; active: boolean }> }>;
}

export interface WsCaptureMsg {
  type: "capture";
  target: string;
  content: string;
}

export interface WsAgentsUpdatedMsg {
  type: "agents-updated";
  agents: TrackedAgent[];
}

export interface WsQueueStatusMsg extends QueueStatus {
  type: "queue-status";
}

export interface WsTaskSubmittedMsg {
  type: "task-submitted";
  task: Task;
}

export interface WsTaskAssignedMsg {
  type: "task-assigned";
  task: Task;
  worker: { target: string; name: string };
  dispatchReason: string;
}

export interface WsTaskCompletedMsg {
  type: "task-completed";
  task: Task;
}

export interface WsTaskFailedMsg {
  type: "task-failed";
  task: Task;
}

export interface WsTaskTimeoutMsg {
  type: "task-timeout";
  task: Task;
}

export interface WsChainCreatedMsg {
  type: "chain-created";
  chain: TaskChain;
}

export interface WsChainUpdatedMsg {
  type: "chain-updated";
  chain: TaskChain;
}

export interface WsChainCompletedMsg {
  type: "chain-completed";
  chain: TaskChain;
}

export interface WsChainFailedMsg {
  type: "chain-failed";
  chain: TaskChain;
}

export interface WsRpcInitiatedMsg {
  type: "rpc-initiated";
  call: RpcCall;
}

export interface WsRpcCompletedMsg {
  type: "rpc-completed";
  call: RpcCall;
}

export interface WsRpcFailedMsg {
  type: "rpc-failed";
  call: RpcCall;
  reason: string;
}

export interface WsAgentSpawnedMsg {
  type: "agent-spawned";
  sessionName: string;
}

export interface WsAgentKilledMsg {
  type: "agent-killed";
  target: string;
}

export interface WsAgentRenamedMsg {
  type: "agent-renamed";
  target: string;
  name: string;
}

export interface WsSessionKilledMsg {
  type: "session-killed";
  sessionName: string;
}

export interface WsTaskCancelResultMsg {
  type: "task-cancel-result";
  ok: boolean;
  taskId: string;
}

export interface WsChainCancelResultMsg {
  type: "chain-cancel-result";
  ok: boolean;
  chainId: string;
}

export interface WsChainSubmittedMsg {
  type: "chain-submitted";
  chain: TaskChain;
}

export interface WsSentMsg {
  type: "sent";
  ok: boolean;
  target: string;
  text: string;
}

export interface WsErrorMsg {
  type: "error";
  error: string;
}

/** Discriminated union of all server-to-client WebSocket messages. */
export type ServerToClientMsg =
  | WsSessionsMsg
  | WsCaptureMsg
  | WsAgentsUpdatedMsg
  | WsQueueStatusMsg
  | WsTaskSubmittedMsg
  | WsTaskAssignedMsg
  | WsTaskCompletedMsg
  | WsTaskFailedMsg
  | WsTaskTimeoutMsg
  | WsChainCreatedMsg
  | WsChainUpdatedMsg
  | WsChainCompletedMsg
  | WsChainFailedMsg
  | WsRpcInitiatedMsg
  | WsRpcCompletedMsg
  | WsRpcFailedMsg
  | WsAgentSpawnedMsg
  | WsAgentKilledMsg
  | WsAgentRenamedMsg
  | WsSessionKilledMsg
  | WsTaskCancelResultMsg
  | WsChainCancelResultMsg
  | WsChainSubmittedMsg
  | WsSentMsg
  | WsErrorMsg;

// ── Client → Server messages ──────────────────────────────────────────────────

import type { TaskPriority, TaskAffinity } from "./task.js";

export interface WsSubscribeMsg {
  type: "subscribe";
  target: string;
  lines?: number;
}

export interface WsSelectMsg {
  type: "select";
  target: string;
}

export interface WsSendKeysMsg {
  type: "send";
  target: string;
  text: string;
}

export interface WsSubmitTaskMsg {
  type: "submit-task";
  command: string;
  priority?: TaskPriority;
  affinity?: TaskAffinity;
}

export interface WsCancelTaskMsg {
  type: "cancel-task";
  taskId: string;
}

export interface WsSubmitChainMsg {
  type: "submit-chain";
  name: string;
  steps: Array<{ prompt: string; targetTag?: string; dependsOn?: number }>;
  priority?: TaskPriority;
}

export interface WsCancelChainMsg {
  type: "cancel-chain";
  chainId: string;
}

export interface WsKillAgentMsg {
  type: "kill-agent";
  target: string;
}

export interface WsToggleWorkerMsg {
  type: "toggle-worker";
  sessionName: string;
}

/** Discriminated union of all client-to-server WebSocket messages. */
export type ClientToServerMsg =
  | WsSubscribeMsg
  | WsSelectMsg
  | WsSendKeysMsg
  | WsSubmitTaskMsg
  | WsCancelTaskMsg
  | WsSubmitChainMsg
  | WsCancelChainMsg
  | WsKillAgentMsg
  | WsToggleWorkerMsg;
