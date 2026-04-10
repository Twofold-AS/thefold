# TheFold Dispatch Plan v3

> **Scope**: 48 tasks · 12 sprints (21–32) · 6 phases  
> **Predecessor**: dispatch-plan v1 (D1-D8), dispatch-plan v2 (D1-D32, Sprint 8-20)  
> **Principles**: SSE streaming-first · Event-based architecture (AG-UI) · Compound AI patterns  
> **Date**: 2026-04-10

---

## Phase 1 — SSE Streaming Foundation

### Sprint 21: Backend SSE Infrastructure

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D1 | **Event Schema Definition** — Define TypeScript types for all SSE event types: `agent.status`, `agent.message`, `agent.tool_use`, `agent.tool_result`, `agent.thinking`, `agent.error`, `agent.done`. Each event has `id`, `timestamp`, `type`, `data`. | M | `agent/events.ts` (new), `agent/types.ts` |
| D2 | **SSE Endpoint** — Create `/agent/stream/:taskId` SSE endpoint using Encore.ts raw endpoint. Implements `text/event-stream` with `Transfer-Encoding: chunked`. Supports `Last-Event-ID` for reconnection. Heartbeat every 15s. | L | `agent/stream.ts` (new), `agent/agent.ts` |
| D3 | **Event Emitter Integration** — Wire tool-loop.ts to emit structured events through the SSE channel instead of only returning final result. Each tool call emits `tool_use` → `tool_result`. Each message emits `agent.message` with delta chunks. | L | `agent/tool-loop.ts`, `agent/agent-tool-executor.ts`, `agent/stream.ts` |
| D4 | **Fix polling bug (immediate)** — Polling doesn't stop on status "failed". Add `failed` to the stop-condition set in chat/page.tsx polling interval. Quick win before full SSE migration. | S | `frontend/src/app/(dashboard)/chat/page.tsx` |

**Acceptance Criteria:**
- SSE endpoint returns `text/event-stream` with correct headers
- Events conform to schema types with unique IDs
- Tool loop emits events in real-time during execution
- `Last-Event-ID` reconnection works within 5 minutes
- Polling bug fixed: interval clears on `failed` status

---

### Sprint 22: Frontend SSE Migration

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D5 | **useAgentStream Hook** — Create React hook that connects to SSE endpoint via EventSource. Handles reconnection (exponential backoff, max 3 retries), event parsing, and state management. Returns `{ messages, status, toolCalls, isStreaming, error }`. | L | `frontend/src/hooks/useAgentStream.ts` (new) |
| D6 | **Chat Page SSE Integration** — Replace polling logic in chat/page.tsx with `useAgentStream`. Messages stream in real-time. Tool calls show as they happen. Status bar shows current agent phase. Preserve pendingReviewId coupling. | XL | `frontend/src/app/(dashboard)/chat/page.tsx` |
| D7 | **Streaming UI Indicators** — Add typing indicator during `agent.thinking`, tool execution spinner during `tool_use`, progress bar for multi-step operations. Skeleton loading for initial connection. | M | `frontend/src/components/chat/StreamIndicator.tsx` (new), `frontend/src/components/chat/ToolCallCard.tsx` (new) |
| D8 | **Remove Polling Code** — Delete all adaptive polling logic from chat page. Remove setInterval/clearInterval patterns. Remove polling-related state variables. Verify no regressions with E2E smoke test. | M | `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/lib/api.ts` |

**Acceptance Criteria:**
- Chat messages stream character-by-character in real-time
- Tool calls visible with name, input, and result as they execute
- No polling intervals remain in chat page
- Reconnection handles network drops gracefully (3 retries)
- pendingReviewId flow still works end-to-end
- Page load → first event latency < 200ms

---

## Phase 2 — Frontend Architecture

