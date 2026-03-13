# maw-js Dashboard Enhancement — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-13
**Author:** Product Owner Agent
**Status:** Ready for Sprint Planning

---

## 1. Problem Statement

maw-js is a local Multi-Agent Workflow orchestrator that gives a solo developer full programmatic control over a fleet of Claude Code agents running in tmux sessions. The backend is mature: it tracks agent status in real time, dispatches tasks via a priority queue with affinity scoring, supports task chaining, and exposes 11 MCP tools.

The web UI (`/office`) is functional but fragmented. Five independent hash-routed views share no common navigation shell. Agent configuration (who is a worker, spawning new agents) requires either JSON file editing or CLI commands. There is no persistent at-a-glance summary of fleet health, cost burn, or task throughput. As the fleet grows to 5–10 agents, the cognitive load of context-switching between views and correlating data across them slows down daily workflow.

The goal of this enhancement is to deliver a polished, professional dashboard experience that reduces time-to-decision for all common agent fleet management tasks. The Paperclip platform is used as a design inspiration reference — not a feature-parity target.

---

## 2. Goals and Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Reduce navigation friction | Time to reach any view from any view | Under 2 keystrokes or 1 click from anywhere |
| Consolidate fleet status | Information visible without leaving the main view | All agents, status, and cost on one screen |
| Eliminate JSON config editing | Agent management actions done in UI | 100% of add/remove/spawn/kill ops available in UI |
| Surface cost awareness | Cost data visible without navigating to Tokens tab | Daily cost visible on dashboard overview |
| Improve task workflow | Task creation with affinity hints | Affinity fields exposed in task submission form |

---

## 3. User Personas

### Persona 1 — Solo Developer / Tech Lead ("The Orchestrator")

- **Background:** Senior developer running 3–8 Claude Code agents simultaneously across multiple projects (auth, frontend, infra).
- **Tools:** Terminal-native. Uses `maw hey`, `maw peek`, `maw kill` frequently. Has the web UI open in a side monitor or second browser window.
- **Pain points:**
  - Has to remember which tmux session name to edit in `agents.json` to promote a session to worker status.
  - Cannot quickly see which agent is doing what, what it is costing, and which task it is on — from one screen.
  - Has to switch between `#command` and `#tokens` to correlate task throughput with cost.
  - Spawning a new agent requires knowing the correct session name, work directory, and agent definition file name ahead of time.
- **Goals:** Operate the entire agent fleet without leaving the web UI except for emergency terminal access.

### Persona 2 — Developer Onboarding New Agents ("The Onboarder")

- **Background:** Same person as above, but in the specific context of setting up a new project or adding a specialist agent for a task spike.
- **Pain points:**
  - No discovery mechanism for available agent definition files — must browse `~/.maw/agents/` manually.
  - No visual confirmation that a spawned agent has successfully started and is in the correct working directory.
  - No way to set a descriptive label for a session beyond the raw tmux session name.
- **Goals:** Spawn a correctly-configured agent in under 60 seconds with full visual confirmation.

---

## 4. MoSCoW Prioritized Feature List

### Must Have (Phase 1 — Foundation)

- M1. Persistent sidebar navigation shell replacing the top `StatusBar`-only layout
- M2. Agent config CRUD in UI: promote/demote workers, rename windows, kill agents/sessions
- M3. Agent spawner form with directory browser, agent definition picker, and initial prompt field
- M4. shadcn/ui component library integrated into the office Vite app
- M5. Dark-mode design tokens and consistent component styling across all views

### Should Have (Phase 2 — Dashboard)

- S1. Dashboard overview page: fleet status summary cards, live agent status grid
- S2. Token cost chart: daily cost trend (7 days) using existing `/api/token-usage` data
- S3. Activity timeline: chronological event feed from WebSocket events
- S4. Agent detail panel/drawer: context info (workingDir, stack, recentFiles, tags), task history

### Could Have (Phase 3 — Task Board)

- C1. Kanban task board: columns for pending / assigned / completed / failed
- C2. Task detail drawer: command, affinity, dispatch reason, output, timing
- C3. Task submission form with explicit affinity fields (tags, projectName, preferAgent)
- C4. Task chain builder: multi-step form to compose and submit `TaskChain`
- C5. Task templates: save and reuse frequently-dispatched command patterns

### Won't Have (This Roadmap Cycle)

- W1. Multi-user access control or authentication (local tool — out of scope)
- W2. Cloud/remote agent management beyond existing SSH support
- W3. Session recording and playback (FEATURE_BACKLOG item 8 — separate effort)
- W4. Mobile-responsive layout (FEATURE_BACKLOG item 9 — Phase 4 only)
- W5. Oracle search UI changes beyond existing OracleSearch component
- W6. Multi-machine topology view (FEATURE_BACKLOG item 11)

