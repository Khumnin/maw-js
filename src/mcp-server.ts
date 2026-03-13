import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MAW_URL = process.env.MAW_URL || "http://localhost:3456";

const server = new McpServer({
  name: "maw-agent-rpc",
  version: "1.0.0",
});

async function mawFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${MAW_URL}${path}`, options);
  return res.json();
}

// 1. maw_rpc_call — call another agent and wait for the result
server.tool(
  "maw_rpc_call",
  "Call another agent to perform work and return the result. Use this instead of spawning sub-agents.",
  {
    to: z.string().describe("Target agent session name"),
    prompt: z.string().describe("What the target agent should do"),
    timeout: z.number().optional().describe("Timeout in seconds (default 120)"),
  },
  async ({ to, prompt, timeout }) => {
    const result = await mawFetch("/api/rpc/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "mcp-client",
        to,
        prompt,
        timeout: (timeout || 120) * 1000,
      }),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 2. maw_send_message — send a message to another agent's mailbox
server.tool(
  "maw_send_message",
  "Send a message to another agent's mailbox (fire-and-forget).",
  {
    to: z.string().describe("Target agent session name"),
    subject: z.string().describe("Message subject"),
    body: z.string().describe("Message body"),
  },
  async ({ to, subject, body }) => {
    const result = await mawFetch("/api/mailbox/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "mcp-client", to, subject, body }),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 3. maw_read_messages — read an agent's mailbox
server.tool(
  "maw_read_messages",
  "Read messages from an agent's mailbox.",
  {
    agent: z.string().describe("Agent session name whose mailbox to read"),
    unread_only: z
      .boolean()
      .optional()
      .describe("Only return unread messages (default true)"),
  },
  async ({ agent, unread_only }) => {
    const unread = unread_only !== false;
    const result = await mawFetch(
      `/api/mailbox/${encodeURIComponent(agent)}?unread=${unread}`
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 4. maw_kv_get — read a value from the shared KV store
server.tool(
  "maw_kv_get",
  "Read a value from the shared KV store.",
  {
    key: z.string().describe("Key to read"),
  },
  async ({ key }) => {
    const result = await mawFetch(`/api/kv/${encodeURIComponent(key)}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 5. maw_kv_set — write a value to the shared KV store
server.tool(
  "maw_kv_set",
  "Write a value to the shared KV store.",
  {
    key: z.string().describe("Key to write"),
    value: z.string().describe("Value to store (string; use JSON.stringify for objects)"),
  },
  async ({ key, value }) => {
    const result = await mawFetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, author: "mcp-client" }),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 6. maw_discover_agents — find available agents by criteria
server.tool(
  "maw_discover_agents",
  "Discover available agents. Filter by tag, status, or worker-only flag.",
  {
    tag: z.string().optional().describe("Filter by tag"),
    status: z.string().optional().describe("Filter by status (e.g. idle, busy)"),
    worker_only: z
      .boolean()
      .optional()
      .describe("Only return worker agents"),
  },
  async ({ tag, status, worker_only }) => {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (status) params.set("status", status);
    if (worker_only !== undefined) params.set("worker", String(worker_only));
    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await mawFetch(`/api/discovery/discover${query}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 7. maw_get_agent_context — get an agent's current working context
server.tool(
  "maw_get_agent_context",
  "Get an agent's current working context (directory, task, metadata).",
  {
    agent: z.string().describe("Agent session name or target identifier"),
  },
  async ({ agent }) => {
    const result = await mawFetch(
      `/api/discovery/${encodeURIComponent(agent)}/context`
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 8. maw_get_agent_output — get an agent's recent terminal output
server.tool(
  "maw_get_agent_output",
  "Get recent terminal output from an agent's session.",
  {
    agent: z.string().describe("Agent session name"),
    lines: z
      .number()
      .optional()
      .describe("Number of lines to return (default 100)"),
  },
  async ({ agent, lines }) => {
    const n = lines || 100;
    const result = await mawFetch(
      `/api/discovery/${encodeURIComponent(agent)}/output?lines=${n}`
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 9. maw_list_rpc_calls — list active RPC calls
server.tool(
  "maw_list_rpc_calls",
  "List all active (pending/in-flight) RPC calls.",
  {},
  async () => {
    const result = await mawFetch("/api/rpc");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 10. maw_kv_list — list all keys in the shared KV store
server.tool(
  "maw_kv_list",
  "List all keys currently stored in the shared KV store.",
  {},
  async () => {
    const result = await mawFetch("/api/kv");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// 11. maw_kv_delete — delete a key from the shared KV store
server.tool(
  "maw_kv_delete",
  "Delete a key from the shared KV store.",
  {
    key: z.string().describe("Key to delete"),
  },
  async ({ key }) => {
    const result = await mawFetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
