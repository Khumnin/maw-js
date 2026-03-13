# Phase 1 Requirements: maw-js Improvement Project

## 1. Problem Statement
The `maw-js` orchestration tool, while providing essential functionality for interactive agent control, currently lacks production-grade stability and security. Key issues inhibiting professional deployment include:
- **Architecture & Maintainability:** The lack of a root `tsconfig.json` and heavy usage of `any` types causes frequent, hard-to-debug runtime errors. Legacy UI components are spread across three isolated entry points (`/`, `/dashboard`, `/office`), duplicating logic and state.
- **Testing Debt:** Zero unit or integration test coverage across core modules—`TaskDispatcher`, `AgentTracker`, `SQLite Store`, and the `MCP Server` layer—precludes safe refactoring.
- **Security:** Insecure filesystem operations (`POST /api/open-file`) lack path-traversal validation, creating significant risk. Hardcoded paths (e.g., in `token-usage.ts` and `store.ts`) prevent deployment portability.
- **Observability:** Inconsistent WebSocket polling and aggregate data views lead to degraded performance in high-agent-density scenarios.

## 2. User Personas
- **Developer:** Manages agents in tmux environments. Needs high reliability and strict types. Pained by runtime crashes and opaque background states.
- **Team Lead:** Monitors multi-agent health. Needs aggregated performance insights. Pained by fragmented data views and manual status checking.
- **DevOps:** Deploying `maw-js` in cloud environments. Needs security-first configurability. Pained by path-traversal vulnerabilities and hardcoded environment assumptions preventing clean containerization.

## 3. User Stories (INVEST)
### Epic A: Infrastructure & Quality
- **A.1:** As a developer, I want all helper scripts to reside within `/src` or `/scripts`, so the project structure is auditable. (1)
- **A.2:** As a developer, I want a CI linting pipeline set up, so style and basic quality errors are caught synchronously. (2)

### Epic B: Type Safety & Architecture
- **B.1:** As a developer, I want a root `tsconfig.json` and strict null checks, so runtime type errors are eliminated. (5)
- **B.2:** As a developer, I want shared backend-frontend types, so that API communication is type-safe. (5)

### Epic C: Testing Core Modules
- **D.1:** As a developer, I want unit tests for `TaskDispatcher.tick()`, so that task scheduling is verified under stress. (3)
- **D.2:** As a developer, I want unit tests for `AgentTracker` state inference, so that active/idle status is reliable. (3)
- **D.3:** As a developer, I want unit tests for `Store` (DB/Mailbox/KV), so data integrity is guaranteed. (3)
- **D.4:** As a developer, I want tests for the `MCP Server` protocol layer, ensuring compliance with external clients. (3)
- **D.5:** As a developer, I want end-to-end integration tests for command dispatch, covering the full terminal-to-agent life cycle. (5)

### Epic D: Security Hardening
- **E.1:** As a DevOps engineer, I want path-traversal validation on `/api/open-file`, preventing unauthorized filesystem access. (8)
- **E.2:** As a DevOps engineer, I want environment-variable driven paths, so that the application is fully container-portable. (3)

### Epic E: UI Modernization & Unification
- **F.1:** As a developer, I want to migrate legacy `ui.html` and `dashboard.html` to central React components, so the codebase is DRY. (5)
- **F.2:** As a developer, I want to centralize global state between the dashboard and terminal, so real-time information syncs perfectly. (5)
- **F.3:** As a PO, I want to delete standalone HTML files, ensuring the system relies only on the React build. (3)

### Epic F: Observability & Performance
- **C.1:** As a user, I want optimized 50ms WebSocket heartbeats, so UI feedback remains crisp during intensive agent activity. (3)
- **C.2:** As a DevOps engineer, I want automated SQLite WAL checkpointing, so that database file bloating is automatically capped. (2)

## 4. Acceptance Criteria (Gherkin)

### Story D.1 (Test Dispatcher)
- **Given** I have a `TaskDispatcher`
- **When** I trigger `tick()` with a sequence of high-priority tasks
- **Then** the dispatcher should queue these before normal tasks in the agent pool

### Story E.1 (Security)
- **Given** a user inputs a path to `/api/open-file`
- **When** the path contains `../` patterns
- **Then** the system must reject the request with a 403 Forbidden status

### Story F.1 (UI Migration)
- **Given** a user loads the `/` endpoint
- **When** the server fetches the page
- **Then** it must serve a consolidated React-rendered component instead of raw HTML

### Story B.1 (Types)
- **Given** a new code change containing a type violation
- **When** the build system runs `tsc`
- **Then** it must exit with a non-zero status

## 5. MoSCoW Prioritization
- **Must Have:** A.1, B.1, E.1, E.2, D.5
- **Should Have:** D.1-D.4, B.2
- **Could Have:** F.1-F.3, C.1-C.2
- **Won't Have:** Any new orchestration features (like session persistence) until all tests pass.

## 6. NFRs
- **Performance:** WebSocket latency < 50ms; 99th percentile orchestration < 200ms.
- **Coverage:** >= 80% line coverage for `/src/*.ts` files post-refactor.
- **Security:** 0 critical vulnerabilities as reported by automated linting (no arbitrary path access).
- **Environment:** Configurable via environment variables ONLY. No default hardcoded absolute paths (e.g., `/root`, `/tmp`).