---

## 5. User Stories — Full Roadmap

Stories are organized by Epic (Phase). Each story is INVEST-validated. Points use the Fibonacci scale.

---

### Epic 1 — Foundation (Phase 1)

---

#### US-1.1 — Sidebar Navigation Shell

**As** the orchestrator,
**I want** a persistent left sidebar with navigation links to all views,
**so that** I can switch between Office, Dashboard, Command, Tokens, and Terminal in one click from any screen.

**Story Points:** 5
**MoSCoW:** Must
**INVEST Notes:** Independent of all feature stories. Replaces current hash-route StatusBar approach with a proper nav shell. Estimable because it is pure layout with no backend changes.

**Acceptance Criteria:**

```gherkin
Feature: Sidebar Navigation

  Scenario: Navigate to any view from Office
    Given I am on the Office view (#office)
    When I click "Command" in the sidebar
    Then I am taken to the Command Center view
    And the "Command" nav item shows an active/highlighted state
    And no full-page reload occurs

  Scenario: Active route is highlighted
    Given I am on any view
    Then the sidebar nav item for the current view is visually distinct from inactive items

  Scenario: Sidebar shows live fleet status summary
    Given the WebSocket is connected
    When agent statuses change
    Then the sidebar shows total agent count and a count of agents in "working" status
    Updated within 3 seconds of the change

  Scenario: Sidebar is accessible via keyboard
    Given I am on any view
    When I press Tab to cycle focus
    Then each sidebar nav item receives keyboard focus in order
    And pressing Enter on a focused nav item navigates to that view
```

---

#### US-1.2 — shadcn/ui Integration

**As** a developer maintaining this codebase,
**I want** shadcn/ui installed and configured in the office Vite app,
**so that** all new UI components use a consistent, accessible component library without reinventing common UI patterns.

**Story Points:** 3
**MoSCoW:** Must
**INVEST Notes:** Small, technical prerequisite. Purely additive — does not modify existing components. Estimable: install + config + theme tokens + one smoke-test component.

**Acceptance Criteria:**

```gherkin
Feature: shadcn/ui Setup

  Scenario: shadcn/ui components render correctly in dark mode
    Given the office app is running
    When I render a shadcn/ui Button, Dialog, and Sheet component in a test page
    Then each component renders without visual errors
    And all components use the dark background color token (not the default light theme)

  Scenario: Existing views are unaffected
    Given shadcn/ui is installed
    When I navigate to the Office, Mission, Command, Tokens, and Terminal views
    Then all existing components render identically to before the integration
    And no TypeScript errors are reported by `bun run typecheck`

  Scenario: Tailwind CSS v4 compatibility
    Given Tailwind CSS v4 is already configured
    When shadcn/ui CSS variables are added
    Then there are no CSS variable naming conflicts with the existing Tailwind config
```

---

#### US-1.3 — Worker Promote / Demote in UI

**As** the orchestrator,
**I want** to toggle an agent's worker status directly from its card in the Office view,
**so that** I no longer need to edit `agents.json` or use the CLI to change which agents accept dispatched tasks.

**Story Points:** 3
**MoSCoW:** Must
**INVEST Notes:** Backend API (`POST /api/agents/worker`) already exists. This is a UI interaction story only.

**Acceptance Criteria:**

```gherkin
Feature: Worker Toggle

  Scenario: Promote an agent to worker via UI
    Given agent "dev-1" is not a worker (isWorker = false)
    When I click the "Make Worker" button on the dev-1 agent card
    Then a POST /api/agents/worker request is sent with action: "add"
    And the agent card updates to show the worker badge within 3 seconds
    And a success notification is displayed

  Scenario: Demote a worker to personal via UI
    Given agent "dev-1" is a worker (isWorker = true)
    When I click the "Remove Worker" button on the dev-1 agent card
    Then a POST /api/agents/worker request is sent with action: "remove"
    And the worker badge is removed from the agent card within 3 seconds

  Scenario: Worker status persists across page reload
    Given I promoted "dev-1" to worker via the UI
    When I reload the page
    Then "dev-1" still shows the worker badge

  Scenario: API error handling
    Given the backend returns a 500 error for the worker toggle request
    When I click the worker toggle button
    Then an error notification is displayed with a human-readable message
    And the agent card's worker badge state does not change
```

---

#### US-1.4 — Agent Rename in UI

**As** the orchestrator,
**I want** to rename a tmux window directly from the agent card,
**so that** I can give sessions descriptive labels without switching to the terminal.

