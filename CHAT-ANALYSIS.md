# Chat Architecture Analysis — TheFold Frontend

## 1. How Chat Works: Dashboard Page vs Chat Page

### Dashboard Page (`/` — `frontend/src/app/(dashboard)/page.tsx`)

The dashboard page contains a **read-only ChatComposer** widget — it renders the heading and the full `ChatInput` (with skills, subagents, model selector) but does NOT hold any conversation state whatsoever. Its sole job is to collect a message and redirect.

Flow:
1. User types a message into `ChatComposer` → `ChatInput`
2. `onSubmit(msg)` fires `onStartChat(msg)` in `OverviewPage`
3. `onStartChat` builds a URL with query params: `?msg=...&repo=...&skills=...&subagents=1`
4. `router.push('/chat?...')` navigates to the full chat page

The dashboard page also loads: `taskStats`, `costData`, `recentTasks`, `auditStats`, `skillsData`, `memoryStats`, `providerData` — all via `useApiData`. None of these are passed to ChatComposer except `skills` (for the picker) and `models` (for model selector).

The dashboard page holds its own local state for `agentOn`, `subAgOn`, `selectedSkillIds`, `selectedModel` — persisted to/from localStorage (`tf_agentMode`, `tf_subAgents`). These settings are only used to populate the redirect URL; they are not synced with what the chat page reads.

### Chat Page (`/chat` — `frontend/src/app/(dashboard)/chat/page.tsx`)

The chat page is a **full conversation manager** that owns all chat state. It uses a two-column grid layout (280px sidebar + flexible main area) that the layout.tsx has specially configured (`useFullWidth = true` for `/chat`, which sets `overflow: hidden` and `height: calc(100vh - HH)` on the content wrapper).

Two display modes:
- **New chat mode** (`newChat === true`, `ac === null`): shows a `ChatComposer` centered in the main area — identical visually to the dashboard widget.
- **Active conversation mode** (`newChat === false`, `ac !== null`): shows conversation header, scrollable message list, and a compact `ChatInput` at the bottom.

The sidebar shows all filtered conversations (by `selectedRepo` from global `RepoContext`) with delete buttons.

---

## 2. All State Variables in `chat/page.tsx` and Their Purposes

| State variable | Type | Purpose |
|---|---|---|
| `ac` | `string \| null` | Active conversation ID. `null` = new-chat mode. Set by clicking sidebar, or when a new conversation is started. Pattern: `repo-{name}-{uuid}` for repo convs, `chat-{ts}-{rand}` for general. |
| `newChat` | `boolean` | Controls which view is shown. `true` = show `ChatComposer` (landing). `false` = show message list + input. Starts `true`. |
| `sending` | `boolean` | Whether a message send is in-flight. Gates polling, disables input, shows "TheFold tenker" indicator. Set `true` on send, `false` when poll detects real reply or agent done/waiting. |
| `chatError` | `string \| null` | User-facing error message shown at bottom of chat. Classified from API error text (billing, rate-limit, API key, unavailable, context-length). Cleared on new send or by user × click. |
| `selectedSkillIds` | `string[]` | IDs of skills selected for next message. Passed to `sendMessage` as `skillIds`. Populated from URL param `skills` on auto-send. |
| `subAgentsEnabled` | `boolean` | Whether sub-agents are on for this chat session. Passed to `sendMessage` (not currently wired — the `sendMessage` API does not accept it, only `agentOn` from dashboard does via URL param). |
| `thinkSeconds` | `number` | Seconds elapsed since `sending` was set `true`. Displayed in the "TheFold tenker {N}s" indicator. Resets to 0 on `sending === false`. |
| `pendingReviewId` | `string \| null` | If set, the next message typed by the user is treated as review feedback rather than a new chat message. `handleSend` intercepts and calls `requestReviewChanges(pendingReviewId, value)` instead of `sendMessage`. Set by `onRequestChanges` in `AgentStream` when the user clicks "Be om endringer" without providing inline feedback. |
| `autoMsgSent` | `ref<boolean>` | Prevents the URL `?msg=` auto-send from firing more than once (StrictMode guard). |
| `msgEndRef` | `ref<HTMLDivElement>` | Points to a sentinel div at the bottom of the message list; used for `scrollIntoView({ behavior: "smooth" })` whenever messages change. |
| `slowIntervalRef` | `ref<ReturnType<setInterval> \| null>` | Holds the slow-poll (3s) interval reference created after 8s, so it can be cleared on cleanup. Separate from fast-poll because it is created in a `setTimeout` and the return cleanup runs synchronously. |
| `pollStoppedRef` | `ref<boolean>` | Set to `true` inside the polling callback once a terminal state is reached (agentDone, agentWaiting, hasRealReply). Prevents the poll callback from acting after polling should have stopped, even if the interval hasn't been cleared yet. |
| `selectedModel` | `string \| null` | Model override for next message. `null` = Auto. Passed to `sendMessage` as `modelOverride`. |

