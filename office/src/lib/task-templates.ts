// ── Task Templates — localStorage CRUD ───────────────────────────────────────
//
// Stores user-defined task templates keyed by `maw-task-templates`.
// Templates are frontend-only (no backend persistence).

const STORAGE_KEY = "maw-task-templates";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskTemplate {
  /** Unique identifier — crypto.randomUUID() */
  id: string;
  /** Display name for the template */
  name: string;
  /** The command / prompt text */
  command: string;
  /** Optional affinity hints to pre-fill in TaskSubmitForm */
  affinity?: {
    tags?: string[];
    projectName?: string;
    preferAgent?: string;
  };
  /** Unix timestamp (ms) when the template was saved */
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidTemplate(item: unknown): item is TaskTemplate {
  if (item === null || typeof item !== "object") return false;
  const t = item as Record<string, unknown>;
  return (
    typeof t["id"] === "string" &&
    typeof t["name"] === "string" &&
    typeof t["command"] === "string" &&
    typeof t["createdAt"] === "number"
  );
}

function readStorage(): TaskTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTemplate);
  } catch {
    return [];
  }
}

function writeStorage(templates: TaskTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage may be full or unavailable — silently ignore
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns all templates sorted newest-first. */
export function getTemplates(): TaskTemplate[] {
  return readStorage().sort((a, b) => b.createdAt - a.createdAt);
}

/** Retrieves a single template by ID, or undefined if not found. */
export function getTemplateById(id: string): TaskTemplate | undefined {
  return readStorage().find((t) => t.id === id);
}

/**
 * Persists a template.
 * - If a template with the same `id` already exists it is replaced.
 * - Pass a partial object without `id` / `createdAt` — they are generated here.
 */
export function saveTemplate(
  partial: Omit<TaskTemplate, "id" | "createdAt"> & Partial<Pick<TaskTemplate, "id" | "createdAt">>
): TaskTemplate {
  const template: TaskTemplate = {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name,
    command: partial.command,
    affinity: partial.affinity,
    createdAt: partial.createdAt ?? Date.now(),
  };

  const existing = readStorage();
  const idx = existing.findIndex((t) => t.id === template.id);
  if (idx !== -1) {
    existing[idx] = template;
  } else {
    existing.push(template);
  }
  writeStorage(existing);
  return template;
}

/** Removes a template by ID. No-op if not found. */
export function deleteTemplate(id: string): void {
  const existing = readStorage().filter((t) => t.id !== id);
  writeStorage(existing);
}