**Story Points:** 2
**MoSCoW:** Must
**INVEST Notes:** Backend API (`PATCH /api/agents/:target/name`) already exists. Pure UI interaction.

**Acceptance Criteria:**

```gherkin
Feature: Agent Rename

  Scenario: Rename an agent window
    Given I am viewing an agent card for target "worker-1:0"
    When I click the rename icon and type "auth-backend" and press Enter
    Then a PATCH /api/agents/worker-1:0/name request is sent with name: "auth-backend"
    And the agent card headline updates to "auth-backend" within 3 seconds

  Scenario: Cancel rename with Escape
    Given I have clicked the rename icon on an agent card
    When I press Escape
    Then the rename input is dismissed with no network request made
    And the original window name is preserved

  Scenario: Empty name is rejected
    Given I have clicked the rename icon on an agent card
    When I clear the input and press Enter
    Then no network request is made
    And an inline validation message "Name cannot be empty" is shown
```

---

#### US-1.5 — Kill Agent / Kill Session in UI

**As** the orchestrator,
**I want** to kill an individual agent window or an entire tmux session from the UI,
**so that** I can clean up stuck or completed agents without switching to the terminal.

**Story Points:** 2
**MoSCoW:** Must
**INVEST Notes:** Backend APIs (`DELETE /api/agents/:target` and `DELETE /api/sessions/:name`) already exist.

**Acceptance Criteria:**

```gherkin
Feature: Kill Agent

  Scenario: Kill a single agent window with confirmation
    Given agent "worker-2:1" is visible in the Office view
    When I click "Kill Window" on that agent's card
    Then a confirmation dialog appears with text "Kill window worker-2:1?"
    When I confirm
    Then DELETE /api/agents/worker-2:1 is called
    And the agent card disappears from the grid within 5 seconds

  Scenario: Kill an entire tmux session with confirmation
    Given session "worker-2" is visible
    When I click "Kill Session" on the session group
    Then a confirmation dialog appears with text "Kill entire session worker-2? This will close all windows."
    When I confirm
    Then DELETE /api/sessions/worker-2 is called
    And all cards for that session disappear from the grid within 5 seconds

  Scenario: Cancel kill action
    Given the kill confirmation dialog is open
    When I click Cancel
    Then no DELETE request is made
    And the agent card remains visible
```

---

#### US-1.6 — Agent Spawner Form

**As** the orchestrator,
**I want** a UI form to spawn a new Claude Code agent session,
**so that** I can start a new agent in the correct working directory with the correct persona without memorizing CLI syntax.

**Story Points:** 5
**MoSCoW:** Must
**INVEST Notes:** Backend API (`POST /api/agents/spawn`) and directory browser (`GET /api/browse`) already exist. Agent definitions API (`GET /api/agent-definitions`) already exists. This story covers the full form UX.

**Acceptance Criteria:**

```gherkin
Feature: Agent Spawner Form

  Scenario: Open spawner and see available agent definitions
    Given I click "Spawn Agent" in the sidebar or Office view
    When the spawner dialog opens
    Then a dropdown/picker shows all agent definition names from GET /api/agent-definitions
    And each entry shows the agent name and description

  Scenario: Browse working directory with directory picker
    Given the spawner dialog is open
    When I click the directory field
    Then a directory browser opens starting at the home directory
    And I can navigate into subdirectories by clicking them
    And I can navigate up to the parent directory
    When I select a directory
    Then the working directory field is populated with the selected path

  Scenario: Submit spawner form successfully
    Given I have filled in session name "new-worker", selected a workDir, and chosen an agent definition
    When I click "Spawn"
    Then POST /api/agents/spawn is called with the correct payload
    And a success toast notification appears: "Spawned new-worker"
    And the dialog closes
    And within 10 seconds the new agent appears in the Office view grid

  Scenario: Session name validation
    Given the spawner dialog is open
    When I enter a session name containing spaces or special characters other than hyphens
    Then an inline validation error is shown before the form is submitted
    And the Spawn button is disabled until the name is valid

  Scenario: Initial prompt is optional
    Given the spawner dialog is open
    When I leave the initial prompt field blank and click Spawn
    Then the form submits successfully without an initialPrompt field
```

---

#### US-1.7 — Consistent Dark-Mode Design Tokens

**As** the orchestrator,
**I want** all views to share a consistent dark-mode color palette and typography scale,
**so that** the application feels like a coherent product rather than a collection of independent pages.

**Story Points:** 3
**MoSCoW:** Must
**INVEST Notes:** Design token work that underpins all Phase 1 visual stories. Separate from shadcn/ui integration (US-1.2) — this is about defining the custom token layer on top.