### Sprint 23: API & Hook Extraction

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D9 | **Split api.ts into Domain Modules** — Extract 1365-line api.ts into: `api/chat.ts`, `api/tasks.ts`, `api/projects.ts`, `api/agent.ts`, `api/memory.ts`, `api/skills.ts`, `api/builder.ts`, `api/auth.ts`. Barrel re-export from `api/index.ts` so existing imports don't break. | L | `frontend/src/lib/api.ts` → `frontend/src/lib/api/` (directory) |
| D10 | **Extract useReviewFlow Hook** — Pull review approval/rejection logic out of chat page into dedicated hook. Manages pendingReviewId, review submission, optimistic state. | M | `frontend/src/hooks/useReviewFlow.ts` (new), `frontend/src/app/(dashboard)/chat/page.tsx` |
| D11 | **Extract useTaskManagement Hook** — Pull task CRUD, status updates, and filtering from tasks/page.tsx. Includes optimistic updates with rollback. | M | `frontend/src/hooks/useTaskManagement.ts` (new), `frontend/src/app/(dashboard)/tasks/page.tsx` |
| D12 | **Shared State Types** — Create centralized TypeScript types for all API responses, agent events, and UI state. Replace inline `any` types across frontend. | M | `frontend/src/types/` (new directory), `frontend/src/types/api.ts`, `frontend/src/types/agent.ts`, `frontend/src/types/task.ts` |

**Acceptance Criteria:**
- All existing imports still work via barrel re-exports
- No `any` types in hook return values
- Each hook has JSDoc documentation
- `api/` modules each < 200 lines
- Zero regressions: all pages still functional

---

### Sprint 24: Component Decomposition

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D13 | **Chat Page Decomposition** — Break 906-line chat page into: `ChatContainer`, `MessageList`, `MessageInput`, `ReviewPanel`, `AgentStatusBar`. Page becomes thin orchestrator (~150 lines). | XL | `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/components/chat/` (new directory) |
| D14 | **Task Page Decomposition** — Break 779-line task page into: `TaskList`, `TaskCard`, `TaskFilters`, `TaskDetailPanel`. | L | `frontend/src/app/(dashboard)/tasks/page.tsx`, `frontend/src/components/tasks/` (new directory) |
| D15 | **Shared UI Components** — Extract repeated patterns: `StatusBadge`, `TimeAgo`, `EmptyState`, `ErrorBoundary`, `LoadingSkeleton`. Used across chat, tasks, and future pages. | M | `frontend/src/components/shared/` (new directory) |
| D16 | **Layout & Navigation Enhancement** — Add breadcrumbs, consistent sidebar active states, and responsive mobile navigation. Prepare layout slots for future pages (projects, skills, memory). | M | `frontend/src/app/(dashboard)/layout.tsx`, `frontend/src/components/nav/` |

**Acceptance Criteria:**
- chat/page.tsx < 200 lines
- tasks/page.tsx < 200 lines
- All shared components have TypeScript props interfaces
- Mobile responsive (tested at 375px, 768px, 1024px)
- No functionality regressions

---

## Phase 3 — Frontend-Backend Gap Closure

### Sprint 25: Core Missing Pages

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D17 | **Project Page** — Build `/projects` and `/projects/[id]` pages. Wire to existing `/agent/project/*` endpoints. Show project overview, linked tasks, repository info, activity timeline. | XL | `frontend/src/app/(dashboard)/projects/` (new), `frontend/src/lib/api/projects.ts` |
| D18 | **Task Editing** — Wire `/tasks/update` endpoint to frontend. Add inline editing for task title, description, priority, status. Add task assignment and due dates. | L | `frontend/src/components/tasks/TaskEditor.tsx` (new), `frontend/src/hooks/useTaskManagement.ts` |
| D19 | **Push-to-Linear Integration** — Expose Linear sync in task UI. Button to push task to Linear, show Linear issue link, sync status badges. Use existing `/tasks/sync-to-linear` endpoint. | M | `frontend/src/components/tasks/LinearSync.tsx` (new), `frontend/src/lib/api/tasks.ts` |
| D20 | **Activity Timeline** — Create shared timeline component showing agent actions, task status changes, deployments, and commits. Wire to existing activity endpoints. | L | `frontend/src/components/shared/ActivityTimeline.tsx` (new), `frontend/src/lib/api/agent.ts` |

**Acceptance Criteria:**
- Project page shows all project data from backend
- Tasks editable inline with optimistic updates
- Linear sync button visible on tasks with correct status
- Activity timeline shows last 50 events with infinite scroll
- All new pages accessible from sidebar navigation

---

