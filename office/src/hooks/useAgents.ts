import { useState, useEffect } from "react";
import type { TrackedAgent } from "@/lib/types";

/**
 * useAgents — subscribes to `maw-ws-message` CustomEvent and maintains
 * a real-time array of TrackedAgent state from `agents-updated` pushes.
 */
export function useAgents(): TrackedAgent[] {
  const [agents, setAgents] = useState<TrackedAgent[]>([]);

  useEffect(() => {
    function handleEvent(e: Event) {
      const data = (e as CustomEvent<unknown>).detail;
      if (
        data !== null &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "agents-updated" &&
        "agents" in data &&
        Array.isArray((data as { agents: unknown }).agents)
      ) {
        setAgents((data as { agents: TrackedAgent[] }).agents);
      }
    }

    window.addEventListener("maw-ws-message", handleEvent);
    return () => window.removeEventListener("maw-ws-message", handleEvent);
  }, []);

  return agents;
}
