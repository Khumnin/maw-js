// Soft modern terminal palette (inspired by Catppuccin Mocha)
const AC = [
  "#0a0a0f","#f38ba8","#a6e3a1","#f9e2af","#89b4fa","#cba6f7","#94e2d5","#cdd6f4",
  "#585b70","#f38ba8","#a6e3a1","#f9e2af","#89b4fa","#cba6f7","#94e2d5","#ffffff",
];

function a256(n: number): string {
  if (n < 16) return AC[n];
  if (n < 232) {
    n -= 16;
    return `rgb(${Math.floor(n / 36) * 51},${(Math.floor(n / 6) % 6) * 51},${(n % 6) * 51})`;
  }
  const v = (n - 232) * 10 + 8;
  return `rgb(${v},${v},${v})`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap bare URLs in the HTML string with clickable <a> tags.
 * Must be called AFTER esc() so we operate on already-escaped text.
 * The regex avoids matching URLs that are already inside an href attribute
 * by asserting the URL is not preceded by `href="` or `href='`.
 * Trailing punctuation characters that are unlikely to be part of a URL
 * (comma, period, closing paren/bracket/quote) are excluded from the match.
 */
function linkifyHtml(html: string): string {
  // Match http(s) URLs not already inside an href attribute value.
  // Negative lookbehind: not preceded by href=" or href='
  // The URL body excludes whitespace and HTML special chars already escaped,
  // and strips trailing sentence punctuation.
  return html.replace(
    /(?<!href=["'])https?:\/\/[^\s<>"'`\][\)]+/g,
    (url) => {
      // Strip trailing punctuation that is likely sentence punctuation, not part of URL
      const stripped = url.replace(/[.,;:!?\)\]'"`]+$/, "");
      const suffix = url.slice(stripped.length);
      return `<a href="${stripped}" target="_blank" rel="noopener noreferrer" style="color:#94e2d5;text-decoration:underline;cursor:pointer">${stripped}</a>${suffix}`;
    }
  );
}

// Supported file extensions for clickable file-path detection
const FILE_EXT = "ts|tsx|js|jsx|json|md|go|css|html|yaml|yml|toml|sql|sh|py|vb|cs|env|txt|cfg|conf|xml|svg|png|jpg|pdf|rs|rb|php|java|tf|scss|sass";

// Regex that matches file paths in already-HTML-escaped terminal text.
// Four groups in alternation:
//   1. Absolute paths: /Users/... /home/... /tmp/... /var/... /opt/... /etc/... /srv/... /app/...
//   2. Home-relative paths: ~/anything/file.ext
//   3. Dot-prefixed relative: ./dir/file.ext or ../dir/file.ext
//   4. Bare relative paths: docs/recruitment/file.md, src/lib/utils.ts
//      — must contain at least one slash and end with a known extension
// Anchored so we don't match inside HTML tag attributes (avoided via a lookbehind
// that rejects matches preceded by `="` which is how href/src attrs appear after esc()).
const FILE_PATH_RE = new RegExp(
  // Must not be preceded by: =" (HTML attr), / (mid-path), . (domain.com/), or word char (mid-token)
  "(?<![='\"/\\.\\w])" +
  "(" +
    // 1. Absolute path starting with known root prefixes
    "\\/(?:Users|home|tmp|var|opt|etc|srv|app)\\/[\\w./@-]+\\.(?:" + FILE_EXT + ")" +
    "|" +
    // 2. Home-relative: ~/path/to/file.ext
    "~\\/[\\w./@-]+\\.(?:" + FILE_EXT + ")" +
    "|" +
    // 3. Dot-prefixed relative: ./file.ext or ../dir/file.ext
    "\\.{1,2}\\/[\\w./@-]+\\.(?:" + FILE_EXT + ")" +
    "|" +
    // 4. Bare relative path: word/word/file.ext (at least one slash required)
    "[\\w@-]+\\/[\\w./@-]*[\\w-]+\\.(?:" + FILE_EXT + ")" +
  ")" +
  // Must not be followed by word characters or slash (avoid partial matches)
  "(?![\\w/])",
  "g"
);

/**
 * Wrap file paths in the HTML string with clickable anchors using event delegation.
 * Must be called AFTER linkifyHtml() so URL links are already wrapped.
 * Uses a data-path attribute so the click handler can read the raw path without
 * having to parse the display text.
 */
function linkifyFilePaths(html: string): string {
  // Reset lastIndex in case the regex is reused across calls
  FILE_PATH_RE.lastIndex = 0;
  return html.replace(FILE_PATH_RE, (path) => {
    return `<a class="file-link" data-path="${path}" style="color:#89b4fa;text-decoration:underline;text-decoration-style:dotted;cursor:pointer">${path}</a>`;
  });
}

// Box-drawing horizontal line characters (U+2500, U+2501, U+2504–U+250B, U+254C–U+254F, U+2550, U+2574–U+2577, etc.)
// We match the most common ones used by terminal UIs: ─ ━ ═ ╌ ╍
const BOX_HLINE_RE = /^[\u2500\u2501\u2504\u2505\u2508\u2509\u254C\u254D\u2550\u2574\u2576\u2578\u257A]+$/;

/**
 * Neutralize colors applied to pure horizontal box-drawing separator lines.
 *
 * Claude Code renders its agent-name pill separator (────────── [agent] ──────────)
 * using foreground color rgb(220,38,38) (Tailwind red-600) for the ─ characters.
 * These are structural chrome, not meaningful colored content. We replace the
 * foreground color for such runs with a dim neutral so they don't bleed red into
 * the terminal view.
 *
 * Strategy: for each text token (non-escape segment) that consists entirely of
 * horizontal box-drawing chars, if the current foreground is a non-neutral color
 * we override it with a dim gray during rendering.
 */
function isBoxHlineOnly(s: string): boolean {
  const stripped = s.replace(/\s/g, "");
  return stripped.length >= 3 && BOX_HLINE_RE.test(stripped);
}

/**
 * Rejoin URLs that were hard-wrapped by the terminal (e.g. by tmux capture-pane).
 * tmux inserts a hard newline at the terminal width, splitting long URLs mid-path.
 * This pre-processing step removes those synthetic newlines before any ANSI parsing
 * or linkification runs.
 *
 * Handles two cases:
 *   1. Clean wrap:   "…auth-se\nrvice/…"
 *   2. ANSI at wrap: "…auth-se\x1b[0m\n\x1b[32mrvice/…"
 *
 * The regex matches a URL fragment ending with a URL-safe character, optional ANSI
 * reset/set sequences straddling the newline, and a non-whitespace continuation
 * character on the next line.  The newline (and surrounding ANSI codes) is removed
 * so the two fragments merge into one URL.
 */
function rejoinWrappedUrls(text: string): string {
  // One or more optional ANSI SGR sequences (e.g. \x1b[0m or \x1b[32m)
  const ansi = "(?:\\x1b\\[[0-9;]*m)*";
  const re = new RegExp(
    // URL fragment ending with a URL-safe character (letter, digit, or /_=-)
    `(https?://[^\\s]*[a-zA-Z0-9/_=-])` +
    // Optional trailing spaces (tmux pads lines to terminal width), optional ANSI
    // codes before the newline, the newline itself, optional ANSI after
    `[ ]*${ansi}\\n${ansi}` +
    // Non-whitespace/non-newline character that continues the URL
    `([^\\s\\n])`,
    "g"
  );
  return text.replace(re, "$1$2");
}

export function ansiToHtml(text: string): string {
  // Rejoin URLs split across lines by terminal hard-wrap before any other processing.
  text = rejoinWrappedUrls(text);

  let h = "", fg: string | null = null, bg: string | null = null;
  let b = 0, d = 0, i = 0, u = 0, s = 0, open = 0;

  for (const p of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = p.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) {
      // Text token: check if it's a pure horizontal box-drawing separator line.
      // If so, and we currently have a non-null fg color, temporarily suppress
      // the open span and render these chars with a dim neutral color instead.
      if (isBoxHlineOnly(p) && fg !== null) {
        if (open) { h += "</span>"; open = 0; }
        h += `<span style="color:#3a3a4a">${esc(p)}</span>`;
        // Re-open the previous span state so subsequent tokens still get correct styling.
        const st: string[] = [];
        if (fg) st.push("color:" + fg);
        if (bg) st.push("background:" + bg);
        if (b) st.push("font-weight:bold");
        if (d) st.push("opacity:0.6");
        if (i) st.push("font-style:italic");
        if (u || s) st.push("text-decoration:" + (u ? "underline" : "") + (u && s ? " " : "") + (s ? "line-through" : ""));
        if (st.length) { h += `<span style="${st.join(";")}">`; open = 1; }
      } else {
        h += linkifyFilePaths(linkifyHtml(esc(p)));
      }
      continue;
    }
    if (open) { h += "</span>"; open = 0; }
    const codes = m[1] ? m[1].split(";").map(Number) : [0];
    for (let j = 0; j < codes.length; j++) {
      const c = codes[j];
      if (!c) { fg = bg = null; b = d = i = u = s = 0; }
      else if (c === 1) b = 1; else if (c === 2) d = 1; else if (c === 3) i = 1;
      else if (c === 4) u = 1; else if (c === 9) s = 1;
      else if (c === 22) b = d = 0; else if (c === 23) i = 0;
      else if (c === 24) u = 0; else if (c === 29) s = 0;
      else if (c >= 30 && c <= 37) fg = AC[c - 30];
      else if (c === 38 && codes[j + 1] === 5) { fg = a256(codes[j + 2]); j += 2; }
      else if (c === 38 && codes[j + 1] === 2) { fg = `rgb(${codes[j + 2]},${codes[j + 3]},${codes[j + 4]})`; j += 4; }
      else if (c === 39) fg = null;
      else if (c >= 40 && c <= 47) bg = AC[c - 40];
      else if (c === 48 && codes[j + 1] === 5) { bg = a256(codes[j + 2]); j += 2; }
      else if (c === 48 && codes[j + 1] === 2) { bg = `rgb(${codes[j + 2]},${codes[j + 3]},${codes[j + 4]})`; j += 4; }
      else if (c === 49) bg = null;
      else if (c >= 90 && c <= 97) fg = AC[c - 82];
      else if (c >= 100 && c <= 107) bg = AC[c - 92];
    }
    const st: string[] = [];
    if (fg) st.push("color:" + fg);
    if (bg) st.push("background:" + bg);
    if (b) st.push("font-weight:bold");
    if (d) st.push("opacity:0.6");
    if (i) st.push("font-style:italic");
    if (u || s) st.push("text-decoration:" + (u ? "underline" : "") + (u && s ? " " : "") + (s ? "line-through" : ""));
    if (st.length) { h += `<span style="${st.join(";")}">`; open = 1; }
  }
  if (open) h += "</span>";
  return h;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
