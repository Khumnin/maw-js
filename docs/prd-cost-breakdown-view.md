# PRD: Cost Breakdown View
## maw-js Dashboard Enhancement

**Document version:** 1.0
**Date:** 2026-03-14
**Status:** Draft — awaiting sprint planning
**Replaces:** Existing `#tokens` view (TokenUsage.tsx)

---

## 1. Problem Statement

The maw-js dashboard orchestrates a fleet of named Claude Code agents (Backend Developer, Orchestrator, DevOps, etc.) running in discrete tmux sessions. The existing `#tokens` view aggregates all token usage across every JSONL session file into a single undifferentiated table. Users cannot answer the most operationally critical questions:

- Which agent consumed the most budget this week?
- Which project is driving costs?
- Is cost accelerating or stable over the past 30 days?

The existing data model in `token-usage.ts` parses JSONL files keyed by session ID (a UUID prefix). It has no concept of agent identity or project context. Session-level cost data is available, but the mapping from session UUID to named agent role is absent. As a result, users must cross-reference raw session IDs against tmux session names manually — an operation that provides no actionable insight on cost per role or per project.

This creates two downstream problems. First, budget decisions are made without evidence: users cannot identify which agent role should be used more sparingly or which project phase is disproportionately expensive. Second, the Anthropic Claude Max subscription enforces prompt-rate limits that are per-session; without visibility into cost-by-agent, it is impossible to know whether reducing a specific agent's invocations would meaningfully lower spend.

---

## 2. Goals and Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Surface cost by agent role | User can identify the highest-cost agent in under 10 seconds | Measured via usability walkthrough |
| Surface cost by project | "By Project" panel renders at least one project bucket | Requires ≥1 agent with a workDir in JSONL metadata |
| Time-range filtering | All data panels respond to range selection | 100% of panels re-render on range change, p95 < 500ms |
| Replace raw session table with actionable view | Sessions table remains accessible as a drill-down, not the primary view | Primary view shows agent-grouped data |
| No regression on existing token/limits data | Plan Usage Limits and Live Sessions sections continue to function | Zero breaks to existing poll intervals |

---

## 3. User Personas

### Persona A: The Workflow Operator (primary)
A developer or team lead who runs the maw-js orchestrator daily. They spawn multiple agents concurrently across different projects and need to understand where their Anthropic budget is being consumed. They are comfortable reading token counts but prefer cost in USD. They make decisions about agent spawning frequency based on budget signals.

Pain points: No way to tell which agent role is expensive. No way to compare cost across projects. Must mentally map tmux session names to agent types.

### Persona B: The Project Accountant (secondary)
A technical PM or founder tracking AI spend across product initiatives. They access the maw-js dashboard weekly to review cost trends. They do not operate agents directly. They need a summarised "by project" view they can screenshot and share.

Pain points: Current view requires understanding of JSONL internals. No exportable or shareable cost summary. No time-range context for the numbers shown.

---

## 4. MoSCoW Prioritized Feature List

### Must Have
- M1. Backend: `agent_name` attribution on token events — map tmux session name to agent role at parse time
- M2. Backend: `GET /api/token-usage/by-agent` endpoint returning cost, token breakdown, and session run count per named agent
- M3. Frontend: "By Agent" panel — ranked list of agents with cost, in/out tokens, and session runs
- M4. Frontend: Time-range selector — "Last 7 Days", "Last 30 Days", "Month to Date", "All Time" tabs that filter all panels
- M5. Frontend: Total cost header matching the reference design (large dollar figure, selected range label)

### Should Have
- S1. Backend: `project` attribution — derive project from JSONL file path or `MAW_CLAUDE_PROJECTS_DIR` directory slug; expose `GET /api/token-usage/by-project`
- S2. Frontend: "By Project" panel — ranked list of projects with aggregate cost
- S3. Frontend: Replace the existing `#tokens` route with the new Cost Breakdown View as the default; retain the session table as a collapsible "Session Detail" section

### Could Have
- C1. Frontend: Per-agent drill-down drawer showing individual sessions and a mini timeline chart
- C2. Frontend: CSV export of the currently visible by-agent table
- C3. Backend: Persist a `cost_snapshots` SQLite table for historical queries beyond what JSONL files cover

### Won't Have (this sprint)
- W1. Real-time cost accumulation mid-session (requires streaming JSONL tail — too complex for this sprint)
- W2. Budget alerting / threshold notifications
- W3. Multi-user authentication or access control on the cost endpoint
- W4. Cost forecasting or projection charts

