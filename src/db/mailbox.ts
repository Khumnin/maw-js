import { Hono } from "hono";
import { insertMessage, getMessages, markMessageRead } from "./store.js";

export const mailboxRoutes = new Hono();

// POST /send — deliver a message to an agent's mailbox
mailboxRoutes.post("/send", async (c) => {
  try {
    const body = await c.req.json();
    const { from, to, subject, body: msgBody } = body;
    if (!from || typeof from !== "string") return c.json({ error: "from required" }, 400);
    if (!to || typeof to !== "string") return c.json({ error: "to required" }, 400);
    if (!subject || typeof subject !== "string") return c.json({ error: "subject required" }, 400);
    if (!msgBody || typeof msgBody !== "string") return c.json({ error: "body required" }, 400);
    const id = await insertMessage({ sender: from, recipient: to, subject, body: msgBody });
    return c.json({ ok: true, id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /:agent — list messages for an agent; ?unread=true filters to unread only
mailboxRoutes.get("/:agent", async (c) => {
  try {
    const agent = c.req.param("agent");
    const unread = c.req.query("unread") === "true";
    const messages = await getMessages(agent, unread);
    return c.json(messages);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// PATCH /:id/read — mark a message as read
mailboxRoutes.patch("/:id/read", async (c) => {
  try {
    const id = c.req.param("id");
    const ok = await markMessageRead(id);
    return c.json({ ok });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
