# PRD: Agent Project Assignment + Terminal Shift+Tab Passthrough

**Product:** maw-js Dashboard (`/office`)
**Date:** 2026-03-14
**Status:** Ready for development

---

## Problem Statement

Two distinct usability gaps are blocking accurate cost tracking and comfortable terminal interaction for developers using the maw-js dashboard.

**Problem 1 — Inaccurate project cost attribution.**
The Cost Breakdown View's "By Project" panel derives project names exclusively from `projectSlugFromDir()` in `token-usage.ts`, which encodes the JSONL directory path into a single label. When a developer runs agents across multiple logical projects within the same working directory, all cost gets collapsed into one bucket. There is also no mechanism to set a project label at spawn time or change it afterward. The result is that the "By Project" panel is misleading for any multi-project workflow.

**Problem 2 — Shift+Tab is stolen by the browser.**
`TerminalModal` uses a controlled `<input>` to buffer keystrokes and forward them to tmux via WebSocket. The browser's native focus-management intercepts `Shift+Tab` before the `onKeyDown` handler fires, moving focus away from the input rather than sending the backtab escape sequence (`\x1b[Z`) to the terminal process. This breaks any CLI tool (fzf, vim, interactive menus) that relies on `Shift+Tab` for backward navigation.

---

## Goals and Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Accurate project cost attribution | % of agent sessions with an explicit `projectLabel` set | 80% of spawned agents have a project label within 2 weeks of release |
| Cost panel reflects explicit labels | "By Project" panel uses `projectLabel` over inferred slug when present | 100% (verifiable in code) |
| Shift+Tab reaches tmux | `\x1b[Z` sent to tmux when Shift+Tab pressed in focused terminal | 100% — verified by manual test and unit test |
| No focus regression | Tab (forward focus) continues to move focus normally when terminal is not open | 0 regressions |

---

## User Personas

**The Orchestrator (primary).** A senior developer running 5-15 Claude Code agents simultaneously across multiple projects (e.g., `auth-admin-ui`, `tigersoft-auth`, `maw-js`). They open Cost Breakdown daily to review spend per project and need labels to map to billing categories, not to filesystem slugs.

**The Terminal Power User.** A developer who uses the `TerminalModal` to interact directly with Claude Code — running fzf file pickers, navigating vim splits, or confirming interactive prompts. They expect the terminal to behave like a real terminal, not a webpage.

---

## Feature List (MoSCoW)

| Priority | Feature |
|----------|---------|
| Must | Add "Project" text field to SpawnAgentDialog |
| Must | Persist `projectLabel` on `TrackedAgent` in-memory store |
| Must | Cost attribution prefers `projectLabel` over `projectSlugFromDir()` |
| Must | Intercept Shift+Tab in TerminalModal and send `\x1b[Z` to tmux |
| Should | Inline project label edit in AgentDetailDrawer |
| Should | `PATCH /api/agents/:target/project` endpoint for label updates |
| Could | Project label shown on AgentCard as a badge |
| Won't | Persisting project labels across server restarts (out of scope — in-memory only) |
| Won't | Multi-select project reassignment |

---

## User Stories

---

### Story 1: Agent Project Assignment

**As a** developer managing multiple concurrent agent sessions,
**I want to** assign an explicit project label when spawning an agent and update it afterward,
**so that** the Cost Breakdown "By Project" panel reflects my actual project boundaries rather than filesystem paths.

**Story Points:** 5
**MoSCoW:** Must (field + persistence + cost attribution) + Should (post-spawn edit)

**INVEST Check:**
- Independent: no dependency on other open stories; cost breakdown already works, this adds a data source
- Negotiable: inline edit vs detail drawer for post-spawn editing is open; BDD scenarios cover both surfaces but implementation choice is the team's
- Valuable: directly fixes misleading cost data, a daily pain point
- Estimable: three bounded touch points — SpawnAgentDialog (UI field), TrackedAgent (data model + server), token-usage.ts (attribution logic)
- Small: fits in one sprint; no persistence layer, no schema migration
- Testable: Gherkin scenarios below are verifiable end-to-end

---

#### Acceptance Criteria

**Scenario 1: Project label captured at spawn time**

```gherkin
Given the developer opens the Spawn Agent dialog
When they fill in Session name "auth-worker-01", Working directory "/Users/dev/auth", and Project "tigersoft-auth"
And they click "Spawn Agent"
Then the server receives a spawn payload containing { "project": "tigersoft-auth" }
And the spawned agent's in-memory record has projectLabel = "tigersoft-auth"
And the AgentDetailDrawer for that agent displays "tigersoft-auth" in the Project field
```

**Scenario 2: Project field is optional — falls back to inferred slug**

```gherkin
Given the developer opens the Spawn Agent dialog
When they fill in Session name and Working directory but leave Project blank
And they click "Spawn Agent"
Then the spawn request succeeds
And the agent's projectLabel is null in the in-memory store
And the Cost Breakdown "By Project" panel attributes this agent's cost using the workDir-inferred slug as before
```

**Scenario 3: Project label updated post-spawn via AgentDetailDrawer**

