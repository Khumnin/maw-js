import { useState, useEffect, useCallback } from "react";
import { ChevronRight, Folder, FolderOpen, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

interface DirEntry {
  name: string;
  type: "directory" | "file";
}

interface BrowseResponse {
  entries: DirEntry[];
  current: string;
  parent: string;
}

interface DirectoryBrowserProps {
  /** Initial path to open. Defaults to home directory. */
  initialPath?: string;
  /** Called when the user confirms a path selection. */
  onSelect: (path: string) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

/**
 * Returns the name unchanged when it is safe to use as a path segment, or
 * null when the name contains path-traversal or null-byte sequences that
 * could escape the browsed directory.
 */
function safeName(name: string): string | null {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  return name;
}

/**
 * DirectoryBrowser — navigable file-system browser backed by GET /api/browse.
 *
 * Shows only directories. Users can navigate into sub-directories, go up to
 * the parent, and confirm the current path with "Select".
 */
export function DirectoryBrowser({ initialPath = "", onSelect, onCancel }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: BrowseResponse = await res.json();
      setCurrentPath(data.current);
      setParentPath(data.parent);
      // Show only directories
      setEntries(data.entries.filter((e) => e.type === "directory"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    browse(initialPath);
  }, [browse, initialPath]);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border overflow-hidden"
      style={{
        background: "var(--color-bg-elevated)",
        borderColor: "var(--color-border-default)",
        minHeight: 240,
        maxHeight: 320,
      }}
    >
      {/* Path bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0 overflow-hidden min-w-0"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <button
          type="button"
          onClick={() => parentPath && browse(parentPath)}
          disabled={!parentPath || loading}
          aria-label="Go to parent directory"
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded transition-colors",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            "hover:bg-white/10"
          )}
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft size={12} />
        </button>
        <span
          className="text-[11px] font-mono truncate flex-1"
          style={{ color: "var(--color-text-muted)" }}
          title={currentPath}
        >
          {currentPath}
        </span>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading && (
          <div
            className="flex items-center justify-center h-16 text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Loading…
          </div>
        )}

        {error && !loading && (
          <div
            className="flex items-center justify-center h-16 text-[11px] px-3 text-center"
            style={{ color: "var(--color-accent-danger)" }}
          >
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div
            className="flex items-center justify-center h-16 text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            No sub-directories
          </div>
        )}

        {!loading &&
          entries.map((entry) => {
            const safe = safeName(entry.name);
            if (!safe) return null;
            return (
              <button
                key={safe}
                type="button"
                onClick={() => browse(`${currentPath}/${safe}`)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-[12px]",
                  "transition-colors hover:bg-white/[0.06]"
                )}
                style={{ color: "var(--color-text-primary)" }}
              >
                <Folder
                  size={13}
                  className="shrink-0"
                  style={{ color: "var(--color-accent-warning)" }}
                />
                <span className="truncate">{safe}</span>
                <ChevronRight
                  size={11}
                  className="ml-auto shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                />
              </button>
            );
          })}
      </div>

      {/* Action row */}
      <div
        className="flex items-center justify-end gap-2 px-3 py-2 border-t shrink-0"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "px-3 py-1.5 rounded text-[12px] transition-colors",
            "hover:bg-white/[0.06]"
          )}
          style={{ color: "var(--color-text-secondary)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentPath)}
          disabled={loading}
          className={cn(
            "px-3 py-1.5 rounded text-[12px] font-medium transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{
            background: "var(--color-accent-primary)",
            color: "var(--color-text-inverted)",
          }}
        >
          <FolderOpen size={11} className="inline mr-1.5 -mt-0.5" />
          Select
        </button>
      </div>
    </div>
  );
}
