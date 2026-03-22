const DEFAULT_HOST = process.env.MAW_HOST || "white.local";
const IS_LOCAL = DEFAULT_HOST === "local" || DEFAULT_HOST === "localhost";

export async function ssh(cmd: string, host = DEFAULT_HOST): Promise<string> {
  const local = host === "local" || host === "localhost" || (host === DEFAULT_HOST && IS_LOCAL);
  const args = local ? ["bash", "-c", cmd] : ["ssh", host, cmd];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(err.trim() || `exit ${code}`);
  }
  return text.trim();
}

export interface Window {
  index: number;
  name: string;
  active: boolean;
}

export interface Session {
  name: string;
  windows: Window[];
}

export async function listSessions(host?: string): Promise<Session[]> {
  const raw = await ssh("tmux list-sessions -F '#{session_name}' 2>/dev/null", host);
  const sessions: Session[] = [];
  for (const s of raw.split("\n").filter(Boolean)) {
    const winRaw = await ssh(
      `tmux list-windows -t '${s}' -F '#{window_index}:#{window_name}:#{window_active}' 2>/dev/null`,
      host,
    );
    const windows = winRaw.split("\n").filter(Boolean).map(w => {
      const [idx, name, active] = w.split(":");
      return { index: +idx, name, active: active === "1" };
    });
    sessions.push({ name: s, windows });
  }
  return sessions;
}

export function findWindow(sessions: Session[], query: string): string | null {
  const q = query.toLowerCase();
  for (const s of sessions) {
    for (const w of s.windows) {
      if (w.name.toLowerCase().includes(q)) return `${s.name}:${w.index}`;
    }
  }
  if (query.includes(":")) return query;
  return null;
}

export async function capture(target: string, lines = 80, host?: string): Promise<string> {
  // -e preserves ANSI escape sequences (colors)
  // -S -N captures N lines of scrollback so the permission prompt is never cut off.
  // Previously the <= 50 path used `| tail -N` on the visible pane only, which
  // returned empty/whitespace when the prompt was in scrollback (above the cursor).
  return ssh(`tmux capture-pane -t '${target}' -e -p -S -${lines} 2>/dev/null`, host);
}

export async function selectWindow(target: string, host?: string): Promise<void> {
  await ssh(`tmux select-window -t '${target}' 2>/dev/null`, host);
}

export async function spawnAgent(
  name: string,
  workDir?: string,
  initialPrompt?: string,
  host?: string,
  agentName?: string,
  skipPermissions?: boolean,
): Promise<void> {
  // Create new detached tmux session
  // Replace leading ~ with $HOME so the shell expands it — tmux -c does not
  // expand tilde inside single quotes on all platforms.
  let dir = workDir || "$HOME";
  if (dir.startsWith("~")) {
    dir = "$HOME" + dir.slice(1);
  }
  const safeDir = dir.replace(/'/g, "'\\''");
  await ssh(`tmux new-session -d -s '${name}' -c '${safeDir}' 2>/dev/null || true`, host);
  await ssh(`tmux set-option -t '${name}' automatic-rename off 2>/dev/null`, host);
  const safeName = name.replace(/'/g, "'\\''");
  await ssh(`tmux rename-window -t '${safeName}' '${safeName}'`, host);

  // Give the shell ~400ms to initialize before sending anything
  await new Promise<void>((r) => setTimeout(r, 400));

  // Start Claude Code — build flags list
  const flags: string[] = [];
  if (agentName) {
    const safeAgent = agentName.replace(/'/g, "'\\''");
    flags.push(`--agent '${safeAgent}'`);
  }
  if (skipPermissions) flags.push("--dangerously-skip-permissions");
  const claudeCmd = `claude ${flags.join(" ")}`.trim();
  await ssh(`tmux send-keys -t '${name}' '${claudeCmd}' Enter`, host);

  // If an initial prompt was provided, wait for Claude to start (1.5s) then send it
  if (initialPrompt) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    const escaped = initialPrompt.replace(/'/g, "'\\''");
    await ssh(`tmux send-keys -t '${name}' -- '${escaped}' Enter`, host);
  }
}

export async function killSession(target: string, host?: string): Promise<void> {
  await ssh(`tmux kill-window -t '${target}' 2>/dev/null || true`, host);
}

export async function renameWindow(target: string, newName: string, host?: string): Promise<void> {
  // Sanitize: strip shell-dangerous characters, limit to 50 chars
  const safeName = newName.replace(/['"\\`$;|&<>(){}!#]/g, "").trim().slice(0, 50);
  if (!safeName) throw new Error("name must not be empty after sanitization");
  const escaped = safeName.replace(/'/g, "'\\''");
  await ssh(`tmux rename-window -t '${target}' '${escaped}'`, host);
}

export async function killEntireSession(sessionName: string, host?: string): Promise<void> {
  await ssh(`tmux kill-session -t '${sessionName}' 2>/dev/null || true`, host);
}

export async function sendKeys(target: string, text: string, host?: string): Promise<void> {
  // Special keys → send as tmux key names (no Enter appended)
  const SPECIAL_KEYS: Record<string, string> = {
    "\x1b": "Escape",
    "\x1b[A": "Up",
    "\x1b[B": "Down",
    "\x1b[C": "Right",
    "\x1b[D": "Left",
    "\x1b[Z": "BTab",
    "\t": "Tab",
    "\r": "Enter",
    "\b": "BSpace",
    "\x7f": "BSpace",
    "\x15": "C-u",
  };
  if (SPECIAL_KEYS[text]) {
    await ssh(`tmux send-keys -t '${target}' ${SPECIAL_KEYS[text]}`, host);
    return;
  }
  if (text.length === 1) {
    // Single char — send literally, no Enter (used for streaming mode)
    const escaped = text === "'" ? "\"'\"" : `'${text}'`;
    await ssh(`tmux send-keys -t '${target}' -l ${escaped}`, host);
  } else if (text.startsWith("/")) {
    // Slash commands: send char by char for interactive tools (Claude Code, etc.)
    for (const ch of text) {
      const escaped = ch === "'" ? "\"'\"" : `'${ch}'`;
      await ssh(`tmux send-keys -t '${target}' -l ${escaped}`, host);
    }
    await ssh(`tmux send-keys -t '${target}' Enter`, host);
  } else {
    const escaped = text.replace(/'/g, "'\\''");
    await ssh(`tmux send-keys -t '${target}' -- '${escaped}' Enter`, host);
  }
}