**Acceptance Criteria:**

```gherkin
Feature: Design Tokens

  Scenario: Background colors are consistent across views
    Given I navigate through Office, Command, Tokens, and Terminal views
    Then all views use the same base background color (#020208 or CSS variable equivalent)
    And no view shows a white or light-mode flash during navigation

  Scenario: Status color tokens are defined and used
    Given the design token set is applied
    Then agent status colors are sourced from named CSS variables:
      - working: a distinct green or teal tone
      - waiting: a muted yellow/amber tone
      - permission: a distinct orange tone
      - error: a distinct red tone
      - idle: a muted grey tone
    And these colors are used consistently in AgentCard, sidebar counters, and any status badges

  Scenario: Typography scale is defined
    Given the design token set is applied
    Then heading, body, caption, and mono text sizes are defined as CSS variables
    And no component uses arbitrary pixel font sizes outside the scale
```

---

### Epic 2 — Dashboard (Phase 2)

---

#### US-2.1 — Fleet Status Overview Dashboard

**As** the orchestrator,
**I want** a dedicated Dashboard view with status summary cards and a live agent status grid,
**so that** I can assess the health of the entire fleet at a glance without opening any modal or navigating away.

**Story Points:** 5
**MoSCoW:** Should

**Acceptance Criteria:**

```gherkin
Feature: Dashboard Overview

  Scenario: Status summary cards are accurate
    Given I am on the Dashboard view
    Then I see summary cards showing:
      - Total agents (count)
      - Agents currently "working" (count)
      - Agents awaiting permission (count, highlighted if > 0)
      - Tasks completed today (count from history)
    And counts update within 3 seconds when agent states change via WebSocket

  Scenario: Live agent status grid
    Given I am on the Dashboard view
    When a new agents-updated WebSocket event arrives
    Then the agent grid shows each agent with its name, status, current headline, and project name
    Updated without a full page reload

  Scenario: Clicking an agent in the grid opens its terminal modal
    Given I am on the Dashboard view
    When I click an agent row in the status grid
    Then the TerminalModal opens for that agent
    (Same behavior as clicking an agent card in Office view)
```

---

#### US-2.2 — Daily Token Cost Chart

**As** the orchestrator,
**I want** a 7-day token cost trend chart on the Dashboard,
**so that** I can monitor cost burn without navigating to the Tokens view.

**Story Points:** 5
**MoSCoW:** Should
**INVEST Notes:** Data source is the existing `/api/token-usage` endpoint. Chart library must be selected (Recharts is the safe choice given the React 19 + Vite stack — no additional bundle risk).

**Acceptance Criteria:**

```gherkin
Feature: Token Cost Chart

  Scenario: Chart renders with available data
    Given /api/token-usage returns data for the last 7 days
    When I view the Dashboard
    Then a bar or line chart shows daily token cost in USD for each of the last 7 days
    And the chart x-axis labels show day abbreviations (Mon, Tue, etc.)
    And the chart y-axis shows cost in USD

  Scenario: Chart handles missing days gracefully
    Given some days in the last 7 have no token usage data
    When the chart renders
    Then missing days show a zero bar (not an error or a gap that breaks the chart)

  Scenario: Chart shows today's running total
    Given today has partial usage data
    When the chart renders
    Then today's bar reflects the current running total from the realtime session data
    And a visual indicator (different color or pattern) distinguishes today's partial bar
```

---

#### US-2.3 — Activity Timeline

**As** the orchestrator,
**I want** a live activity timeline on the Dashboard showing recent agent and task events,
**so that** I can follow what the fleet has done in the last hour without manually checking each agent.

**Story Points:** 5
**MoSCoW:** Should
**INVEST Notes:** The WebSocket already emits structured events (`task-submitted`, `task-assigned`, `task-completed`, `task-failed`, `agent-spawned`, `agent-killed`, `chain-created`, `chain-completed`). This story surfaces those events in a feed UI.

**Acceptance Criteria:**

```gherkin
Feature: Activity Timeline

  Scenario: Timeline shows recent events
    Given the Dashboard is open and the WebSocket is connected
    When events arrive (task-submitted, task-assigned, task-completed, agent-spawned, etc.)
    Then each event appears as a new row at the top of the timeline
    With a timestamp, event type badge, and human-readable description
    Formatted as: "[HH:MM:SS] [badge] Description"

  Scenario: Timeline is capped to prevent overflow
    Given more than 100 events have occurred since the page loaded
    Then the timeline shows only the most recent 100 events
    And a "showing last 100 events" note is visible

  Scenario: Timeline events are color-coded by type
    Given events of different types are in the timeline
    Then task-completed events show a green accent
    And task-failed / chain-failed events show a red accent
    And permission events show an orange accent
    And informational events (agent-spawned, task-submitted) show a neutral/muted accent
```

