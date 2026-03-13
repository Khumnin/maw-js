# Project Plan: maw-js Improvement Project

## 1. Work Breakdown Structure (WBS)

| Task ID | Title | Tag | Parent | Est. Hours | Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T1.1 | [Infra] Audit and Reorganize Project Structure | infra | A.1 | 2 | none |
| T1.2 | [Infra] Configure CI linting pipeline | infra | A.2 | 4 | T1.1 |
| T2.1 | [BE] Set up root `tsconfig.json` and enable strict null checks | backend | B.1 | 6 | T1.1 |
| T2.2 | [BE] Define shared backend-frontend types in `/src/types/` | backend | B.2 | 8 | T2.1 |
| T3.1 | [BE] Write unit tests for `TaskDispatcher.tick()` | test | D.1 | 6 | T2.2 |
| T3.2 | [BE] Write unit tests for `AgentTracker` state inference | test | D.2 | 6 | T2.2 |
| T3.3 | [BE] Write unit tests for `Store` (SQLite/Mailbox/KV) | test | D.3 | 6 | T2.2 |
| T3.4 | [BE] Write unit tests for `MCP Server` protocol layer | test | D.4 | 6 | T2.2 |
| T3.5 | [QA] Implement e2e integration tests for command dispatch | test | D.5 | 10 | T3.1-T3.4 |
| T4.1 | [BE] Implement path-traversal validation middleware | backend | E.1 | 8 | T2.2 |
| T4.2 | [Infra] Refactor hardcoded paths to env variables | infra | E.2 | 4 | T4.1 |
| T5.1 | [FE] Migrate legacy HTMIs to central React components | frontend | F.1 | 10 | T2.2 |
| T5.2 | [FE] Centralize global state between UI and terminal | frontend | F.2 | 8 | T5.1 |
| T5.3 | [FE] Remove legacy standalone HTML files | frontend | F.3 | 2 | T5.2 |
| T6.1 | [BE] Optimize WebSocket heartbeats | backend | C.1 | 4 | T2.2 |
| T6.2 | [BE] Implement SQLite WAL checkpointing | backend | C.2 | 4 | T3.3 |

## 2. Sprint Plan (4 Sprints)

**Sprint 1: Foundation (Must-Haves)**
- Goal: Secure, auditable project base and strict type enforcement.
- Tasks: T1.1, T1.2, T2.1
- Hours: 12h | Goal: Auditable repo, CI passing lint, strict TS compiler enabled.

**Sprint 2: Type Safety & Security (High Priority)**
- Goal: Contract safety and critical security gaps.
- Tasks: T2.2, T4.1, T4.2
- Hours: 20h | Goal: Shared types contract, path traversal mitigation, env-driven portability.

**Sprint 3: Testing Core (High Priority)**
- Goal: High-coverage verification of core orchestration logic.
- Tasks: T3.1, T3.2, T3.3, T3.4, T3.5
- Hours: 34h | Goal: 80% coverage on core, verified integration pipeline.

**Sprint 4: UI & Performance (Could-Haves)**
- Goal: Modernized, unified UX and optimized performance/DB.
- Tasks: T5.1, T5.2, T5.3, T6.1, T6.2
- Hours: 28h | Goal: Consolidated React SPA, optimized polling, WAL database stability.

## 3. Risk Register
| Risk | Probability | Impact | Mitigation | Owner |
| :--- | :--- | :--- | :--- | :--- |
| CI pipeline integration fails | High | Medium | Use Bun’s native test/lint tools | Infra Lead |
| Path validation breaks legit agent work | Medium | High | Comprehensive unit testing in mock environment | Backend Dev |
| React migration complexity (legacy spaghetti) | Medium | Medium | Incremental migration component by component | Frontend Dev |
| SQLite performance degradation during WAL | Low | Medium | Benchmarking before and after implementation | Backend Dev |
| Shared types mismatch between BE/FE | Medium | Medium | Strict Zod validation at API boundary | Backend Dev |

## 4. RACI Chart

| Epic | BE Dev | FE Dev | DevOps | QA/Test | PO | SA |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A: Infra/Quality | C | C | R | I | I | A |
| B: Types/Arch | R/A | C | I | I | I | C |
| C: Core Testing | R | I | I | A | I | C |
| D: Security | R | I | A | C | I | C |
| E: UI/Consol | I | R | I | I | A | C |
| F: Performance | R | I | C | C | A | I |

## 5. Definition of Done Checklist
- **Code Quality:** Passes ESLint (strict config), no `any` types used in new code.
- **Test Coverage:** Passes all unit tests; >80% line coverage for tested core modules.
- **Security:** Passes path-traversal audit; no hardcoded absolute paths in committed code.
- **UI:** All functionality from legacy `.html` files migrated to React components.
- **Review:** Peer review signed off; build passes cleanly in CI.

## 6. ClickUp Task Structure

### Sprint 1: Foundation
#### Story: A.1/A.2 - Infrastructure
- [Infra] Audit and Reorganize Project Structure | tag: infra | hours: 2 | depends: none
- [Infra] Configure CI Linting Pipeline | tag: infra | hours: 4 | depends: T1.1
- [QA] Verify CI Linting Pipeline | tag: test | hours: 2 | depends: T1.2

### Sprint 2: Type Safety & Security
#### Story: B.1/B.2 - Type Safety
- [BE] Implement Root tsconfig and Strict Mode | tag: backend | hours: 6 | depends: T1.1
- [BE] Create Shared Types in /src/types/ | tag: backend | hours: 8 | depends: T2.1
- [QA] Verify Build Errors | tag: test | hours: 3 | depends: T2.2

#### Story: E.1/E.2 - Security
- [BE] Implement Path-Traversal Middleware | tag: backend | hours: 8 | depends: T2.2
- [Infra] Refactor Paths to Env Variables | tag: infra | hours: 4 | depends: T4.1
- [QA] Path Traversal Pen Test | tag: test | hours: 4 | depends: T4.1, T4.2

### Sprint 3: Testing Core
#### Story: D.1-D.4 - Unit Testing
- [BE] Unit Tests TaskDispatcher.tick() | tag: backend | hours: 6 | depends: T2.2
- [BE] Unit Tests AgentTracker | tag: backend | hours: 6 | depends: T2.2
- [BE] Unit Tests Store Layer | tag: backend | hours: 6 | depends: T2.2
- [BE] Unit Tests MCP Server | tag: backend | hours: 6 | depends: T2.2
- [QA] Test Suite Quality Review | tag: test | hours: 4 | depends: T3.1-T3.4

#### Story: D.5 - End-to-End
- [BE] Integration Dispatcher Tests | tag: backend | hours: 10 | depends: T3.1-T3.4
- [QA] Full Integration Test Suite | tag: test | hours: 5 | depends: T3.5

### Sprint 4: Performance & UI
#### Story: F.1-F.3 - UI Consolidation
- [FE] Create React UI Components | tag: frontend | hours: 10 | depends: T2.2
- [FE] Integrate Global UI State | tag: frontend | hours: 8 | depends: T5.1
- [FE] Cleanup Legacy HTML Files | tag: frontend | hours: 2 | depends: T5.2
- [QA] Verify Consolidated UI Sync | tag: test | hours: 4 | depends: T5.3

#### Story: C.1-C.2 - Performance
- [BE] Optimize WebSocket Heartbeats | tag: backend | hours: 4 | depends: T2.2
- [BE] Implement SQLite WAL Checkpointing | tag: backend | hours: 4 | depends: T3.3
- [QA] Performance Benchmark | tag: test | hours: 3 | depends: T6.1, T6.2
