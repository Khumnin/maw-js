/**
 * Path-Traversal Validation Middleware
 *
 * Prevents directory traversal attacks on any endpoint that accepts
 * filesystem paths. Blocks ../  ..\  URL-encoded variants and null bytes,
 * then resolves the canonical path and verifies it stays within an allowed
 * root directory.
 */

import type { Context, MiddlewareHandler } from "hono";
import { resolve } from "path";
import { homedir } from "node:os";

// ── Traversal patterns to reject immediately ──────────────────────────────────

const BLOCKED_PATTERNS: RegExp[] = [
  /\.\.[/\\]/,          // ../  or ..\
  /\.\.$/, // trailing ..
  /%2e%2e/i,            // URL-encoded ..
  /%2f/i,               // URL-encoded /
  /%5c/i,               // URL-encoded backslash
  /\u0000/,             // null byte (literal)
  /%00/,                // null byte (URL-encoded)
];

/**
 * Returns true when the path string contains no traversal patterns.
 * This is a pre-resolution guard; the post-resolution root check is the
 * definitive boundary enforcement.
 */
function containsTraversalPattern(path: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(path));
}

/**
 * Decode percent-encoded characters so that double-encoded sequences like
 * `%252e%252e` are caught by the pattern check above.
 */
function decodeAllPercent(input: string): string {
  try {
    // Iteratively decode until stable (handles double-encoding)
    let prev = input;
    let next = decodeURIComponent(input.replace(/\+/g, " "));
    while (next !== prev) {
      prev = next;
      next = decodeURIComponent(next.replace(/\+/g, " "));
    }
    return next;
  } catch {
    // If decoding fails the string is malformed; return as-is so pattern
    // checks still apply to the raw string.
    return input;
  }
}

// ── Core validation utility ───────────────────────────────────────────────────

/**
 * Validate `path` against a list of `allowedRoots`.
 *
 * Returns `true` when the path is safe; `false` when it should be blocked.
 *
 * Steps:
 *  1. Reject empty / non-string values.
 *  2. Decode all percent-encoding and reject traversal patterns.
 *  3. Resolve to an absolute canonical path (relative → process.cwd()).
 *  4. Confirm the resolved path starts with at least one allowed root.
 */
export function validatePath(path: string, allowedRoots: string[]): boolean {
  if (!path || typeof path !== "string") return false;

  // Decode and check raw patterns
  const decoded = decodeAllPercent(path);
  if (containsTraversalPattern(decoded) || containsTraversalPattern(path)) {
    return false;
  }

  // Resolve to canonical absolute path
  const canonical = resolve(decoded);

  // Must be inside at least one allowed root
  if (allowedRoots.length === 0) return true; // no restriction configured

  return allowedRoots.some((root) => {
    const normalRoot = resolve(root);
    return canonical === normalRoot || canonical.startsWith(normalRoot + "/");
  });
}

// ── Middleware options ────────────────────────────────────────────────────────

export interface PathValidatorOptions {
  /**
   * Directories the resolved path must be confined to.
   * Defaults to [homedir()] when not provided.
   * Production callers should always supply explicit roots via the
   * ALLOWED_ROOTS constant in server.ts rather than relying on this default.
   */
  allowedRoots?: string[];

  /**
   * Names of JSON body fields that contain paths to validate.
   * Defaults to ["path", "cwd", "workDir"].
   */
  bodyFields?: string[];

  /**
   * Names of query parameters that contain paths to validate.
   * Defaults to ["path"].
   */
  queryParams?: string[];
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Hono middleware that validates path inputs in the request body and query
 * string. Returns 403 Forbidden if any path fails validation.
 *
 * Usage:
 *   app.post("/api/open-file", pathValidator({ allowedRoots: [homedir()] }), handler)
 */
export function pathValidator(options: PathValidatorOptions = {}): MiddlewareHandler {
  const allowedRoots = options.allowedRoots ?? [homedir()];
  const bodyFields = options.bodyFields ?? ["path", "cwd", "workDir"];
  const queryParams = options.queryParams ?? ["path"];

  return async (c: Context, next) => {
    // ── Validate query parameters ────────────────────────────────────────────
    for (const param of queryParams) {
      const value = c.req.query(param);
      if (value === undefined || value === null || value === "") continue;

      if (!validatePath(value, allowedRoots)) {
        return c.json(
          { error: `Forbidden: invalid path in query parameter '${param}'` },
          403,
        );
      }
    }

    // ── Validate JSON body fields ────────────────────────────────────────────
    // Only attempt body parsing for methods that carry a body.
    const method = c.req.method.toUpperCase();
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const contentType = c.req.header("content-type") ?? "";
      if (contentType.includes("application/json")) {
        let body: Record<string, unknown>;
        try {
          body = await c.req.json<Record<string, unknown>>();
        } catch {
          // Malformed JSON — let the route handler deal with it
          await next();
          return;
        }

        for (const field of bodyFields) {
          const value = body[field];
          if (value === undefined || value === null) continue;
          if (typeof value !== "string") continue;
          if (value === "") continue;

          if (!validatePath(value, allowedRoots)) {
            return c.json(
              { error: `Forbidden: invalid path in body field '${field}'` },
              403,
            );
          }
        }

        // Re-attach the parsed body so downstream handlers can still read it.
        // Hono caches req.json() after the first call, so this is safe.
      }
    }

    await next();
  };
}
