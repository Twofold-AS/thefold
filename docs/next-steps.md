# Next Steps — TheFold Development Priorities

_Last updated: 2026-04-11_

---

## 1. Chat UX Improvements

**High priority**

- **Review panel — post-action state:** After clicking Godkjenn/Avvis, the buttons disappear (good) but there's no persistent confirmation. Show a compact "PR opprettet ✓" or "Review avvist" inline message so the user knows the action completed.
- **"Be om endringer" flow:** Currently focuses the input and waits for the user to type. Add a placeholder prompt in the input ("Hva skal endres?") and a visible indicator that the input is in "changes request" mode.
- **Polling vs SSE gap for agent tasks:** After `agent.done`, the trailing refreshes (2s/8s/20s) catch late pub/sub messages, but if the agent task is very long (>2 min) the SSE sometimes drops. Add a reconnect strategy in `useAgentStream` — exponential backoff with max 5 retries.
- **Empty state for new repo conversations:** When starting a fresh repo conversation, the chat area shows a generic "Ingen meldinger enda." message. Replace with a contextual onboarding hint (e.g., "Beskriv hva du vil bygge i [repo-name]").
- **Message timestamps:** Currently only show HH:MM. Add relative time ("2 minutter siden") on hover via `title` attribute.

---

## 2. SSE Streaming vs Polling Gaps

**Medium priority**

- **Direct chat SSE stability:** The `useAgentStream` hook connects SSE for `activeTaskId` OR `ac` (conversation ID). When the AI responds via pub/sub rather than SSE (e.g., tool-use loop), the SSE stream for `ac` receives nothing. The polling fallback catches this but with up to 3s delay — consider emitting a lightweight SSE heartbeat from the chat endpoint to confirm the stream is alive.
- **Agent task disconnect recovery:** If the user navigates away and back during an agent task, `activeTaskId` is lost. Persist `activeTaskId` in `sessionStorage` so refresh/navigate reconnects the SSE automatically.
- **SSE backpressure:** `callAnthropicStreaming` in `ai/call.ts` buffers chunks and sends via `chatResponses` pub/sub. Under high load, pub/sub delivery can lag 5–10s. Add a `X-TheFold-Task-Id` header to the initial `sendMessage` response so the frontend can poll `/agent/job/{id}` as a fallback without waiting for SSE.

---

## 3. Agent Execution Reliability

**High priority**

- **Retry context delta (YB):** `computeRetryContext()` in `agent/execution.ts` computes a delta (summary + diff + latest error) to save tokens on retries. Verify this is actually reducing token spend — add a per-task token breakdown log at STEP 12 (`completeTask`).
- **`impossible_task` escalation:** Currently sets Linear status to `blocked` and stops. Add a chat notification with the specific reason so the user can rephrase the task.
- **Builder fix-loop max iterations:** The per-file fix loop allows 3 attempts and the integration phase allows 3 full re-validates. Under complex tasks this can silently exhaust retries without notifying the user. Emit a chat report when the fix-loop maxes out.
- **Sandbox filesystem cleanup:** `/tmp/thefold-sandboxes/` can grow unbounded in dev mode. Add a startup check (or cron) that deletes sandboxes older than 6 hours in filesystem mode (Docker mode already has a 30-min cron).

---

## 4. Frontend Polish and Testing

**Medium priority**

- **AgentStream shimmer animation:** The shimmer CSS (`shimmerMove`) is defined inline. Move to a shared CSS file or `globals.css` to avoid duplicate `@keyframes` warnings in the console.
- **ReviewPanel file diff expand/collapse:** Currently toggles inline with `▲▼` indicators. Add line count and language badge (e.g., `TS`, `CSS`) per file for scannability.
- **Storybook coverage:** `ToolCallCard.stories.tsx` exists but AgentStream, ReviewPanel, and AgentStatusBar have no stories. Add stories with the `waiting` (review) state to catch regressions visually.
- **E2E test for review flow:** `agent/e2e-mock.test.ts` covers the task execution path but not the approve/reject flow. Add a test that:
  1. Starts a task via mock agent
  2. Asserts a review is created
  3. Calls `approveReview` and asserts PR URL returned
- **Mobile/responsive layout:** The chat grid is `280px + 1fr` which clips on viewports <700px. Add a responsive breakpoint that collapses the sidebar into a hamburger menu.

---

## 5. Issues Discovered During Debugging

**Track and fix**

- **`docs/debug-chat-findings.md`** — existing debug notes in the repo (untracked). Review and either incorporate findings or delete the file.
- **`Btn.tsx` `disabled` prop handling:** The component was updated to forward `disabled` correctly, but the `primary` + `disabled` combination doesn't visually grey out in the current design token set. Add `T.disabled` token and apply it.
- **`ToolCallCard.stories.tsx` import path:** Had a broken relative import that was patched. Verify it runs cleanly in `npx storybook dev`.
- **Chat history deduplication:** `MessageList` deduplicates by keeping only the last agent message. If two distinct agent tasks run in the same conversation (e.g., project orchestrator spawning sub-tasks), only the final status is shown. Consider grouping by `taskId` instead of discarding all but last.
- **`useReviewFlow` — no loading state passed to ReviewPanel:** `ReviewPanel` accepts a `loading` prop but `useReviewFlow` never sets it. The loading state is handled inside `AgentStream` directly (not via `ReviewPanel`). Either remove `loading` from `ReviewPanel` props or wire it up — currently it's dead code.

---

## 6. Planned Features (Grunnmur-ready)

Lower priority but infrastructure is in place:

- **Skills engine pre/post hooks:** `skills/engine.ts` `executePreRun`/`executePostRun` return passthrough. Activate with real routing logic and token budgeting.
- **Monitor service code_quality/doc_freshness:** Stubs in `monitor/monitor.ts`. Implement with ESLint report parsing and doc age checks.
- **Registry auto-extraction:** `registry/extractor.ts` has `extractComponents()` wired to `callForExtraction`. Enable `RegistryExtractionEnabled` flag and test against a real completed build.
- **GitHub App auth:** `GitHubAppEnabled` flag gates the App JWT flow in `github/github-app.ts`. Test with an actual GitHub App installation to replace PAT-based auth.