---

#### US-2.4 — Agent Detail Drawer

**As** the orchestrator,
**I want** to open a detail drawer for any agent showing its full context (working directory, detected stack, recent files, current task),
**so that** I can quickly understand what an agent is working on and what files it has touched without opening a terminal.

**Story Points:** 3
**MoSCoW:** Should

**Acceptance Criteria:**

```gherkin
Feature: Agent Detail Drawer

  Scenario: Open agent detail drawer
    Given I am on the Dashboard or Office view
    When I click the "Details" action on an agent card or row
    Then a slide-over drawer opens from the right
    Showing:
      - Session name and window name
      - Current status badge
      - Working directory (from AgentContext.workingDir)
      - Detected stack tags (from AgentContext.detectedStack)
      - Recent files list (from AgentContext.recentFiles, last 10)
      - Project name (from AgentContext.projectName)
      - Last activity timestamp (from AgentContext.lastActiveAt)
      - Current task ID if assigned

  Scenario: Recent files are clickable
    Given the agent detail drawer is open
    When I click a file path in the recent files list
    Then POST /api/open-file is called with the file path
    And the file opens in the default application on the host machine

  Scenario: Drawer updates in real time
    Given the agent detail drawer is open for agent "worker-1:0"
    When a new agents-updated WebSocket event arrives with updated context for worker-1:0
    Then the drawer content updates without closing and reopening
```

---

### Epic 3 — Task Board (Phase 3)

---

#### US-3.1 — Kanban Task Board

**As** the orchestrator,
**I want** a Kanban-style task board with columns for each task status,
**so that** I can see all pending, assigned, completed, and failed tasks at a glance and manage them visually.

**Story Points:** 8
**MoSCoW:** Could
**INVEST Notes:** The existing CommandCenter already shows task lists. This story replaces or augments it with a column-based layout. 8 points because it requires a Kanban layout component, drag context (optional — could be click-only for MVP), and integration with all four task states from the dispatcher.

**Acceptance Criteria:**

```gherkin
Feature: Kanban Task Board

  Scenario: Board shows all task statuses
    Given I navigate to the Task Board view
    When the board loads with data from GET /api/queue
    Then I see four columns: Pending, Assigned, Completed, Failed
    And each task card shows: task ID, truncated command (max 80 chars), priority badge, and age

  Scenario: Board updates in real time
    Given the Task Board is open
    When a task-assigned WebSocket event arrives
    Then the task card moves from the Pending column to the Assigned column without a page reload
    And the card shows the assigned agent's session name

  Scenario: Cancel a pending task from the board
    Given a task is in the Pending column
    When I click the cancel (X) icon on the task card
    Then a confirmation prompt appears
    When I confirm
    Then POST /api/queue/cancel is called with the task ID
    And the task card moves to the Failed column

  Scenario: Completed and failed columns are scrollable
    Given more than 20 tasks are in the Completed column
    Then the column scrolls independently
    And the other columns are not affected
```

---

#### US-3.2 — Task Detail Drawer

**As** the orchestrator,
**I want** to open a task detail drawer showing the full task metadata and terminal output,
**so that** I can inspect what a task produced without opening the assigned agent's terminal.

**Story Points:** 3
**MoSCoW:** Could

**Acceptance Criteria:**

```gherkin
Feature: Task Detail Drawer

  Scenario: Open task detail from Kanban card
    Given I am viewing the Task Board
    When I click on a task card
    Then a drawer opens showing:
      - Task ID
      - Full command text (not truncated)
      - Status, priority, creation time, assignment time, completion time
      - Assigned to: agent session name and target
      - Dispatch reason (the affinity scoring explanation)
      - Affinity tags, projectName, and filePaths if set
      - Retry count / max retries
      - Output (raw terminal capture, in a monospace scrollable block) if available

  Scenario: Output is absent for pending tasks
    Given I open the detail drawer for a pending task
    Then the output section shows "No output yet — task is pending"
    And no empty or broken code block is rendered
```

---

#### US-3.3 — Enhanced Task Submission Form

**As** the orchestrator,
**I want** a task submission form that exposes affinity fields (tags, project name, preferred agent),
**so that** I can guide task routing to the most relevant agent without relying entirely on auto-detection.

**Story Points:** 5
**MoSCoW:** Could
**INVEST Notes:** The existing CommandCenter has a basic task input. This story adds the affinity fields UI on top of the existing POST /api/queue/submit API.

