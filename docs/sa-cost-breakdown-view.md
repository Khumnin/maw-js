# Solution Architecture: Cost Breakdown View

**Date:** 2026-03-14
**PRD:** `docs/prd-cost-breakdown-view.md`
**Status:** Ready for implementation

---

## 1. API Contract

### 1.1 `GET /api/token-usage/by-agent`

Aggregates token usage grouped by agent name (tmux session name).

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `range` | `string` | `"7d"` | One of: `7d`, `30d`, `mtd`, `all` |

**Range definitions:**
- `7d` -- sessions with `lastSeen >= now - 7 days`
- `30d` -- sessions with `lastSeen >= now - 30 days`
- `mtd` -- sessions with `lastSeen >= 1st of current calendar month at 00:00 local time`
- `all` -- no date filter

**Response `200 OK`:**

```jsonc
{
  "agents": [
    {
      "agentName": "backend-developer",   // tmux session name, or null
      "estimatedCost": 10.70,
      "inputTokens": 344000,
      "outputTokens": 113700,
      "cacheCreation": 28000,
      "cacheRead": 150000,
      "sessionCount": 8,
      "turnCount": 142,
      "costShare": 0.369                   // proportion of totalCost (0..1)
    }
  ],
  "projects": [
    {
      "project": "maw-js",                // derived from JSONL dir slug
      "estimatedCost": 24.15,
      "sessionCount": 12,
      "costShare": 0.834
    }
  ],
  "totalCost": 28.96,
  "totalSessions": 15,
  "range": "7d",
  "cachedAt": "2026-03-14T10:30:00.000Z"
}
```

**Response `400`:**

```json
{ "error": "Invalid range. Must be one of: 7d, 30d, mtd, all" }
```

**Response `500`:**

```json
{ "error": "Failed to parse JSONL files: <message>" }
```

**Notes on sort order:** `agents` array is sorted by `estimatedCost` descending. `projects` array is sorted by `estimatedCost` descending.

### 1.2 Agent Name Attribution

The existing `getRealtimeSessions()` function already builds a map from `sessionPrefix` (first 8 chars of the UUID) to `sessionName` (the tmux session name, which IS the agent role name like `backend-developer`).

**Attribution logic in the new endpoint:**

1. Call `getRealtimeSessions()` to get the live `sessionPrefix -> sessionName` map.
2. Call `getAllParsedFiles()` (shared cache, 10s TTL) to get all parsed JSONL session data.
3. For each parsed file, `sessionId.slice(0, 8)` yields the prefix. Look it up in the realtime map.
4. If found: `agentName = realtimeMap[prefix].sessionName`.
5. If not found (session terminated, tmux gone): `agentName = null`. These get grouped under a synthetic `"(unknown)"` agent entry.

**Limitation:** Only currently-running tmux sessions can be attributed. Terminated sessions show as `(unknown)`. This is acceptable for Sprint 1. The PRD's C3 (persistent `cost_snapshots` table) would solve this in Sprint 2.

### 1.3 Project Attribution

The JSONL files all live under a single `JSONL_DIR` path today. The directory slug in that path (e.g., `-Users-kanatekhumnin-Project`) represents the Claude Code project. For the current single-project setup, all sessions share one project.

**Multi-project support:** If `MAW_CLAUDE_DIR` is set (default `~/.claude`), scan `~/.claude/projects/*/` for JSONL files across multiple project directories. Each directory name becomes the project slug. The last path segment is cleaned up:
- `-Users-kanatekhumnin-Project-maw-js` becomes `maw-js` (extract last segment after the final `-Project-` or last path component)

For Sprint 1, single-project is sufficient. The `projects` array will contain one entry. If the project slug cannot be determined, use `"default"`.

---

## 2. Data Flow

