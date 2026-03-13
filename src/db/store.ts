import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAW_DB_PATH } from "../paths";

// ── DB path ───────────────────────────────────────────────────────────────────

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  const dbDir = dirname(MAW_DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  _db = new Database(MAW_DB_PATH, { create: true });
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");
  return _db;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initDb(): void {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id             TEXT    PRIMARY KEY,
      chain_id       TEXT,
      command        TEXT    NOT NULL,
      output         TEXT,
      status         TEXT    NOT NULL DEFAULT 'pending',
      assigned_to    TEXT,
      priority       TEXT    DEFAULT 'normal',
      dispatch_reason TEXT,
      affinity_json  TEXT,
      created_at     INTEGER NOT NULL,
      assigned_at    INTEGER,
      completed_at   INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT    PRIMARY KEY,
      sender     TEXT    NOT NULL,
      recipient  TEXT    NOT NULL,
      subject    TEXT    NOT NULL,
      body       TEXT    NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_by TEXT,
      updated_at INTEGER NOT NULL
    )
  `);
}

// ── Message type ──────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  read: boolean;
  createdAt: number;
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export interface StoredTask {
  id: string;
  chainId?: string;
  command: string;
  output?: string;
  status: string;
  assignedTo?: string;
  priority: string;
  dispatchReason?: string;
  affinity?: object;
  createdAt: number;
  assignedAt?: number;
  completedAt?: number;
}

type UpsertTaskInput = {
  id: string;
  chainId?: string;
  command: string;
  output?: string;
  status: string;
  assignedTo?: string;
  priority?: string;
  dispatchReason?: string;
  affinity?: object;
  createdAt?: number;
  assignedAt?: number;
  completedAt?: number;
};

export function upsertTask(task: UpsertTaskInput): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, chain_id, command, output, status, assigned_to,
      priority, dispatch_reason, affinity_json, created_at, assigned_at, completed_at
    ) VALUES (
      $id, $chain_id, $command, $output, $status, $assigned_to,
      $priority, $dispatch_reason, $affinity_json, $created_at, $assigned_at, $completed_at
    )
    ON CONFLICT(id) DO UPDATE SET
      chain_id        = excluded.chain_id,
      command         = excluded.command,
      output          = excluded.output,
      status          = excluded.status,
      assigned_to     = excluded.assigned_to,
      priority        = excluded.priority,
      dispatch_reason = excluded.dispatch_reason,
      affinity_json   = excluded.affinity_json,
      created_at      = excluded.created_at,
      assigned_at     = excluded.assigned_at,
      completed_at    = excluded.completed_at
  `);

  stmt.run({
    $id:              task.id,
    $chain_id:        task.chainId ?? null,
    $command:         task.command,
    $output:          task.output ?? null,
    $status:          task.status,
    $assigned_to:     task.assignedTo ?? null,
    $priority:        task.priority ?? "normal",
    $dispatch_reason: task.dispatchReason ?? null,
    $affinity_json:   task.affinity ? JSON.stringify(task.affinity) : null,
    $created_at:      task.createdAt ?? Date.now(),
    $assigned_at:     task.assignedAt ?? null,
    $completed_at:    task.completedAt ?? null,
  });
}

export function getTask(id: string): StoredTask | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM tasks WHERE id = $id");
  const row = stmt.get({ $id: id }) as Record<string, unknown> | null;
  return row ? deserializeTask(row) : null;
}

export function queryTasks(filter: {
  status?: string;
  chainId?: string;
  assignedTo?: string;
  limit?: number;
}): StoredTask[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.status !== undefined) {
    conditions.push("status = $status");
    params.$status = filter.status;
  }
  if (filter.chainId !== undefined) {
    conditions.push("chain_id = $chain_id");
    params.$chain_id = filter.chainId;
  }
  if (filter.assignedTo !== undefined) {
    conditions.push("assigned_to = $assigned_to");
    params.$assigned_to = filter.assignedTo;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = filter.limit !== undefined ? `LIMIT ${filter.limit}` : "";
  const sql = `SELECT * FROM tasks ${where} ORDER BY created_at DESC ${limitClause}`;

  const stmt = db.prepare(sql);
  // Cast to satisfy bun:sqlite's SQLQueryBindings — params is always a valid
  // named-parameter object at runtime, but the type union is overly strict.
  const rows = stmt.all(params as Parameters<typeof stmt.all>[0]) as Record<string, unknown>[];
  return rows.map(deserializeTask);
}

