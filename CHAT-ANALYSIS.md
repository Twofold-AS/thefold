# Chat Frontend Architecture Analysis

> Generated: 2026-04-10  
> Scope: `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/app/(dashboard)/page.tsx`, `frontend/src/lib/api.ts`, `frontend/src/components/`

---

## 1. How Chat Works: Dashboard vs Chat Page

### Overview Page (`/` → `dashboard/page.tsx`)
The main dashboard renders a `ChatComposer` component as the primary entry point. When the user submits a message:

```
ChatComposer.onSubmit(msg)
  → builds URL: /chat?msg={msg}&repo={repo}&skills={ids}&subagents={1}
  → router.push(url)
```

The overview page has **no chat state of its own** — it is a pure redirect trigger. No polling, no message rendering, no conversation management.

### Chat Page (`/chat` → `dashboard/chat/page.tsx`)
Full chat UI with two internal modes controlled by state:

| Mode | Condition | What renders |
|------|-----------|--------------|
| New chat / composer | `newChat === true` | `ChatComposer` + empty state |
| Active conversation | `ac !== null` | Sidebar, message thread, `ChatInput` |

On mount, the chat page reads `?msg` from URL params and fires an auto-send **exactly once** (guarded by `autoMsgSent` ref). This is the handoff from the overview page.

```
URL param ?msg detected
  → parse ?repo, ?skills, ?subagents
  → create or derive conversation ID
  → setAc(convId)
  → optimistic message added to msgs state
  → setSending(true)
  → sendMessage(convId, msg, options)
```

Navigation within the chat page is purely state-based — conversation switching does **not** change the URL.

---

## 2. Component Dependency Map

```
Layout (dashboard/layout.tsx)
└── RepoProvider (global repo context, persisted to localStorage)
    └── DashboardLayoutInner
        ├── Sidebar navigation
        ├── Overview Page (dashboard/page.tsx)
        │   ├── ChatComposer           ← entry point to chat
        │   │   └── ChatInput
        │   ├── Stats Grid
        │   └── Skills / Memory / Activity
        └── Chat Page (dashboard/chat/page.tsx)
            ├── Sidebar
            │   └── Conversation list
            └── Main area [two modes]
                ├── newChat=true → ChatComposer → ChatInput
                └── ac !== null  → Conversation view
                    ├── Header (title + repo)
                    ├── Messages area
                    │   ├── User message bubbles
                    │   └── Assistant messages
                    │       ├── AgentStream (agent_status / agent_progress types)
                    │       │   ├── Phase label + shimmer
                    │       │   ├── Step checklist
                    │       │   ├── Report card
                    │       │   ├── Questions (waiting state)
                    │       │   └── Review UI (Approve / Reject / Request Changes)
                    │       └── Chat message content + metadata row
                    └── ChatInput (compact mode)
```

**Shared utilities:**
- `useApiData` hook — generic fetch + refresh for all API calls
- `lib/api.ts` — all API functions centralized
- `RepoContext` — global repo selection

---

## 3. State Variables and Their Purposes

All state lives in `ChatPageInner` (the inner Suspense-wrapped component of `chat/page.tsx`).

### Core Conversation State

| Variable | Type | Purpose |
|----------|------|---------|
| `ac` | `string \| null` | Active conversation ID. Drives message fetch and polling. |
| `newChat` | `boolean` | `true` = show composer. `false` = show message thread. |
| `msgs` | `{ messages, hasMore }` | Message history. Fetched via `useApiData`, keyed on `ac`. |
| `sending` | `boolean` | `true` while waiting for agent response. **Triggers polling.** |
| `chatError` | `string \| null` | Parsed user-facing error (credit/rate limit/API key/context). |

### Configuration State

| Variable | Type | Purpose |
|----------|------|---------|
| `selectedSkillIds` | `string[]` | Skills to attach to next request. |
| `subAgentsEnabled` | `boolean` | Whether to enable parallel sub-agents. |
| `selectedModel` | `string \| null` | Override AI model for this conversation. |

### Review / Feedback State

| Variable | Type | Purpose |
|----------|------|---------|
| `pendingReviewId` | `string \| null` | When set, next `handleSend` is intercepted as review feedback instead of new message. |

### UI State

| Variable | Type | Purpose |
|----------|------|---------|
| `thinkSeconds` | `number` | Elapsed seconds counter shown while `sending`. |

### Refs (non-reactive)