Derived (not state):
- `filtered`: Conversations filtered by `selectedRepo` from `RepoContext` and excluding `inkognito-` prefixed IDs.
- `cur`: Current conversation object found from `conversations` by `ac`.
- `curRepo`: Repo name extracted from `ac` by parsing the `repo-{name}-...` pattern.
- `msgs`: Messages from `msgData?.messages ?? []`.
- `conversations`: From `convData?.conversations ?? []`.

---

## 3. Polling Logic Details

The polling is driven by a `useEffect` that fires when `sending` or `ac` changes.

**Phases:**

1. **Immediate kick** (800ms): `setTimeout(poll, 800)` — fires once shortly after send.
2. **Fast phase** (0–8s): `setInterval(poll, 1200)` — polls every 1.2s.
3. **Transition at 8s**: The fast interval is cleared via a `setTimeout(() => clearInterval(fast), 8000)`.
4. **Slow phase** (8s+): A separate `setTimeout(() => { slowIntervalRef.current = setInterval(poll, 3000); }, 8000)` starts a 3s interval.
5. **Hard cap**: `setTimeout(() => setSending(false), 120000)` — 2-minute absolute maximum to prevent infinite polling.

**Deduplication check:**
The poll callback computes a hash of `{id}:{content[0..80]}:{messageType}` for all messages. Only calls `setMsgData` if the hash changed — avoids unnecessary re-renders.

**Terminal condition logic inside `poll`:**
```
agentDone = p.status === "done"/"completed"/"failed" OR p.phase === "completed"/"Ferdig"/"Feilet"
agentWaiting = p.status === "waiting"/"needs_input"
hasRealReply = assistant message with non-empty content, not starting with "{", messageType="chat", after last user message
```
If `agentDone || agentWaiting || (hasRealReply && !lastAgent)` → sets `pollStoppedRef.current = true` and `setSending(false)`.

**Cleanup:** The effect returns a cleanup that clears all timeouts/intervals, including `slowIntervalRef.current`.

**Risk:** The `useEffect` only watches `[sending, ac]`. If `selectedModel` or `selectedSkillIds` change mid-flight, polling is unaffected (correct). However, the slow-interval is stored in a ref — if React's Strict Mode double-fires the effect, the cleanup from the first run will clear the first set of intervals, and the second run starts clean. The `pollStoppedRef` is not reset between runs, so a second fire may immediately no-op.

---

## 4. The `pendingReviewId` Flow

When the agent finishes a task and submits a review, `AgentStream` renders with `status === "waiting"` and `report.reviewId` set. Three buttons appear: Godkjenn, Be om endringer, Avvis.

**"Be om endringer" path:**
- `AgentStream` calls `onRequestChanges(reviewId, "")` — empty feedback string.
- In `chat/page.tsx`, `onRequestChanges` handler detects `feedback.trim() === ""` and:
  1. Sets `setPendingReviewId(reviewId)` — this is the "waiting for user feedback" mode.
  2. Calls `document.querySelector('[data-chat-input]')` to focus the textarea (imperative DOM query — a fragile pattern).
  3. Returns without calling the API.
- The `ChatInput` `placeholder` prop switches to `"Skriv feedback til agenten..."` when `pendingReviewId` is set.
- User types their feedback and submits.
- `handleSend` checks `if (pendingReviewId)` first — instead of sending a normal chat message, it calls `requestReviewChanges(pendingReviewId, value)`.
- On success: clears `pendingReviewId`, calls `refreshMsgs()`.
- On error: clears `pendingReviewId`, sets `chatError`.

**"Godkjenn" path:**
- `AgentStream.onApprove(reviewId)` → calls `approveReview(reviewId)` → `refreshMsgs()`.
- Does NOT set `pendingReviewId`.

**"Avvis" path:**
- `AgentStream.onReject(reviewId)` → calls `rejectReview(reviewId)` → `refreshMsgs()`.