function deserializeTask(row: Record<string, unknown>): StoredTask {
  return {
    id:             row.id as string,
    chainId:        row.chain_id as string | undefined ?? undefined,
    command:        row.command as string,
    output:         row.output as string | undefined ?? undefined,
    status:         row.status as string,
    assignedTo:     row.assigned_to as string | undefined ?? undefined,
    priority:       (row.priority as string | undefined) ?? "normal",
    dispatchReason: row.dispatch_reason as string | undefined ?? undefined,
    affinity:       row.affinity_json ? JSON.parse(row.affinity_json as string) as object : undefined,
    createdAt:      row.created_at as number,
    assignedAt:     row.assigned_at as number | undefined ?? undefined,
    completedAt:    row.completed_at as number | undefined ?? undefined,
  };
}

// ── Message CRUD ──────────────────────────────────────────────────────────────

export function insertMessage(msg: {
  sender: string;
  recipient: string;
  subject: string;
  body: string;
}): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO messages (id, sender, recipient, subject, body, read, created_at)
    VALUES ($id, $sender, $recipient, $subject, $body, 0, $created_at)
  `);

  stmt.run({
    $id:         id,
    $sender:     msg.sender,
    $recipient:  msg.recipient,
    $subject:    msg.subject,
    $body:       msg.body,
    $created_at: now,
  });

  return id;
}

export function getMessages(recipient: string, unreadOnly = false): Message[] {
  const db = getDb();
  const sql = unreadOnly
    ? "SELECT * FROM messages WHERE recipient = $recipient AND read = 0 ORDER BY created_at DESC"
    : "SELECT * FROM messages WHERE recipient = $recipient ORDER BY created_at DESC";

  const stmt = db.prepare(sql);
  const rows = stmt.all({ $recipient: recipient }) as Record<string, unknown>[];
  return rows.map(deserializeMessage);
}

export function markMessageRead(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare("UPDATE messages SET read = 1 WHERE id = $id");
  const result = stmt.run({ $id: id });
  return result.changes > 0;
}

export function getMessage(id: string): Message | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM messages WHERE id = $id");
  const row = stmt.get({ $id: id }) as Record<string, unknown> | null;
  return row ? deserializeMessage(row) : null;
}

function deserializeMessage(row: Record<string, unknown>): Message {
  return {
    id:        row.id as string,
    sender:    row.sender as string,
    recipient: row.recipient as string,
    subject:   row.subject as string,
    body:      row.body as string,
    read:      (row.read as number) === 1,
    createdAt: row.created_at as number,
  };
}

// ── KV Store ──────────────────────────────────────────────────────────────────

type KvEntry = { key: string; value: string; updatedBy: string; updatedAt: number };

export function kvGet(key: string): KvEntry | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM kv_store WHERE key = $key");
  const row = stmt.get({ $key: key }) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    key:       row.key as string,
    value:     row.value as string,
    updatedBy: row.updated_by as string,
    updatedAt: row.updated_at as number,
  };
}

export function kvSet(key: string, value: string, author: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO kv_store (key, value, updated_by, updated_at)
    VALUES ($key, $value, $updated_by, $updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    $key:        key,
    $value:      value,
    $updated_by: author,
    $updated_at: Date.now(),
  });
}

export function kvList(): Array<{ key: string; updatedBy: string; updatedAt: number }> {
  const db = getDb();
  const stmt = db.prepare("SELECT key, updated_by, updated_at FROM kv_store ORDER BY key ASC");
  const rows = stmt.all({}) as Record<string, unknown>[];
  return rows.map((row) => ({
    key:       row.key as string,
    updatedBy: row.updated_by as string,
    updatedAt: row.updated_at as number,
  }));
}

export function kvDelete(key: string): boolean {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM kv_store WHERE key = $key");
  const result = stmt.run({ $key: key });
  return result.changes > 0;
}
