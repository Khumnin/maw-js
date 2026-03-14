// ── API types — request/response contracts ────────────────────────────────────
//
// Zod schemas are defined alongside TypeScript types so that the same module
// provides both the runtime validator (schema) and the static type (inferred).

import { z } from "zod";

// ── RPC ───────────────────────────────────────────────────────────────────────

export type RpcStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface RpcCall {
  id: string;
  from: string;           // caller agent session name
  to: string;             // target agent session name
  prompt: string;         // the work to do
  taskId: string;         // underlying dispatcher task ID
  status: RpcStatus;
  output?: string;        // captured output from target agent
  createdAt: number;
  completedAt?: number;
  timeout: number;        // ms, default 120000
}

// ── Agent Definitions ─────────────────────────────────────────────────────────

export interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  file: string;
}

// ── Zod schemas for API boundary validation ───────────────────────────────────

export const SubmitTaskSchema = z.object({
  command:  z.string().min(1, "command required"),
  priority: z.enum(["high", "normal", "low"]).optional(),
  affinity: z
    .object({
      tags:         z.array(z.string()).optional(),
      projectName:  z.string().optional(),
      filePaths:    z.array(z.string()).optional(),
      preferAgent:  z.string().optional(),
    })
    .optional(),
});

export type SubmitTaskInput = z.infer<typeof SubmitTaskSchema>;

export const CancelTaskSchema = z.object({
  taskId: z.string().min(1, "taskId required"),
});

export type CancelTaskInput = z.infer<typeof CancelTaskSchema>;

export const SubmitChainSchema = z.object({
  name:     z.string().min(1, "name required"),
  steps:    z
    .array(
      z.object({
        prompt:    z.string().min(1, "step prompt required"),
        targetTag: z.string().optional(),
        dependsOn: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1, "steps must be non-empty"),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

export type SubmitChainInput = z.infer<typeof SubmitChainSchema>;

export const WorkerActionSchema = z.object({
  sessionName: z.string().min(1, "sessionName required"),
  action:      z.enum(["add", "remove"]),
});

export type WorkerActionInput = z.infer<typeof WorkerActionSchema>;

export const SpawnAgentSchema = z.object({
  name:            z.string().min(1, "name required").regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/, "invalid session name"),
  workDir:         z.string().optional(),
  initialPrompt:   z.string().optional(),
  agentName:       z.string().regex(/^[a-zA-Z0-9._-]+$/, "agentName contains invalid characters").optional(),
  project:         z.string().max(64).optional(),
  skipPermissions: z.boolean().default(false),
});

export const SetProjectSchema = z.object({
  project: z.string().max(64),
});

export type SpawnAgentInput = z.infer<typeof SpawnAgentSchema>;

export const RpcCallSchema = z.object({
  from:    z.string().min(1, "from (caller session name) required"),
  to:      z.string().min(1, "to (target session name) required"),
  prompt:  z.string().min(1, "prompt required"),
  timeout: z.number().int().min(1_000).max(300_000).optional(),
});

export type RpcCallInput = z.infer<typeof RpcCallSchema>;

// ── Goals ─────────────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  title: z.string().min(1, "title required").max(200, "title too long (max 200 chars)"),
});

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;

export const UpdateGoalSchema = z.object({
  title:         z.string().min(1).max(200).optional(),
  status:        z.enum(["in_progress", "completed"]).optional(),
  linkChainId:   z.string().min(1).optional(),
  unlinkChainId: z.string().min(1).optional(),
});

export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
