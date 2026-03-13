/**
 * Centralised path configuration for maw-js.
 *
 * All filesystem paths are derived from environment variables so that the
 * application is fully container-portable with no hardcoded absolute paths
 * (Story E.2 — NFR: configurable via environment variables ONLY).
 *
 * Environment variables (see .env.example at project root):
 *
 *   MAW_DATA_DIR      Base data directory.               Default: ./data
 *   MAW_DB_PATH       SQLite database file path.         Default: <MAW_DATA_DIR>/maw.db
 *   MAW_AGENTS_DIR    Claude agent definition files.     Default: ~/.claude/agents
 *   MAW_UPLOAD_DIR    Temporary upload staging dir.      Default: <MAW_DATA_DIR>/uploads
 *   MAW_CLAUDE_DIR    Claude config/project root.        Default: ~/.claude
 *
 * The module creates MAW_DATA_DIR and MAW_UPLOAD_DIR on first import so that
 * dependent code never needs to guard against a missing directory.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ── Helpers ───────────────────────────────────────────────────────────────────

function env(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Resolved paths ────────────────────────────────────────────────────────────

/** Base data directory — all persistent app data lives here by default. */
export const MAW_DATA_DIR = resolve(env("MAW_DATA_DIR", "./data"));

/**
 * SQLite database file.
 * Override MAW_DB_PATH to place the DB on a separate volume.
 */
export const MAW_DB_PATH = resolve(
  env("MAW_DB_PATH", join(MAW_DATA_DIR, "maw.db"))
);

/**
 * Directory containing Claude agent definition markdown files.
 * Defaults to ~/.claude/agents which is the standard Claude Code installation
 * location; override for containerised deployments.
 */
export const MAW_AGENTS_DIR = resolve(
  env("MAW_AGENTS_DIR", join(homedir(), ".claude", "agents"))
);

/**
 * Temporary staging directory for file uploads.
 * Files are written here by POST /api/upload and referenced by the agent.
 */
export const MAW_UPLOAD_DIR = resolve(
  env("MAW_UPLOAD_DIR", join(MAW_DATA_DIR, "uploads"))
);

/**
 * Root of the Claude configuration directory.
 * Used to locate JSONL session files and notification state.
 * Defaults to ~/.claude which is the standard Claude Code config location.
 */
export const MAW_CLAUDE_DIR = resolve(
  env("MAW_CLAUDE_DIR", join(homedir(), ".claude"))
);

// ── Bootstrap required directories on import ─────────────────────────────────

ensureDir(MAW_DATA_DIR);
ensureDir(MAW_UPLOAD_DIR);

// Export a typed config object for convenience
export const paths = {
  dataDir: MAW_DATA_DIR,
  dbPath: MAW_DB_PATH,
  agentsDir: MAW_AGENTS_DIR,
  uploadDir: MAW_UPLOAD_DIR,
  claudeDir: MAW_CLAUDE_DIR,
} as const;

export type Paths = typeof paths;