---

## 5. User Stories

### Story 1: Agent Cost Attribution (Backend)
**Story points:** 5
**Priority:** Must Have (M1, M2)

**As a** workflow operator,
**I want** the token-usage API to identify which named agent role each Claude Code session belongs to,
**so that** I can see cost grouped by agent rather than by anonymous session ID.

**INVEST check:**
- Independent: The attribution logic is a backend-only change to `token-usage.ts`; it does not require frontend changes to be deployed.
- Negotiable: The mapping strategy (tmux name lookup vs. JSONL metadata vs. agent definition filename) is open.
- Valuable: Unlocks Stories 2 and 3 — without attribution, the entire feature has no data.
- Estimable: Two clear sub-tasks: (a) extend `SessionUsage` type with `agentName: string | null`, (b) add `/api/token-usage/by-agent` aggregation endpoint.
- Small: Fits in one sprint; no schema migration — JSONL parsing already produces `sessionId` which maps to a tmux session name via the existing `listSessions` SSH call.
- Testable: See acceptance criteria below.

**Implementation notes for solution architect:**
The existing `getRealtimeSessions()` already calls `listSessions()` and returns `sessionName` alongside `sessionPrefix`. At parse time in `buildTokenUsage()`, `sessionPrefix` (first 8 chars of sessionId) can be matched against the `sessionPrefix` in the realtime map to resolve the tmux session name. The tmux session name (e.g. `backend-developer`) is the agent role. The new `/api/token-usage/by-agent` endpoint should call `buildTokenUsage()` and group by `agentName`, summing `inputTokens`, `outputTokens`, `cacheCreation`, `cacheRead`, `estimatedCost`, and counting `sessionCount` (runs).

**Acceptance Criteria:**

```gherkin
Feature: Agent cost attribution

  Scenario: Session with a matching tmux name resolves to agent name
    Given a JSONL session file exists with sessionId starting with "abc12345"
    And a tmux session named "backend-developer" has the prefix "abc12345"
    When GET /api/token-usage is called
    Then the session object for "abc12345" has agentName = "backend-developer"
    And the agentName is not null

  Scenario: Session with no matching tmux session remains anonymous
    Given a JSONL session file exists with sessionId starting with "zz999999"
    And no tmux session has the prefix "zz999999"
    When GET /api/token-usage is called
    Then the session object for "zz999999" has agentName = null

  Scenario: By-agent endpoint aggregates correctly
    Given three JSONL sessions exist with agentName = "orchestrator"
    And each has estimatedCost = 2.00
    When GET /api/token-usage/by-agent is called
    Then the response contains an entry for "orchestrator"
    And that entry has estimatedCost = 6.00
    And sessionCount = 3

  Scenario: By-agent endpoint respects time range filter
    Given sessions exist with timestamps spanning 60 days
    When GET /api/token-usage/by-agent?range=last7days is called
    Then only sessions with lastSeen within the past 7 days are included in cost totals

  Scenario: By-agent endpoint returns agents sorted by cost descending
    Given the by-agent response contains "orchestrator" ($6.28) and "tester" ($0.34)
    Then "orchestrator" appears before "tester" in the agents array

  Scenario: API response time is acceptable
    Given 50 JSONL session files exist
    When GET /api/token-usage/by-agent is called
    Then the response is returned in under 2000ms
    And the HTTP status code is 200
```

---

### Story 2: Time-Range Selector + Cost Header (Frontend)
**Story points:** 3
**Priority:** Must Have (M4, M5)

**As a** workflow operator,
**I want** to select a time range (Last 7 Days, Last 30 Days, Month to Date, All Time) at the top of the Cost Breakdown View,
**so that** all cost panels reflect only the period I care about without requiring me to do mental arithmetic on cumulative totals.

**INVEST check:**
- Independent: The time-range selector is a pure frontend state concern; it passes a `range` query parameter to existing and new API endpoints. It does not require Story 1 to be deployed first — it can be built against the existing `/api/token-usage` endpoint with client-side date filtering as a fallback.
- Negotiable: Tab labels and exact date boundaries (e.g. whether "Month to Date" is calendar month or rolling 30 days) are open for discussion.
- Valuable: Without this, cost data has no temporal context — users cannot tell if a $28 total is from today or the past year.
- Estimable: Two sub-tasks: (a) range tab component with state, (b) total cost header card.
- Small: Pure UI state + one new component; no new API surface.
- Testable: See acceptance criteria below.