| Ref | Type | Purpose |
|-----|------|---------|
| `autoMsgSent` | `boolean` | Prevents URL param auto-send from firing twice. |
| `msgEndRef` | `HTMLDivElement` | Scroll anchor at bottom of message list. |
| `slowIntervalRef` | timer handle | Holds the slow-phase poll interval for cleanup. |
| `pollStoppedRef` | `boolean` | Set to `true` when polling stops; prevents stale callbacks from re-triggering. |

### `useApiData` Hooks

```typescript
// All conversations for current user
const { data: convData, refresh: refreshConvs } = useApiData(() => getConversations(), []);

// Message history for active conversation
const { data: msgData, refresh: refreshMsgs, setData: setMsgData } = useApiData(
  () => ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false }),
  [ac]
);

// Skills list (loaded once)
const { data: skillsData } = useApiData(() => listSkills(), []);

// AI providers and models (loaded once)
const { data: providerData } = useApiData(() => listProviders(), []);
```

---

## 4. Polling Logic (3-Phase Adaptive)

Polling is active when `sending === true` AND `ac !== null`.

```
T=0ms       Request sent, setSending(true)
T=800ms     First poll fires (initial delay)
T=800ms+    Fast phase: poll every 1200ms
T=8000ms    Switch to slow phase: poll every 3000ms
T=120000ms  Hard timeout: setSending(false) regardless
```

### Stop Conditions (evaluated on each poll response)

Checked in priority order. Any match → `pollStoppedRef.current = true` + `setSending(false)`.

1. **`agentDone`** — last agent message has status in `[done, completed, failed]` OR phase in `[completed, Ferdig, Feilet]`
2. **`agentWaiting`** — last agent message has status in `[waiting, needs_input]` (review gate)
3. **`hasRealReply`** — an assistant chat message (non-JSON content) appears after the last user message
4. **Hybrid case** — last agent message is present but no following chat message (agent finished without chat reply)

### Content Hash Optimization

To avoid unnecessary re-renders, poll responses are compared via hash before updating state:

```typescript
const newHash = data.messages
  .map(m => `${m.id}:${(m.content || "").substring(0, 80)}:${m.messageType}`)
  .join("|");
if (newHash !== oldHash) setMsgData({ ...data });
```

### Implementation Risk

`slowIntervalRef` is stored in a **ref**, not managed by React's cleanup. If the component unmounts while polling, the slow interval must be cleared manually in the cleanup function. This is fragile — extracting polling into a hook must return all 4 handles (2 timeouts + 2 intervals) for cleanup.

---

## 5. `pendingReviewId` Flow

```
User clicks "Request Changes" in AgentStream (without pre-typed text)
  → setPendingReviewId(reviewId)
  → focus ChatInput
  → ChatInput placeholder changes to "Skriv feedback til agenten..."

User types feedback and submits
  → handleSend() fires
  → if (pendingReviewId) {
      await requestReviewChanges(pendingReviewId, text)  // ← intercepted path
      setPendingReviewId(null)
    } else {
      await sendMessage(ac, text, options)                // ← normal path
    }
```

This is **intentionally coupled** to `handleSend`. The interception happens at the send layer, not at the input level. Do not extract this without accepting prop-drilling `pendingReviewId` down into `ChatInput` — which would break its generic interface.

**Other review actions** (Approve, Reject) are called directly from AgentStream and do not intercept the send flow:

```typescript
onApprove: async (reviewId) => {
  await approveReview(reviewId);
  refreshMsgs();
}

onReject: async (reviewId) => {
  await rejectReview(reviewId);
  refreshMsgs();
}
```

---

## 6. Redirect / Navigation Behavior

### Overview → Chat

```typescript
// dashboard/page.tsx ChatComposer onSubmit
router.push(`/chat?msg=${encodeURIComponent(msg)}&repo=${repoName}&skills=${ids}&subagents=1`)
```

### Chat Page: URL Params → State (one-shot)

```typescript
const autoMsg = searchParams.get("msg");

useEffect(() => {
  if (autoMsg && !autoMsgSent.current) {
    autoMsgSent.current = true;  // prevents double-fire

    const repoParam   = searchParams.get("repo");
    const skillsParam = searchParams.get("skills");
    const subagents   = searchParams.get("subagents") === "1";

    if (skillsParam) setSelectedSkillIds(skillsParam.split(",").filter(Boolean));
    if (subagents)   setSubAgentsEnabled(true);

    const convId = repoParam
      ? repoConversationId(repoParam)
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setAc(convId);
    // optimistic message + sendMessage() call
  }
}, [autoMsg]);
```

