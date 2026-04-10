# ADR-002: Domain module split for frontend API layer

**Status:** Accepted

## Context

The frontend originally had a single `lib/api.ts` file that grew to several hundred lines as TheFold added services (tasks, chat, agent, memory, skills, projects). This caused:
- Slow TypeScript type-checking (entire file re-checked on any change)
- Merge conflicts when multiple features touched the same file
- No clear ownership boundary between domains
- Import bloat (every page imported everything even if it only needed tasks)

## Decision

Split `lib/api.ts` into domain-specific modules under `lib/api/`:

```
lib/api/
  index.ts      ← barrel re-export (backwards compat)
  client.ts     ← apiFetch, circuit breaker, API_BASE
  chat.ts       ← Message, ConversationSummary, sendMessage, getChatHistory…
  tasks.ts      ← TheFoldTask, LinearTask, listTheFoldTasks, createTask…
  agent.ts      ← CodeReview, AuditLogEntry, listAuditLog, getReview…
  memory.ts     ← Memory types, searchMemory, storeMemory…
  skills.ts     ← Skill types, listSkills, createSkill…
  builder.ts    ← BuildJob types, getBuildJobs…
  auth.ts       ← listRepos, getUserProfile…
  projects.ts   ← Project types derived from tasks
```

The barrel `index.ts` re-exports everything so existing imports continue to work without changes.

## Consequences

**Positive:**
- Each page imports only the domain it needs → smaller bundles, faster incremental type-checking
- Domain modules are individually testable (see `tests/contract/api-modules.test.ts`)
- Clear ownership: chat features → `chat.ts`, task features → `tasks.ts`
- Adding a new service requires creating one new file, not touching a shared monolith

**Negative / Trade-offs:**
- Slightly more files to navigate
- The barrel re-export means bundle size doesn't decrease unless pages use direct imports (`@/lib/api/tasks` instead of `@/lib/api`)
- Interface definitions duplicated at the boundary (frontend types ↔ Encore-generated types) — mitigated by Encore's `gen client` capability

**Migration path:**
Existing `import { ... } from "@/lib/api"` imports continue to work unchanged via the barrel. New code should import from the specific module.