```
JSONL files on disk
        |
        v
getAllParsedFiles()  <-- shared 10s TTL cache (parsedFilesCache)
        |                already exists in token-usage.ts
        v
+-------+-------+
|               |
v               v
buildByAgent()  buildTokenUsage() (existing)
|
|  1. Get realtime sessions (prefix -> name map)
|  2. For each parsed file:
|     a. Match prefix to agent name
|     b. Apply time range filter on lastSeen
|     c. Group by agentName, sum tokens/cost
|     d. Group by project (from dir slug)
|  3. Sort agents by cost desc
|  4. Compute costShare per agent
|
v
GET /api/token-usage/by-agent response
```

**Key reuse points:**
- `getAllParsedFiles()` -- already cached, already parses all JSONL files
- `estimateCost()` -- already computed per-session in `buildTokenUsage()`; reuse the same `RawSessionData` which already has hourBuckets and timestamps
- `getRealtimeSessions()` -- already maps prefixes to tmux names
- No new file I/O, no new SQLite tables

**Cache strategy:** The new endpoint shares `parsedFilesCache` (10s TTL). An additional 10s TTL cache is added for the by-agent response itself (keyed by `range` param) to avoid re-aggregation on rapid polls.

---

## 3. Backend Implementation Guide

Add a new function `getTokenUsageByAgent(range: string)` to `src/services/token-usage.ts`. Register it in `src/server.ts` at `GET /api/token-usage/by-agent`.

### 3.1 New Types (add to token-usage.ts)

```typescript
export interface AgentCost {
  agentName: string | null;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  sessionCount: number;
  turnCount: number;
  costShare: number;
}

export interface ProjectCost {
  project: string;
  estimatedCost: number;
  sessionCount: number;
  costShare: number;
}

export type TimeRange = "7d" | "30d" | "mtd" | "all";

export interface ByAgentResponse {
  agents: AgentCost[];
  projects: ProjectCost[];
  totalCost: number;
  totalSessions: number;
  range: TimeRange;
  cachedAt: string;
}
```

### 3.2 Time Range Filter

```typescript
function rangeStartDate(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case "7d":  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "mtd": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "all": return null;
  }
}
```

Filter: include a session if `lastSeen >= rangeStart` (where `lastSeen` is derived from `raw.timestamps.sort()` last element).

### 3.3 Route Registration (server.ts)

```typescript
import { getTokenUsageByAgent } from "./services/token-usage";

app.get("/api/token-usage/by-agent", async (c) => {
  try {
    const range = c.req.query("range") || "7d";
    if (!["7d", "30d", "mtd", "all"].includes(range)) {
      return c.json({ error: "Invalid range. Must be one of: 7d, 30d, mtd, all" }, 400);
    }
    const data = await getTokenUsageByAgent(range as TimeRange);
    return c.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});
```

---

## 4. Frontend Component Architecture

### 4.1 Component Tree

```
App.tsx (route: "tokens")
  |
  CostBreakdownView                    -- route container, replaces TokenUsage as primary view
    |
    +-- CostHeader                     -- total cost + range label
    |
    +-- TimeRangeTabs                  -- 7d | 30d | MTD | All
    |
    +-- div.panels (grid, responsive)
    |     |
    |     +-- AgentCostPanel           -- left panel
    |     |     |
    |     |     +-- AgentCostRow[]     -- individual agent rows with cost bar
    |     |
    |     +-- ProjectCostPanel         -- right panel
    |           |
    |           +-- ProjectCostRow[]
    |
    +-- <details> "Session Detail"     -- collapsible, contains existing session table
          |
          +-- (existing session table from TokenUsage.tsx)
```

### 4.2 New Files

```
office/src/components/cost/
  CostBreakdownView.tsx    -- route container
  CostHeader.tsx           -- total cost display
  TimeRangeTabs.tsx        -- tab bar
  AgentCostPanel.tsx       -- agent list panel (includes AgentCostRow inline)
  ProjectCostPanel.tsx     -- project list panel

office/src/hooks/
  useCostBreakdown.ts      -- data fetching hook
```

### 4.3 Hook: `useCostBreakdown(range)`