### Sprint 26: Knowledge & Skills UI

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D21 | **Knowledge Explorer** — Build `/knowledge` page. Search knowledge base with hybrid vector+BM25. Show knowledge entries with source, confidence, and usage stats. Wire to `/memory/search` and `/memory/knowledge/*` endpoints. | L | `frontend/src/app/(dashboard)/knowledge/` (new), `frontend/src/lib/api/memory.ts` |
| D22 | **Skill Management Page** — Build `/skills` page. List available skills, show skill details. Enable/disable skills per project. Wire to existing `/skills/*` endpoints. | L | `frontend/src/app/(dashboard)/skills/` (new), `frontend/src/lib/api/skills.ts` |
| D23 | **Memory Viewer** — Build `/memory` page. Visualize agent memory: recent conversations, distilled knowledge, dream mode consolidation history. Show memory stats and allow manual pruning. | M | `frontend/src/app/(dashboard)/memory/` (new), `frontend/src/lib/api/memory.ts` |
| D24 | **Build Pipeline Dashboard** — Enhance existing build page with real-time build logs (via SSE), deployment history, environment status. Wire to `/builder/*` and `/sandbox/*` endpoints. | L | `frontend/src/app/(dashboard)/builds/` (enhanced), `frontend/src/lib/api/builder.ts` |

**Acceptance Criteria:**
- Knowledge search returns results in < 500ms
- Skills can be toggled per project
- Memory viewer shows conversation history and distilled entries
- Build logs stream in real-time via SSE
- All pages have proper loading and empty states

---

## Phase 4 — Agent Intelligence

### Sprint 27: Structured Agent Events

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D25 | **Tool Event Enrichment** — Enhance tool_use/tool_result events with metadata: execution time, token count, cost estimate, files touched. Add `agent.progress` event for multi-step operations. | M | `agent/events.ts`, `agent/agent-tool-executor.ts`, `agent/tool-loop.ts` |
| D26 | **Agent Reasoning Stream** — Emit `agent.thinking` events with reasoning text. Show thinking process in UI as collapsible section. Rate-limit to avoid flooding. | L | `agent/tool-loop.ts`, `agent/stream.ts`, `frontend/src/components/chat/ThinkingBlock.tsx` (new) |
| D27 | **Planning Phase Events** — When agent enters planning mode, emit `agent.plan` event with steps array. UI shows plan with checkmarks as steps complete. | L | `agent/tool-loop.ts`, `agent/events.ts`, `frontend/src/components/chat/PlanView.tsx` (new) |
| D28 | **Error Recovery Events** — Emit structured `agent.error` events with error type, retry info, and suggested actions. Frontend shows actionable error cards. | M | `agent/tool-loop.ts`, `agent/events.ts`, `frontend/src/components/chat/ErrorCard.tsx` (new) |

**Acceptance Criteria:**
- Tool events include execution time and token usage
- Thinking blocks collapsible, default collapsed
- Plan steps show progress with visual checkmarks
- Error cards show specific action buttons (retry, skip, abort)
- All events respect rate limiting (max 10 events/second)

---

### Sprint 28: Agent Capabilities

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D29 | **Self-Review Phase** — After completing a task, agent runs self-review: checks code quality, test coverage, security patterns. Emits `agent.review` events. | L | `agent/self-review.ts` (new), `agent/tool-loop.ts` |
| D30 | **Budget Guardrails UI** — Show token/cost budget in agent status bar. Configurable per project. Warning at 80%, pause at 100% with user confirmation. | M | `frontend/src/components/chat/BudgetBar.tsx` (new), `agent/tool-loop.ts` |
| D31 | **Context Window Manager** — Show context usage in UI. Auto-summarize when approaching limit. Sliding window with priority retention. | L | `agent/context-manager.ts` (new), `agent/context-builder.ts` |
| D32 | **Multi-Agent Coordination** — Primary agent spawns sub-agents for parallel work. Coordinate via shared event bus. | XL | `agent/coordinator.ts` (new), `agent/sub-agent.ts` (new) |

**Acceptance Criteria:**
- Self-review catches unused imports, missing error handling, hardcoded secrets
- Budget bar updates in real-time
- Context manager keeps usage below 80%
- Sub-agents run concurrently with separate event streams
- All features behind feature flags

---

## Phase 5 — Platform Hardening

### Sprint 29: Communication & Integrations

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D33 | **Wire Email Templates** — Connect jobCompletionEmail(), criticalErrorEmail(), healingReportEmail() to pub/sub events. Replace hardcoded HTML. | M | `gateway/email.ts`, `gateway/task-email-sub.ts` |
| D34 | **MCP Setup Flow** — Build MCP configuration page with status indicators, API key input, auto-install, health checks. | L | `frontend/src/app/(dashboard)/settings/mcp/` (new), `mcp/client.ts` |
| D35 | **Fix Firecrawl Local** — Set FirecrawlApiKey for local. Add graceful fallback when key missing. Health check endpoint. | S | `web/web.ts`, `agent/context-builder.ts` |
| D36 | **Webhook System** — Outgoing webhooks for key events. Configurable per project. Uses existing pub/sub. | M | `gateway/webhooks.ts` (new) |