**Implementation notes for solution architect:**
The range selector lives in the existing `TokenUsage.tsx` (which is being promoted to the Cost Breakdown View). The selected range is stored as local component state and passed as a query param to `/api/token-usage/by-agent?range=last7days`. Client-side filtering of `SessionUsage[]` by `lastSeen` date can be used for the range tabs as an interim until the backend respects the `range` param. The total cost header should display `totals.estimatedCost` for the selected range. Use CSS custom properties consistent with the existing dark-mode tokens: `--color-surface`, `--color-border` etc. Do not introduce Tailwind opacity utilities that conflict with existing inline `rgba()` patterns already in the file.

**Acceptance Criteria:**

```gherkin
Feature: Time-range selector

  Scenario: Default range is "Last 7 Days" on first load
    Given the user opens the Cost Breakdown View for the first time
    Then the "Last 7 Days" tab is visually selected
    And cost panels display data for the past 7 calendar days only

  Scenario: Selecting "Last 30 Days" updates all panels
    Given the user is on the Cost Breakdown View
    When the user clicks the "Last 30 Days" tab
    Then all cost panels re-render with data scoped to the past 30 days
    And the "Last 30 Days" tab has the active visual state
    And the re-render completes in under 500ms

  Scenario: Selecting "All Time" shows lifetime totals
    Given the user selects the "All Time" tab
    Then total cost equals the sum of estimatedCost across all sessions in the dataset
    And no date filter is applied to the session list

  Scenario: Total cost header reflects the selected range
    Given the selected range is "Last 7 Days"
    And total cost for last 7 days is $12.50
    When the user views the cost header
    Then the header displays "$12.50"
    And the subtitle reads "Last 7 Days"

  Scenario: Range selection persists across re-polls
    Given the user has selected "Last 30 Days"
    When the 30-second polling interval fires and new data arrives
    Then the "Last 30 Days" tab remains selected
    And the cost panels update with the new data still scoped to 30 days

  Scenario: Time-range tabs are accessible on mobile viewport (375px)
    Given the viewport width is 375px
    When the user views the Cost Breakdown View
    Then the time-range tabs are scrollable horizontally without breaking layout
    And the total cost header is fully visible without horizontal scroll
```

---

### Story 3: By-Agent Panel + By-Project Panel (Frontend)
**Story points:** 5
**Priority:** Must Have (M3) + Should Have (S1, S2, S3)

**As a** workflow operator,
**I want** a two-panel layout showing cost ranked by agent and by project,
**so that** I can immediately identify which agent roles and which projects are consuming the most budget.

**INVEST check:**
- Independent: Depends on Story 1's backend endpoint being available, but can be built with mock data during development and switched to the live endpoint on Story 1 completion. The panel layout and rendering logic are independently shippable.
- Negotiable: The visual layout (side-by-side vs. stacked on mobile, icon choice, bar vs. list), and whether the By-Project panel is hidden when no project data is available, are open.
- Valuable: This is the primary user-facing value of the entire feature — the two panels are what replaces the anonymous session table as the default view.
- Estimable: Three clear sub-tasks: (a) `AgentCostRow` component, (b) `ByAgentPanel` component, (c) `ByProjectPanel` component (could be a stub if project attribution is not ready).
- Small: Both panels are read-only display components; no mutations. Fits within the sprint alongside Story 1 and 2.
- Testable: See acceptance criteria below.

**Implementation notes for solution architect:**
The By-Agent panel consumes `/api/token-usage/by-agent`. Each row in the panel should render: agent name (with a colored avatar derived from `agentColor(name)` in `constants.ts`), total cost in USD, input/output token counts formatted with `fmtTokens()`, and session run count. The cost is the primary sort key, descending. A horizontal bar behind each row (width proportional to cost share of total) provides the visual ranking affordance shown in the reference screenshot. The By-Project panel consumes `/api/token-usage/by-project` (Story S1). If the endpoint returns an empty array, the panel should display a "No project data" placeholder and not show an error. The existing `#tokens` hash route should map to this new Cost Breakdown View. The old session table should be moved to a collapsible `<details>` section labeled "Session Detail" at the bottom of the page to preserve backward access.