```typescript
type TimeRange = "7d" | "30d" | "mtd" | "all";

interface UseCostBreakdownReturn {
  data: ByAgentResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useCostBreakdown(range: TimeRange): UseCostBreakdownReturn
```

- Fetches `GET /api/token-usage/by-agent?range=${range}`
- Polls every 30 seconds (same cadence as existing `useTokenUsage`)
- Re-fetches immediately when `range` changes
- Returns `loading=true` only on initial load (not on re-polls, to avoid flicker)

### 4.4 Component Specifications

#### `CostHeader`

Props: `{ totalCost: number; rangeLabel: string }`

Renders:
- Large dollar figure: `$28.96` (2 decimal places)
- Subtitle: range label string (e.g., "Last 7 Days")
- Uses `var(--color-accent-primary)` for the dollar amount

#### `TimeRangeTabs`

Props: `{ value: TimeRange; onChange: (range: TimeRange) => void }`

Tabs:
| Value | Label |
|-------|-------|
| `7d` | Last 7 Days |
| `30d` | Last 30 Days |
| `mtd` | Month to Date |
| `all` | All Time |

Implementation:
- `role="tablist"` on the container
- Each tab is a `<button role="tab" aria-selected={isActive}>`
- Active tab styled with `var(--color-accent-primary)` border-bottom
- Container: `overflow-x-auto` on mobile, `flex-nowrap`

#### `AgentCostPanel`

Props: `{ agents: AgentCost[]; totalCost: number }`

- Panel header: "By Agent" with agent count
- Each row renders an `AgentCostRow`
- Empty state: "No agent data for this range"

#### `AgentCostRow`

Props: `{ agent: AgentCost; totalCost: number }`

Renders per row:
1. **Color dot** -- uses `agentColor(agent.agentName)` from `office/src/lib/constants.ts`
2. **Agent name** -- sanitized via React's default JSX escaping (no `dangerouslySetInnerHTML`)
3. **Cost** -- `$10.70` right-aligned
4. **Token counts** -- `344k in / 113.7k out` (reuse `fmtTokens()` pattern from `TokenUsage.tsx`)
5. **Session count** -- `8 sessions`
6. **Cost bar** -- background div, `width: ${agent.costShare * 100}%`, colored with `agentColor()` at 20% opacity
7. **aria-label** -- `"Agent backend-developer: $10.70, 36.9% of total"`

#### `ProjectCostPanel`

Props: `{ projects: ProjectCost[] }`

- Panel header: "By Project"
- Each row: project name, cost, session count, cost share bar
- Empty state: "No project data" (not an error)

### 4.5 Routing Change (App.tsx)

The `route === "tokens"` branch should render `CostBreakdownView` instead of `TokenUsage`:

```tsx
// Lazy load
const CostBreakdownView = lazy(() =>
  import("./components/cost/CostBreakdownView").then((m) => ({
    default: m.CostBreakdownView,
  }))
);

// In the route handler:
if (route === "tokens") {
  return (
    <AppShell route={route} agents={agents} connected={connected}>
      {globalNotifications}
      {globalCommandPalette}
      <div className="overflow-y-auto h-full" style={{ background: "var(--color-bg-base)" }}>
        <Suspense fallback={<LoadingFallback />}>
          <CostBreakdownView sessions={sessions} />
        </Suspense>
      </div>
    </AppShell>
  );
}
```

The `CostBreakdownView` component receives `sessions` (tmux sessions) to pass down to the preserved session detail table at the bottom.

---

## 5. Design Decisions

### D1: No new SQLite tables

**Decision:** Derive all data from JSONL files + live tmux state. No new persistence layer.

**Rationale:** The JSONL files are already parsed and cached in `parsedFilesCache` with 10s TTL. Adding SQLite would introduce write complexity and data synchronization concerns for a read-only view. The PRD explicitly marks persistent storage as "Could Have" (C3).