**Acceptance Criteria:**
- Email templates render with proper styling
- MCP servers show green/red status
- Firecrawl gracefully degrades when key missing
- Webhooks deliver within 5 seconds
- All secrets via Encore secrets

---

### Sprint 30: Reliability & Error Handling

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D37 | **Frontend Error Boundaries** — React error boundaries around major sections. Recovery UI, log to backend. | M | `frontend/src/components/shared/ErrorBoundary.tsx`, all pages |
| D38 | **API Retry with Circuit Breaker** — Retry with exponential backoff. Circuit breaker after 3 failures. Status indicator in UI. | L | `frontend/src/lib/api/client.ts` (new) |
| D39 | **Agent Crash Recovery** — Detect via heartbeat timeout. Auto-resume from last successful tool result. Notify user. | L | `agent/recovery.ts` (new), `agent/tool-loop.ts` |
| D40 | **MCP Client Persistence** — Replace in-memory Map with persistent tracking. Reconnect on restart. | M | `mcp/client.ts`, `mcp/persistence.ts` (new) |

**Acceptance Criteria:**
- Error boundaries prevent full-page crashes
- Retries max 3 attempts with backoff (1s, 2s, 4s)
- Circuit breaker resets after 30s
- Agent resumes within 10s of crash
- MCP clients survive restart

---

## Phase 6 — Polish & Testing

### Sprint 31: Testing & Quality

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D41 | **E2E Tests — Critical Paths** — Playwright tests for login → chat → message → response → review. Task CRUD → Linear sync. Project creation. | XL | `frontend/e2e/` (new) |
| D42 | **SSE Integration Tests** — Connection, reconnection, event ordering, heartbeat, backpressure. | L | `agent/__tests__/stream.test.ts` (new) |
| D43 | **API Contract Tests** — Verify frontend modules match backend signatures. Auto-generate from OpenAPI spec. | M | `tests/contract/` (new) |
| D44 | **Component Storybook** — Storybook for shared and chat components. Visual regression testing. | L | `frontend/.storybook/` (new) |

**Acceptance Criteria:**
- E2E covers 5 critical flows
- SSE tests verify reconnection
- Contract tests run in CI
- Storybook covers all shared components

---

### Sprint 32: Performance & Documentation

| ID | Task | Complexity | Affected Files |
|----|------|-----------|----------------|
| D45 | **Performance Optimization** — Lighthouse ≥ 90. Code splitting per route. Lazy load heavy components. Optimize SSE batching. | L | All frontend, `next.config.js` |
| D46 | **SSE Load Benchmarking** — 100 concurrent connections, 10 minutes. Measure p50/p95/p99. | M | `tests/load/` (new) |
| D47 | **OpenAPI Documentation** — Generate and publish API docs. Add descriptions to all endpoints. | M | All service files |
| D48 | **Architecture Decision Records** — ADRs for SSE choice, domain split, event schema, agent coordination. | S | `docs/adr/` (new) |

**Acceptance Criteria:**
- Lighthouse performance ≥ 90, accessibility ≥ 90
- SSE handles 100 streams with p99 < 500ms
- OpenAPI docs auto-generated
- ADRs document all major decisions

---

## Critical Path

```
D1 (Event Schema) → D2 (SSE Endpoint) → D3 (Event Emitter) → D5 (useAgentStream)
→ D6 (Chat SSE Migration) → D8 (Remove Polling) → D9 (API Split)
→ D13 (Chat Decomposition) → D41 (E2E Tests)
```

**Quick wins (do first):**
- D4: Fix polling bug (30 min)
- D35: Fix Firecrawl local (15 min)
- D12: Shared state types (helps everything else)

## Feature Flags

- `SSEStreamingEnabled` — Phase 1
- `AgentReasoningStream` — Phase 4
- `MultiAgentEnabled` — Phase 4
- `WebhookSystemEnabled` — Phase 5
- `SelfReviewEnabled` — Phase 4

## Dependencies

- Phase 2 depends on Phase 1 (hooks replace polling)
- Phase 3 depends on Phase 2 (new pages use decomposed components)
- Phase 4 depends on Phase 1 (agent events use SSE infrastructure)
- Phase 5 is independent (can run parallel with Phase 3-4)
- Phase 6 depends on all previous phases
