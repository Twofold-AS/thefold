# TheFold Frontend — Comprehensive Fix Plan

**Date:** 2026-04-13
**Status:** Awaiting approval before any code changes

---

## Summary of Audit

I've reviewed every page source file, taken screenshots, and traced through component trees. Below is a categorized list of every issue found, organized by priority.

---

## CRITICAL BUGS (Breaks functionality)

### Bug 1: AegisSpinner not visible — duplicate "Tenker..." boxes
**Where:** `AgentStatusBar.tsx` → used in `MessageList.tsx` line 254
**Root cause:** AgentStatusBar shows AegisSpinner + "Tenker..." text, BUT there's ALSO a separate `TypingIndicator` at line 251 that shows "Tenker..." for direct chat (non-agent). The problem is both can render simultaneously depending on timing. Additionally, `ThinkingBlock.tsx` shows its own "Tenker…" with a brain emoji when agent thought messages come through. So the user sees up to THREE "thinking" indicators at once.
**Fix:** 
- Make AgentStatusBar and TypingIndicator mutually exclusive (they already have guards but timing of `activeTaskId` being set can cause both to flash)
- Verify `ThinkingBlock` doesn't duplicate the status bar
- Ensure AegisSpinner CSS animation `aegisRotate` isn't being overridden by any parent styles
- Test: send a message that triggers agent, verify exactly ONE spinner shows

### Bug 2: Review flow — no "Godkjenner..." loading state, button reappears
**Where:** `AgentStream.tsx` lines 496-529, `useReviewFlow.ts`, `chat/page.tsx`
**Root cause:** When user clicks "Godkjenn ✓", the `handleApprove` in AgentStream sets local `reviewAction` state to "approve" and shows "Godkjenner...", but the SSE stream and polling keep refreshing messages. Each refresh re-renders the AgentStream component with fresh data, resetting the local `reviewAction` state back to null. So the loading state disappears and the button reappears.
**Fix:**
- Move approve/reject loading state UP to the chat page level (or useReviewFlow hook) so it persists across message refreshes
- When approve is clicked, set a page-level `reviewInProgress` flag that prevents re-rendering the buttons
- After approve completes, refresh messages to show the PR link
- Add a proper "Godkjenner..." full-width loading state that replaces the buttons entirely
- Stop SSE polling during review action

### Bug 3: Chat keeps updating during review
**Where:** `chat/page.tsx` lines 141-145, 148-152
**Root cause:** Two polling mechanisms run while `sending=true`:
  1. Line 141: interval polls every 8s while `activeTaskId` is set  
  2. Line 148: trailing refreshes at 2s, 8s, 20s, 60s after sending stops
  
  When `streamStatus === "pending_review"`, line 133 sets `sending=false`, which triggers the trailing refreshes. These refreshes re-render messages, causing the chat to "keep updating."
**Fix:**
- When entering review state, skip trailing refreshes
- Add a `reviewMode` state that suppresses auto-refresh
- Only refresh after explicit user action (approve/reject/request changes)

---

## HIGH PRIORITY (Visual/UX issues user specifically complained about)

### Issue 4: ProactiveSuggestions takes too much space
**Where:** `chat/page.tsx` line 455, `ProactiveSuggestions.tsx`
**Current:** Renders above ChatContainer, can show up to 4 items in compact mode with headers, pushing actual chat content down significantly.
**Fix:**
- Move ProactiveSuggestions INSIDE the empty chat state (ChatComposer) instead of above the active conversation
- Or: collapse to a single-line hint that expands on click
- Or: remove from active conversations entirely, only show in new chat state

### Issue 5: Three unclear icons under chat input (+, sub-agents, skills)
**Where:** ChatContainer → MessageInput component
**Problem:** User doesn't know what +, brain icon, and sparkle icon do
**Fix:**
- Add tooltips on hover
- Consider removing the + button if it's redundant with the text input
- Label icons or use a single "options" button that reveals a dropdown

