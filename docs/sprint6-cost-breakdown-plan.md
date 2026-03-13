# Sprint 6 Plan: Cost Breakdown View
## maw-js Dashboard Enhancement

**Sprint dates:** 2026-03-14 to 2026-03-21 (1 week)
**Velocity:** 13 points | **Capacity:** 80% (one solo full-stack developer)
**PRD:** `docs/prd-cost-breakdown-view.md` | **SA:** `docs/sa-cost-breakdown-view.md`

---

## Sprint Goal

Replace the anonymous session table with a ranked cost-by-agent and cost-by-project view, backed by a new `/api/token-usage/by-agent` endpoint, so operators can identify their highest-cost agent in under 10 seconds.

---

## Work Breakdown Structure

### Story 1 — Agent Cost Attribution (Backend) | 5 pts

**Dependency:** None. Must be completed before Story 3 can integrate against the live endpoint.

| # | Subtask | Tag | Description | Est. |
|---|---------|-----|-------------|------|
| 1.1 | Add `AgentCost`, `ProjectCost`, `TimeRange`, `ByAgentResponse` types | `[BE]` | Declare the four TypeScript interfaces in `src/services/token-usage.ts` exactly as specified in SA section 3.1. No logic yet — types only. | 0.5h |
| 1.2 | Implement `rangeStartDate(range)` helper | `[BE]` | Write the switch-case function (SA section 3.2) that converts `7d / 30d / mtd / all` into a `Date` cutoff or `null`. Include unit-level inline test with `bun test`. | 1h |
| 1.3 | Implement `getTokenUsageByAgent(range)` | `[BE]` | Call `getRealtimeSessions()` to build the prefix-to-name map, call `getAllParsedFiles()` from the shared cache, match each session by `sessionId.slice(0, 8)`, apply the range filter on `lastSeen`, group by `agentName` and by project slug, sort both arrays by `estimatedCost` desc, compute `costShare`, and return `ByAgentResponse`. Unattributed sessions aggregate under `agentName: null` displayed as `(unknown)`. | 3h |
| 1.4 | Register `GET /api/token-usage/by-agent` route | `[BE]` | Add the Hono route handler in `src/server.ts` (SA section 3.3). Validate the `range` query param; return 400 on invalid value, 500 on parse error. Ensure the existing CORS middleware covers this route. | 0.5h |
| 1.5 | Manual verification of backend ACs | `[QA]` | Use `curl` to hit the endpoint with all four range values. Verify agent sort order, cost aggregation, and response time < 2000ms against the local JSONL dataset. Cross-check `(unknown)` grouping when no tmux sessions are live. | 1h |

**Story 1 total: 6h**

---

### Story 2 — Time-Range Selector + Cost Header (Frontend) | 3 pts

**Dependency:** Can be built in parallel with Story 1 using client-side date filtering as a fallback. Does not block on the live endpoint.

| # | Subtask | Tag | Description | Est. |
|---|---------|-----|-------------|------|
| 2.1 | Create `useCostBreakdown(range)` hook | `[FE]` | New file `office/src/hooks/useCostBreakdown.ts`. Fetches `GET /api/token-usage/by-agent?range=${range}`, polls every 30 seconds, re-fetches immediately on `range` change. Returns `{ data, loading, error, refetch }`. Use the SA section 8 mock response as the initial implementation while the backend is in progress. | 1.5h |
| 2.2 | Build `TimeRangeTabs` component | `[FE]` | New file `office/src/components/cost/TimeRangeTabs.tsx`. Container has `role="tablist"`, each tab is `<button role="tab" aria-selected={isActive}>`. Active tab styled with `var(--color-accent-primary)` border-bottom. Container uses `overflow-x-auto` and `flex-nowrap` for mobile. Labels: Last 7 Days / Last 30 Days / Month to Date / All Time. Export `RANGE_LABELS` from the hook file. | 1.5h |
| 2.3 | Build `CostHeader` component | `[FE]` | New file `office/src/components/cost/CostHeader.tsx`. Props: `{ totalCost: number; rangeLabel: string }`. Renders the large dollar figure in `var(--color-accent-primary)` and the range label as a subtitle. Font-mono for the value. | 0.5h |
| 2.4 | Manual verification of Story 2 ACs | `[QA]` | Verify default tab is "Last 7 Days" on load, tab switch triggers re-render under 500ms, cost header reflects selected range, tabs are keyboard-navigable in Chrome and Safari, and layout holds at 375px viewport width. | 1h |

**Story 2 total: 4.5h**

---

### Story 3 — By-Agent Panel + By-Project Panel (Frontend) | 5 pts

**Dependency:** Story 2 (hook and range state) must be done. Story 1 endpoint must be live for integration wiring; build with mock data until then.