**Tradeoff:** Terminated sessions lose their agent name attribution. This is acceptable for Sprint 1 because the most actionable cost data is from currently-running agents.

### D2: Agent attribution via prefix matching

**Decision:** Match `sessionId.slice(0, 8)` from JSONL filenames against `sessionPrefix` from `getRealtimeSessions()`.

**Rationale:** This is how `TokenUsage.tsx` already maps sessions to tmux names (line 810-813 of existing component). The `getRealtimeSessions()` function captures the session prefix from the Claude Code status bar (`session:abc12345` pattern) and falls back to `session.name.slice(0, 8)`.

**Risk:** If tmux session names don't match JSONL prefixes (e.g., renamed sessions), attribution fails silently. The unknown sessions still appear aggregated under `(unknown)`.

### D3: No new npm dependencies

**Decision:** All UI built with existing stack (React 19, Tailwind, CSS custom properties, pure SVG for bars).

**Rationale:** NFR-D2 prohibits new dependencies. Cost bars are simple `<div>` elements with percentage widths -- no chart library needed. Recharts is available but unnecessary for horizontal bars.

### D4: Single endpoint for both agent and project data

**Decision:** Return both `agents[]` and `projects[]` in one response from `/api/token-usage/by-agent` rather than separate endpoints.

**Rationale:** Both panels render from the same underlying parsed data. Splitting into two endpoints doubles the cache-miss parsing cost and requires the frontend to coordinate two loading states. The PRD's S1 endpoint (`/api/token-usage/by-project`) is subsumed by this combined response.

### D5: Time range filtering on backend

**Decision:** The `range` query parameter triggers server-side filtering before aggregation.

**Rationale:** The backend already has timestamps in `RawSessionData.timestamps`. Server-side filtering reduces the payload size for `7d` range (most common case) and keeps the client simple. The PRD allows client-side filtering as a fallback, but since the backend work is minimal, we do it properly.

---

## 6. Responsive Layout

### Desktop (>= 1024px)

```
+------------------------------------------------------------+
| CostHeader  ($28.96)          TimeRangeTabs  [7d|30d|MTD|All] |
+------------------------------------------------------------+
| AgentCostPanel (60%)   |   ProjectCostPanel (40%)          |
|  backend-dev  $10.70   |   maw-js       $24.15             |
|  orchestrator  $6.28   |   auth-system   $4.81             |
|  ...                   |                                   |
+------------------------------------------------------------+
| [Session Detail] (collapsed <details>)                     |
+------------------------------------------------------------+
```

CSS: `grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4`

### Tablet (769px - 1023px)

Same as desktop but panels may compress. Threshold is `lg:` (1024px).

### Mobile (<= 768px)

```
+---------------------------+
| $28.96                    |
| Last 7 Days               |
+---------------------------+
| [7d] [30d] [MTD] [All]   |  <- horizontally scrollable
+---------------------------+
| By Agent                  |
|  backend-dev    $10.70    |
|  orchestrator    $6.28    |
+---------------------------+
| By Project                |
|  maw-js         $24.15   |
+---------------------------+
| [Session Detail]          |
+---------------------------+
```

CSS: Panels stack vertically (`grid-cols-1`). Time range tabs container: `overflow-x-auto whitespace-nowrap`. Total cost header: full width, no horizontal scroll.

---

## 7. TypeScript Types (Frontend)

Add to `office/src/hooks/useCostBreakdown.ts`:

```typescript
export type TimeRange = "7d" | "30d" | "mtd" | "all";

export interface AgentCost {
  agentName: string | null;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  sessionCount: number;
  turnCount: number;
  costShare: number;
}

export interface ProjectCost {
  project: string;
  estimatedCost: number;
  sessionCount: number;
  costShare: number;
}

export interface ByAgentResponse {
  agents: AgentCost[];
  projects: ProjectCost[];
  totalCost: number;
  totalSessions: number;
  range: TimeRange;
  cachedAt: string;
}

export const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "mtd": "Month to Date",
  "all": "All Time",
};
```