```gherkin
Given a running agent with projectLabel = null
And the developer opens the AgentDetailDrawer for that agent
When they click the edit affordance next to the Project field and type "maw-js"
And they confirm the edit (press Enter or click save)
Then a PATCH /api/agents/{target}/project request is sent with { "project": "maw-js" }
And the in-memory record is updated to projectLabel = "maw-js"
And the drawer refreshes to show "maw-js" without a full page reload
```

**Scenario 4: Explicit label takes priority over inferred slug in cost panel**

```gherkin
Given an agent session whose working directory would infer the project slug "Project"
And that agent has projectLabel = "tigersoft-auth" set explicitly
When the Cost Breakdown "By Project" panel loads
Then the session's cost appears under the bucket "tigersoft-auth"
And no cost appears under the bucket "Project" for that session
```

**Scenario 5: Project field validation**

```gherkin
Given the Spawn Agent dialog is open
When the developer enters more than 64 characters in the Project field
Then an inline validation message is shown: "Project name must be 64 characters or fewer"
And the Spawn Agent button remains disabled until the value is within limit
```

---

#### Non-Functional Requirements

- Project label field: max 64 characters, free-text (no format restriction)
- `projectLabel` is stored in-memory on `TrackedAgent`; no disk persistence required
- `PATCH /api/agents/:target/project` must return 404 if the target is not currently tracked
- The spawn payload schema (`SpawnAgentSchema` in `server.ts`) must be updated with an optional `project?: string` field validated by Zod
- The `buildTokenUsageByAgent` function in `token-usage.ts` must resolve project name as: `agent.projectLabel ?? projectSlugFromDir(JSONL_DIR)`

---

#### Out of Scope

- Persisting project labels to disk or KV store across restarts
- Filtering or grouping agents in the fleet view by project
- Project labels on tasks or chains

---

### Story 2: Shift+Tab Terminal Passthrough

**As a** developer using the TerminalModal to interact with tmux sessions,
**I want** Shift+Tab keypresses to be captured and forwarded to the terminal process,
**so that** I can navigate backward through interactive CLI menus (fzf, vim, shell completions) without losing focus.

**Story Points:** 2
**MoSCoW:** Must

**INVEST Check:**
- Independent: self-contained change in `TerminalModal.tsx` `handleKeyDown`; no backend changes required
- Negotiable: exact escape sequence (`\x1b[Z`) is the ECMA-48 standard for reverse-tab; not negotiable on that, but the team can discuss whether to also suppress Tab's default browser behavior when the input is focused
- Valuable: unblocks a class of CLI tools entirely; high signal-to-effort ratio
- Estimable: one condition branch added to `handleKeyDown`; the fix itself is ~3 lines
- Small: well under a sprint; the 2-point estimate reflects writing the test harness alongside the fix
- Testable: Gherkin scenario below is directly verifiable

---

#### Acceptance Criteria

**Scenario 1: Shift+Tab is captured and forwarded to tmux**

```gherkin
Given the TerminalModal is open and the input element is focused
When the developer presses Shift+Tab
Then the browser's default focus-navigation behavior is suppressed (e.preventDefault is called)
And a WebSocket message { type: "send", target: <agent.target>, text: "\x1b[Z" } is dispatched
And focus remains on the TerminalModal input element
```

**Scenario 2: Regular Tab does not regress (Tab still moves browser focus when terminal is closed)**

```gherkin
Given the TerminalModal is closed and no terminal input is focused
When the developer presses Tab on any other focusable page element
Then browser default focus-navigation proceeds normally
And no WebSocket message is sent
```

**Scenario 3: Other modifier+key combinations continue to work**

```gherkin
Given the TerminalModal is open and the input is focused
When the developer presses Ctrl+C
Then setInputBuf is called to clear the buffer
And no text is sent to the tmux session (existing behavior is preserved)
```

---

#### Non-Functional Requirements

- The fix must be contained to `handleKeyDown` in `office/src/components/TerminalModal.tsx`
- No changes to the WebSocket message protocol; uses the existing `{ type: "send", target, text }` shape
- `\x1b[Z` is the correct ECMA-48 reverse-tab sequence; it must not be altered

---

#### Out of Scope

- Intercepting Tab to send `\x09` to the terminal (Tab completion passthrough); Tab currently types into the input buffer and that behavior is acceptable
- Key remapping configuration UI

---

## Sprint Capacity Plan

Both stories target the next available sprint. Neither has dependencies on each other or on any open work.

| Story | Points | Assignee Suggestion | Notes |
|-------|--------|---------------------|-------|
| Story 1: Agent Project Assignment | 5 | Frontend + Backend pairing | Three touch points: UI field, TrackedAgent type + PATCH route, token-usage attribution logic |
| Story 2: Shift+Tab Terminal Passthrough | 2 | Frontend | Single file change + test |
| **Sprint total** | **7** | | Well within a standard 8-10pt sprint velocity |

**Recommended delivery order within the sprint:**
1. Story 2 first (fast win, zero risk, unblocks terminal users immediately)
2. Story 1 (higher surface area, benefits from Story 2 being merged and out of the way)