**Acceptance Criteria:**

```gherkin
Feature: By-Agent panel

  Scenario: Panel renders agents sorted by cost descending
    Given the /api/token-usage/by-agent endpoint returns 5 agents with different costs
    When the By-Agent panel renders
    Then agents are displayed in descending cost order
    And the highest-cost agent appears at the top of the list

  Scenario: Each agent row shows required fields
    Given an agent "backend-developer" with cost $10.70, inputTokens 344, outputTokens 113700, sessionCount 8
    When the agent row renders
    Then the row displays the agent name "backend-developer"
    And displays the cost "$10.70"
    And displays input tokens as "344"
    And displays output tokens as "113.7k"
    And displays session runs as "8"

  Scenario: Cost bar width is proportional to agent share
    Given "backend-developer" has cost $10.70 and total fleet cost is $28.96
    When the agent row renders
    Then the bar width is approximately 36.9% of the panel width
    And the bar does not overflow the panel boundary

  Scenario: Panel shows a loading skeleton while data is fetching
    Given the API call to /api/token-usage/by-agent is in-flight
    When the By-Agent panel renders
    Then a loading skeleton or spinner is visible
    And no error state is shown

  Scenario: Panel shows an empty state when no agents have data
    Given the /api/token-usage/by-agent endpoint returns an empty agents array
    When the By-Agent panel renders
    Then a message "No agent data for this range" is displayed
    And no rows are rendered

Feature: By-Project panel

  Scenario: Panel renders projects when data is available
    Given the /api/token-usage/by-project endpoint returns one project "recruit-platform" with cost $24.15
    When the By-Project panel renders
    Then the project "recruit-platform" is visible
    And the cost "$24.15" is displayed

  Scenario: Panel shows placeholder when no project data is available
    Given the /api/token-usage/by-project endpoint returns an empty projects array
    When the By-Project panel renders
    Then a placeholder message is displayed
    And the panel does not render an error or crash

Feature: Session Detail preservation

  Scenario: Session table is accessible via collapsible section
    Given the user is on the Cost Breakdown View
    When the user clicks the "Session Detail" disclosure element
    Then the existing per-session table expands and is visible
    And all existing columns (Input Tokens, Output Tokens, Cache, Cost, Turns, Tool Uses, Context %, Status) remain present

  Scenario: Session table is collapsed by default
    Given the user opens the Cost Breakdown View
    Then the "Session Detail" section is collapsed
    And the session table rows are not rendered until the section is expanded

Feature: Responsive layout

  Scenario: Two panels stack vertically on narrow viewports
    Given the viewport width is 768px or less
    When the Cost Breakdown View renders
    Then the By-Agent and By-Project panels are stacked vertically
    And each panel occupies the full container width

  Scenario: Two panels render side-by-side on wide viewports
    Given the viewport width is 1024px or more
    When the Cost Breakdown View renders
    Then the By-Agent and By-Project panels are displayed side-by-side
    And neither panel overflows its container
```

---

## 6. Non-Functional Requirements

### Performance
- NFR-P1: `/api/token-usage/by-agent` must respond in under 2000ms for a dataset of up to 100 JSONL session files (this is an extension of the existing 30s TTL cache; the endpoint must share the `parsedFilesCache` already in place in `token-usage.ts`).
- NFR-P2: Time-range filtering must apply in under 500ms on the client side for a result set of up to 1000 session entries.
- NFR-P3: The By-Agent panel must not trigger layout thrash on re-poll; use `memo()` on all sub-components consistent with the existing pattern in `TokenUsage.tsx`.

### Security
- NFR-S1: The new endpoints must apply the same CORS middleware already registered on `/api/*` in `server.ts`; no additional authentication is required as maw-js is a local-only tool.
- NFR-S2: Agent names derived from tmux session names must be treated as untrusted strings — they must be HTML-escaped before rendering to prevent XSS via malicious tmux session names.

### Accessibility
- NFR-A1: Time-range tabs must be implemented as `<button>` or `role="tab"` elements with `aria-selected` state so keyboard navigation and screen readers identify the active range.
- NFR-A2: The agent cost bar must have an `aria-label` attribute of the form "Agent [name]: [cost], [percent]% of total" so the visual bar is also machine-readable.
- NFR-A3: Color must not be the sole visual differentiator for any data point — agent name labels must accompany all color-coded avatars.