| # | Subtask | Tag | Description | Est. |
|---|---------|-----|-------------|------|
| 3.1 | Build `AgentCostPanel` + `AgentCostRow` | `[FE]` | New file `office/src/components/cost/AgentCostPanel.tsx`. Panel header shows "By Agent" and agent count. Each `AgentCostRow` renders: color dot via `agentColor()`, agent name (JSX-escaped), cost right-aligned, formatted token counts using the `fmtTokens()` pattern, session count, and the proportional cost bar as a `<div>` at `width: ${costShare * 100}%` with `agentColor() + "33"` opacity fill. Add `aria-label="Agent {name}: ${cost}, {pct}% of total"` to each bar. Empty state: "No agent data for this range". Wrap in `memo()`. | 3h |
| 3.2 | Build `ProjectCostPanel` | `[FE]` | New file `office/src/components/cost/ProjectCostPanel.tsx`. Same row structure as agent panel but for projects (name, cost, session count, bar). Empty state: "No project data" — not an error. Wrap in `memo()`. | 1.5h |
| 3.3 | Build `CostBreakdownView` route container | `[FE]` | New file `office/src/components/cost/CostBreakdownView.tsx`. Assembles `CostHeader`, `TimeRangeTabs`, the two-panel grid (`grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4`), and a `<details>` disclosure labeled "Session Detail" containing the existing session table (collapsed by default). Manages `range` state, passes it to `useCostBreakdown`. | 1.5h |
| 3.4 | Wire `CostBreakdownView` into `App.tsx` routing | `[FE]` | Lazy-load `CostBreakdownView` and replace the `route === "tokens"` branch in `App.tsx` as specified in SA section 4.5. The old `TokenUsage` component is demoted to the `<details>` session table. Ensure `DailyCostChart` in the `#dashboard` route is untouched. | 0.5h |
| 3.5 | Swap mock data for live backend endpoint | `[FE]` | Remove the mock fallback from `useCostBreakdown.ts` and confirm the hook calls the real `/api/token-usage/by-agent` endpoint. Requires Story 1 to be complete. | 0.5h |
| 3.6 | Manual verification of Story 3 ACs | `[QA]` | Verify agent sort order, row fields, bar proportions, empty states for both panels, session table collapses and expands with all original columns intact, two-panel layout on 1024px+ and stacked at 768px-, and no TypeScript errors (`bun tsc --noEmit`). | 2h |

**Story 3 total: 9h**

---

## Sprint Schedule (suggested daily order)

| Day | Focus |
|-----|-------|
| Mon | 1.1, 1.2, 1.3 (backend types + range filter + aggregation logic) |
| Tue | 1.4, 1.5 (route registration + backend QA); 2.1 in parallel |
| Wed | 2.2, 2.3, 2.4 (tabs + header + Story 2 QA) |
| Thu | 3.1, 3.2 (agent panel + project panel with mock data) |
| Fri | 3.3, 3.4, 3.5, 3.6 (container, routing, live endpoint wiring, final QA + TypeScript check) |

**Total estimated hours: 19.5h** (fits within a ~40h week at 80% capacity; remaining capacity covers context-switching and unforeseen fixes)

---

## Definition of Done

Sprint is complete when ALL of the following are true:

- [ ] `GET /api/token-usage/by-agent` returns a valid `ByAgentResponse` for all four range values (`7d`, `30d`, `mtd`, `all`)
- [ ] Invalid `range` param returns HTTP 400 with the specified error message
- [ ] All three Story 1 Gherkin scenarios pass manual verification (attribution, unknown grouping, aggregation, sort order, response time < 2000ms)
- [ ] `TimeRangeTabs` default is "Last 7 Days" on first load; switching range updates all panels; tabs are keyboard-navigable with `aria-selected`
- [ ] Total cost header displays the correct USD value and range label for the selected range
- [ ] Range selection persists across the 30-second polling cycle
- [ ] `AgentCostPanel` renders agents sorted by cost descending with correct name, cost, token counts, session count, and proportional bar
- [ ] `ProjectCostPanel` renders a "No project data" placeholder (not an error) when the projects array is empty
- [ ] `<details>` "Session Detail" section is collapsed by default; expands to show all original session table columns
- [ ] Two-panel layout is side-by-side at >= 1024px and stacked at <= 768px
- [ ] Time-range tabs scroll horizontally without layout break at 375px viewport width
- [ ] `bun tsc --noEmit` exits with zero errors
- [ ] `DailyCostChart` on the `#dashboard` route renders without errors (no regression)
- [ ] No new hardcoded hex colors outside the established palette (`NFR-D1`)
- [ ] No new npm dependencies added (`NFR-D2`)
- [ ] Agent names are HTML-escaped via React JSX (no `dangerouslySetInnerHTML`) (`NFR-S2`)

---

## Risk Register

| # | Risk | Probability | Impact | Score | Mitigation | Owner |
|---|------|-------------|--------|-------|------------|-------|
| R1 | **Terminated-session attribution gap** — sessions that have already ended will have `agentName = null` because `getRealtimeSessions()` only sees live tmux processes. If most cost data is from terminated sessions, the By-Agent panel will be dominated by `(unknown)` and provide little value. | Medium | High | 6 | Accepted for Sprint 1 per SA decision D1. Mitigate at demo time by keeping a few sessions running to demonstrate attribution. Flag for Sprint 2 backlog: persistent `session_names` SQLite table. | Developer |
| R2 | **JSONL prefix collision** — if two JSONL session UUIDs share the same first 8 characters, they will both be attributed to the same tmux session name, inflating that agent's cost figures. | Low | Medium | 3 | UUID collision in 8 hex characters (4 billion combinations) is statistically negligible at current scale (< 100 sessions). No mitigation needed this sprint; document the theoretical limit in a code comment. | Developer |
| R3 | **Story 3 integration delay** — Story 3 blocks on Story 1's live endpoint for final wiring (subtask 3.5). If the backend overruns, the frontend QA day (Friday) compresses. | Medium | Medium | 4 | Build Story 3 panels against the SA section 8 mock response from the start. Story 3 has zero dependency on Story 1 until the final 0.5h wiring step. Backend must be QA-complete by end of Tuesday to protect Friday's integration window. | Developer |