### Chat → Chat (conversation switching)

Pure state — no URL change:

```typescript
// Click conversation in sidebar
setAc(conversationId);
setNewChat(false);

// Click "New Chat"
setAc(null);
setNewChat(true);
```

**There is no URL-based routing for individual conversations.** Refreshing the page returns to the new-chat composer.

---

## 7. Message Rendering

### Message Types

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_status" | "agent_thought" | "agent_progress"
             | "agent_report" | "task_start" | "context_transfer";
  metadata?: string;  // JSON: { model, cost, tokens }
  createdAt: string;
}
```

`isAgentMessage(m)` returns true when `messageType` is one of the agent types OR content starts with `"{"`.

### Three Render Paths

**User message**
- Right-aligned bubble
- Raw text content
- Timestamp (HH:MM, `nb-NO` locale — hardcoded)

**Assistant chat message**
- Left-aligned, no bubble
- Formatted text content
- Metadata row: timestamp, model name, cost, token count (parsed from JSON `metadata` field)

**Agent message → `AgentStream` component**
- JSON content parsed into `AgentProgress` object
- Renders: phase label with shimmer if active, step checklist, report card, questions, concerns
- Review UI (Approve / Reject / Request Changes buttons) when `status === "waiting"` and `report.reviewId` present

### Agent Message Deduplication + Merging

Only the **last** agent message in the conversation is rendered (all preceding agent messages are dropped). Additionally, the last agent message may be **merged** under the chat message that immediately precedes it instead of rendering standalone.

```typescript
const lastAgentIdx = msgs.findLast((m) => isAgentMessage(m));
const deduped = msgs.filter((m, i) => !isAgentMessage(m) || i === lastAgentIdx);

const lastAgentMsg = deduped.find(m => isAgentMessage(m));
const mergeUnderChatId = lastAgentMsg
  ? findPrecedingChatMessage(deduped, lastAgentMsg)?.id
  : null;

// In the render map:
// Case A: Standalone agent message (no preceding chat message)
//   → render AgentStream directly
// Case B: Merged (chat message immediately precedes agent message)
//   → render chat bubble, then AgentStream beneath it
```

This creates **two separate AgentStream renders** in the component — the primary source of review handler duplication.

---

## 8. Duplicated Logic

### HIGH SEVERITY: Message Sending (3×)

The same pattern appears in three places:

1. `startNewChat()` — when user submits from composer within chat page
2. `handleSend()` — when user submits from input in active conversation
3. URL param auto-send effect — on mount when `?msg` param present

Each contains:
- Optimistic message creation + state update
- `sendMessage()` call
- `refreshConvs()` call
- Error catch + error parsing

### HIGH SEVERITY: Error Parsing (3×)

```typescript
const lower = msg.toLowerCase();
if (lower.includes("credit") || lower.includes("payment")) setChatError("...");
else if (lower.includes("rate limit")) setChatError("...");
else if (lower.includes("api key") || lower.includes("authentication")) setChatError("...");
else if (lower.includes("context length") || lower.includes("too long")) setChatError("...");
else setChatError(msg);
```

This block appears verbatim in all 3 send locations.

### MEDIUM SEVERITY: Review Handlers (2×)

```typescript
// Both AgentStream renders include identical:
onApprove: async (reviewId) => {
  try { await approveReview(reviewId); refreshMsgs(); }
  catch (e) { /* handle */ }
},
onReject: async (reviewId) => {
  try { await rejectReview(reviewId); refreshMsgs(); }
  catch (e) { /* handle */ }
},
onRequestChanges: (reviewId, feedback) => {
  if (feedback) {
    requestReviewChanges(reviewId, feedback).then(refreshMsgs);
  } else {
    setPendingReviewId(reviewId);
    // focus input
  }
},
```

### LOW SEVERITY: Conversation ID Generation (2×)

```typescript
// Appears in startNewChat() and in URL param effect:
const convId = repoParam
  ? repoConversationId(repoParam)
  : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

---

## 9. Widget Extraction Recommendations

### Extract Immediately (Low Risk, High Impact)

**A. `parseAndSetChatError(e, setter)` utility**

File: `frontend/src/lib/chat-errors.ts`

