# Chat E2E Debug Findings

> Traced: 2026-04-11  
> Files: `chat/chat.ts`, `agent/tool-loop.ts`, `agent/stream.ts`, `agent/event-bus.ts`, `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/hooks/useAgentStream.ts`

---

## Executive Summary

Four bugs, all structural. The chat UI, the AI backend, and the SSE infrastructure are each individually working — but they are not connected correctly for the **direct chat flow** (the normal case when no `linearTaskId` is passed).

The SSE pipeline is fully wired for **agent tasks** (startTask → tool-loop → event-bus → /agent/stream → useAgentStream). But direct chat bypasses every part of that pipeline. It uses a fire-and-forget DB-write pattern with no streaming, no signals, and a premature `refreshMsgs()` call that fetches an empty placeholder.

---

## Bug 1: ~50 Second Response Time

### Where: `chat/chat.ts` → `processAIResponse()` (lines 820–1103)

`processAIResponse` is fire-and-forget but does this work **synchronously** before the AI call:

```
Step 2: DB query — conversation history (fast, ~5ms)
Step 3: Dynamic import("~encore/clients") + skillsClient.resolve() (~100–300ms cold start per import)
Step 4: Dynamic import + memory.search() — only for complex queries
Step 4.5: GitHub context fetch — THE MAIN BOTTLENECK
  - github.getTree()                        → 1 API call (~500ms)
  - github.findRelevantFiles()              → 1 API call (~500ms)
  - github.getFile() × up to 5 files       → 5 serial API calls (~500ms each = 2500ms)
  TOTAL SERIAL NETWORK: up to ~4000ms on happy path
  (Falls back to 3 more getFile calls if findRelevantFiles fails)
Step 5: Dynamic import + ai.chat()         → 1 AI inference call
```

**Root causes:**
1. **GitHub context is fetched for every chat message** — even simple greetings — whenever `repoName && repoOwner` are set. All GitHub calls are **serial** (no `Promise.all`).
2. **Three `import("~encore/clients")` calls happen on every request** (skills, memory, github, ai). Each dynamic import has cold-start cost the first time per process.
3. **`ai.chat()` itself uses CHAT_TOOLS** (5 tools, callWithTools loop up to 10 iterations). A simple "hei" question can still trigger multiple AI round-trips if the model decides to call tools.

**Why it's ~50 seconds specifically:** On a cold start + a repo-context chat with a complex message:
- 3–5 serial GitHub API calls: ~3s
- Skills resolve: ~1s  
- Memory search: ~1s
- ai.chat() with tool-use loop (worst case 3 tool calls): ~30–40s
- Total: ~35–45s, matches observed ~50s

---

## Bug 2: No Live Streaming/Thinking Indicator

### Where: `processAIResponse()` emits **zero SSE events**

The SSE infrastructure in `agent/event-bus.ts` + `agent/stream.ts` + `agent/tool-loop.ts` is complete and correct — but it is **only used by the agent tool loop** (`runAgentToolLoop`).

The direct chat path (`processAIResponse`) calls `ai.chat()` which is a regular Encore API call that returns when done. Neither `processAIResponse` nor `ai.chat()` ever call `agentEventBus.emit()`.

So when `useAgentStream` connects to `/agent/stream?taskId=<conversationId>` for a direct chat:
- The SSE connection opens
- It receives only 15-second heartbeats
- No `agent.status`, no `agent.message`, no `agent.thinking` events are ever emitted
- `thinkingText` stays `null`, `isStreaming` stays `true` but nothing renders
- `agent.done` never fires, so `onDone` never calls `refreshMsgs()`

### Compounding issue in `chat/page.tsx` line 97–98:
```tsx
const { messages: sseMessages, status: streamStatus } = useAgentStream(
  sending && activeTaskId ? activeTaskId : null,
```

For direct chat, `activeTaskId` is **never set** (only set at line 149 when `result.agentTriggered && result.taskId`). So for normal chat messages, `useAgentStream(null)` is called — the hook immediately tears down, connects nothing. No indicator at all.

---

## Bug 3: Messages Don't Appear Until Manual Refresh

### Where: `chat/page.tsx` → `handleSendResult()` (lines 148–157)

```tsx
const handleSendResult = (result) => {
  if (result?.agentTriggered && result.taskId) {
    setActiveTaskId(result.taskId);        // SSE onDone will call refreshMsgs()
  } else {
    // Direct chat — "response already persisted to DB" ← THIS ASSUMPTION IS WRONG
    refreshMsgs().then(() => setSending(false));
  }
  refreshConvs();
};
```

The comment says "response already persisted to DB" — **this is false**. The `/chat/send` endpoint returns immediately after:
1. Storing the user message
2. Inserting an **empty placeholder** (`content: ''`) into the messages table
3. Calling `processAIResponse(...).catch(...)` as fire-and-forget

`refreshMsgs()` is called the moment `/chat/send` responds — but `processAIResponse` hasn't even started the AI call yet at that point. The DB contains only the empty placeholder, so the UI re-renders showing nothing new (or an empty assistant bubble), and `setSending(false)` is called immediately.

The actual AI response arrives 5–50 seconds later when `processAIResponse` calls `updateMessageContent(placeholderId, aiResponse.content)` — but by then the UI has stopped listening and no re-fetch is triggered.