### Compatibility and Design
- NFR-D1: All styling must use the existing dark-mode CSS custom property system. Do not introduce new named colors outside the patterns already in `ui.html` (`#0a0a0f` background, `rgba(255,255,255,0.XX)` for text hierarchy, `#F4001A` accent, `#22d3ee` active nav). For agent avatar colors, use the `agentColor()` function already defined in `constants.ts`.
- NFR-D2: No new npm dependencies may be added for this feature. The existing Recharts library (present in the project) may be used for any charts if inline SVG is insufficient, but pure SVG is preferred to stay consistent with the `TimelineChart` implementation.
- NFR-D3: The feature must be mobile-responsive at 375px minimum width, consistent with the responsive patterns established in the existing `TokenUsage.tsx` (`sm:` breakpoint usage with `flex-wrap`).

### Data Accuracy
- NFR-DA1: Cost calculations must use the existing `estimateCost()` function in `token-usage.ts` which applies the Anthropic pricing table (Sonnet: $3/$15 per million input/output, Opus: $15/$75, Haiku: $0.80/$4). No new pricing logic should be introduced.
- NFR-DA2: Session run count per agent must count distinct JSONL session files attributed to that agent, not individual turns.

---

## 7. Sprint Capacity Plan

**Assumed velocity:** 13 story points per sprint
**Sprint duration:** 1 week

| Story | Title | Points | Assignee hint | Dependencies |
|-------|-------|--------|---------------|--------------|
| Story 1 | Agent Cost Attribution (Backend) | 5 | Backend Developer | None |
| Story 2 | Time-Range Selector + Cost Header (Frontend) | 3 | Frontend Developer | Can start in parallel with Story 1 using client-side date filtering |
| Story 3 | By-Agent Panel + By-Project Panel (Frontend) | 5 | Frontend Developer | Story 1 endpoint must be available for integration (Story 3 blocks on Story 1 for final wiring) |

**Total sprint points:** 13
**Buffer:** 0 (tight fit — Story 3's By-Project panel may be deferred to Could Have if attribution takes longer than estimated)

**Sprint gate (Definition of Done for all stories):**
- All Gherkin acceptance criteria pass manual verification
- No TypeScript compilation errors (`bun tsc --noEmit`)
- Existing `#tokens` route continues to render without errors
- The `DailyCostChart` component in the existing Tokens view is not broken or removed
- NFR-D1 verified: no new hardcoded colors outside the established palette
- NFR-A1 verified: tab keyboard navigation works in Chrome and Safari

---

## 8. Out of Scope

The following items are explicitly excluded from this sprint to prevent scope creep:

- Persistent cost history across server restarts (JSONL files are the source of truth; no database write for cost data)
- Cost allocation to specific tasks or chains in the task dispatcher
- Budget enforcement or automatic agent throttling
- Any changes to the `/api/usage-limits` or plan-limits display
- The `DailyCostChart` component — it remains as-is; this PRD adds a new view alongside it, not a replacement
- Changes to how JSONL files are written or named by Claude Code itself

---

## 9. Open Questions

1. **Agent name resolution strategy:** The current implementation would use `getRealtimeSessions()` to build the `prefix → sessionName` map at the time `/api/token-usage/by-agent` is called. This means sessions that have already terminated will have `agentName = null` if they are no longer running. Should maw-js maintain a persistent `session_names` lookup table in SQLite to preserve attribution for terminated sessions? (Recommendation: yes — add as a Could Have story in Sprint 2.)

2. **Project attribution:** The JSONL directory path contains a slug derived from the project working directory (e.g. `-Users-kanatekhumnin-Project` in `MAW_CLAUDE_PROJECTS_DIR`). Multiple agents working in the same repo will share this slug. Is "project" defined as the Claude Code project directory slug, or should it be derived from a separate maw-js concept like a `goal` or `chain`? This determines whether `by-project` grouping is meaningful.

3. **"Month to Date" definition:** Does the month boundary reset at midnight local time on the 1st of the calendar month, or is it a rolling 30-day window? The reference screenshot shows both "Month to Date" and "Last 30 Days" as separate tabs, implying they are distinct.

4. **Existing `DailyCostChart`:** The `#tokens` view currently has a `DailyCostChart` using the `useTokenUsage` hook (separate from `TokenUsage.tsx`). After this feature ships, will that component be removed, kept in a separate view, or folded into the new Cost Breakdown View as the hourly timeline section?