**Risks:**
- `pendingReviewId` is never automatically cleared if the user navigates away or switches conversations (changes `ac`). If `ac` changes, the next `handleSend` will still try to call `requestReviewChanges` on a stale `pendingReviewId`.
- The `document.querySelector('[data-chat-input]')` focus hack bypasses React entirely. If `ChatInput` unmounts or remounts, the ref is stale.
- `AgentStream`'s `onRequestChanges` is duplicated verbatim in two render paths (standalone agent message AND merged-under-chat-message), creating two identical ~14-line blocks.

---

## 5. Redirect Behavior: Dashboard → Chat

The dashboard page's `onStartChat` function:

```ts
const onStartChat = (msg: string) => {
  const params = new URLSearchParams();
  if (msg) params.set("msg", msg);
  if (selectedRepo) params.set("repo", selectedRepo.name);
  if (selectedSkillIds.length > 0) params.set("skills", selectedSkillIds.join(","));
  if (subAgOn) params.set("subagents", "1");
  router.push(`/chat?${params.toString()}`);
};
```

Note: `agentOn` from dashboard is NOT passed in the URL. There is no `agent=0` param, so the chat page always behaves as if agent mode is on. The `selectedModel` on the dashboard is also NOT passed in the URL — it is silently dropped.

On the chat page, `useSearchParams()` reads `?msg=`, `?repo=`, `?skills=`, `?subagents=` in the auto-send `useEffect`:

```ts
useEffect(() => {
  if (autoMsg && !autoMsgSent.current) {
    autoMsgSent.current = true;
    setNewChat(false);
    // parse params, build convId, set state, sendMessage()
  }
}, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps
```

The dependency array is `[autoMsg]` only — other params (`repo`, `skills`, `subagents`) are read via `searchParams.get(...)` inside the effect without being declared as deps. This is safe because these only need to be read once on the initial send, but it triggers the eslint-disable comment.

The auto-send fires ONCE (guarded by `autoMsgSent.current`). If the user navigates back to `/chat` without query params, `autoMsg` is `null` and nothing fires.

---

## 6. Where Logic is Duplicated

### A. Error classification block — 3 identical copies

The error-classification pattern appears identically in three places within `chat/page.tsx`:
- `startNewChat()` catch handler
- `handleSend()` catch handler
- Auto-send `useEffect` catch handler

Each copy is ~8 lines of `if (lower.includes(...))` checks for billing/rate-limit/API-key/unavailable/context-length errors. Should be extracted to a single `classifyApiError(e: unknown): string` utility.

### B. Optimistic message construction — 2 copies

The optimistic user message object is constructed identically in `startNewChat()` and `handleSend()`, and again in the auto-send `useEffect`. All three create:
```ts
const optimisticMsg: Message = {
  id: crypto.randomUUID(),
  conversationId: convId,
  role: "user" as const,
  content: msg,
  messageType: "chat",
  metadata: null,
  createdAt: new Date().toISOString(),
};
setMsgData(prev => ({
  messages: [...(prev?.messages ?? []), optimisticMsg],
  hasMore: prev?.hasMore ?? false,
}));
```
Should be extracted to `appendOptimisticMessage(convId, text)` or a shared helper.

### C. `AgentStream` with all three review callbacks — 2 identical render blocks

Lines 688–722 and lines 748–781 in `chat/page.tsx` are near-identical — the first is for standalone agent messages, the second is for the merged-under-chat-message case. Both render `<AgentStream ... onCancel onApprove onReject onRequestChanges />` with the same callback bodies. The only structural difference is the outer `div` wrapping. Should be extracted to a `<ReviewableAgentStream>` component.

### D. `ChatComposer` rendered in two places

`ChatComposer` appears on both `/` (dashboard) and in the new-chat view of `/chat`. Both pass the same props shape (`skills`, `selectedSkillIds`, `onSkillsChange`, `subAgentsEnabled`, `onSubAgentsToggle`, `models`, `selectedModel`, `onModelChange`). This is correct reuse, not duplication — but the callback wiring is slightly different (dashboard uses URL redirect; chat page calls `startNewChat`).

### E. Conversation ID generation — 2 copies

The pattern `repoConversationId(repoName)` vs `chat-${Date.now()}-${rand}` appears in both `startNewChat` and the auto-send `useEffect`. Should use a shared `buildConversationId(repoName: string | null): string` helper.

### F. `timeAgo` and `relativeTime` — 2 nearly identical functions

`dashboard/page.tsx` defines `relativeTime(dateStr: string)` and `chat/page.tsx` defines `timeAgo(date: string)`. They implement the same logic with slightly different labels ("nå" vs "na", and month support). Should be in `lib/utils.ts`.

---