---

## 8. Mock Response

For frontend development before the backend endpoint is ready:

```json
{
  "agents": [
    {
      "agentName": "backend-developer",
      "estimatedCost": 10.70,
      "inputTokens": 344000,
      "outputTokens": 113700,
      "cacheCreation": 28000,
      "cacheRead": 150000,
      "sessionCount": 8,
      "turnCount": 142,
      "costShare": 0.369
    },
    {
      "agentName": "orchestrator",
      "estimatedCost": 6.28,
      "inputTokens": 180000,
      "outputTokens": 62000,
      "cacheCreation": 15000,
      "cacheRead": 90000,
      "sessionCount": 3,
      "turnCount": 48,
      "costShare": 0.217
    },
    {
      "agentName": "frontend-developer",
      "estimatedCost": 5.44,
      "inputTokens": 156000,
      "outputTokens": 54200,
      "cacheCreation": 12000,
      "cacheRead": 80000,
      "sessionCount": 5,
      "turnCount": 67,
      "costShare": 0.188
    },
    {
      "agentName": "solution-architect",
      "estimatedCost": 4.20,
      "inputTokens": 120000,
      "outputTokens": 42000,
      "cacheCreation": 10000,
      "cacheRead": 60000,
      "sessionCount": 2,
      "turnCount": 31,
      "costShare": 0.145
    },
    {
      "agentName": null,
      "estimatedCost": 2.34,
      "inputTokens": 68000,
      "outputTokens": 23400,
      "cacheCreation": 5000,
      "cacheRead": 30000,
      "sessionCount": 4,
      "turnCount": 18,
      "costShare": 0.081
    }
  ],
  "projects": [
    {
      "project": "maw-js",
      "estimatedCost": 24.15,
      "sessionCount": 18,
      "costShare": 0.834
    },
    {
      "project": "digital-worker",
      "estimatedCost": 4.81,
      "sessionCount": 4,
      "costShare": 0.166
    }
  ],
  "totalCost": 28.96,
  "totalSessions": 22,
  "range": "7d",
  "cachedAt": "2026-03-14T10:30:00.000Z"
}
```

---

## 9. Styling Constraints

All components must follow the existing dark-mode CSS custom property system from `ui.html` and `TokenUsage.tsx`:

| Token | Usage |
|-------|-------|
| `var(--color-bg-base)` | Page background (`#0a0a0f`) |
| `var(--color-bg-surface)` | Card/panel background |
| `rgba(255,255,255,0.02)` | Card background (inline, matches existing panels) |
| `border-white/[0.06]` | Card borders |
| `text-white/40` | Muted labels |
| `text-white/70` | Primary text |
| `var(--color-accent-primary)` | Active tab indicator, header cost color (`#22d3ee` cyan) |
| `agentColor(name)` | Agent avatar dots and cost bar fills (from `office/src/lib/constants.ts`) |

Do **not** introduce:
- New hardcoded hex colors outside the established palette
- Tailwind opacity utilities that conflict with inline `rgba()` patterns
- Any new CSS custom properties

Agent avatar dots: use `agentColor(name)` with full opacity for the dot, 20% opacity (`+ "33"` hex suffix) for the cost bar background.

Font: `font-mono` for all data values, consistent with existing dashboard.

---

## 10. Open Question Resolutions

| # | Question | Decision for Sprint 1 |
|---|----------|-----------------------|
| 1 | Persistent session name lookup | Skip. Unattributed sessions show as `(unknown)`. Revisit in Sprint 2. |
| 2 | Project attribution source | Use JSONL directory slug. Single project for now. Multi-project scan is a future enhancement. |
| 3 | "Month to Date" definition | Calendar month: 1st of current month at 00:00 local time. This is distinct from "Last 30 Days" (rolling). |
| 4 | DailyCostChart fate | Keep as-is in the Dashboard view (`#dashboard`). The Cost Breakdown View is a separate view under `#tokens`. |