**Acceptance Criteria:**

```gherkin
Feature: Task Submission with Affinity

  Scenario: Submit a task with backend tag affinity
    Given I am on the Command or Task Board view
    When I open the task submission form and enter a command
    And I select "backend" from the tags picker
    And I click Submit
    Then POST /api/queue/submit is called with affinity.tags: ["backend"]
    And the task appears in the Pending column with a "backend" affinity badge

  Scenario: Submit a task with preferred agent
    Given the task submission form is open
    When I select a specific agent from the "Prefer Agent" dropdown (populated from live agent list)
    And I submit the task
    Then the task affinity.preferAgent is set to the selected agent's target string

  Scenario: Auto-detected affinity is shown to the user
    Given the task submission form is open
    When I type a command containing the word "deploy" or "kubernetes"
    Then the form shows "Auto-detected: infra" as a chip below the command field
    And I can remove or add to the auto-detected tags before submitting

  Scenario: Priority selection
    Given the task submission form is open
    Then priority options High, Normal, Low are available
    And "Normal" is selected by default
```

---

#### US-3.4 — Task Chain Builder

**As** the orchestrator,
**I want** a multi-step form to define and submit a task chain,
**so that** I can compose sequential workflows (A then B then C) from the UI without writing API calls.

**Story Points:** 5
**MoSCoW:** Could

**Acceptance Criteria:**

```gherkin
Feature: Task Chain Builder

  Scenario: Create a 3-step chain
    Given I open the Chain Builder dialog
    When I enter a chain name "auth-migration"
    And I add 3 steps with individual prompt text
    And I click "Submit Chain"
    Then POST /api/chain/submit is called with the correct name, steps array, and priority
    And a success notification confirms the chain was submitted
    And the chain appears in the active chains panel

  Scenario: Reorder steps before submission
    Given the Chain Builder has 3 steps entered
    When I drag step 3 above step 2
    Then the steps are reordered in the UI
    And the submitted chain reflects the new order

  Scenario: Minimum one step required
    Given the Chain Builder dialog is open
    When I attempt to submit with zero steps
    Then the Submit button is disabled
    And an inline message "Add at least one step" is shown

  Scenario: Cancel chain
    Given a chain is in running status
    When I click "Cancel Chain" from the active chains panel
    Then DELETE /api/chain/:id is called
    And the chain status updates to "failed" in the UI
```

---

#### US-3.5 — Task Templates

**As** the orchestrator,
**I want** to save frequently-used task commands as named templates and recall them from the task form,
**so that** I stop retyping the same long prompts for routine tasks.

**Story Points:** 5
**MoSCoW:** Could
**INVEST Notes:** Templates are stored client-side in localStorage (no backend change required). This keeps it independent and small enough for one sprint.

**Acceptance Criteria:**

```gherkin
Feature: Task Templates

  Scenario: Save a task as a template
    Given I have entered a task command in the submission form
    When I click "Save as Template" and enter a template name
    Then the template is stored in localStorage under key "maw-task-templates"
    And a success notification confirms "Template saved"

  Scenario: Load a template into the form
    Given at least one template is saved
    When I open the task submission form and click the templates icon
    Then a dropdown shows all saved templates by name
    When I select a template
    Then the command field is populated with the template's command
    And affinity fields are populated if the template includes them

  Scenario: Delete a template
    Given the template picker is open
    When I click the delete icon next to a template
    Then a confirmation prompt appears
    When I confirm
    Then the template is removed from localStorage and the picker list

  Scenario: Templates persist across page reloads
    Given I saved a template named "run-tests"
    When I reload the page and open the task form
    Then "run-tests" still appears in the template picker
```

---

### Epic 4 — Cherry-Pick Features (Phase 4)

---

#### US-4.1 — Global Command Palette (Cmd+K)

**As** the orchestrator,
**I want** a Cmd+K command palette for navigation, agent actions, and task submission,
**so that** I can perform any common action without moving my hands from the keyboard.

**Story Points:** 8
**MoSCoW:** Could
**INVEST Notes:** This is a significant standalone feature. The ShortcutOverlay already exists — this replaces/augments it with an action-capable palette.

**Acceptance Criteria:**

