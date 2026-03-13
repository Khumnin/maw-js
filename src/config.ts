import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "maw");
const CONFIG_FILE = join(CONFIG_DIR, "agents.json");

export interface AgentConfig {
  workers: string[];   // tmux session names tagged as workers
  personal: string[];  // explicitly tagged personal (anything not in workers is personal by default)
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): AgentConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return { workers: [], personal: [] };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      workers: Array.isArray(parsed.workers) ? parsed.workers : [],
      personal: Array.isArray(parsed.personal) ? parsed.personal : [],
    };
  } catch {
    return { workers: [], personal: [] };
  }
}

export function saveConfig(config: AgentConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function isWorker(sessionName: string): boolean {
  const config = loadConfig();
  return config.workers.includes(sessionName);
}

export function addWorker(sessionName: string): void {
  const config = loadConfig();
  if (!config.workers.includes(sessionName)) {
    config.workers.push(sessionName);
  }
  // Remove from personal if explicitly listed there
  config.personal = config.personal.filter((s) => s !== sessionName);
  saveConfig(config);
}

export function removeWorker(sessionName: string): void {
  const config = loadConfig();
  config.workers = config.workers.filter((s) => s !== sessionName);
  saveConfig(config);
}
