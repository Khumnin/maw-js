import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentDefinition } from "@/lib/types";

interface AgentDefPickerProps {
  value: string;
  onChange: (name: string) => void;
}

/**
 * AgentDefPicker — fetches GET /api/agent-definitions on mount and renders a
 * shadcn Select dropdown. Each option shows the agent name and description.
 */
export function AgentDefPicker({ value, onChange }: AgentDefPickerProps) {
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/agent-definitions")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AgentDefinition[]>;
      })
      .then((data) => {
        if (alive) {
          setDefinitions(Array.isArray(data) ? data : []);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <p className="text-[11px]" style={{ color: "var(--color-accent-danger)" }}>
        Failed to load definitions: {error}
      </p>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={loading || definitions.length === 0}>
      <SelectTrigger className="w-full min-w-0 text-[12px] h-9 overflow-hidden">
        {/* Constrain the value span so long names truncate instead of expanding the trigger */}
        <span className="flex-1 min-w-0 overflow-hidden">
          <SelectValue
            placeholder={loading ? "Loading…" : definitions.length === 0 ? "No definitions found" : "Select agent definition"}
            className="block truncate"
          />
        </span>
      </SelectTrigger>
      <SelectContent
        className="z-[200]"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border-strong)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {definitions.map((def) => (
          <SelectItem key={def.file} value={def.name}>
            <span className="flex flex-col gap-0.5 min-w-0 max-w-[360px]">
              <span className="text-[12px] font-medium truncate">{def.name}</span>
              {def.description && (
                <span
                  className="text-[10px] truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {def.description}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