## 7. What Can Be Extracted as Reusable Widget Components

### 7a. `<ConversationSidebar>`

Extract the 280px sidebar from `chat/page.tsx`:
- Props: `conversations`, `activeId`, `onSelect(id)`, `onNewChat()`, `onDelete(id)`, `loading`
- Internal: `filtered` logic (repo-based), `timeAgo`, delete confirm
- Currently entirely inline in `ChatPageInner`

### 7b. `<MessageList>`

Extract the scrollable message area:
- Props: `messages`, `sending`, `thinkSeconds`, `chatError`, `onDismissError`, `onCancelGeneration`, `onApprove`, `onReject`, `onRequestChanges`
- Internal: dedup logic (single last agent message), merge logic (agent under chat), `isAgentMessage()` predicate, "TheFold tenker" spinner, "Oppdaterer..." indicator, `msgEndRef`

### 7c. `<ReviewableAgentStream>`

Wrap `AgentStream` with the three standard callbacks already wired:
- Props: `content`, `conversationId`, `onCancel`, `onPendingReview(reviewId)`, `onRefresh()`
- Eliminates the two duplicate `AgentStream` + callback blocks in `MessageList`

### 7d. `useChatPolling` hook

Extract polling logic from `chat/page.tsx`:
- Signature: `useChatPolling({ sending, conversationId, onMessages, onDone })`
- Internal: all setTimeout/setInterval management, dedup hash check, terminal state detection, 2-minute cap
- Returns: nothing (side-effect only)
- Currently 50+ lines inside `ChatPageInner`

### 7e. `useSendMessage` hook

Extract the send orchestration:
- Signature: `useSendMessage({ conversationId, selectedRepo, selectedSkillIds, selectedModel, pendingReviewId, onSent, onError, onPendingReviewClear })`
- Returns: `{ send(text: string), sending, setSending }`
- Owns: optimistic message insertion, API call, error classification, `refreshConvs` after success

### 7f. `useAutoSend` hook

Extract the URL-param auto-send:
- Fires once when `?msg=` is present in search params
- Handles `repo`, `skills`, `subagents` params
- Returns: `{ autoSendFired: boolean }`

### 7g. `classifyApiError(e: unknown): string` utility

Pure function in `lib/utils.ts` — eliminates the three duplicated catch blocks.

---

## 8. Risks and Gotchas for Decomposition

### 8a. `useApiData` setData cross-boundary

`chat/page.tsx` uses `setData` from `useApiData` directly (the hook exposes it) to do optimistic updates and to update messages from polling. Any extracted `useSendMessage` or `useChatPolling` hook must receive `setMsgData` as a parameter — or the hooks must be co-located inside a context. Otherwise, React's state update rules prevent cross-component `useState` setters from being shared cleanly without context.

### 8b. Polling cleanup and ref leakage

`slowIntervalRef` is a module-level ref. If `ChatPageInner` unmounts and remounts (which Next.js App Router can do on navigation), the cleanup function from the old effect must have run. The current implementation handles this correctly, but any refactor that moves `slowIntervalRef` into a hook must be careful to include it in the hook's own cleanup.

### 8c. `pollStoppedRef` is NOT reset between `ac` changes

When the user switches conversations, `ac` changes → the `sending` effect re-runs. But `pollStoppedRef.current` is never reset to `false` when `ac` changes — only when `sending` changes. If a previous poll set it to `true` and `sending` was then set to `false`, the next message send sets `sending` to `true` → effect re-runs → `pollStoppedRef.current = false` correctly (line 120 in the page). Actually, the line `pollStoppedRef.current = false;` IS the first thing in the effect body, so this is correct. However, if decomposing into a hook, this reset must stay at the top of the effect.

### 8d. DOM query for focus (`document.querySelector('[data-chat-input]')`)

The `pendingReviewId` focus hack queries `[data-chat-input]` — a `data-` attribute on the textarea inside `ChatInput.tsx`. If `ChatInput` is refactored or the textarea is conditionally rendered, this breaks silently. Should be replaced with a `forwardRef` + `useImperativeHandle` on `ChatInput` exposing a `focus()` method, or a context-based focus trigger.

### 8e. `newChat` and `ac` are tightly coupled but separate state

`newChat === true` and `ac === null` always go together (and vice versa). They could be a single state: `type ChatMode = { type: 'new' } | { type: 'active', conversationId: string }`. Refactoring to a single union type would eliminate the invariant violation risk (currently nothing prevents `newChat === false && ac === null`).

### 8f. Message deduplication is in the render path