```gherkin
Feature: Command Palette

  Scenario: Open palette with Cmd+K
    Given I am on any view
    When I press Cmd+K (or Ctrl+K on non-Mac)
    Then the command palette modal opens with an empty search input focused

  Scenario: Search navigates to views
    Given the command palette is open
    When I type "office"
    Then the palette shows "Go to Office" as a result
    When I press Enter
    Then I am navigated to the Office view and the palette closes

  Scenario: Search targets agents
    Given the command palette is open
    When I type the name of an agent session
    Then the palette shows actions: "Open Terminal", "Kill Agent", "Toggle Worker"
    When I select "Open Terminal"
    Then the TerminalModal opens for that agent

  Scenario: Close palette with Escape
    Given the command palette is open
    When I press Escape
    Then the palette closes with no action taken
    And keyboard focus returns to where it was before opening
```

---

#### US-4.2 — Mobile-Responsive Status View

**As** the orchestrator,
**I want** the Dashboard view to be readable on a phone screen,
**so that** I can check fleet status and approve/deny permission prompts while away from my desk.

**Story Points:** 5
**MoSCoW:** Could

**Acceptance Criteria:**

```gherkin
Feature: Mobile Responsive Dashboard

  Scenario: Dashboard is readable at 375px viewport width
    Given I open the dashboard on a device with 375px width
    Then the layout stacks vertically (single column)
    And summary cards are full-width
    And the agent status grid shows one agent per row
    And no horizontal scroll bar appears

  Scenario: Agent permission prompt is actionable on mobile
    Given an agent is in "permission" status
    When I view the Dashboard on mobile
    Then the agent row shows a prominent "Needs Permission" indicator
    And I can tap the agent row to open the TerminalModal
    And the terminal modal is scrollable and usable at mobile width

  Scenario: Navigation is accessible on mobile
    Given I am on mobile width
    Then the sidebar collapses to a hamburger menu or bottom navigation bar
    And all 5 views remain accessible
```

---

#### US-4.3 — Goal Hierarchy Panel

**As** the orchestrator,
**I want** to define high-level goals and link task chains to them,
**so that** I can track progress toward multi-session objectives (e.g., "Implement Auth Module") rather than individual tasks.

**Story Points:** 8
**MoSCoW:** Could
**INVEST Notes:** Requires a new backend data model (Goals stored in SQLite) and a new API endpoint. This is the most architecturally additive item in Phase 4 — deliberately last to avoid polluting earlier sprints.

**Acceptance Criteria:**

```gherkin
Feature: Goal Hierarchy

  Scenario: Create a goal
    Given I open the Goals panel
    When I enter a goal title "Complete Auth Module v2" and click Save
    Then the goal is persisted (POST /api/goals)
    And the goal appears in the goals list with status "In Progress"

  Scenario: Link a task chain to a goal
    Given a goal "Complete Auth Module v2" exists
    And a chain "auth-migration" is in the active chains panel
    When I drag the chain onto the goal or select "Link to Goal" from the chain context menu
    Then the chain is associated with the goal
    And the goal's progress indicator updates to reflect the chain's completion status

  Scenario: Goal progress is calculated from linked chains
    Given a goal has 3 linked chains (2 completed, 1 running)
    Then the goal card shows "2/3 chains complete" and a progress bar at 66%

  Scenario: Mark a goal as complete manually
    Given a goal is in "In Progress" status
    When I click "Mark Complete"
    Then the goal status changes to "Completed" and moves to a completed section
```

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target |
|-------------|--------|
| Dashboard initial load time | Under 1 second on localhost (no external dependencies) |
| WebSocket event to UI update latency | Under 200ms after message receipt |
| Agent tracker poll cycle | Must remain at 2s — UI enhancements must not increase backend poll frequency |
| Office Vite bundle size (gzipped) | Under 500KB total including all new dependencies |
| Token chart render with 7 data points | Under 100ms |

### 6.2 Security

This is a local developer tool. Security requirements are proportional to the threat model (localhost + local network).

- The backend already enforces `pathValidator` on directory browsing and file operations. No new file-access endpoints should be added without using this middleware.
- No user authentication is required (out of scope per W1 above).
- The spawner form must validate session names on the client before submission to prevent shell injection via the `tmux new-session` path. The backend's existing Zod schema validation (`SpawnAgentSchema`) is the authoritative guard.
- No secrets, tokens, or credentials should be stored in localStorage or rendered in the UI.

### 6.3 Accessibility

This is a developer tool with a single power-user persona. Accessibility requirements are pragmatic:

- All interactive elements must have a visible focus ring (keyboard navigation).
- All status indicators must use both color and text/icon — never color alone — to support color-blind users.
- Modal dialogs must trap focus while open and return focus to the trigger element on close.
- Minimum touch target size of 44x44px for mobile-targeted interactions (US-4.2).
- No WCAG AAA requirement. WCAG AA for text contrast ratios is the target.

### 6.4 Compatibility

