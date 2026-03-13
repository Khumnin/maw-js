import { Hono } from "hono";
import { kvGet, kvSet, kvList, kvDelete } from "./store.js";

export const kvRoutes = new Hono();

// GET / — list all keys (no values)
kvRoutes.get("/", async (c) => {
  try {
    const keys = await kvList();
    return c.json(keys);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /:key — get a single KV pair, 404 if not found
kvRoutes.get("/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const entry = await kvGet(key);
    if (entry === null || entry === undefined) return c.json({ error: "not found" }, 404);
    return c.json(entry);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// PUT /:key — upsert a KV pair
kvRoutes.put("/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const body = await c.req.json();
    const { value, author } = body;
    if (value === undefined || typeof value !== "string") return c.json({ error: "value required" }, 400);
    await kvSet(key, value, author);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /:key — remove a KV pair
kvRoutes.delete("/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const ok = await kvDelete(key);
    return c.json({ ok });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
