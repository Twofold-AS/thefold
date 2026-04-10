# ADR-004: Chat and task page component decomposition

**Status:** Accepted

## Context

TheFold's chat and task pages began as large monolithic page components (>500 lines each). As features grew (SSE streaming, tool call cards, review panels, thinking indicators, agent status bars), the pages became difficult to reason about, test, and iterate on.

The team decomposed these pages into focused, single-responsibility components.

## Decision

### Chat page decomposition (`src/components/chat/`)

| Component | Responsibility |
|-----------|---------------|
| `ChatContainer` | Top-level layout; owns the `useAgentStream` hook, wires props to children |
| `MessageList` | Renders the scrollable list of messages |
| `MessageWithAgent` | Single message bubble with inline agent progress |
| `MessageInput` | Composer input with send/stop controls |
| `ToolCallCard` | Collapsible card for a single tool invocation |
| `StreamIndicator` | Compact "thinking / running tool / progress" row |
| `ThinkingBlock` | Expandable AI reasoning trace |
| `AgentStatusBar` | Phase pipeline with animated icons |
| `ReviewPanel` | Inline approve/request-changes/reject UI |
| `PlanView` | Renders structured task plan from AI |
| `ContextUsage` | Token budget ring chart |
| `ErrorCard` | Error display with retry option |
| `ConversationSidebar` | Conversation history list |

### Task page decomposition (`src/components/tasks/`)

| Component | Responsibility |
|-----------|---------------|
| `TaskList` | Filtered, sorted list of task cards |
| `TaskCard` | Single task row with status badge and metadata |
| `TaskDetailPanel` | Slide-in detail view (description, history, actions) |
| `TaskEditor` | Create/edit form |
| `TaskFilters` | Status/repo/source filter controls |
| `LinearSync` | Linear sync status and trigger button |

### Shared (`src/components/shared/`)

| Component | Responsibility |
|-----------|---------------|
| `StatusBadge` | Coloured inline badge for task/review status |
| `EmptyState` | Consistent empty placeholder with icon, message, action |
| `LoadingSkeleton` | Shimmer placeholder during data fetch |
| `ErrorBoundary` | React error boundary for graceful degradation |
| `ConnectionStatus` | SSE connection state indicator |
| `TimeAgo` | Human-readable relative timestamps |
| `ActivityTimeline` | Vertical timeline of events |

## Consequences

**Positive:**
- Each component has a single testable prop interface
- Storybook stories can be created per component (see D44)
- Page files focus on data-fetching and layout; presentation lives in components
- `useAgentStream` hook encapsulates all SSE logic; components are pure/presentational

**Negative / Trade-offs:**
- More files to navigate; mitigated by directory organisation (`chat/`, `tasks/`, `shared/`)
- Some prop-drilling from `ChatContainer` down to leaf components — acceptable given the depth is at most 2–3 levels
- `"use client"` directive must appear in each component that uses hooks, even if the parent is also a client component — this is a Next.js App Router constraint, not a design flaw

**Hook convention:**
Complex stateful logic is extracted into hooks (`useAgentStream`, `useApiData`) that live in `src/hooks/`. Components receive their data as props or call hooks directly — they do not call `apiFetch` inline.