- Browsers: Chrome 120+, Firefox 120+, Safari 17+ (developer tools — no legacy IE/Edge support required).
- Node/Bun runtime: no change — Bun 1.x as per existing stack.
- The existing CLI tools (`maw hey`, `maw peek`, `maw kill`) must remain fully functional after all UI changes — they interact with the backend API, not the UI.
- All backend API routes in `server.ts` must remain backward compatible. No breaking changes to existing route signatures.

### 6.5 Dark Mode

All new UI components must be dark-mode first. There is no light-mode requirement for this product.

---

## 7. Out of Scope

The following items are explicitly excluded from this roadmap to prevent scope creep:

- Authentication, multi-user access, or session management (local tool)
- Multi-machine topology management beyond existing SSH remote support
- Session recording and playback (FEATURE_BACKLOG item 8 — separate initiative)
- Oracle search UI modifications
- Backend logic changes (new data models, new polling mechanisms, new inference engines)
  - Exception: Goal hierarchy (US-4.3) requires a minimal new SQLite table and two REST endpoints — this is scoped and bounded
- Real-time audio/notification changes beyond what GlobalNotificationProvider already handles
- Internationalization or localization

---

## 8. Sprint Capacity Plan

**Assumptions:**
- 1 frontend developer available
- Sprint length: 2 weeks
- Velocity estimate: 18–22 points per sprint (based on complexity of this codebase)
- US-1.2 (shadcn/ui) is a prerequisite for all other Phase 1 UI stories and must be the first task in Sprint 1

### Sprint 1 — Foundation Core (Target: 20 points)

| Story | Points | Notes |
|-------|--------|-------|
| US-1.2 — shadcn/ui Integration | 3 | Start here — unblocks all other stories |
| US-1.7 — Design Tokens | 3 | Do alongside 1.2, same PR context |
| US-1.1 — Sidebar Navigation Shell | 5 | Layout foundation — all routes remain working |
| US-1.3 — Worker Promote/Demote UI | 3 | Quick win, backend ready |
| US-1.4 — Agent Rename UI | 2 | Quick win, backend ready |
| US-1.5 — Kill Agent / Kill Session UI | 2 | Quick win, backend ready |
| **Sprint 1 Total** | **18** | |

### Sprint 2 — Spawner + Dashboard (Target: 21 points)

| Story | Points | Notes |
|-------|--------|-------|
| US-1.6 — Agent Spawner Form | 5 | Most complex Phase 1 story |
| US-2.1 — Fleet Status Dashboard | 5 | New route, no backend changes |
| US-2.2 — Daily Cost Chart | 5 | Recharts + existing token-usage API |
| US-2.3 — Activity Timeline | 5 | WebSocket event fan-out to feed UI |
| **Sprint 2 Total** | **20** | |

### Sprint 3 — Agent Detail + Task Board (Target: 19 points)

| Story | Points | Notes |
|-------|--------|-------|
| US-2.4 — Agent Detail Drawer | 3 | |
| US-3.1 — Kanban Task Board | 8 | Largest single story — no drag-and-drop required for MVP |
| US-3.2 — Task Detail Drawer | 3 | |
| US-3.3 — Enhanced Task Submission Form | 5 | Replaces current CommandCenter input |
| **Sprint 3 Total** | **19** | |

### Sprint 4 — Task Chains + Templates (Target: 18 points)

| Story | Points | Notes |
|-------|--------|-------|
| US-3.4 — Task Chain Builder | 5 | |
| US-3.5 — Task Templates | 5 | localStorage only, no backend |
| US-4.1 — Cmd+K Command Palette | 8 | Can be descoped to Sprint 5 if velocity is lower |
| **Sprint 4 Total** | **18** | |

### Sprint 5 — Mobile + Goals (Target: ~21 points)

| Story | Points | Notes |
|-------|--------|-------|
| US-4.2 — Mobile Responsive Dashboard | 5 | |
| US-4.3 — Goal Hierarchy Panel | 8 | Requires backend work — coordinate with SA |
| US-4.1 — Cmd+K (if deferred) | 8 | |
| **Sprint 5 Total** | **13–21** | Flex sprint — absorb Phase 4 carry-over |

---

## 9. Definition of Done

A user story is Done when:

1. All Gherkin acceptance criteria pass in manual testing.
2. No TypeScript errors reported by `bun run typecheck`.
3. No ESLint errors reported by `bun run lint`.
4. All existing views (`#office`, `#mission`, `#command`, `#tokens`, `#terminal`) continue to function correctly (backward compatibility check).
5. The change has been reviewed and merged to the feature branch.
6. No regressions in the existing CLI tools (`maw hey`, `maw peek`, `maw kill`).
