# maw-js Dashboard Enhancement — Project Plan

**Version:** 1.0
**Date:** 2026-03-13
**Author:** Project Manager Agent
**Status:** Ready for Development
**Input:** PRD v1.0 (17 stories, 96 pts) + SA v1.0
**Methodology:** Agile / Scrum (5 sprints × 2 weeks)

---

## Table of Contents

1. [Project Charter](#1-project-charter)
2. [Work Breakdown Structure (WBS)](#2-work-breakdown-structure)
3. [Sprint Plan with Capacity](#3-sprint-plan-with-capacity)
4. [Risk Register](#4-risk-register)
5. [RACI Chart](#5-raci-chart)
6. [Definition of Done Checklist](#6-definition-of-done-checklist)
7. [ClickUp Task List](#7-clickup-task-list)

---

## 1. Project Charter

### 1.1 Project Overview

| Field | Value |
|---|---|
| Project Name | maw-js Dashboard Enhancement |
| Product | Multi-Agent Workflow (maw-js) Web UI |
| Start Date | 2026-03-16 (Sprint 1 Day 1) |
| End Date | 2026-05-22 (Sprint 5 Day 10) |
| Total Duration | 10 weeks (5 × 2-week sprints) |
| Team Size | 1 solo frontend developer |
| Methodology | Agile Scrum |

### 1.2 Objectives

1. Deliver a persistent sidebar navigation shell replacing the fragmented hash-route layout
2. Eliminate all agent management tasks that currently require CLI or JSON file editing
3. Build a real-time fleet health dashboard visible at a glance without view switching
4. Introduce a visual task board for queue management and task chain composition
5. Ship a Cmd+K command palette and mobile-responsive layout as cherry-pick features

### 1.3 Scope Boundaries

**In Scope:** All 17 user stories across Epics 1-4 (US-1.1 through US-4.3) as defined in the PRD. Frontend implementation only, except US-4.3 which requires minimal backend changes (4 REST endpoints + 1 SQLite table).

**Out of Scope:** Authentication, multi-user access, session recording/playback, Oracle search UI changes, mobile layout for non-Dashboard views, multi-machine topology, internationalization.

### 1.4 Constraints and Assumptions

| Type | Statement |
|---|---|
| Constraint | All existing views (#office, #mission, #command, #tokens, #terminal) must remain backward compatible at all times |
| Constraint | No new backend endpoints for Phases 1-3. Backend API is frozen until Sprint 5 (Goals) |
| Constraint | Bundle size must stay under 500KB gzipped including all new dependencies |
| Constraint | Bun runtime — no Node.js-specific packages |
| Assumption | Backend API is stable and all documented endpoints in SA Section 5.1 work as described |
| Assumption | Developer has 6 productive hours/day, 10 working days per sprint |
| Assumption | 80% capacity utilization target (48 hours effective per sprint) |
| Assumption | shadcn/ui CLI works with the existing Tailwind v4 + Vite 6 configuration |

### 1.5 Success Criteria

| Metric | Target |
|---|---|
| All 17 stories pass AC | 100% manual Gherkin scenario coverage |
| TypeScript errors after delivery | 0 |
| ESLint errors after delivery | 0 |
| Existing views broken | 0 regressions |
| Bundle size (gzipped) | Under 500KB |
| Dashboard initial render | Under 1 second |

---

## 2. Work Breakdown Structure

Sprint assignments, hour estimates, and dependency chains are listed per story. All estimates assume a solo developer familiar with the codebase.

---

### 2.1 Epic 1 — Foundation (Sprint 1)

---

#### US-1.2 — shadcn/ui Integration (3 pts)

**Total estimated hours: 8h**

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.2.1 | [FE] Install peer dependencies: bun add class-variance-authority clsx tailwind-merge | frontend | 0.5h | — | 1 |
| 1.2.2 | [FE] Create office/components.json with shadcn new-york style + Tailwind v4 CSS-variables config | frontend | 0.5h | 1.2.1 | 1 |
| 1.2.3 | [FE] Create office/src/lib/cn.ts (clsx + twMerge utility) | frontend | 0.5h | 1.2.1 | 1 |
| 1.2.4 | [FE] Add @ path alias to office/vite.config.ts and update tsconfig.json paths | frontend | 0.5h | 1.2.2 | 1 |
| 1.2.5 | [FE] Run bunx shadcn@latest add for Sprint 1 component set: button, card, dialog, sheet, badge, input, label, select, separator, tooltip, toggle | frontend | 1h | 1.2.2, 1.2.4 | 1 |
| 1.2.6 | [FE] Add class="dark" to office/index.html | frontend | 0.25h | 1.2.5 | 1 |
| 1.2.7 | [FE] Create smoke-test page rendering Button, Dialog, Sheet in dark mode to verify rendering | frontend | 1h | 1.2.5, 1.2.6 | 1 |
| 1.2.8 | [FE] Install sonner: bun add sonner then bunx shadcn@latest add sonner | frontend | 0.75h | 1.2.5 | 1 |
| 1.2.9 | [QA] Manual verify all 5 existing views render without regressions after shadcn install | test | 1.5h | 1.2.5 | 1 |
| 1.2.10 | [QA] Run bun run typecheck and bun run lint — confirm 0 errors | test | 0.5h | 1.2.7 | 1 |

---

#### US-1.7 — Consistent Dark-Mode Design Tokens (3 pts)

**Total estimated hours: 7h**
**Depends on:** US-1.2 complete

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.7.1 | [FE] Add full @theme block of CSS custom properties to office/src/index.css (base palette, status colors, accent, typography scale, spacing/radius, shadcn required vars) as specified in SA Section 4.5 | frontend | 1.5h | 1.2.5 | 1 |
| 1.7.2 | [FE] Audit existing hardcoded color values across all component files and replace with CSS variable references | frontend | 2h | 1.7.1 | 1 |
| 1.7.3 | [FE] Create office/src/lib/design-tokens.ts exporting token constant names for TypeScript contexts | frontend | 0.5h | 1.7.1 | 1 |
| 1.7.4 | [FE] Create shared/StatusBadge.tsx implementing STATUS_CONFIG map with color + text + icon per status type (working, waiting, permission, error, idle) | frontend | 1h | 1.7.1 | 1 |
| 1.7.5 | [QA] Manual verify: all 5 existing views show consistent background color, no white flash on navigation, status badge colors match token values | test | 1.5h | 1.7.2, 1.7.4 | 1 |
| 1.7.6 | [QA] Verify no component uses arbitrary pixel font sizes outside the defined typography scale | test | 0.5h | 1.7.2 | 1 |

---

#### US-1.1 — Sidebar Navigation Shell (5 pts)

**Total estimated hours: 12h**
**Depends on:** US-1.2, US-1.7

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.1.1 | [FE] Create office/src/components/layout/AppShell.tsx: flex layout (sidebar 220px + main content flex-1, overflow-y-auto), background using --color-bg-base token | frontend | 1.5h | 1.7.1 | 1 |
| 1.1.2 | [FE] Create Sidebar.tsx (outer container, collapse toggle to 56px icon-only state) and SidebarFleetStatus.tsx (shows total agents + working count from useAgents stub) | frontend | 1.5h | 1.1.1 | 1 |
| 1.1.3 | [FE] Create SidebarNav.tsx: nav item list for all 7 routes (office, dashboard, command, tasks, tokens, terminal, mission) with active-route highlighting via current hash comparison | frontend | 1.5h | 1.1.2 | 1 |
| 1.1.4 | [FE] Add Spawn Agent button to Sidebar bottom section (stub — opens SpawnAgentDialog when built in Sprint 2) | frontend | 0.5h | 1.1.2 | 1 |
| 1.1.5 | [FE] Wrap all routes in App.tsx inside AppShell; update useHashRoute to recognize dashboard, tasks, goals | frontend | 1.5h | 1.1.1, 1.1.3 | 1 |
| 1.1.6 | [FE] Remove StatusBar from AppShell render tree (keep StatusBar.tsx file intact for backward compat) | frontend | 1h | 1.1.5 | 1 |
| 1.1.7 | [FE] Implement sidebar keyboard navigation: Tab cycles nav items in order, Enter on focused item navigates | frontend | 0.75h | 1.1.3 | 1 |
| 1.1.8 | [QA] Manual Gherkin AC: navigate from every view to every other via sidebar (no full-page reload), active route highlights, fleet counts update within 3s of WS change | test | 1.5h | 1.1.5 | 1 |
| 1.1.9 | [QA] Keyboard navigation test: Tab + Enter navigation through all sidebar items | test | 0.75h | 1.1.7 | 1 |
| 1.1.10 | [QA] Confirm all 5 existing views still functional inside AppShell wrapper | test | 1.5h | 1.1.6 | 1 |

---

#### US-1.3 — Worker Promote / Demote in UI (3 pts)

**Total estimated hours: 6h**
**Depends on:** US-1.2 (shadcn Toggle), US-1.1 (AppShell in place)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.3.1 | [FE] Create components/agents/WorkerToggle.tsx using shadcn Toggle: pressed = worker status, shows worker badge; disabled during in-flight request | frontend | 1.5h | 1.2.5 | 1 |
| 1.3.2 | [FE] Wire WorkerToggle to POST /api/agents/worker with action "add" or "remove" | frontend | 1h | 1.3.1 | 1 |
| 1.3.3 | [FE] Integrate WorkerToggle into AgentCard.tsx | frontend | 0.5h | 1.3.2 | 1 |
| 1.3.4 | [FE] Add success toast (sonner) on toggle success; add error toast with human-readable message on 500; badge state does not change on error | frontend | 0.5h | 1.3.2 | 1 |
| 1.3.5 | [QA] Manual Gherkin AC: promote, demote, reload verify persistence, simulate 500 verify error toast + no badge state change | test | 2h | 1.3.3, 1.3.4 | 1 |
| 1.3.6 | [QA] bun run typecheck + bun run lint | test | 0.5h | 1.3.3 | 1 |

---

#### US-1.4 — Agent Rename in UI (2 pts)

**Total estimated hours: 5h**
**Depends on:** US-1.2

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.4.1 | [FE] Create components/agents/RenameInline.tsx: display mode (name + pencil icon); edit mode (auto-focused input); Enter saves via PATCH /api/agents/:target/name, Escape cancels with no request | frontend | 1.5h | 1.2.5 | 1 |
| 1.4.2 | [FE] Client-side validation: reject empty string ("Name cannot be empty"), max 64 chars, no shell metacharacters | frontend | 0.5h | 1.4.1 | 1 |
| 1.4.3 | [FE] Integrate RenameInline into AgentCard.tsx; update headline on success | frontend | 1.25h | 1.4.2 | 1 |
| 1.4.4 | [QA] Manual Gherkin AC: rename to valid name, cancel with Escape (no request, original preserved), submit empty name (inline error, no request) | test | 1.5h | 1.4.3 | 1 |
| 1.4.5 | [QA] bun run typecheck + bun run lint | test | 0.25h | 1.4.3 | 1 |

---

#### US-1.5 — Kill Agent / Kill Session in UI (2 pts)

**Total estimated hours: 5h**
**Depends on:** US-1.2 (shadcn Dialog)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.5.1 | [FE] Create components/agents/ConfirmKillDialog.tsx using shadcn Dialog: dynamic title ("Kill window X?" or "Kill entire session Y?"), Cancel and Confirm buttons | frontend | 1.5h | 1.2.5 | 1 |
| 1.5.2 | [FE] Wire Kill Window to DELETE /api/agents/:target; agent card disappears within 5s on success | frontend | 0.75h | 1.5.1 | 1 |
| 1.5.3 | [FE] Wire Kill Session to DELETE /api/sessions/:name; all session cards disappear within 5s on success | frontend | 0.75h | 1.5.1 | 1 |
| 1.5.4 | [FE] Add Kill Window and Kill Session action buttons to AgentCard.tsx | frontend | 0.5h | 1.5.2, 1.5.3 | 1 |
| 1.5.5 | [QA] Manual Gherkin AC: kill window, kill session, cancel kill (no request, card remains) | test | 1.25h | 1.5.4 | 1 |
| 1.5.6 | [QA] bun run typecheck + bun run lint | test | 0.25h | 1.5.4 | 1 |

---

### 2.2 Epic 1 continued + Epic 2 (Sprint 2)

---

#### US-1.6 — Agent Spawner Form (5 pts)

**Total estimated hours: 12h**
**Depends on:** US-1.2 (Dialog available), US-1.1 (Spawn button stub in Sidebar)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 1.6.1 | [FE] Create components/agents/DirectoryBrowser.tsx: calls GET /api/browse, renders navigable directory list, parent button, select button confirms path | frontend | 2h | — | 2 |
| 1.6.2 | [FE] Create components/agents/AgentDefPicker.tsx: calls GET /api/agent-definitions, renders shadcn Select with name + description per definition | frontend | 1h | — | 2 |
| 1.6.3 | [FE] Create components/agents/SpawnAgentDialog.tsx using shadcn Dialog: session name input, DirectoryBrowser, AgentDefPicker, optional initial prompt textarea, Spawn/Cancel buttons | frontend | 2h | 1.6.1, 1.6.2 | 2 |
| 1.6.4 | [FE] Client-side session name validation: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/ — disable Spawn button while invalid, show inline error | frontend | 0.75h | 1.6.3 | 2 |
| 1.6.5 | [FE] Wire Spawn button to POST /api/agents/spawn; success toast "Spawned {name}", close dialog | frontend | 0.75h | 1.6.3 | 2 |
| 1.6.6 | [FE] Connect Spawn Agent button in Sidebar to open SpawnAgentDialog | frontend | 0.25h | 1.6.3, 1.1.4 | 2 |
| 1.6.7 | [QA] Manual Gherkin AC: definitions visible in picker, directory browser navigation, successful spawn, session name validation, optional prompt omitted | test | 3h | 1.6.5, 1.6.6 | 2 |
| 1.6.8 | [QA] Verify new agent appears in Office view grid within 10 seconds of spawn | test | 0.75h | 1.6.7 | 2 |
| 1.6.9 | [QA] bun run typecheck + bun run lint | test | 0.5h | 1.6.5 | 2 |

---

#### US-2.1 — Fleet Status Overview Dashboard (5 pts)

**Total estimated hours: 10h**
**Depends on:** US-1.1 (#dashboard route registered in App.tsx)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 2.1.1 | [FE] Create hooks/useAgents.ts: subscribes to maw-ws-message CustomEvent, filters agents-updated type, maintains TrackedAgent[] state | frontend | 1h | 1.1.5 | 2 |
| 2.1.2 | [FE] Create components/dashboard/StatusSummaryCards.tsx: 4 shadcn Card components (total agents, working, permission count highlighted if >0, tasks completed today) | frontend | 1.5h | 2.1.1 | 2 |
| 2.1.3 | [FE] Create components/dashboard/AgentStatusGrid.tsx: sortable table of all agents with name, StatusBadge, headline, project name; row click opens TerminalModal | frontend | 2h | 2.1.1 | 2 |
| 2.1.4 | [FE] Create components/dashboard/DashboardView.tsx composing all dashboard sub-components; register #dashboard route in App.tsx with React.lazy import | frontend | 1.25h | 2.1.2, 2.1.3 | 2 |
| 2.1.5 | [QA] Manual Gherkin AC: card counts accurate, update within 3s of WS state change, row click opens TerminalModal | test | 2h | 2.1.4 | 2 |
| 2.1.6 | [QA] Measure WS event to DOM update latency (target <200ms using Performance.mark()) | test | 1.25h | 2.1.5 | 2 |
| 2.1.7 | [QA] Verify all 5 existing views unaffected; bun run typecheck + bun run lint | test | 1h | 2.1.4 | 2 |

---

#### US-2.2 — Daily Token Cost Chart (5 pts)

**Total estimated hours: 9h**
**Depends on:** US-2.1 (DashboardView exists)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 2.2.1 | [FE] Install Recharts: bun add recharts | frontend | 0.25h | — | 2 |
| 2.2.2 | [FE] Create hooks/useTokenUsage.ts: fetches /api/token-usage and /api/token-usage/realtime every 30s; normalizes last 7 days, filling missing days with 0 | frontend | 1h | — | 2 |
| 2.2.3 | [FE] Create components/dashboard/DailyCostChart.tsx as lazy-loaded component: Recharts BarChart, 7-day x-axis, USD y-axis, today's bar in distinct color, dark themed tooltip and grid | frontend | 2.5h | 2.2.1, 2.2.2 | 2 |
| 2.2.4 | [FE] Integrate DailyCostChart into DashboardView with React.lazy/Suspense | frontend | 0.5h | 2.2.3, 2.1.4 | 2 |
| 2.2.5 | [QA] Manual Gherkin AC: chart renders with data, missing days show zero bar, today's bar visually distinct | test | 1.5h | 2.2.4 | 2 |
| 2.2.6 | [QA] Performance: chart renders in <100ms via React DevTools Profiler | test | 0.75h | 2.2.5 | 2 |
| 2.2.7 | [QA] Bundle size check: bun run build — confirm gzipped total remains under 500KB after adding Recharts | test | 0.5h | 2.2.5 | 2 |
| 2.2.8 | [QA] Verify Three.js is NOT imported on #dashboard route (check Vite chunk output) | test | 1h | 2.2.4 | 2 |

---

#### US-2.3 — Activity Timeline (5 pts)

**Total estimated hours: 9h**
**Depends on:** US-2.1 (DashboardView)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 2.3.1 | [FE] Create hooks/useActivityFeed.ts: subscribes to all maw-ws-message CustomEvents; prepends each as ActivityEvent (id, timestamp, type, description, color); caps array at 100 | frontend | 1.5h | — | 2 |
| 2.3.2 | [FE] Define human-readable description formatter for all relevant WS event types: task-submitted, task-assigned, task-completed, task-failed, agent-spawned, agent-killed, chain-created, chain-completed, chain-failed, task-timeout | frontend | 1h | 2.3.1 | 2 |
| 2.3.3 | [FE] Create components/dashboard/ActivityTimeline.tsx: shadcn ScrollArea list; each row: [HH:MM:SS] colored badge + description; green=completed, red=failed, orange=permission, neutral=info | frontend | 2h | 2.3.2 | 2 |
| 2.3.4 | [FE] Add "showing last 100 events" note when cap is reached; integrate into DashboardView | frontend | 0.5h | 2.3.3, 2.1.4 | 2 |
| 2.3.5 | [QA] Manual Gherkin AC: events appear at top, cap at 100 shows note, all 4 color categories verified | test | 2h | 2.3.4 | 2 |
| 2.3.6 | [QA] Measure WS event to timeline DOM update latency (target <200ms) | test | 1.5h | 2.3.5 | 2 |
| 2.3.7 | [QA] bun run typecheck + bun run lint | test | 0.5h | 2.3.4 | 2 |

---

### 2.3 Epic 2 continued + Epic 3 (Sprint 3)

---

#### US-2.4 — Agent Detail Drawer (3 pts)

**Total estimated hours: 7h**
**Depends on:** US-1.2 (shadcn Sheet), useAgents hook (Sprint 2)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 2.4.1 | [FE] Create components/agents/AgentDetailDrawer.tsx using shadcn Sheet (side="right"); accepts agent target prop; subscribes to useAgents filtering for matching target | frontend | 2h | 2.1.1 | 3 |
| 2.4.2 | [FE] Render all required fields: session/window name, StatusBadge, workingDir, detectedStack tags, recentFiles (last 10), projectName, lastActiveAt, currentTaskId | frontend | 1.5h | 2.4.1 | 3 |
| 2.4.3 | [FE] Recent files clickable: POST /api/open-file with file path on click | frontend | 0.5h | 2.4.2 | 3 |
| 2.4.4 | [FE] Add "Details" action button to AgentCard.tsx and AgentStatusGrid rows | frontend | 0.75h | 2.4.1 | 3 |
| 2.4.5 | [QA] Manual Gherkin AC: open drawer shows all fields, file click calls open-file, drawer updates without close/reopen on WS event | test | 1.75h | 2.4.3, 2.4.4 | 3 |
| 2.4.6 | [QA] Verify drawer content refreshes within 3s of agents-updated WS event | test | 0.5h | 2.4.5 | 3 |

---

#### US-3.1 — Kanban Task Board (8 pts)

**Total estimated hours: 16h**
**Depends on:** US-1.1 (#tasks route), US-1.2 (shadcn), US-1.7 (tokens)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 3.1.1 | [FE] Create hooks/useTaskQueue.ts: subscribes to queue-status (initial state) + all task-* WS events; maintains {pending, assigned, completed, failed} state | frontend | 2h | — | 3 |
| 3.1.2 | [FE] Create components/shared/ConfirmDialog.tsx: generic shadcn Dialog with title, description, Cancel and Confirm buttons; reusable across all destructive actions | frontend | 0.75h | 1.2.5 | 3 |
| 3.1.3 | [FE] Create components/tasks/TaskCard.tsx: task ID, command truncated to 80 chars, priority Badge, age, assigned agent (Assigned column only); Cancel button (Pending column only) triggers ConfirmDialog then POST /api/queue/cancel | frontend | 1.5h | 3.1.2 | 3 |
| 3.1.4 | [FE] Create components/tasks/KanbanColumn.tsx: column header + count badge + shadcn ScrollArea of TaskCards; columns scroll independently | frontend | 1h | 3.1.3 | 3 |
| 3.1.5 | [FE] Create components/tasks/KanbanBoard.tsx: flex row of 4 KanbanColumn instances (Pending/Assigned/Completed/Failed); no drag-and-drop per ADR-002 | frontend | 1h | 3.1.4, 3.1.1 | 3 |
| 3.1.6 | [FE] Create components/tasks/TaskBoardView.tsx as route container; register #tasks in App.tsx with React.lazy import | frontend | 1.25h | 3.1.5 | 3 |
| 3.1.7 | [QA] Manual Gherkin AC: all 4 columns visible, task card moves Pending->Assigned in real time on WS event, cancel pending task with confirmation, completed and failed columns scroll independently | test | 3h | 3.1.6 | 3 |
| 3.1.8 | [QA] Performance: Kanban column re-render on task move under 50ms via React DevTools Profiler | test | 1h | 3.1.7 | 3 |
| 3.1.9 | [QA] Verify all existing views (#office, #command, etc.) unaffected; bun run typecheck + bun run lint | test | 1h | 3.1.6 | 3 |
| 3.1.10 | [QA] Verify Three.js not imported on #tasks route | test | 0.5h | 3.1.6 | 3 |
| 3.1.11 | [QA] bun run build — confirm 0 errors | test | 1h | 3.1.9 | 3 |

---

#### US-3.2 — Task Detail Drawer (3 pts)

**Total estimated hours: 6h**
**Depends on:** US-3.1 (TaskCard exists), US-1.2 (shadcn Sheet)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 3.2.1 | [FE] Create components/tasks/TaskDetailDrawer.tsx using shadcn Sheet: shows task ID, full command (untruncated), status, priority, created/assigned/completed timestamps, assigned agent target, dispatch reason, affinity fields, retry count | frontend | 2h | 1.2.5 | 3 |
| 3.2.2 | [FE] Output section: shadcn ScrollArea monospace block with captured output; pending tasks show "No output yet — task is pending" | frontend | 0.75h | 3.2.1 | 3 |
| 3.2.3 | [FE] Wire TaskCard click (area outside Cancel button) to open TaskDetailDrawer with clicked task | frontend | 0.5h | 3.2.1, 3.1.3 | 3 |
| 3.2.4 | [QA] Manual Gherkin AC: open completed task (all metadata visible, output in monospace), open pending task ("No output yet" shown, no broken code block) | test | 1.25h | 3.2.3 | 3 |
| 3.2.5 | [QA] bun run typecheck + bun run lint | test | 0.5h | 3.2.3 | 3 |
| 3.2.6 | [QA] bun run build — confirm 0 errors | test | 1h | 3.2.5 | 3 |

---

#### US-3.3 — Enhanced Task Submission Form (5 pts)

**Total estimated hours: 10h**
**Depends on:** US-3.1 (TaskBoardView), US-1.2 (shadcn form components), useAgents

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 3.3.1 | [FE] Create components/tasks/TaskSubmitForm.tsx: command textarea, priority Select (High/Normal/Low, default Normal), tags chip input (add/remove), project name text input, preferred agent Select (live from useAgents) | frontend | 2.5h | 2.1.1 | 3 |
| 3.3.2 | [FE] Auto-detect affinity: parse command text on change for keywords (deploy/kubernetes->infra, backend/api->backend, frontend/ui->frontend, test->test); render as removable chips below textarea | frontend | 1.5h | 3.3.1 | 3 |
| 3.3.3 | [FE] Wire submit to POST /api/queue/submit with full affinity payload; show success toast; submitted task appears in Pending column | frontend | 1h | 3.3.1, 3.1.1 | 3 |
| 3.3.4 | [FE] Integrate TaskSubmitForm into TaskBoardView | frontend | 0.5h | 3.3.3, 3.1.6 | 3 |
| 3.3.5 | [QA] Manual Gherkin AC: submit with tag affinity, submit with preferred agent, auto-detect chips appear and are removable, priority selection, task appears in Pending | test | 2.5h | 3.3.4 | 3 |
| 3.3.6 | [QA] Verify existing CommandCenter in #command still works; bun run typecheck + bun run lint | test | 1h | 3.3.4 | 3 |
| 3.3.7 | [QA] bun run build — confirm 0 errors | test | 1h | 3.3.4 | 3 |

---

### 2.4 Epic 3 continued + Epic 4 partial (Sprint 4)

---

#### US-3.4 — Task Chain Builder (5 pts)

**Total estimated hours: 10h**
**Depends on:** US-3.1 (TaskBoardView), US-1.2 (shadcn Dialog)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 3.4.1 | [FE] Create components/tasks/ChainBuilderDialog.tsx using shadcn Dialog: chain name input, dynamic step list (each step: index, prompt textarea, delete, move-up/move-down buttons), Add Step button | frontend | 2.5h | 1.2.5 | 4 |
| 3.4.2 | [FE] Minimum 1 step validation: disable Submit button when step count is 0, show "Add at least one step" message | frontend | 0.5h | 3.4.1 | 4 |
| 3.4.3 | [FE] Wire Submit to POST /api/chain/submit; success toast, close dialog | frontend | 0.75h | 3.4.1 | 4 |
| 3.4.4 | [FE] Add active chains panel to TaskBoardView: list running chains from WS chain-* events; Cancel Chain button calls DELETE /api/chain/:id, status updates to failed | frontend | 1.75h | 3.4.1 | 4 |
| 3.4.5 | [QA] Manual Gherkin AC: create 3-step chain (verify POST payload), reorder steps (submitted chain reflects new order), minimum step validation, cancel running chain | test | 2.5h | 3.4.4 | 4 |
| 3.4.6 | [QA] bun run typecheck + bun run lint + bun run build | test | 2h | 3.4.4 | 4 |

---

#### US-3.5 — Task Templates (5 pts)

**Total estimated hours: 9h**
**Depends on:** US-3.3 (TaskSubmitForm exists)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 3.5.1 | [FE] Create lib/task-templates.ts: CRUD for localStorage key "maw-task-templates"; TaskTemplate interface {id (crypto.randomUUID()), name, command, affinity?, createdAt} | frontend | 1h | — | 4 |
| 3.5.2 | [FE] Create components/tasks/TaskTemplatesPicker.tsx: dropdown of saved templates by name with delete icon per entry; delete triggers ConfirmDialog | frontend | 1.5h | 3.5.1, 3.1.2 | 4 |
| 3.5.3 | [FE] Add "Save as Template" button to TaskSubmitForm: inline name-input dialog, calls task-templates.ts save, success toast | frontend | 1h | 3.5.1, 3.3.1 | 4 |
| 3.5.4 | [FE] Integrate TaskTemplatesPicker into TaskSubmitForm: picker icon opens dropdown, selecting template populates command + affinity fields | frontend | 1h | 3.5.2, 3.3.1 | 4 |
| 3.5.5 | [QA] Manual Gherkin AC: save template (localStorage written), load template (form fields populated), delete template (ConfirmDialog, removed from picker + localStorage), reload verifies persistence | test | 2.5h | 3.5.4 | 4 |
| 3.5.6 | [QA] Verify no credentials or tokens are written to localStorage | test | 0.5h | 3.5.4 | 4 |
| 3.5.7 | [QA] bun run typecheck + bun run lint + bun run build | test | 1.5h | 3.5.4 | 4 |

---

#### US-4.1 — Global Command Palette (Cmd+K) (8 pts)

**Total estimated hours: 14h**
**Depends on:** US-1.1 (App shell), US-1.2 (shadcn), useAgents hook

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 4.1.1 | [FE] Install shadcn command component: bunx shadcn@latest add command (installs cmdk-based Command primitive) | frontend | 0.5h | — | 4 |
| 4.1.2 | [FE] Create hooks/useCommandPalette.ts: manages open state; builds CommandAction[] registry for all 7 route navigation actions | frontend | 1.5h | 4.1.1 | 4 |
| 4.1.3 | [FE] Create components/shared/CommandPalette.tsx: wraps shadcn Command in a Dialog; global keydown listener for Cmd+K (macOS) / Ctrl+K (non-Mac); Escape closes and restores prior focus | frontend | 2h | 4.1.1, 4.1.2 | 4 |
| 4.1.4 | [FE] Navigation actions: fuzzy match route names in palette (e.g. "dash" matches Dashboard), execute hash navigation on select | frontend | 1h | 4.1.3 | 4 |
| 4.1.5 | [FE] Agent actions: type agent session name to surface "Open Terminal", "Kill Agent", "Toggle Worker" items for matched agents | frontend | 2h | 4.1.3, 2.1.1 | 4 |
| 4.1.6 | [FE] Mount CommandPalette at App.tsx root (always mounted, conditionally visible); verify focus trap and Escape behavior | frontend | 1.25h | 4.1.3 | 4 |
| 4.1.7 | [QA] Manual Gherkin AC: Cmd+K opens focused, "office" navigates to Office, agent name shows actions, Escape closes with focus restored | test | 3h | 4.1.6 | 4 |
| 4.1.8 | [QA] Cross-browser: Ctrl+K on Firefox and Safari; measure open-to-interactive time (target <100ms) | test | 1.5h | 4.1.7 | 4 |
| 4.1.9 | [QA] bun run typecheck + bun run lint | test | 0.5h | 4.1.6 | 4 |
| 4.1.10 | [QA] Full Sprint 4 regression: all stories from Sprints 1-4 still pass | test | 0.75h | 4.1.9 | 4 |

---

### 2.5 Epic 4 (Sprint 5)

---

#### US-4.2 — Mobile-Responsive Status View (5 pts)

**Total estimated hours: 9h**
**Depends on:** US-2.1 (DashboardView fully built), US-1.1 (Sidebar)

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 4.2.1 | [FE] Implement mobile sidebar collapse: at <768px viewport, sidebar renders as position:fixed overlay triggered by hamburger button; overlay closes on nav item click or outside tap | frontend | 2h | 1.1.2 | 5 |
| 4.2.2 | [FE] Make StatusSummaryCards responsive: grid-cols-1 at xs breakpoint (full-width cards at 375px) | frontend | 0.5h | 2.1.2 | 5 |
| 4.2.3 | [FE] Make AgentStatusGrid responsive: single column at 375px, hide secondary columns | frontend | 0.75h | 2.1.3 | 5 |
| 4.2.4 | [FE] Ensure all interactive elements meet 44×44px touch target minimum (padding audit) | frontend | 0.75h | 4.2.1 | 5 |
| 4.2.5 | [FE] Make TerminalModal scrollable at 375px: max-height 90dvh, overflow-y-auto | frontend | 0.75h | — | 5 |
| 4.2.6 | [FE] Verify no horizontal overflow at 375px across all Dashboard components | frontend | 0.5h | 4.2.1, 4.2.2, 4.2.3 | 5 |
| 4.2.7 | [QA] Manual Gherkin AC using Chrome DevTools 375px: vertical stacking, no horizontal scroll, hamburger shows all views, permission agent tappable, terminal modal usable | test | 2h | 4.2.6 | 5 |
| 4.2.8 | [QA] Safari 17+ mobile emulation test | test | 1h | 4.2.7 | 5 |
| 4.2.9 | [QA] bun run typecheck + bun run lint | test | 0.75h | 4.2.6 | 5 |

---

#### US-4.3 — Goal Hierarchy Panel (8 pts)

**Total estimated hours: 16h**
**Depends on:** All Phases 1-3 complete. Only story with backend changes.

| # | Task | Tag | Hours | Depends On | Sprint |
|---|---|---|---|---|---|
| 4.3.1 | [BE] Add goals table to initDb() in src/db/store.ts (CREATE TABLE IF NOT EXISTS goals); add CRUD functions: createGoal, getGoals, updateGoal, deleteGoal | backend | 2h | — | 5 |
| 4.3.2 | [BE] Add 4 REST routes to src/server.ts: GET/POST/PATCH/DELETE /api/goals/*; Zod validation (title max 200 chars, status enum, linkChainId/unlinkChainId optional strings) | backend | 1.5h | 4.3.1 | 5 |
| 4.3.3 | [FE] Add Goal interface to office/src/lib/types.ts | frontend | 0.25h | 4.3.2 | 5 |
| 4.3.4 | [FE] Create lib/api.ts: typed fetch helpers for Goals API (fetchGoals, createGoal, updateGoal, deleteGoal, linkChain, unlinkChain) | frontend | 1h | 4.3.3 | 5 |
| 4.3.5 | [FE] Create components/goals/GoalsPanel.tsx: route container with create goal form (title input + Save) and goals list | frontend | 1.5h | 4.3.4 | 5 |
| 4.3.6 | [FE] Goals list: each goal card shows title, status badge, shadcn Progress bar (completed chains / total chains), "Mark Complete" button | frontend | 1.5h | 4.3.5 | 5 |
| 4.3.7 | [FE] "Link to Goal" context menu on active chains panel: Select dialog with available goals; calls PATCH /api/goals/:id with linkChainId | frontend | 1h | 4.3.5, 3.4.4 | 5 |
| 4.3.8 | [FE] Register #goals route in App.tsx with React.lazy import; add Goals nav item to SidebarNav.tsx | frontend | 0.5h | 4.3.5 | 5 |
| 4.3.9 | [QA] Manual Gherkin AC: create goal (appears in list), link chain updates progress bar, 2/3 completed shows 66% bar, mark complete changes status | test | 2h | 4.3.8 | 5 |
| 4.3.10 | [QA] Verify goal persists in SQLite across server restart | test | 1h | 4.3.9 | 5 |
| 4.3.11 | [QA] Backend API validation: test all 4 endpoints; Zod rejects title >200 chars; 404 for unknown goal ID | test | 1.5h | 4.3.2 | 5 |
| 4.3.12 | [QA] bun run typecheck + bun run lint | test | 0.75h | 4.3.8 | 5 |
| 4.3.13 | [QA] FINAL REGRESSION: all 17 stories manually verified, bun run build passes, bundle under 500KB, 0 TS errors, 0 lint errors, no CLI regressions | test | 4h | All Sprint 5 stories | 5 |

---

## 3. Sprint Plan with Capacity

**Capacity baseline:**
- Days per sprint: 10
- Hours per day: 6 productive
- Total raw capacity: 60 hours/sprint
- 80% utilization cap: **48 hours/sprint**
- All sprints are planned at or below 48 hours of estimated work

---

### Sprint 1 — Foundation Core

**Dates:** 2026-03-16 to 2026-03-27
**Stories:** US-1.2, US-1.7, US-1.1, US-1.3, US-1.4, US-1.5
**Story Points:** 18

| Story | FE Hours | QA Hours | Subtotal |
|---|---|---|---|
| US-1.2 shadcn/ui Integration | 5.25h | 2h | 7.25h |
| US-1.7 Design Tokens | 5h | 2h | 7h |
| US-1.1 Sidebar Navigation Shell | 8.75h | 3.75h | 12.5h |
| US-1.3 Worker Promote/Demote | 3.5h | 2.5h | 6h |
| US-1.4 Agent Rename | 3.25h | 1.75h | 5h |
| US-1.5 Kill Agent/Session | 3.5h | 1.5h | 5h |
| **Sprint 1 Total** | **29.25h** | **13.5h** | **42.75h** |

**Capacity check:** 42.75h / 48h cap = **89% — within budget**

**Implementation order within Sprint 1 (critical path):**
1. US-1.2 (shadcn + cn.ts) — Day 1-2, unblocks everything
2. US-1.7 (design tokens) — Day 2-3, run in parallel with shadcn install
3. US-1.1 (AppShell + Sidebar) — Day 3-5, depends on 1.2 + 1.7
4. US-1.3, US-1.4, US-1.5 — Day 6-9, parallel agent management stories
5. QA regression and sign-off — Day 10

**Sprint 1 Exit Criteria:**
- All 5 existing views render correctly inside AppShell with sidebar visible
- Worker toggle, rename, kill all functional end-to-end
- 0 TypeScript errors, 0 ESLint errors
- M1 Milestone: Foundation Complete

---

### Sprint 2 — Spawner + Dashboard

**Dates:** 2026-03-30 to 2026-04-10
**Stories:** US-1.6, US-2.1, US-2.2, US-2.3
**Story Points:** 20

| Story | FE Hours | QA Hours | Subtotal |
|---|---|---|---|
| US-1.6 Agent Spawner Form | 7h | 4.25h | 11.25h |
| US-2.1 Fleet Status Dashboard | 5.75h | 4.25h | 10h |
| US-2.2 Daily Token Cost Chart | 4.25h | 3.25h | 7.5h |
| US-2.3 Activity Timeline | 5h | 4h | 9h |
| **Sprint 2 Total** | **22h** | **15.75h** | **37.75h** |

**Capacity check:** 37.75h / 48h cap = **79% — within budget**

**Implementation order:**
1. useAgents hook (2.1.1) — Day 1, unblocks Dashboard and Sidebar fleet count
2. DirectoryBrowser + AgentDefPicker (1.6.1, 1.6.2) — Day 1-2, parallel with useAgents
3. SpawnAgentDialog complete (1.6.3-1.6.6) — Day 2-3
4. StatusSummaryCards + AgentStatusGrid + DashboardView (2.1.2-2.1.4) — Day 3-5
5. useTokenUsage + DailyCostChart (2.2.2-2.2.4) — Day 4-6
6. useActivityFeed + ActivityTimeline (2.3.1-2.3.4) — Day 5-7
7. QA sprint — Day 7-10

**Sprint 2 Exit Criteria:**
- #dashboard route live with all components rendering real data
- Spawn agent creates a real agent visible in Office within 10 seconds
- Bundle check passes (under 500KB)
- M2 Milestone: Dashboard Live

---

### Sprint 3 — Agent Detail + Task Board

**Dates:** 2026-04-13 to 2026-04-24
**Stories:** US-2.4, US-3.1, US-3.2, US-3.3
**Story Points:** 19

| Story | FE Hours | QA Hours | Subtotal |
|---|---|---|---|
| US-2.4 Agent Detail Drawer | 4.75h | 2.25h | 7h |
| US-3.1 Kanban Task Board | 8.5h | 6.5h | 15h |
| US-3.2 Task Detail Drawer | 3.25h | 2.75h | 6h |
| US-3.3 Enhanced Task Submission | 5.5h | 4.5h | 10h |
| **Sprint 3 Total** | **22h** | **16h** | **38h** |

**Capacity check:** 38h / 48h cap = **79% — within budget**

**Implementation order:**
1. ConfirmDialog.tsx (3.1.2) — Day 1, shared utility needed by multiple stories
2. useTaskQueue hook (3.1.1) — Day 1-2
3. AgentDetailDrawer (2.4.1-2.4.4) — Day 2-3
4. TaskCard + KanbanColumn + KanbanBoard (3.1.3-3.1.6) — Day 3-6
5. TaskDetailDrawer (3.2.1-3.2.3) — Day 5-6
6. TaskSubmitForm with affinity (3.3.1-3.3.4) — Day 6-8
7. QA sprint — Day 8-10

**Sprint 3 Exit Criteria:**
- #tasks route live with real-time Kanban board
- Task cards move between columns on WS events without page reload
- Agent detail drawer updates live
- M3 Milestone: Task Board Live

---

### Sprint 4 — Task Chains + Templates + Cmd+K

**Dates:** 2026-04-27 to 2026-05-08
**Stories:** US-3.4, US-3.5, US-4.1
**Story Points:** 18

| Story | FE Hours | QA Hours | Subtotal |
|---|---|---|---|
| US-3.4 Task Chain Builder | 5.5h | 4.5h | 10h |
| US-3.5 Task Templates | 3.5h | 4.5h | 8h |
| US-4.1 Cmd+K Command Palette | 8.25h | 5.75h | 14h |
| **Sprint 4 Total** | **17.25h** | **14.75h** | **32h** |

**Capacity check:** 32h / 48h cap = **67% — significant buffer preserved for US-4.1 risk absorption**

The deliberate underscheduling here is intentional: US-4.1 carries an 8-point estimate and is the highest-complexity Sprint 4 story (new library, global keyboard binding, cross-browser testing). If it overruns into the buffer, no story needs to move to Sprint 5.

**Sprint 4 Exit Criteria:**
- Chain builder submits multi-step chains to backend, active chains panel functional
- Templates persist in localStorage and load into TaskSubmitForm
- Cmd+K palette functional in Chrome, Firefox, Safari
- M4 Milestone: Chains + Palette

---

### Sprint 5 — Mobile + Goals (Flex Sprint)

**Dates:** 2026-05-11 to 2026-05-22
**Stories:** US-4.2, US-4.3
**Story Points:** 13 (up to 21 if US-4.1 carries from Sprint 4)

| Story | FE Hours | BE Hours | QA Hours | Subtotal |
|---|---|---|---|---|
| US-4.2 Mobile Responsive Dashboard | 5.25h | 0 | 3.75h | 9h |
| US-4.3 Goal Hierarchy Panel | 7.75h | 3.5h | 9.25h | 20.5h |
| **Sprint 5 Base Total** | **13h** | **3.5h** | **13h** | **29.5h** |

**Capacity check (base):** 29.5h / 48h cap = **61% — absorbs US-4.1 carry-over (14h) and reaches 90%**

**Sprint 5 Exit Criteria:**
- Dashboard readable at 375px with no horizontal scroll; hamburger navigation works
- Goals persisted in SQLite; chain linkage and progress calculation correct
- Full regression: all 17 stories manually verified
- 0 TypeScript errors, 0 ESLint errors, bundle under 500KB
- M5 Milestone: Project Complete

---

### Milestone Summary

| Milestone | Date | Deliverable |
|---|---|---|
| M1 — Foundation Complete | 2026-03-27 | shadcn/ui integrated, sidebar live, all agent management actions wired |
| M2 — Dashboard Live | 2026-04-10 | Fleet status, cost chart, activity timeline all rendering live data |
| M3 — Task Board Live | 2026-04-24 | Kanban board, agent detail drawer, enhanced task submission |
| M4 — Chains + Palette | 2026-05-08 | Full Epic 3 complete, Cmd+K shipped |
| M5 — Project Complete | 2026-05-22 | Mobile layout, Goals, full end-to-end regression |

---

### Critical Path

The following tasks form the critical path. Any delay here delays the project end date:

```
US-1.2 (shadcn/ui)
  └── US-1.7 (Design Tokens)
        └── US-1.1 (AppShell/Sidebar — all views wrapped)
              └── useAgents hook (2.1.1)
                    └── US-2.1 (Dashboard View)
                          └── US-3.1 (Task Board — useTaskQueue needed)
                                └── US-3.3 (Task Submit Form)
                                      └── US-3.5 (Task Templates)
```

US-4.3 (Goal Hierarchy) is on its own parallel path with backend dependency. Its backend subtasks (4.3.1, 4.3.2) are the only tasks requiring server-side changes and have no frontend predecessors — they can start Day 1 of Sprint 5.

---

## 4. Risk Register

| ID | Description | Probability | Impact | Score | Mitigation | Owner | Sprint | Status |
|---|---|---|---|---|---|---|---|---|
| R-01 | shadcn/ui CLI fails to configure with Tailwind v4 CSS variables — components render with wrong theme or conflict with existing classes | Low | High | Medium | SA confirmed shadcn/ui v2.3+ supports Tailwind v4 natively. Smoke-test (task 1.2.7) catches this before any other work proceeds. Fallback: manually copy component files without CLI. | Developer | 1 | Open |
| R-02 | Three.js bundle (300KB+) inflates total past 500KB target after adding Recharts (~45KB) | High | High | Critical | SA mandates lazy-loading UniverseBg via React.lazy() on #office only. Bundle size check task (2.2.7) after Sprint 2 validates. If exceeded, lazy-load MissionControl as next measure. | Developer | 2 | Open |
| R-03 | WebSocket event volume causes DOM lag when Dashboard, Timeline, TaskBoard, and Sidebar all subscribe simultaneously to the same CustomEvent bus | Low | Medium | Low | All hooks share the single existing WS connection and CustomEvent pattern already proven by CommandCenter. No new WS connections added. Latency measurement tasks (2.1.6, 2.3.6) confirm <200ms. | Developer | 2-3 | Open |
| R-04 | Recharts incompatibility with React 19 or Vite 6 bundler | Medium | Medium | Medium | SA explicitly selected Recharts as React 19 compatible. Lazy-load isolates failure. Fallback: hand-coded SVG chart (7 static data points — feasible in <4h). | Developer | 2 | Open |
| R-05 | Kanban board scope expands mid-sprint when drag-and-drop is requested | Medium | Medium | Medium | PRD and SA ADR-002 explicitly defer drag-and-drop to post-roadmap. Any request is a formal change and deferred to backlog unless explicitly re-scoped with timeline adjustment. | Developer/PO | 3 | Open |
| R-06 | US-4.3 backend changes introduce regression to existing server.ts routes | Low | High | Medium | New routes use /api/goals/* path — no collision with any existing route. Schema change uses CREATE TABLE IF NOT EXISTS — non-destructive to existing data. Final regression (task 4.3.13) validates all endpoints. | Developer | 5 | Open |
| R-07 | Solo developer velocity drops below 18 pts/sprint due to illness or context-switching | Medium | High | High | Sprints 4 and 5 are deliberately under-loaded (67% and 61% capacity). US-4.1 (8 pts) can move from Sprint 4 to Sprint 5 without affecting any dependent story. US-4.2 and US-4.3 are independent of each other. | Developer | All | Open |
| R-08 | Existing useSessions or useWebSocket hooks contain breaking assumptions conflicting with new hooks reading the same WS events | Low | High | Medium | SA Section 4.3 confirms CustomEvent bus pattern already used by CommandCenter. New hooks only add listeners — they never modify the event producer or existing hooks. | Developer | 2 | Open |
| R-09 | Tailwind v4 CSS variable conflicts between shadcn/ui variables and existing index.css properties | Low | Medium | Low | SA Section 4.5 documents exact variable names. They use semantic shadcn names not present in the existing codebase. Smoke-test (1.2.7) catches conflicts before Sprint 1 exits. | Developer | 1 | Open |
| R-10 | Cmd+K keyboard shortcut conflicts with browser DevTools, OS shortcuts, or Claude Code's own bindings | Medium | Low | Low | Ctrl+K is the non-Mac fallback. Cmd+K is not a reserved macOS system shortcut. Key binding is configurable in useCommandPalette.ts if a conflict is discovered during cross-browser testing (4.1.8). | Developer | 4 | Open |

---

## 5. RACI Chart

**Roles:**
- **Developer** — the human developer executing all implementation tasks
- **Orchestrator (AI)** — pipeline coordination, ClickUp management, phase gates
- **PO (AI)** — requirements ownership, AC validation, story acceptance

| Activity | Developer | Orchestrator (AI) | PO (AI) |
|---|---|---|---|
| Define user stories and acceptance criteria | I | C | **A/R** |
| Solution architecture and technology decisions | C | C | **A/R** |
| ClickUp task creation and sprint board setup | I | **A/R** | C |
| Sprint planning, capacity allocation, milestone dates | **A/R** | C | I |
| Risk identification and register maintenance | **A/R** | C | I |
| Frontend implementation ([FE] tasks) | **A/R** | I | I |
| Backend implementation ([BE] tasks — US-4.3 only) | **A/R** | I | I |
| Manual QA and Gherkin AC validation ([QA] tasks) | **A/R** | I | C |
| TypeScript typecheck and ESLint validation | **A/R** | I | I |
| Performance budget monitoring (bundle size, render timing) | **A/R** | I | C |
| Sprint demo and story walkthrough | R | I | **A** |
| Story acceptance (DoD sign-off) | R | C | **A** |
| Phase gate approval (advance to next agent in pipeline) | I | **A/R** | C |
| Backward compatibility regression testing | **A/R** | I | I |
| ClickUp status updates (task progress) | I | **A/R** | I |
| Retrospective and lessons learned | **A/R** | C | C |

---

## 6. Definition of Done Checklist

This checklist is the handoff document from Developer to Tester (Phase 5) for every user story. A story is **Done** only when every applicable item below is checked and confirmed.

### 6.1 Code Quality

- [ ] `bun run typecheck` reports 0 TypeScript errors across the entire codebase
- [ ] `bun run lint` reports 0 ESLint errors
- [ ] No `@ts-ignore` or `@ts-expect-error` comments added without an adjacent explanation comment
- [ ] No `console.log` statements present in production code paths
- [ ] New files placed in the correct directory per SA Section 3.1 structure (components/ui, components/layout, components/dashboard, components/tasks, components/agents, components/shared, components/goals, hooks, lib)

### 6.2 Functional Acceptance

- [ ] All Gherkin acceptance criteria scenarios from the PRD pass in manual testing on Chrome 120+
- [ ] Error scenarios tested: API returns 500, network failure, empty state (no agents, no tasks, no data)
- [ ] Loading states handled: no layout flash, no blank panels during data fetch
- [ ] Toast notifications appear for all success and error outcomes as specified per story

### 6.3 Backward Compatibility

- [ ] `#office` view renders correctly; all agent cards show current data
- [ ] `#mission` view renders correctly
- [ ] `#command` view renders correctly; task submission still works
- [ ] `#tokens` view renders correctly; usage data displays
- [ ] `#terminal` view renders correctly
- [ ] CLI commands `maw hey`, `maw peek`, `maw kill` verified working via terminal (spot check)
- [ ] No existing component file (.tsx) has been deleted or renamed

### 6.4 Design and Accessibility

- [ ] All CSS colors use CSS variable tokens from SA Section 4.5 — no arbitrary hex values added
- [ ] All interactive elements have a visible focus ring when navigated by keyboard
- [ ] All status indicators use both color AND text or icon — never color alone
- [ ] Modal dialogs trap focus while open; Escape closes them; focus returns to trigger element on close
- [ ] No white or light-mode background appears on any view during navigation

### 6.5 Performance

- [ ] Dashboard initial render measured under 1 second on localhost
- [ ] WS event-to-DOM update latency measured under 200ms (for stories involving WS updates)
- [ ] Kanban column re-render measured under 50ms (US-3.1)
- [ ] Token cost chart render measured under 100ms (US-2.2)
- [ ] `bun run build` executed; gzipped bundle total confirmed under 500KB
- [ ] Three.js confirmed NOT imported on any route other than `#office`

### 6.6 Security

- [ ] Session name field validates against `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/` client-side before any submit
- [ ] No new file-access endpoints added without confirming pathValidator middleware is applied in server.ts
- [ ] No credentials, API tokens, or secrets written to localStorage or rendered to the DOM
- [ ] US-4.3 only: Goals API Zod schema rejects title longer than 200 characters

### 6.7 Merge Readiness

- [ ] Feature branch is up to date with the base branch
- [ ] All ClickUp subtasks for the story are in DONE status
- [ ] Story reviewed and accepted by PO (AI) before closing
- [ ] Sprint retrospective note written if any surprises or lessons emerged from this story

---

## 7. ClickUp Task List

**ClickUp Workspace:** `9018768826`
**Target Space:** `AI Project` (ID: `901810085735`)

**Folder/List structure:**
```
Folder: maw-js Dashboard Enhancement
  Sprint 1 — Foundation Core         (2026-03-16 to 2026-03-27)
  Sprint 2 — Spawner + Dashboard     (2026-03-30 to 2026-04-10)
  Sprint 3 — Agent Detail + Task Board (2026-04-13 to 2026-04-24)
  Sprint 4 — Chains + Templates + Cmd+K (2026-04-27 to 2026-05-08)
  Sprint 5 — Mobile + Goals          (2026-05-11 to 2026-05-22)
  Backlog
  Done
```

---

### Sprint 1 Tasks

---

PARENT TASK: US-1.2 — shadcn/ui Integration
  Priority: urgent
  Description: |
    Install and configure shadcn/ui in the office Vite app. Prerequisite for all other Phase 1 UI stories.
    Covers peer dep installation (CVA, clsx, tailwind-merge, sonner), components.json config, @ path alias in Vite + tsconfig, class="dark" on html element, Sprint 1 component set install, and smoke-test page.
    AC: Button/Dialog/Sheet render in dark mode without errors. All 5 existing views unaffected. 0 TS errors. 0 lint errors.

  SUBTASK: [FE] Install peer dependencies and create cn.ts
    Tag: frontend
    Description: bun add class-variance-authority clsx tailwind-merge. Create office/src/lib/cn.ts exporting cn(). Also bun add sonner and bunx shadcn@latest add sonner.
    Hours: 1.25h
    Dependencies: none
    Sprint: 1
    Due: 2026-03-17

  SUBTASK: [FE] Configure components.json and @ path alias
    Tag: frontend
    Description: Create office/components.json (new-york style, Tailwind v4 CSS-variables, rsc:false, tsx:true, aliases with @ pointing to ./src). Add resolve.alias @ in office/vite.config.ts. Add paths entry in tsconfig.json. Add class="dark" to office/index.html.
    Hours: 1h
    Dependencies: Install peer dependencies
    Sprint: 1
    Due: 2026-03-17

  SUBTASK: [FE] Install Sprint 1 shadcn component set
    Tag: frontend
    Description: Run bunx shadcn@latest add button card dialog sheet badge input label select separator tooltip toggle. Confirm all generated files appear in office/src/components/ui/.
    Hours: 1h
    Dependencies: Configure components.json and @ path alias
    Sprint: 1
    Due: 2026-03-18

  SUBTASK: [FE] Create smoke-test render page for dark mode verification
    Tag: frontend
    Description: Create a temporary test route or section in App.tsx rendering Button, Dialog, Sheet, Badge from components/ui. Verify dark background, correct colors, no light-mode flash.
    Hours: 1h
    Dependencies: Install Sprint 1 shadcn component set
    Sprint: 1
    Due: 2026-03-18

  SUBTASK: [QA] Regression test all 5 existing views and run typecheck/lint
    Tag: test
    Description: Navigate to #office, #mission, #command, #tokens, #terminal. Confirm all render identically to pre-install. Run bun run typecheck and bun run lint. Expect 0 errors in both.
    Hours: 2h
    Dependencies: Install Sprint 1 shadcn component set
    Sprint: 1
    Due: 2026-03-19

---

PARENT TASK: US-1.7 — Consistent Dark-Mode Design Tokens
  Priority: urgent
  Description: |
    Define the complete design token layer as CSS custom properties in office/src/index.css. Replace all hardcoded color values across existing components with CSS variable references. Create StatusBadge shared component.
    AC: All views share identical base background. Status colors use named CSS variables. Typography scale defined. No arbitrary hex values remain.

  SUBTASK: [FE] Add @theme CSS variable block to index.css
    Tag: frontend
    Description: Add the full token set to office/src/index.css after the Tailwind import: base palette (bg-base, bg-surface, bg-elevated), border tokens, text tokens, status colors (working/waiting/permission/error/idle/completed), accent colors, typography scale (xs through 2xl), radius tokens, shadcn required variables. Reference SA Section 4.5 for exact values.
    Hours: 1.5h
    Dependencies: US-1.2 shadcn install complete
    Sprint: 1
    Due: 2026-03-18

  SUBTASK: [FE] Audit and replace hardcoded colors with CSS variable references
    Tag: frontend
    Description: Search all component files for hardcoded hex values (#020208, status color hex codes, inline styles with colors). Replace each with the corresponding var(--color-*) CSS variable. Scope: existing components only (AgentCard, StatusBar, etc.).
    Hours: 2h
    Dependencies: Add @theme CSS variable block
    Sprint: 1
    Due: 2026-03-20

  SUBTASK: [FE] Create components/shared/StatusBadge.tsx
    Tag: frontend
    Description: Implement STATUS_CONFIG map mapping AgentStatus -> { label, className, icon }. Use color class names from token values (bg-cyan-500/15 text-cyan-400 for working, amber for waiting, orange for permission, red for error, gray for idle). Export StatusBadge component wrapping shadcn Badge.
    Hours: 1h
    Dependencies: Add @theme CSS variable block
    Sprint: 1
    Due: 2026-03-19

  SUBTASK: [QA] Visual and token consistency regression
    Tag: test
    Description: Navigate all 5 existing views. Confirm consistent base background (no white flash), status badge colors match their status semantics across AgentCard and any other consumers. Verify no remaining arbitrary hex values in component files using grep.
    Hours: 2h
    Dependencies: Audit and replace hardcoded colors, StatusBadge created
    Sprint: 1
    Due: 2026-03-20

---

PARENT TASK: US-1.1 — Sidebar Navigation Shell
  Priority: urgent
  Description: |
    Replace top StatusBar-only layout with a persistent 220px left sidebar (collapsible to 56px). All routes wrapped in AppShell. Nav items for all 7 routes with active highlighting. Live fleet mini-status. Keyboard Tab+Enter navigation.
    AC: One-click navigation from any view to any view, no full-page reload, active route highlighted, fleet counts update within 3s, keyboard navigation functional.

  SUBTASK: [FE] Create AppShell.tsx layout wrapper
    Tag: frontend
    Description: Create office/src/components/layout/AppShell.tsx. Outer div: flex, h-dvh, background var(--color-bg-base). Left slot: Sidebar (220px). Right slot: main (flex-1, overflow-y-auto). Accepts route, agents, connected as props and passes to Sidebar.
    Hours: 1.5h
    Dependencies: US-1.7 design tokens applied
    Sprint: 1
    Due: 2026-03-20

  SUBTASK: [FE] Create Sidebar.tsx, SidebarNav.tsx, SidebarFleetStatus.tsx
    Tag: frontend
    Description: Sidebar.tsx: outer container with collapse toggle (220px <-> 56px icon-only). SidebarNav.tsx: nav items for all 7 routes; item for current route shows active style (accent color bg). SidebarFleetStatus.tsx: shows "N agents / N working" derived from useAgents stub (returns [] until Sprint 2). Spawn Agent button at bottom.
    Hours: 3h
    Dependencies: AppShell.tsx
    Sprint: 1
    Due: 2026-03-23

  SUBTASK: [FE] Wrap all App.tsx routes in AppShell and register new routes
    Tag: frontend
    Description: Modify App.tsx: wrap all route renders in <AppShell>. Update useHashRoute constant array to add 'dashboard', 'tasks', 'goals'. Remove <StatusBar> from AppShell render tree (keep StatusBar.tsx file). Add placeholder renders for #dashboard and #tasks (e.g., <div>Coming Sprint 2</div>).
    Hours: 1.5h
    Dependencies: Sidebar.tsx complete
    Sprint: 1
    Due: 2026-03-24

  SUBTASK: [FE] Implement keyboard navigation for sidebar
    Tag: frontend
    Description: Ensure all SidebarNav items use <button> or <a> elements (natively focusable). Tab key cycles them in DOM order. Enter on focused item triggers hash navigation. Verify no tabindex=-1 blocking on nav items.
    Hours: 0.75h
    Dependencies: SidebarNav.tsx complete
    Sprint: 1
    Due: 2026-03-24

  SUBTASK: [QA] Manual Gherkin AC test for sidebar navigation
    Tag: test
    Description: Test Scenario 1: navigate from #office to every other view via sidebar, confirm no full-page reload (no white flash, no loss of WS state). Scenario 2: active route highlighted for each view. Scenario 3: fleet count updates in sidebar within 3s of agent state change. Scenario 4: Tab + Enter keyboard navigation.
    Hours: 2.25h
    Dependencies: App.tsx wrapped in AppShell
    Sprint: 1
    Due: 2026-03-25

  SUBTASK: [QA] Confirm all 5 existing views functional inside AppShell
    Tag: test
    Description: Visit each existing view (#office, #mission, #command, #tokens, #terminal). Confirm all components render and function (agent cards, task submission, token chart, terminal capture) as before the AppShell wrapper was added.
    Hours: 1.5h
    Dependencies: App.tsx wrapped in AppShell
    Sprint: 1
    Due: 2026-03-26

---

PARENT TASK: US-1.3 — Worker Promote / Demote in UI
  Priority: high
  Description: |
    Toggle button on each agent card for promoting/demoting worker status. Calls POST /api/agents/worker. Success and error toasts. Worker badge persists across page reload.
    AC: Toggle sends correct action param, badge updates within 3s, error toast on 500 without badge state change, persistence across reload.

  SUBTASK: [FE] Create WorkerToggle.tsx and integrate into AgentCard
    Tag: frontend
    Description: Create components/agents/WorkerToggle.tsx using shadcn Toggle. Pressed = worker (shows "Worker" badge via StatusBadge or custom badge). On toggle: call POST /api/agents/worker with {action: "add"} or {action: "remove"}, disable button during request. Show sonner success toast on 200. Show sonner error toast with backend error message on non-200; do NOT change badge state on error. Integrate into AgentCard.tsx.
    Hours: 3.5h
    Dependencies: US-1.2 shadcn components
    Sprint: 1
    Due: 2026-03-24

  SUBTASK: [QA] Manual Gherkin AC test: promote, demote, error handling, persistence
    Tag: test
    Description: Test all 4 Gherkin scenarios: promote to worker (badge appears within 3s), demote (badge removed within 3s), reload and verify persistence, simulate 500 (error toast shown, badge unchanged). Run bun run typecheck + bun run lint.
    Hours: 2.5h
    Dependencies: WorkerToggle integrated in AgentCard
    Sprint: 1
    Due: 2026-03-25

---

PARENT TASK: US-1.4 — Agent Rename in UI
  Priority: high
  Description: |
    Inline rename input on each agent card. Click pencil icon to enter edit mode. Enter saves via PATCH API. Escape cancels with no request. Empty name shows inline validation error.
    AC: PATCH request sent with correct name, headline updates, empty name rejected, Escape cancels cleanly.

  SUBTASK: [FE] Create RenameInline.tsx and integrate into AgentCard
    Tag: frontend
    Description: Create components/agents/RenameInline.tsx. Display mode: show name text + pencil icon button. Edit mode: auto-focused input; Enter saves (PATCH /api/agents/:target/name); Escape cancels with no network request; clicking outside cancels. Client validation: reject empty ("Name cannot be empty" inline error), max 64 chars, no shell metacharacters (reject ;|&$`). On save success update agent card headline. Integrate into AgentCard.tsx.
    Hours: 3.25h
    Dependencies: US-1.2 shadcn input
    Sprint: 1
    Due: 2026-03-25

  SUBTASK: [QA] Manual Gherkin AC test: rename, Escape cancel, empty name validation
    Tag: test
    Description: Test 3 scenarios: rename to valid name (headline updates), cancel with Escape (no request made, original name preserved), submit empty name (inline error shown, no request). Run typecheck + lint.
    Hours: 1.75h
    Dependencies: RenameInline integrated in AgentCard
    Sprint: 1
    Due: 2026-03-26

---

PARENT TASK: US-1.5 — Kill Agent / Kill Session in UI
  Priority: high
  Description: |
    Confirmation dialogs for killing an individual agent window or an entire tmux session. Confirmed kill calls the DELETE endpoint. Agent/session cards disappear within 5s. Cancel takes no action.
    AC: Dialog with correct text, confirm executes delete, cancel makes no request, cards disappear within 5s.

  SUBTASK: [FE] Create ConfirmKillDialog.tsx and add kill actions to AgentCard
    Tag: frontend
    Description: Create components/agents/ConfirmKillDialog.tsx using shadcn Dialog. Props: target (string), type ("window"|"session"), onConfirm, onCancel. Dialog title: "Kill window {target}?" or "Kill entire session {name}? This will close all windows." Kill Window: calls DELETE /api/agents/:target. Kill Session: calls DELETE /api/sessions/:name. Add Kill Window and Kill Session buttons/menu to AgentCard.tsx. Cards removed from DOM on successful delete response (or on next agents-updated WS event within 5s).
    Hours: 3.5h
    Dependencies: US-1.2 shadcn Dialog
    Sprint: 1
    Due: 2026-03-26

  SUBTASK: [QA] Manual Gherkin AC test: kill window, kill session, cancel
    Tag: test
    Description: Test 3 scenarios: kill single window (dialog text correct, confirm removes card within 5s), kill session (dialog text correct, all session cards disappear within 5s), cancel (no DELETE request, card remains). Run typecheck + lint.
    Hours: 1.5h
    Dependencies: ConfirmKillDialog integrated in AgentCard
    Sprint: 1
    Due: 2026-03-27

---

### Sprint 2 Tasks

---

PARENT TASK: US-1.6 — Agent Spawner Form
  Priority: high
  Description: |
    Full spawn dialog: directory browser (GET /api/browse), agent definition picker (GET /api/agent-definitions), session name with client-side validation, optional initial prompt. Submits POST /api/agents/spawn. New agent appears in Office grid within 10s.
    AC: All agent definitions visible, directory browser navigable, spawn succeeds, session name validation enforced, optional prompt works.

  SUBTASK: [FE] Create DirectoryBrowser.tsx
    Tag: frontend
    Description: Create components/agents/DirectoryBrowser.tsx. On mount and on path change: GET /api/browse?path={currentPath}. Render a list of subdirectory names. Up button: navigate to parent directory (strip last segment). Directory click: navigate into it. Select button: call onSelect prop with current path. Show current path as a breadcrumb or text field.
    Hours: 2h
    Dependencies: none
    Sprint: 2
    Due: 2026-04-01

  SUBTASK: [FE] Create AgentDefPicker.tsx
    Tag: frontend
    Description: Create components/agents/AgentDefPicker.tsx. On mount: GET /api/agent-definitions. Render as shadcn Select (or Combobox). Each option shows definition name + description. On change: call onSelect prop with selected definition name.
    Hours: 1h
    Dependencies: none
    Sprint: 2
    Due: 2026-04-01

  SUBTASK: [FE] Create SpawnAgentDialog.tsx with full form and validation
    Tag: frontend
    Description: Create components/agents/SpawnAgentDialog.tsx using shadcn Dialog. Form fields: session name (input, validated on change: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/ — Spawn button disabled and inline error shown while invalid), working directory (DirectoryBrowser in an expandable section), agent definition (AgentDefPicker), initial prompt (Textarea, optional). Spawn button calls POST /api/agents/spawn with {sessionName, workDir, agentDefinition, initialPrompt?}. Success: sonner toast "Spawned {name}", close dialog. Connect Sidebar Spawn button to open this dialog.
    Hours: 3h
    Dependencies: DirectoryBrowser.tsx, AgentDefPicker.tsx
    Sprint: 2
    Due: 2026-04-03

  SUBTASK: [QA] Manual Gherkin AC test for all 5 spawner scenarios
    Tag: test
    Description: Test: open dialog and see all definitions in picker, browse directories (navigate into and up from subdirectories, select populates workDir), successful spawn with all fields (POST payload correct, toast shows, dialog closes, agent appears in Office grid within 10s), session name with spaces/special chars rejected before submit, leave initial prompt blank and spawn succeeds.
    Hours: 4h
    Dependencies: SpawnAgentDialog connected to sidebar button
    Sprint: 2
    Due: 2026-04-08

---

PARENT TASK: US-2.1 — Fleet Status Overview Dashboard
  Priority: high
  Description: |
    New #dashboard route. 4 KPI summary cards + live agent status grid. All data from useAgents hook (WS agents-updated events). Clicking agent row opens TerminalModal.
    AC: Cards show accurate counts updated within 3s of WS event, grid shows name/status/headline/project, row click opens terminal.

  SUBTASK: [FE] Create hooks/useAgents.ts
    Tag: frontend
    Description: Create office/src/hooks/useAgents.ts. Add window.addEventListener("maw-ws-message", handler) on mount; remove on unmount. Handler: if event.detail.type === "agents-updated", call setAgents(event.detail.agents). Return TrackedAgent[] state. Export useAgents().
    Hours: 1h
    Dependencies: US-1.1 App.tsx wrapped in AppShell (WS already broadcasting)
    Sprint: 2
    Due: 2026-04-01

  SUBTASK: [FE] Create StatusSummaryCards.tsx
    Tag: frontend
    Description: Create components/dashboard/StatusSummaryCards.tsx. Compute from TrackedAgent[]: total count, working count, permission count, tasks-completed-today count (derive from WS task-completed events or default 0 with a counter). Render 4 shadcn Card components. Permission card gets a highlighted border/bg if count > 0.
    Hours: 1.5h
    Dependencies: useAgents.ts
    Sprint: 2
    Due: 2026-04-02

  SUBTASK: [FE] Create AgentStatusGrid.tsx
    Tag: frontend
    Description: Create components/dashboard/AgentStatusGrid.tsx. Table with columns: name (session:window), StatusBadge, headline/status text, project name. Derive all data from useAgents(). Clicking a row triggers TerminalModal open for that agent (same mechanism as AgentCard click in OfficeView).
    Hours: 2h
    Dependencies: useAgents.ts, StatusBadge.tsx
    Sprint: 2
    Due: 2026-04-02

  SUBTASK: [FE] Create DashboardView.tsx and register #dashboard route
    Tag: frontend
    Description: Create components/dashboard/DashboardView.tsx. Compose: StatusSummaryCards, AgentStatusGrid, <Suspense><DailyCostChart /></Suspense>, ActivityTimeline. Register in App.tsx: add case for "dashboard" route, lazy import DashboardView.
    Hours: 1.25h
    Dependencies: StatusSummaryCards.tsx, AgentStatusGrid.tsx
    Sprint: 2
    Due: 2026-04-03

  SUBTASK: [QA] Gherkin AC, latency measurement, and regression
    Tag: test
    Description: Test 3 Gherkin scenarios: summary cards show correct counts, counts update within 3s of WS state change, row click opens TerminalModal. Measure WS event to DOM update latency using Performance.mark() (target <200ms). Verify all 5 existing views still functional. Run typecheck + lint.
    Hours: 5.25h
    Dependencies: DashboardView registered in App.tsx
    Sprint: 2
    Due: 2026-04-09

---

PARENT TASK: US-2.2 — Daily Token Cost Chart
  Priority: high
  Description: |
    7-day bar chart on Dashboard using Recharts. Missing days show zero bar. Today's bar visually distinct. Data from /api/token-usage refreshed every 30s. Lazy-loaded.
    AC: Chart renders with data, missing days zero, today distinguished. Chart <100ms render. Bundle under 500KB.

  SUBTASK: [FE] Install Recharts and create useTokenUsage.ts
    Tag: frontend
    Description: bun add recharts. Create hooks/useTokenUsage.ts: on mount start setInterval(fetch, 30000); fetch /api/token-usage; normalize response into last-7-days array (fill missing days with {date, cost: 0}); return {data, loading, error}; clear interval on unmount.
    Hours: 1.25h
    Dependencies: none
    Sprint: 2
    Due: 2026-04-02

  SUBTASK: [FE] Create DailyCostChart.tsx (lazy-loaded) with dark theme
    Tag: frontend
    Description: Create components/dashboard/DailyCostChart.tsx. Export as default for React.lazy. Use Recharts BarChart: XAxis (day abbreviations), YAxis (USD), Bar (fill with CSS var for normal days; today's bar uses --color-accent-primary). Custom Tooltip component styled for dark background. Custom grid stroke using --color-border-default. Use ResponsiveContainer. Integrate into DashboardView wrapped in React.lazy + Suspense.
    Hours: 3.25h
    Dependencies: useTokenUsage.ts, DashboardView.tsx
    Sprint: 2
    Due: 2026-04-07

  SUBTASK: [QA] Gherkin AC, performance, and bundle size validation
    Tag: test
    Description: Test 3 Gherkin scenarios (chart with data, missing days zero, today bar distinguished). Measure chart render time with React DevTools Profiler (target <100ms). Run bun run build; confirm gzipped output under 500KB. Verify Three.js not present in #dashboard route chunk.
    Hours: 3.25h
    Dependencies: DailyCostChart integrated in DashboardView
    Sprint: 2
    Due: 2026-04-09

---

PARENT TASK: US-2.3 — Activity Timeline
  Priority: high
  Description: |
    Live event feed on Dashboard. All WS events collected into capped array (100 max). Displayed newest-first with timestamp, color-coded badge, and human-readable description.
    AC: Events appear at top on arrival, cap at 100 with note, green/red/orange/neutral color coding verified for all event types.

  SUBTASK: [FE] Create hooks/useActivityFeed.ts with event formatter
    Tag: frontend
    Description: Create hooks/useActivityFeed.ts. Subscribe to all maw-ws-message events. Build ActivityEvent: {id: crypto.randomUUID(), timestamp: Date.now(), type, description (formatted), color}. Format descriptions: e.g., "task-completed: Task {taskId} completed on {agent}", "agent-spawned: New agent {name} spawned". Prepend to array state. If length > 100, remove last entry. Return ActivityEvent[].
    Hours: 2.5h
    Dependencies: none
    Sprint: 2
    Due: 2026-04-03

  SUBTASK: [FE] Create ActivityTimeline.tsx and integrate
    Tag: frontend
    Description: Create components/dashboard/ActivityTimeline.tsx. Wrap list in shadcn ScrollArea. Each row: timestamp formatted as HH:MM:SS (local time), Badge component with type label and color class (green border for completed, red for failed, orange for permission events, muted for informational). "Showing last 100 events" note appears when feed.length >= 100. Integrate into DashboardView.
    Hours: 2.5h
    Dependencies: useActivityFeed.ts, DashboardView.tsx
    Sprint: 2
    Due: 2026-04-07

  SUBTASK: [QA] Gherkin AC and latency test
    Tag: test
    Description: Test 3 Gherkin scenarios: events appear at top, 100-event cap shows note, all 4 color categories verified with real WS events. Measure event-to-DOM latency (target <200ms). Run typecheck + lint.
    Hours: 4h
    Dependencies: ActivityTimeline integrated
    Sprint: 2
    Due: 2026-04-10

---

### Sprint 3 Tasks

---

PARENT TASK: US-2.4 — Agent Detail Drawer
  Priority: high
  Description: |
    Slide-over drawer (shadcn Sheet) accessible from agent cards in both Office and Dashboard views. Shows full agent context. Recent files clickable (POST /api/open-file). Updates in real time without close/reopen.
    AC: All fields present, file path click triggers open-file API, drawer refreshes on WS event without closing.

  SUBTASK: [FE] Create AgentDetailDrawer.tsx and wire to agent cards
    Tag: frontend
    Description: Create components/agents/AgentDetailDrawer.tsx using shadcn Sheet side="right". Props: targetAgent (string | null), onClose. Use useAgents() filtered for matching target. Render: session name, window name, StatusBadge, workingDir (monospace), detectedStack as Badge chips, recentFiles list (last 10, each as a clickable button calling POST /api/open-file), projectName, lastActiveAt (human-readable), currentTaskId. Add "Details" button to AgentCard.tsx and a "Details" action on AgentStatusGrid row context or row click with modifier.
    Hours: 5.25h
    Dependencies: useAgents.ts, shadcn Sheet installed (Sprint 1)
    Sprint: 3
    Due: 2026-04-16

  SUBTASK: [QA] Gherkin AC and real-time update test
    Tag: test
    Description: Test 3 Gherkin scenarios: open drawer shows all required fields, click file path in recentFiles list (verify POST /api/open-file called with correct path), keep drawer open and trigger agents-updated WS event (verify drawer content updates without closing). Verify update within 3s.
    Hours: 2.25h
    Dependencies: AgentDetailDrawer wired to agent cards
    Sprint: 3
    Due: 2026-04-18

---

PARENT TASK: US-3.1 — Kanban Task Board
  Priority: high
  Description: |
    New #tasks route. 4-column Kanban (Pending/Assigned/Completed/Failed). Real-time task card movement on WS events. Cancel pending tasks with confirmation. Independent column scrolling. No drag-and-drop.
    AC: All columns visible, real-time movement, cancel confirms and calls queue/cancel, columns scroll independently.

  SUBTASK: [FE] Create hooks/useTaskQueue.ts
    Tag: frontend
    Description: Create hooks/useTaskQueue.ts. On mount: fetch current queue state (GET /api/queue or wait for queue-status WS event). Subscribe to all task-* WS events (task-submitted -> add to pending; task-assigned -> move from pending to assigned; task-completed -> move to completed; task-failed -> move to failed; task-timeout -> move to failed). Maintain {pending: Task[], assigned: Task[], completed: Task[], failed: Task[]} state. Return TaskQueueState.
    Hours: 2h
    Dependencies: none
    Sprint: 3
    Due: 2026-04-14

  SUBTASK: [FE] Create shared/ConfirmDialog.tsx
    Tag: frontend
    Description: Create components/shared/ConfirmDialog.tsx. Generic shadcn Dialog. Props: open (boolean), title (string), description (string), onConfirm (() => void), onCancel (() => void), confirmLabel? (default "Confirm"), cancelLabel? (default "Cancel"). Use destructive variant on confirm button for kill/delete actions. Reusable by kill actions, task cancel, and template delete.
    Hours: 0.75h
    Dependencies: US-1.2 shadcn Dialog
    Sprint: 3
    Due: 2026-04-14

  SUBTASK: [FE] Create TaskCard.tsx, KanbanColumn.tsx, KanbanBoard.tsx
    Tag: frontend
    Description: TaskCard.tsx: shows task ID (last 8 chars), command truncated to 80 chars, priority Badge (High=red, Normal=blue, Low=gray), age (format: "2m ago"), assigned agent name in Assigned column. Cancel button visible only in Pending column — triggers ConfirmDialog then POST /api/queue/cancel with taskId on confirm. KanbanColumn.tsx: header with title + count badge, ScrollArea wrapping TaskCard list (height: calc(100vh - Xpx), overflow-y-auto). KanbanBoard.tsx: flex row of 4 KanbanColumn instances; no drag handles; no DnD library.
    Hours: 4.25h
    Dependencies: useTaskQueue.ts, ConfirmDialog.tsx, StatusBadge.tsx
    Sprint: 3
    Due: 2026-04-17

  SUBTASK: [FE] Create TaskBoardView.tsx and register #tasks route
    Tag: frontend
    Description: Create components/tasks/TaskBoardView.tsx as route container: renders KanbanBoard, TaskSubmitForm (below or alongside board), ChainBuilder trigger button. Register #tasks route in App.tsx with React.lazy + Suspense. Update SidebarNav Tasks item to navigate to #tasks (already stubbed as nav item since Sprint 1).
    Hours: 1.25h
    Dependencies: KanbanBoard.tsx
    Sprint: 3
    Due: 2026-04-18

  SUBTASK: [QA] Gherkin AC, performance, and regression
    Tag: test
    Description: Test 4 Gherkin scenarios: all 4 columns visible with task data, task card moves Pending->Assigned in real time on WS task-assigned event (no page reload), cancel pending task (ConfirmDialog appears, confirm calls queue/cancel, card moves to Failed), completed and failed columns scroll independently when many tasks. Measure Kanban re-render with React DevTools Profiler (target <50ms). Verify all existing views (#office, #command, etc.) unaffected. Run bun run build.
    Hours: 6.5h
    Dependencies: TaskBoardView registered
    Sprint: 3
    Due: 2026-04-23

---

PARENT TASK: US-3.2 — Task Detail Drawer
  Priority: normal
  Description: |
    Drawer (shadcn Sheet) opened by clicking a task card. Shows full task metadata: command, status, timestamps, dispatch reason, affinity, output (monospace). Pending tasks show "No output yet" placeholder.
    AC: All metadata fields visible, pending task shows placeholder text, no broken code block for pending tasks.

  SUBTASK: [FE] Create TaskDetailDrawer.tsx and wire to TaskCard click
    Tag: frontend
    Description: Create components/tasks/TaskDetailDrawer.tsx using shadcn Sheet side="right". Accepts task: Task | null, onClose. Renders: task ID (full), command (untruncated, monospace), status Badge, priority Badge, created/assigned/completed timestamps (or "—"), assigned agent target (or "unassigned"), dispatch reason (or "—"), affinity.tags, affinity.projectName, affinity.filePaths, retryCount/maxRetries. Output section: if task.output exists render in ScrollArea pre/code block (monospace font). If pending or no output: render "No output yet — task is pending" text (not a pre/code element). Wire TaskCard body click (excluding Cancel button area) to open this drawer with the clicked task.
    Hours: 4.25h
    Dependencies: TaskCard.tsx, shadcn Sheet (Sprint 1)
    Sprint: 3
    Due: 2026-04-21

  SUBTASK: [QA] Gherkin AC test for both scenarios
    Tag: test
    Description: Test Scenario 1: click a completed task card — verify all metadata fields visible, output shows in monospace scrollable block. Scenario 2: click a pending task card — verify "No output yet — task is pending" shown, no broken empty code block rendered. Run bun run typecheck + bun run lint + bun run build.
    Hours: 2.75h
    Dependencies: TaskDetailDrawer wired to TaskCard
    Sprint: 3
    Due: 2026-04-22

---

PARENT TASK: US-3.3 — Enhanced Task Submission Form
  Priority: high
  Description: |
    Replace basic task input with a full affinity-aware form: command textarea, priority, tags (with auto-detect from keywords), project name, preferred agent (live dropdown). Submits to POST /api/queue/submit.
    AC: Submit with tags, submit with preferred agent, auto-detect chips appear on keyword input and are removable, priority selection functional.

  SUBTASK: [FE] Create TaskSubmitForm.tsx with affinity fields
    Tag: frontend
    Description: Create components/tasks/TaskSubmitForm.tsx. Fields: command (shadcn Textarea, required), priority (shadcn Select: High/Normal/Low, default Normal), tags (chip input: text field that adds chip on Enter/comma; chips are removable; shadcn Badge for each chip), project name (shadcn Input, optional), preferred agent (shadcn Select populated from useAgents(), optional). Auto-detect: on command change, parse for keywords (deploy/kubernetes -> "infra", backend/api -> "backend", frontend/ui -> "frontend", test -> "test"); render auto-detected chips with a distinct visual style (e.g., dashed border) below textarea; each removable. On submit: POST /api/queue/submit with {command, priority, affinity: {tags, projectName, preferAgent}}. Success: sonner toast + clear form.
    Hours: 5.5h
    Dependencies: useAgents.ts, shadcn Select/Input/Textarea (Sprint 1)
    Sprint: 3
    Due: 2026-04-22

  SUBTASK: [QA] Gherkin AC test and backward-compat check
    Tag: test
    Description: Test 4 Gherkin scenarios: submit with backend tag affinity (POST includes affinity.tags: ["backend"]), submit with preferred agent (affinity.preferAgent set), auto-detect chips appear on "deploy" keyword and are removable before submit, priority selection persists to POST payload. Verify task appears in Pending Kanban column. Verify existing CommandCenter in #command still works. Run typecheck + lint + build.
    Hours: 4.5h
    Dependencies: TaskSubmitForm integrated in TaskBoardView
    Sprint: 3
    Due: 2026-04-24

---

### Sprint 4 Tasks

---

PARENT TASK: US-3.4 — Task Chain Builder
  Priority: normal
  Description: |
    Multi-step chain composer dialog. Chain name + dynamic step list with add/remove/reorder (up/down buttons). Minimum 1 step validation. Submits POST /api/chain/submit. Active chains panel with cancel.
    AC: 3-step chain created and submitted correctly, step reordering reflected in POST payload, minimum 1 step enforced, cancel chain calls DELETE.

  SUBTASK: [FE] Create ChainBuilderDialog.tsx
    Tag: frontend
    Description: Create components/tasks/ChainBuilderDialog.tsx using shadcn Dialog. Chain name input. Dynamic steps array in state: each step has {id, prompt}. Render each step as: index number, Textarea for prompt, delete (X) button, move-up arrow button (disabled on first step), move-down arrow button (disabled on last step). Add Step button appends empty step. Submit button: disabled when steps.length === 0, shows "Add at least one step" message. On Submit: POST /api/chain/submit with {name, steps: [{prompt}], priority}. Success toast, close dialog.
    Hours: 3.25h
    Dependencies: US-1.2 shadcn Dialog, Textarea
    Sprint: 4
    Due: 2026-04-30

  SUBTASK: [FE] Add active chains panel to TaskBoardView
    Tag: frontend
    Description: Add an ActiveChainsPanel section to TaskBoardView. Subscribe to chain-* WS events to maintain running chains list. Fetch GET /api/chain on mount for initial state. Each chain shows: chain name, status, step progress if available. "Cancel Chain" button calls DELETE /api/chain/:id. On cancel success: update chain status to "cancelled/failed" in local state. Add "Open Chain Builder" button to TaskBoardView to open ChainBuilderDialog.
    Hours: 2.5h
    Dependencies: ChainBuilderDialog.tsx
    Sprint: 4
    Due: 2026-05-04

  SUBTASK: [QA] Gherkin AC test for all 4 chain scenarios
    Tag: test
    Description: Test Scenario 1: create 3-step chain — verify POST /api/chain/submit receives correct name and steps array. Scenario 2: enter 3 steps, drag step 3 above step 2 (using up button) — verify submitted payload reflects new order. Scenario 3: open dialog with 0 steps — verify Submit disabled and "Add at least one step" visible. Scenario 4: cancel a running chain — verify DELETE called and chain status updates to failed in panel. Run typecheck + lint + build.
    Hours: 4.5h
    Dependencies: Active chains panel complete
    Sprint: 4
    Due: 2026-05-07

---

PARENT TASK: US-3.5 — Task Templates
  Priority: normal
  Description: |
    localStorage-based template CRUD integrated into TaskSubmitForm. Save commands as named templates. Load into form (populates command + affinity). Delete with ConfirmDialog. Persists across reloads.
    AC: Save writes to localStorage, load populates form, delete removes from localStorage, templates survive reload.

  SUBTASK: [FE] Create lib/task-templates.ts and TaskTemplatesPicker.tsx
    Tag: frontend
    Description: lib/task-templates.ts: CRUD wrapping localStorage key "maw-task-templates". Functions: getAll(): TaskTemplate[], save(template: Omit<TaskTemplate, "id"|"createdAt">): TaskTemplate, remove(id: string): void. TaskTemplate: {id (crypto.randomUUID()), name, command, affinity?, createdAt: Date.now()}. TaskTemplatesPicker.tsx: shadcn DropdownMenu showing all templates by name; each entry has a delete icon button that triggers ConfirmDialog; selecting a template calls onSelect(template) prop.
    Hours: 2.5h
    Dependencies: ConfirmDialog.tsx (Sprint 3), lib/ directory
    Sprint: 4
    Due: 2026-04-29

  SUBTASK: [FE] Integrate Save as Template and picker into TaskSubmitForm
    Tag: frontend
    Description: Add "Save as Template" icon button to TaskSubmitForm header area. Clicking opens a small inline dialog (shadcn Dialog or Popover) with a name input and Save button. On save: calls task-templates.ts save() with current form values, shows sonner toast "Template saved". Add template picker icon button to TaskSubmitForm. Clicking opens TaskTemplatesPicker dropdown. On template select: populate command field and all affinity fields from template.
    Hours: 2h
    Dependencies: task-templates.ts, TaskTemplatesPicker.tsx, TaskSubmitForm.tsx
    Sprint: 4
    Due: 2026-05-01

  SUBTASK: [QA] Gherkin AC test and localStorage security check
    Tag: test
    Description: Test 4 Gherkin scenarios: save template (inspect localStorage key "maw-task-templates" — template entry present), load template (command and affinity fields populated correctly), delete template (ConfirmDialog appears, confirm removes from localStorage and picker list), reload page and verify template still in picker. Also verify: open DevTools Application > Local Storage — confirm no credentials, tokens, or API keys present. Run typecheck + lint + build.
    Hours: 4h
    Dependencies: Templates integrated in TaskSubmitForm
    Sprint: 4
    Due: 2026-05-06

---

PARENT TASK: US-4.1 — Global Command Palette (Cmd+K)
  Priority: normal
  Description: |
    Cmd+K / Ctrl+K command palette (shadcn Command / cmdk). Navigate to views by fuzzy name, target agents by session name for quick actions (Open Terminal, Kill Agent, Toggle Worker). Escape closes with focus restored.
    AC: Opens on Cmd+K with input focused, "office" navigates to Office, agent name surfaces actions, Escape closes and restores focus.

  SUBTASK: [FE] Install shadcn command component and create useCommandPalette.ts
    Tag: frontend
    Description: bunx shadcn@latest add command. Creates components/ui/command.tsx (cmdk-based). Create hooks/useCommandPalette.ts: state {open: boolean}; setOpen function; actions registry: CommandAction[] for navigate to each of 7 routes (Office, Dashboard, Command, Tasks, Tokens, Terminal, Mission); dynamic agent actions from useAgents() (for each agent: Open Terminal, Kill Agent, Toggle Worker).
    Hours: 2h
    Dependencies: useAgents.ts
    Sprint: 4
    Due: 2026-04-28

  SUBTASK: [FE] Create CommandPalette.tsx with keyboard binding and action handlers
    Tag: frontend
    Description: Create components/shared/CommandPalette.tsx wrapping shadcn Command in a Dialog. Mount a global window keydown listener: if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(true); }. Escape closes (Dialog already handles this via onOpenChange). Track "trigger element" with document.activeElement before opening; return focus to it on close. Navigation actions: execute window.location.hash = "#route" on select. Agent actions: call existing handler functions (openTerminal, killAgent, toggleWorker). Filter/search is built into shadcn Command.
    Hours: 3.25h
    Dependencies: useCommandPalette.ts
    Sprint: 4
    Due: 2026-05-01

  SUBTASK: [FE] Mount CommandPalette in App.tsx root
    Tag: frontend
    Description: Import CommandPalette into App.tsx. Render it at root level outside AppShell (always mounted, visibility controlled by its own Dialog open state). Confirm it overlays correctly on all routes.
    Hours: 1h
    Dependencies: CommandPalette.tsx
    Sprint: 4
    Due: 2026-05-05

  SUBTASK: [QA] Gherkin AC, cross-browser test, and timing measurement
    Tag: test
    Description: Test 4 Gherkin scenarios: Cmd+K opens palette with input focused, type "office" shows "Go to Office" result, press Enter navigates to Office and palette closes; type agent session name shows "Open Terminal"/"Kill Agent"/"Toggle Worker" actions; Escape closes palette and keyboard focus returns to prior element. Test Ctrl+K on Firefox and Safari. Measure time from keydown event to palette interactive (target <100ms). Run typecheck + lint.
    Hours: 5.75h
    Dependencies: CommandPalette mounted in App.tsx
    Sprint: 4
    Due: 2026-05-08

---

### Sprint 5 Tasks

---

PARENT TASK: US-4.2 — Mobile-Responsive Status View
  Priority: normal
  Description: |
    CSS-only responsive Dashboard layout at 375px. Sidebar collapses to hamburger/overlay on mobile. Summary cards stack full-width. Agent grid single-column. 44×44px touch targets. No horizontal scroll.
    AC: 375px layout stacks vertically, full-width cards, single-column grid, no horizontal scroll, navigation via hamburger, permission agent tappable.

  SUBTASK: [FE] Mobile sidebar collapse with hamburger menu
    Tag: frontend
    Description: In AppShell.tsx/Sidebar.tsx: add viewport detection or CSS media query. At viewport <768px: sidebar renders as position:fixed overlay (z-50, full height, slide-in transition) instead of static 220px column. Add a hamburger icon button in a mobile top bar (or in AppShell main area) that toggles sidebar open/closed. Overlay closes on nav item selection or on clicking outside the sidebar. All views remain accessible.
    Hours: 2h
    Dependencies: US-1.1 Sidebar complete
    Sprint: 5
    Due: 2026-05-13

  SUBTASK: [FE] Responsive Dashboard components at 375px
    Tag: frontend
    Description: StatusSummaryCards.tsx: change grid from grid-cols-2 or grid-cols-4 to grid-cols-1 using Tailwind responsive prefix (sm:grid-cols-2 md:grid-cols-4). AgentStatusGrid.tsx: hide secondary columns (project, headline) at xs breakpoint, show only name and status. TerminalModal: add max-h-[90dvh] overflow-y-auto. Ensure all buttons/clickable areas meet 44px minimum height/width.
    Hours: 3.25h
    Dependencies: Mobile sidebar hamburger complete
    Sprint: 5
    Due: 2026-05-15

  SUBTASK: [QA] Mobile viewport AC test in Chrome and Safari
    Tag: test
    Description: Open Chrome DevTools, set viewport to 375px width. Test 3 Gherkin scenarios: layout stacks vertically single column, no horizontal scrollbar on any Dashboard component, hamburger menu visible and opens sidebar showing all nav items. Verify permission agent row visible and tappable (TerminalModal opens). Verify TerminalModal is scrollable at 375px. Repeat key tests in Safari 17+ mobile emulation. Run typecheck + lint.
    Hours: 3.75h
    Dependencies: Responsive Dashboard components complete
    Sprint: 5
    Due: 2026-05-20

---

PARENT TASK: US-4.3 — Goal Hierarchy Panel
  Priority: normal
  Description: |
    New #goals route. Goals persisted in SQLite (new table + 4 REST endpoints). Create goals, link task chains, progress bar from chain completion, mark complete. Only story requiring backend changes.
    AC: Create goal (persists in SQLite), link chain updates progress, 2/3 completed chains shows 66% bar, mark complete changes status and moves to completed section.

  SUBTASK: [BE] Add goals table and CRUD to src/db/store.ts
    Tag: backend
    Description: In src/db/store.ts, inside initDb(): add CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', linked_chain_ids_json TEXT DEFAULT '[]', created_at INTEGER NOT NULL, completed_at INTEGER). Add typed functions: createGoal(title: string): Goal, getGoals(): Goal[], updateGoal(id: string, patch: Partial<Goal>): Goal | null, deleteGoal(id: string): boolean. Return typed Goal objects matching SA Section 5.2 interface.
    Hours: 2h
    Dependencies: none
    Sprint: 5
    Due: 2026-05-13

  SUBTASK: [BE] Add 4 Goals REST routes to src/server.ts
    Tag: backend
    Description: Add to src/server.ts: GET /api/goals (returns Goal[]), POST /api/goals (body: {title}, Zod: required string max 200 chars), PATCH /api/goals/:id (body: {title?, status?, linkChainId?, unlinkChainId?}, Zod validation per field), DELETE /api/goals/:id. All return {ok: true, goal} or {ok: true} on success; {error: "..."} on failure. 404 if goal not found. Route group follows same pattern as existing routes.
    Hours: 1.5h
    Dependencies: store.ts goals CRUD
    Sprint: 5
    Due: 2026-05-14

  SUBTASK: [FE] Add Goal type to types.ts and create lib/api.ts
    Tag: frontend
    Description: Add Goal interface to office/src/lib/types.ts (id, title, status, linkedChainIds, createdAt, completedAt?). Create office/src/lib/api.ts with typed async functions: fetchGoals(): Promise<Goal[]>, createGoal(title: string): Promise<Goal>, updateGoal(id: string, patch): Promise<Goal>, deleteGoal(id: string): Promise<void>, linkChain(goalId: string, chainId: string): Promise<Goal>, unlinkChain(goalId: string, chainId: string): Promise<Goal>. All handle {error: string} response shape and throw.
    Hours: 1.25h
    Dependencies: Backend routes accessible
    Sprint: 5
    Due: 2026-05-15

  SUBTASK: [FE] Create GoalsPanel.tsx with goals list and create form
    Tag: frontend
    Description: Create components/goals/GoalsPanel.tsx as the #goals route container. At top: create goal form (title Input + Save button, inline validation). Below: two sections — "In Progress" and "Completed". Each goal card: title, status Badge, shadcn Progress bar ((completedChainCount / totalLinkedChains) * 100), linked chain count, "Mark Complete" button (calls updateGoal with status: "completed"), "Delete" button (ConfirmDialog then deleteGoal). On create: call createGoal, prepend to in-progress list.
    Hours: 3h
    Dependencies: lib/api.ts
    Sprint: 5
    Due: 2026-05-19

  SUBTASK: [FE] Add Link to Goal from active chains panel and register #goals route
    Tag: frontend
    Description: In ActiveChainsPanel (TaskBoardView): add a "Link to Goal" button for each running chain. Clicking opens a shadcn Select/Combobox listing all goals from fetchGoals(). On selection: call linkChain(goalId, chainId), show success toast "Linked to goal". Register #goals in App.tsx with React.lazy. Add "Goals" nav item to SidebarNav.tsx (use a trophy or target icon, label "Goals").
    Hours: 1.5h
    Dependencies: GoalsPanel.tsx, ActiveChainsPanel (Sprint 4)
    Sprint: 5
    Due: 2026-05-19

  SUBTASK: [QA] Gherkin AC test for Goals UI
    Tag: test
    Description: Test 4 Gherkin scenarios: create goal "Complete Auth Module v2" (appears in In Progress with status badge), link chain "auth-migration" to goal (progress bar updates), with 2/3 linked chains completed (bar shows 66%), mark complete (status changes to Completed, card moves to Completed section). Run typecheck + lint.
    Hours: 2h
    Dependencies: Goals route registered, Link to Goal functional
    Sprint: 5
    Due: 2026-05-20

  SUBTASK: [QA] Backend persistence and API validation
    Tag: test
    Description: Test all 4 Goals API endpoints. Create a goal (POST), verify it appears in GET. Update title and status (PATCH). Delete (DELETE). Restart Bun server and GET /api/goals — verify goal still present (SQLite persistence). Test Zod rejection: POST with title exceeding 200 chars should return 400 {error: ...}. PATCH with unknown id should return 404.
    Hours: 2.5h
    Dependencies: Backend routes complete
    Sprint: 5
    Due: 2026-05-20

  SUBTASK: [QA] FINAL REGRESSION — all 17 stories, full quality gate
    Tag: test
    Description: Comprehensive end-to-end regression covering all 17 user stories across all 5 sprints. Verify: all Gherkin ACs still pass (spot check each story), all 5 existing views functional, CLI tools unaffected, no TypeScript errors (bun run typecheck), no ESLint errors (bun run lint), bun run build succeeds, gzipped bundle under 500KB, Three.js not imported on non-office routes, no credentials in localStorage.
    Hours: 4h
    Dependencies: All Sprint 5 stories complete
    Sprint: 5
    Due: 2026-05-22

---

*End of Phase 3 Project Plan*

---

**Document statistics:**
| Metric | Value |
|---|---|
| Total user stories | 17 |
| Total WBS subtasks | 113 |
| Total estimated hours | 206h |
| Average sprint utilization | 84% vs 48h cap |
| Sprint 1 hours | 42.75h (89%) |
| Sprint 2 hours | 37.75h (79%) |
| Sprint 3 hours | 38h (79%) |
| Sprint 4 hours | 32h (67%) |
| Sprint 5 hours (base) | 29.5h (61%) |
| Critical path length | 8 stories (US-1.2 -> US-3.5) |
| Backend-only sprint | Sprint 5 (US-4.3 only) |

**Next phase:** Phase 4 — Frontend Developer Implementation (Sprint 1 start: 2026-03-16)