**Timeline:**
```
t=0ms:   user sends message
t=5ms:   /chat/send stores user msg, inserts empty placeholder, returns { agentTriggered: false }
t=6ms:   handleSendResult() → refreshMsgs() → DB has empty placeholder → blank render
t=7ms:   setSending(false) → spinner stops
t=50s:   processAIResponse finishes, writes to DB → UI doesn't know
t=∞:     user manually refreshes page to see response
```

---

## Bug 4: Agent Creates Task Record Instead of Running Work

### Where: `chat/chat.ts` line 637 — `shouldTriggerAgent` condition

```tsx
const shouldTriggerAgent = req.linearTaskId && !req.chatOnly;
```

The agent tool loop (which does real work: GitHub reads/writes, sandbox execution, PR creation) is **only activated when a `linearTaskId` is explicitly passed in the request**. For a normal chat message ("build me a login page"), `linearTaskId` is undefined, so `shouldTriggerAgent = false`.

Instead, the normal path calls `ai.chat()` with CHAT_TOOLS, one of which is `create_task`. When the AI decides the user wants work done, it:
1. Calls `create_task` tool → creates a task record in the DB
2. Calls `start_task` tool → fires `agent.startTask()` asynchronously
3. Agent starts running in the background with its own SSE stream key = the task ID

But the frontend never learns the task ID for the SSE stream:
- `/chat/send` returns `{ agentTriggered: false }` (because `shouldTriggerAgent` is false)
- `handleSendResult` enters the "direct chat" branch
- `setActiveTaskId` is never called
- `useAgentStream` stays disconnected
- Agent runs in the background forever with no frontend awareness

The user sees: "Jeg skal opprette en oppgave for dette..." and then silence. The task record appears in `/tasks` but no progress is shown, and the agent result is never surfaced back to chat.

---

## SSE Architecture — What IS Working

For agent tasks started with a `linearTaskId`, the full pipeline works correctly:

```
/chat/send (linearTaskId provided)
  → agent.startTask()
  → agent/agent.ts → executeTask()
  → agent/execution.ts → executePlan()
  → builder.start()
  → agent/tool-loop.ts → runAgentToolLoop()
     → agentEventBus.emit(thefoldTaskId, event)     ← events emitted here
  
frontend: useAgentStream(activeTaskId)
  → EventSource("/agent/stream?taskId=<thefoldTaskId>")
  → agent/stream.ts → agentEventBus.subscribe(taskId, handler)
  → res.write(formatSSE(event))                     ← streamed to browser
  → onDone() → refreshMsgs()                        ← correct
```

The event bus is in-memory (`AgentEventBus` singleton in `agent/event-bus.ts`). This means it only works if the SSE subscriber and the tool-loop emitter are in the **same Encore service process**. Since both are in the `agent` service, this is fine in production. However, note there is no replay on reconnect (the `getBuffer()` method exists but is never used in `stream.ts`).

---

## Fix Recommendations (Priority Order)

### Fix 1 — Direct chat refresh timing (Bug 3) — Quick Win
**Problem:** `refreshMsgs()` called before AI finishes.  
**Fix:** For direct chat, use a polling loop or a DB update signal. Simplest approach: after `refreshMsgs()` in `handleSendResult`, if the last assistant message has empty content, set up a short polling interval (e.g. every 2s for max 90s) until content appears.

Alternatively: have `processAIResponse` emit to `agentEventBus` using `conversationId` as the key when done — a single `agent.done` event with the final message content. Frontend already handles `onDone → refreshMsgs()`.

### Fix 2 — Emit SSE events from direct chat (Bug 2) — Medium
**Problem:** `processAIResponse` emits nothing to SSE.  
**Fix:** Add `agentEventBus.emit(conversationId, ...)` calls in `processAIResponse`:
- On start: `agent.status { status: "running", phase: "Tenker" }`
- During GitHub fetch: `agent.status { phase: "Henter kontekst" }`
- On AI response: stream the actual text via `agent.message` events by switching `ai.chat()` to use streaming (Anthropic SDK streaming is already used in `tool-loop.ts`)
- On done: `agent.done { summary: aiResponse.content }`

Also fix `chat/page.tsx` line 97–98: pass `conversationId` (not `activeTaskId`) as the stream key for direct chat so `useAgentStream` connects immediately on send.

### Fix 3 — GitHub context latency (Bug 1) — Medium
**Problem:** Serial GitHub API calls add 2–5 seconds before AI call.  
**Fix:** Parallelize with `Promise.all`:
```ts
const [tree, relevantFiles] = await Promise.all([
  github.getTree({ owner, repo }),
  github.findRelevantFiles({ owner, repo, taskDescription: userContent, tree: [] }),
]);
const fileContents = await Promise.all(filesToFetch.map(p => github.getFile({ owner, repo, path: p })));
```
Also: skip GitHub context for short/simple messages (e.g. `quickComplexity(userContent) < 4`).

### Fix 4 — Surface chat-initiated agent tasks (Bug 4) — Larger
**Problem:** When AI calls `start_task` tool, frontend doesn't connect to the agent's SSE stream.  
**Fix:** Make `ai.chat()` return the `lastStartedTaskId` if a task was started during tool-use. Then in `chat.ts` `send` endpoint:
```ts
// If a task was started during direct chat, surface it
if (aiResponse.lastStartedTaskId) {
  return { message: msg, agentTriggered: true, taskId: aiResponse.lastStartedTaskId };
}
```
This already partially exists: `lastCreatedTaskId` is stored in message metadata (line 1051), but it's never returned from the `send` endpoint.