The dedup logic (finding `lastAgentIdx`, building `dedupedMsgs`, computing `mergedChatId`) runs inside the JSX render callback via an IIFE:
```tsx
{(() => {
  let lastAgentIdx = -1;
  // ...
  return dedupedMsgs.map(...);
})()}
```
This is not memoized — it re-runs on every render. When decomposing into `<MessageList>`, this should become a `useMemo` inside the component.

### 8g. Layout coupling: `useFullWidth` in layout.tsx

`layout.tsx` checks `pathname === "/chat" || pathname.startsWith("/chat/")` to apply `overflow: hidden` and `height: calc(100vh - HH)` to the content wrapper. This means the chat page REQUIRES this special layout treatment to achieve its full-height non-scrolling behavior. Any decomposition that changes the `/chat` route path, or moves chat into a modal/overlay, must also update `layout.tsx`.

### 8h. `repoConversationId` collision risk

`lib/api.ts` exports `repoConversationId(repoName)` which generates a deterministic ID. The chat page also generates `chat-${Date.now()}-${rand}` for non-repo conversations. These two ID schemes are used to filter the sidebar (`c.id.startsWith("chat-")` vs `c.id.startsWith("repo-${selectedRepo.name}-")`). Any new conversation ID pattern would break sidebar filtering.

### 8i. `sendMessage` API does not accept `repoOwner`

The `sendMessage` signature in `api.ts` does not include `repoOwner` in its documented options, but `chat/page.tsx` passes `repoOwner: selectedRepo?.owner` in the options object. The API function accepts `...options` spread into the body, so it passes through. But if the API is ever tightened, this silent pass-through will break.

### 8j. `subAgentsEnabled` is tracked but not fully wired

`chat/page.tsx` maintains `subAgentsEnabled` state and passes it to `ChatInput`, but `sendMessage` in `api.ts` does not have a `subAgentsEnabled` parameter — only `skillIds`, `modelOverride`, `repoName`, `chatOnly`. The sub-agents setting from the dashboard page IS passed via URL (`?subagents=1`) and sets the state, but the state is never forwarded to the API. This is either a bug or the backend infers it from something else.

---

## Summary Map

```
frontend/
  app/(dashboard)/
    page.tsx              — Dashboard: ChatComposer as redirect launcher, stats grid, activity, skills/memory
    layout.tsx            — Shell: sidebar nav, header, repo selector; useFullWidth for /chat
    chat/
      page.tsx            — Full chat: Suspense wrapper → ChatPageInner
                            All state (ac, newChat, sending, chatError, selectedSkillIds,
                            subAgentsEnabled, thinkSeconds, pendingReviewId)
                            Polling logic (fast/slow/cap)
                            Auto-send from URL params
                            startNewChat(), handleSend(), isAgentMessage()
                            Dedup + merge rendering inline

  components/
    ChatComposer.tsx      — Centered heading + ChatInput (landing widget, used on / and /chat new)
    ChatInput.tsx         — Full-featured input with skills/subagents/model dropdowns (root-level, used by ChatComposer)
    AgentStream.tsx       — Parses agent progress JSON, renders phase/steps/report/review actions
    NotifBell.tsx         — Notification bell, polls /chat/notifications every 30s
    chat/
      chat-bubble.tsx     — (unused by chat/page.tsx) Alternative bubble UI with markdown rendering
      chat-controls.tsx   — (unused by chat/page.tsx) Alternative control bar component with repo/inkognito/agent/skills
      chat-input.tsx      — (unused by chat/page.tsx) Alternative input component (different API to ChatInput.tsx)
    agent/
      parseAgentMessage.ts — Parses "Builder: phase (N/M) [status]" text format into AgentStatusData

  lib/
    api.ts                — sendMessage, getChatHistory, getConversations, approveReview,
                            rejectReview, requestReviewChanges, repoConversationId
    hooks.ts              — useApiData (fetch + loading + error + refresh + setData)
    repo-context.tsx      — RepoProvider, useRepoContext (selectedRepo, repos, selectRepo, clearRepo)
```

Note: `components/chat/chat-bubble.tsx`, `components/chat/chat-controls.tsx`, and `components/chat/chat-input.tsx` exist but are NOT imported by `chat/page.tsx`. The page uses the root-level `ChatInput.tsx` and `ChatComposer.tsx` instead. These three components in `components/chat/` appear to be an earlier or parallel design iteration that was abandoned. They have different prop interfaces and styling approaches. This is a significant source of confusion — there are effectively two parallel chat UI implementations.
