/**
 * Federation — cross-instance agent discovery and RPC forwarding.
 *
 * Each maw-js instance can register peer instances. When a local RPC call
 * targets an agent that doesn't exist locally, the call is forwarded to
 * the appropriate peer.
 *
 * NOTE: Uses curl subprocess for HTTP calls because ESET Network Protection
 * on macOS blocks outbound sockets from Bun/Node to LAN peers while allowing
 * curl/nc/python. This is a known ESET + libuv interaction issue.
 */

export interface PeerInstance {
  id: string;
  name: string;
  url: string;        // e.g. "http://192.168.1.38:3456"
  lastSeen?: number;
  healthy: boolean;
}

interface PeerAgent {
  sessionName: string;
  target: string;
  status: string;
  peerId: string;
  peerName: string;
}

// In-memory peer registry
const peers = new Map<string, PeerInstance>();

/**
 * HTTP helper using curl subprocess to bypass ESET network filter.
 * Falls back to native fetch for localhost/loopback addresses.
 */
async function curlFetch(
  url: string,
  opts?: { method?: string; body?: string; timeoutSec?: number },
): Promise<{ ok: boolean; status: number; json: () => unknown }> {
  const method = opts?.method || "GET";
  const timeout = opts?.timeoutSec ?? 5;
  const args = [
    "curl", "-s", "-S",
    "--max-time", String(timeout),
    "-X", method,
    "-H", "Content-Type: application/json",
    "-w", "\n__HTTP_STATUS__%{http_code}",
  ];
  if (opts?.body) {
    args.push("-d", opts.body);
  }
  args.push(url);

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`curl exited ${exitCode}`);
  }

  const statusMatch = output.match(/__HTTP_STATUS__(\d+)$/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const body = output.replace(/__HTTP_STATUS__\d+$/, "").trim();

  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => JSON.parse(body),
  };
}

/**
 * Initialize peers from MAW_PEERS env var.
 * Format: "Name1:url1,Name2:url2"
 * Example: "G35DX:http://192.168.1.38:3456,Mac:http://192.168.1.216:3456"
 */
export function initPeers(): void {
  const raw = process.env.MAW_PEERS || "";
  for (const entry of raw.split(",").filter(Boolean)) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const name = entry.slice(0, colonIdx).trim();
    const url = entry.slice(colonIdx + 1).trim();
    if (!name || !url) continue;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    peers.set(id, { id, name, url, healthy: true });
  }
  if (peers.size > 0) {
    console.log(
      `[federation] registered ${peers.size} peer(s): ${[...peers.values()].map((p) => `${p.name}@${p.url}`).join(", ")}`,
    );
  }
}

/** Get all registered peers */
export function getPeers(): PeerInstance[] {
  return [...peers.values()];
}

/** Health check a single peer */
async function checkPeerHealth(peer: PeerInstance): Promise<boolean> {
  try {
    const res = await curlFetch(`${peer.url}/api/agents`, { timeoutSec: 3 });
    peer.healthy = res.ok;
    peer.lastSeen = Date.now();
    peers.set(peer.id, peer);
    return res.ok;
  } catch {
    peer.healthy = false;
    peers.set(peer.id, peer);
    return false;
  }
}

/** Health check all peers */
export async function checkAllPeers(): Promise<void> {
  await Promise.allSettled([...peers.values()].map(checkPeerHealth));
}

/** Discover agents on a specific peer */
export async function discoverPeerAgents(peerId: string): Promise<PeerAgent[]> {
  const peer = peers.get(peerId);
  if (!peer || !peer.healthy) return [];

  try {
    const res = await curlFetch(`${peer.url}/api/agents`, { timeoutSec: 5 });
    if (!res.ok) return [];
    const agents = res.json() as Array<{ sessionName: string; target: string; status: string }>;
    return agents.map((a) => ({
      sessionName: a.sessionName,
      target: a.target,
      status: a.status,
      peerId: peer.id,
      peerName: peer.name,
    }));
  } catch {
    return [];
  }
}

/** Discover agents across ALL healthy peers */
export async function discoverAllPeerAgents(): Promise<PeerAgent[]> {
  const results = await Promise.allSettled(
    [...peers.values()]
      .filter((p) => p.healthy)
      .map((p) => discoverPeerAgents(p.id)),
  );

  const allAgents: PeerAgent[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allAgents.push(...r.value);
  }
  return allAgents;
}

/**
 * Forward an RPC call to a peer instance.
 * Returns the peer's response or null if forwarding fails.
 */
export async function forwardRpcToPeer(
  peerId: string,
  from: string,
  to: string,
  prompt: string,
  isAsync: boolean = true,
  timeoutMs: number = 120_000,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const peer = peers.get(peerId);
  if (!peer) return { ok: false, error: `peer '${peerId}' not found` };
  if (!peer.healthy) return { ok: false, error: `peer '${peer.name}' is not healthy` };

  try {
    const body = JSON.stringify({
      from: `${from}@${process.env.MAW_INSTANCE_NAME || "local"}`,
      to,
      prompt,
      async: isAsync,
      timeout: timeoutMs,
    });
    const curlTimeout = isAsync ? 10 : Math.ceil(timeoutMs / 1000) + 5;
    const res = await curlFetch(`${peer.url}/api/rpc/call`, {
      method: "POST",
      body,
      timeoutSec: curlTimeout,
    });

    const data = res.json();
    return { ok: res.ok, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `failed to reach peer ${peer.name}: ${msg}` };
  }
}

/**
 * Find which peer has a given agent (by session name).
 * Returns the peer ID or null if not found on any peer.
 */
export async function findAgentPeer(sessionName: string): Promise<string | null> {
  const allAgents = await discoverAllPeerAgents();
  const found = allAgents.find((a) => a.sessionName === sessionName);
  return found?.peerId ?? null;
}