```typescript
export function parseAndSetChatError(e: unknown, setter: (msg: string | null) => void): void {
  const msg = e instanceof Error ? e.message : "Noe gikk galt";
  const lower = msg.toLowerCase();
  if (lower.includes("credit") || lower.includes("payment")) {
    setter("Kontoen mangler kreditt. Gå til innstillinger for å legge til betalingsmetode.");
  } else if (lower.includes("rate limit")) {
    setter("For mange forespørsler. Vent litt og prøv igjen.");
  } else if (lower.includes("api key") || lower.includes("authentication")) {
    setter("API-nøkkel mangler eller er ugyldig. Sjekk innstillinger.");
  } else if (lower.includes("context length") || lower.includes("too long")) {
    setter("Meldingen er for lang. Prøv å dele opp oppgaven.");
  } else {
    setter(msg);
  }
}
```

Eliminates 3 duplicate error-parsing blocks.

---

**B. `createConversationId(repo?)` utility**

File: `frontend/src/lib/conversation-ids.ts`

```typescript
import { repoConversationId } from "./api";

export function createConversationId(repoName?: string | null): string {
  return repoName
    ? repoConversationId(repoName)
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

Eliminates 2 duplicate ID generation blocks.

---

### Extract After (Medium Complexity)

**C. `useChatSend(ac, options)` hook**

Bundles: `sending`, `chatError`, optimistic update, `sendMessage()`, `refreshConvs()`.

```typescript
function useChatSend(ac: string | null, refreshConvs: () => void) {
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const send = useCallback(async (
    convId: string,
    text: string,
    options: SendOptions,
    optimisticMsg?: Message
  ) => {
    setChatError(null);
    if (optimisticMsg) {
      setMsgData(prev => ({ messages: [...(prev?.messages ?? []), optimisticMsg], hasMore: false }));
    }
    setSending(true);
    try {
      await sendMessage(convId, text, options);
      refreshConvs();
    } catch (e) {
      parseAndSetChatError(e, setChatError);
      setSending(false);
    }
  }, [refreshConvs]);

  return { sending, setSending, chatError, setChatError, send };
}
```

Replaces 3 duplicate send flows. Requires `setMsgData` to be passed in or managed externally.

---

**D. `usePollingEffect(deps, onPoll, config)` hook**

```typescript
interface PollingConfig {
  fastInterval?: number;   // default 1200ms
  slowInterval?: number;   // default 3000ms
  switchAt?: number;       // default 8000ms
  maxDuration?: number;    // default 120000ms
}