### Issue 6: Skeleton loaders don't match page layouts
**Where:** `Skeleton.tsx` and `LoadingSkeleton.tsx` — generic gray bars
**Problem:** Every page shows the same generic shimmer bars regardless of actual content layout
**Fix:**
- Create page-specific skeleton layouts for:
  - Dashboard (bento grid placeholder)
  - Chat (message area placeholder)
  - Tasks (table row placeholders)
  - Memory (card grid placeholder)
- Keep the generic Skeleton for small inline uses

### Issue 7: Color scheme issues
**Where:** `tokens.ts` — Octet palette
**Problem:** User said "fargene er ikke fine" and site "ser helt jævlig ut"
**Assessment:** The Octet palette itself (dark bg, muted accents) is fine for a dev tool. The issue is likely contrast problems — some text is too faint, some borders invisible, stat numbers were wrong color (fixed), and the overall feel is "unfinished."
**Fix:**
- Audit all text colors: ensure T.textMuted has enough contrast on T.surface
- Ensure borders are visible but subtle
- Review T.accent (#b7cae2) usage — may need a stronger accent for interactive elements
- Check that active/hover states are clearly distinguishable

---

## MEDIUM PRIORITY (Polish and cleanup)

### Issue 8: HuginnTopline still imported but not rendered
**Where:** `chat/page.tsx` line 8 — `import HuginnTopline`
**Fix:** Remove the unused import. The component file can stay for now.

### Issue 9: CommandPalette triggers dream with raw fetch
**Where:** `chat/page.tsx` line 515 — `fetch("/api/memory/dream")` without auth
**Fix:** Replace with `apiFetch("/memory/dream", { method: "POST" })` like we fixed on the Dreams page.

### Issue 10: Innstillinger tabs navigerer bort fra siden
**Where:** `innstillinger/page.tsx` lines 394-396
**Root cause:** Clicking AI-modeller, Integrasjoner, or MCP tabs does `router.push()` to separate pages (`/settings/models`, `/integrasjoner`, `/innstillinger/mcp`). These pages render standalone without the Innstillinger TabBar, so user loses the horizontal menu and has no way back except clicking sidebar.
**Fix:**
- STOP using router.push for these tabs
- Extract the content from `/settings/models/page.tsx`, `/integrasjoner/page.tsx`, `/innstillinger/mcp/page.tsx` into reusable components
- Import and render those components inline within the Innstillinger tab view
- User keeps the horizontal tab bar at all times
- PROMOTED TO SPRINT 1 (critical UX)

### Issue 11: NotifBell position
**Where:** `NotifBell.tsx` — opens upward from bottom of sidebar
**Status:** Already fixed to open upward. Verify it works well visually.

### Issue 12: Sidebar collapse button
**Where:** `layout.tsx` — toggle at top of sidebar
**Status:** Already fixed to stay at top. Verify no regression.

---

## IMPLEMENTATION ORDER

### Sprint 1: Fix critical bugs (est. 2-3 hours)
1. Fix duplicate "Tenker..." — make indicators mutually exclusive
2. Fix review flow loading state — lift state up, block re-renders during approve
3. Fix chat polling during review — add reviewMode guard
4. Verify AegisSpinner CSS animation renders correctly

### Sprint 2: UX fixes user complained about (est. 2-3 hours)  
5. Move/collapse ProactiveSuggestions
6. Add tooltips to chat input icons
7. Create page-specific skeleton loaders (dashboard, chat, tasks, memory)

### Sprint 3: Cleanup and polish (est. 1-2 hours)
8. Remove unused HuginnTopline import
9. Fix CommandPalette dream fetch
10. Color/contrast audit and fixes
11. Verify all navigation paths work (settings tabs → sub-pages → back)

### Sprint 4: Verification (est. 1 hour)
12. Click every button on every page in Chrome
13. Verify no console errors
14. Verify all loading states work
15. Screenshot final state of each page

---

## WHAT I WILL NOT CHANGE (to avoid breaking more things)
- Sidebar structure (7 items — confirmed working)
- Octet color palette base values (unless user requests specific changes)
- Backend API endpoints
- Component architecture
- Page routing structure
