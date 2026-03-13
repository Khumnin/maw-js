import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { homedir } from "node:os";
import { validatePath, pathValidator } from "../../src/middleware/path-validator";

// ── validatePath unit tests ───────────────────────────────────────────────────

describe("validatePath", () => {
  const allowedRoots = [homedir(), "/tmp"];

  // ── Traversal patterns that must be blocked ─────────────────────────────────

  describe("blocks directory traversal patterns", () => {
    test("blocks ../ (Unix-style)", () => {
      expect(validatePath("../etc/passwd", allowedRoots)).toBe(false);
    });

    test("blocks ..\\ (Windows-style)", () => {
      expect(validatePath("..\\etc\\passwd", allowedRoots)).toBe(false);
    });

    test("blocks URL-encoded %2e%2e%2f", () => {
      expect(validatePath("%2e%2e%2f", allowedRoots)).toBe(false);
    });

    test("blocks URL-encoded %2e%2e/ (mixed)", () => {
      expect(validatePath("%2e%2e/etc/passwd", allowedRoots)).toBe(false);
    });

    test("blocks URL-encoded %2e%2e%5c (backslash variant)", () => {
      expect(validatePath("%2e%2e%5c", allowedRoots)).toBe(false);
    });

    test("blocks double-encoded %252e%252e%252f", () => {
      expect(validatePath("%252e%252e%252f", allowedRoots)).toBe(false);
    });

    test("blocks null byte (literal \\u0000)", () => {
      expect(validatePath("/tmp/file\u0000.txt", allowedRoots)).toBe(false);
    });

    test("blocks null byte URL-encoded %00", () => {
      expect(validatePath("/tmp/file%00.txt", allowedRoots)).toBe(false);
    });

    test("blocks trailing ..", () => {
      expect(validatePath("/tmp/..", allowedRoots)).toBe(false);
    });

    test("blocks deeply nested traversal", () => {
      expect(validatePath("/tmp/a/b/../../../etc/passwd", allowedRoots)).toBe(false);
    });
  });

  // ── Root confinement — paths that resolve outside allowed roots ─────────────

  describe("blocks paths outside allowed roots", () => {
    test("blocks absolute path to /etc/passwd", () => {
      expect(validatePath("/etc/passwd", allowedRoots)).toBe(false);
    });

    test("blocks /root (outside home and /tmp)", () => {
      expect(validatePath("/root/secret", allowedRoots)).toBe(false);
    });

    test("blocks /var/log", () => {
      expect(validatePath("/var/log/syslog", allowedRoots)).toBe(false);
    });

    test("blocks /proc/self/environ", () => {
      expect(validatePath("/proc/self/environ", allowedRoots)).toBe(false);
    });
  });

  // ── Legitimate paths that must be allowed ───────────────────────────────────

  describe("allows legitimate paths", () => {
    test("allows path inside /tmp", () => {
      expect(validatePath("/tmp/some-file.txt", allowedRoots)).toBe(true);
    });

    test("allows path inside homedir", () => {
      expect(validatePath(`${homedir()}/documents/report.md`, allowedRoots)).toBe(true);
    });

    test("allows deeply nested path inside /tmp", () => {
      expect(validatePath("/tmp/a/b/c/d/e/file.log", allowedRoots)).toBe(true);
    });

    test("allows homedir itself", () => {
      expect(validatePath(homedir(), allowedRoots)).toBe(true);
    });

    test("allows /tmp itself", () => {
      expect(validatePath("/tmp", allowedRoots)).toBe(true);
    });

    test("allows path with no allowed roots configured (unrestricted)", () => {
      expect(validatePath("/etc/passwd", [])).toBe(true);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    test("blocks empty string", () => {
      expect(validatePath("", allowedRoots)).toBe(false);
    });

    test("blocks single dot path", () => {
      // "." resolves to cwd which is unlikely to be /tmp or homedir in test env —
      // we don't assert a specific value; we confirm it doesn't throw.
      expect(() => validatePath(".", allowedRoots)).not.toThrow();
    });

    test("handles path with encoded slash %2f only", () => {
      // %2f alone is a forward-slash — not a traversal by itself but the pattern
      // check rejects it as a conservative measure.
      expect(validatePath("%2f", allowedRoots)).toBe(false);
    });

    test("handles very long path inside /tmp", () => {
      const long = "/tmp/" + "a".repeat(500) + "/file.txt";
      expect(validatePath(long, allowedRoots)).toBe(true);
    });

    test("root path / is outside allowed roots", () => {
      expect(validatePath("/", allowedRoots)).toBe(false);
    });
  });
});

// ── pathValidator middleware integration tests ────────────────────────────────

describe("pathValidator middleware", () => {
  function makeApp(options: Parameters<typeof pathValidator>[0]) {
    const app = new Hono();
    app.post(
      "/upload",
      pathValidator(options),
      (c) => c.json({ ok: true }),
    );
    app.get(
      "/browse",
      pathValidator(options),
      (c) => c.json({ ok: true }),
    );
    return app;
  }

  // ── POST body field validation ───────────────────────────────────────────────

  describe("POST body field validation", () => {
    test("returns 403 when body.path contains ../", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "../etc/passwd" }),
      });
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/Forbidden/);
    });

    test("returns 403 when body.path is URL-encoded traversal", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "%2e%2e%2fetc%2fpasswd" }),
      });
      expect(res.status).toBe(403);
    });

    test("returns 403 when body.path contains null byte", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/file\u0000.txt" }),
      });
      expect(res.status).toBe(403);
    });

    test("returns 403 when body.path escapes allowed root", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/etc/passwd" }),
      });
      expect(res.status).toBe(403);
    });

    test("returns 200 when body.path is within allowed root", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/safe-file.txt" }),
      });
      expect(res.status).toBe(200);
    });

    test("returns 200 when body.path is absent (no path to validate)", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ someOtherField: "value" }),
      });
      expect(res.status).toBe(200);
    });

    test("returns 403 for Windows-style ..\\ in body", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], bodyFields: ["path"] });
      const res = await app.request("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "..\\windows\\system32" }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ── GET query parameter validation ──────────────────────────────────────────

  describe("GET query parameter validation", () => {
    test("returns 403 when query param contains ../", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], queryParams: ["path"] });
      const res = await app.request("/browse?path=..%2Fetc%2Fpasswd");
      expect(res.status).toBe(403);
    });

    test("returns 403 when query param is outside allowed root", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], queryParams: ["path"] });
      const res = await app.request("/browse?path=/etc/passwd");
      expect(res.status).toBe(403);
    });

    test("returns 200 when query param is within allowed root", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], queryParams: ["path"] });
      const res = await app.request("/browse?path=/tmp/subdir");
      expect(res.status).toBe(200);
    });

    test("returns 200 when query param is absent", async () => {
      const app = makeApp({ allowedRoots: ["/tmp"], queryParams: ["path"] });
      const res = await app.request("/browse");
      expect(res.status).toBe(200);
    });
  });

  // ── Default options ──────────────────────────────────────────────────────────

  describe("default options", () => {
    test("uses homedir as default allowed root (no /tmp by default)", async () => {
      const app = new Hono();
      app.post("/test", pathValidator(), (c) => c.json({ ok: true }));

      // Path inside homedir — allowed
      const res1 = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `${homedir()}/some/file.md` }),
      });
      expect(res1.status).toBe(200);

      // /tmp is no longer in the default allowed roots — blocked
      const res2 = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tmp/foo.txt" }),
      });
      expect(res2.status).toBe(403);

      // /etc/passwd — blocked
      const res3 = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/etc/passwd" }),
      });
      expect(res3.status).toBe(403);
    });
  });
});