function usePollingEffect(
  active: boolean,
  onPoll: () => Promise<void>,
  config?: PollingConfig
) {
  const pollStoppedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    pollStoppedRef.current = false;

    const { fastInterval = 1200, slowInterval = 3000, switchAt = 8000, maxDuration = 120000 } =
      config ?? {};

    const initialDelay = setTimeout(async () => {
      await onPoll();
      if (pollStoppedRef.current) return;

      const fastHandle = setInterval(onPoll, fastInterval);

      const switchHandle = setTimeout(() => {
        clearInterval(fastHandle);
        const slowHandle = setInterval(onPoll, slowInterval);
        // store for cleanup
      }, switchAt);

      const maxHandle = setTimeout(() => {
        pollStoppedRef.current = true;
        // caller must handle setSending(false)
      }, maxDuration);

      return () => {
        clearInterval(fastHandle);
        clearTimeout(switchHandle);
        clearTimeout(maxHandle);
      };
    }, 800);

    return () => {
      pollStoppedRef.current = true;
      clearTimeout(initialDelay);
    };
  }, [active, onPoll, config]);

  return pollStoppedRef;
}
```

Extracts interval management out of the page component. `onPoll` callback still reads message state from page scope.

---

**E. `useProcessedMessages(rawMessages)` hook**

Encapsulates deduplication + merge detection:

```typescript
function useProcessedMessages(rawMessages: Message[]) {
  return useMemo(() => {
    const lastAgentIdx = rawMessages.findLastIndex(m => isAgentMessage(m));
    const deduped = rawMessages.filter((m, i) => !isAgentMessage(m) || i === lastAgentIdx);

    const lastAgentMsg = deduped.find(m => isAgentMessage(m));
    const precedingChat = lastAgentMsg
      ? findPrecedingChatMessage(deduped, lastAgentMsg)
      : null;

    return {
      messages: deduped,
      lastAgentMsg,
      mergeUnderChatId: precedingChat?.id ?? null,
      isAgentStandalone: (id: string) => id === lastAgentMsg?.id && !precedingChat,
      isChatWithMergedAgent: (id: string) => id === precedingChat?.id,
    };
  }, [rawMessages]);
}
```

Makes render logic purely presentational. Enables isolated testing of the merge algorithm.

---

**F. Consolidate two AgentStream renders → `<MessageWithAgent>`**

Current: Two separate AgentStream renders in the message map (standalone + merged).  
Target: One render path, one set of review handlers.

```typescript
function MessageWithAgent({
  agentMessage,
  precedingChatMessage,
  onApprove,
  onReject,
  onRequestChanges,
}: MessageWithAgentProps) {
  return (
    <>
      {precedingChatMessage && <ChatBubble message={precedingChatMessage} />}
      <AgentStream
        message={agentMessage}
        onApprove={onApprove}
        onReject={onReject}
        onRequestChanges={onRequestChanges}
      />
    </>
  );
}
```

This eliminates the review handler duplication entirely. Requires refactoring the message map loop.

---

### Do NOT Extract (Intrinsically Coupled)

| Coupling | Why |
|----------|-----|
| `pendingReviewId` + `handleSend` interception | Intentional send-layer override. Extracting requires prop-drilling into `ChatInput`, breaking its generic interface. Document instead. |
| `ac` + `sending` together | They jointly drive the polling `useEffect`. Separating them creates race conditions in cleanup. |
| URL param → initial state hydration | One-shot with `autoMsgSent` ref guard. Extracting adds indirection without benefit. |
| Skill/model selection state | Should NOT be moved to URL params — too chatty. Should NOT be moved to context — not truly global. Lives correctly in page state. |

---

## 10. Risks and Gotchas

### Critical

**Polling cleanup is fragile.**  
`slowIntervalRef` is stored in a ref outside React's cleanup lifecycle. If the component unmounts while in the slow-poll phase, the interval is not automatically cleared. When extracting polling to a hook, all 4 handles (initial timeout, fast interval, switch timeout, slow interval) must be returned to the cleanup function.

**Test:** Navigate away from chat while an agent is responding. Verify no further network requests fire after navigation.

---

**Optimistic messages use random IDs.**  
The locally-created optimistic message has an ID from `crypto.randomUUID()`. The backend creates its own ID. If deduplication ever switches from content-hash to ID-matching, messages will appear twice. The current content-hash strategy is correct — do not change it.

---

### Medium

**`pendingReviewId` does not survive navigation.**  
If the user clicks "Request Changes", then navigates to another page, `pendingReviewId` is lost. This is acceptable — the review workflow requires staying in the conversation. Do not persist `pendingReviewId` to URL params (it would expose review IDs in browser history and break on page reload).

---

**Two AgentStream renders must stay in sync.**  
Until the consolidation (Recommendation F) is done, any change to review handler logic must be applied in **both** render paths. This is the primary maintenance risk of the current structure.

---

### Low

**Timestamp locale is hardcoded to `nb-NO`.**  
```typescript
toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
```
Acceptable now. Flag for when i18n is added — all timestamp formatters must be updated together.

---

**Agent message parsing is silently defensive.**  
`parseProgress()` catches all errors and returns `null`. On failure, the raw JSON string is shown to the user. No error is logged. Add `log.warn` or a monitoring hook for production observability.

---

**Skill selection persists across conversation switches.**  
When the user switches to a different conversation, `selectedSkillIds` and `subAgentsEnabled` are **not** reset. This may be unexpected — a user could accidentally send skills from a previous conversation context. Consider whether to reset on conversation change.

---

## 11. Summary Table

| Area | Status | Action |
|------|--------|--------|
| Error parsing | 3× duplicated | Extract `parseAndSetChatError` utility |
| Message sending flow | 3× duplicated | Extract `useChatSend` hook |
| Review handlers | 2× duplicated | Consolidate via `<MessageWithAgent>` component |
| Conversation ID generation | 2× duplicated | Extract `createConversationId` utility |
| Polling logic | Centralized but fragile | Extract `usePollingEffect` hook with full cleanup |
| Message deduplication | Centralized | Extract `useProcessedMessages` hook |
| `pendingReviewId` coupling | Intentional | Document, do not extract |
| `ac` + `sending` coupling | Necessary | Do not separate |
| Timestamp locale | Hardcoded | Flag for i18n pass |
| Agent parse errors | Silent | Add observability |
