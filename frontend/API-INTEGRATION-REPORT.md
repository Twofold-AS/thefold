# TheFold Frontend — API Integration Report

## Oversikt
Alle 12 dashboard-sider er koblet til backend API-endepunkter. Hardkodede data er erstattet med ekte API-kall via `useApiData` hook og funksjoner fra `@/lib/api.ts`.

## Build Status
**next build: OK** — Alle 16 sider kompilerer uten feil.

---

## Nye filer opprettet

| Fil | Beskrivelse |
|-----|-------------|
| `src/lib/hooks.ts` | `useApiData<T>()` — generisk hook for data-henting med loading/error/refresh |

---

## Sider oppdatert

### 1. Overview (`/`)
- **Stats:** `getTaskStats()` + `getCostSummary()` for tokens, kostnad, aktive tasks, success rate
- **Aktivitet:** `listTheFoldTasks({limit:4})` for siste aktivitet
- **Toggles:** localStorage-persist (agentMode, subAgents, private)
- **Unicode:** Fikset alle `\uXXXX` → norske tegn

### 2. Tasks (`/tasks`)
- **Liste:** `listTheFoldTasks()` erstatter hardkodede tasks
- **Detail:** `listReviews()` for kvalitetsrapport (qualityScore, fileCount)
- **Importer fra Linear:** `syncLinearTasks()` med refresh
- **Godkjenn/Avvis:** `approveReview()`, `requestReviewChanges()`, `rejectReview()` via reviewId
- **Relativ tid:** `timeAgo()` helper for createdAt → "2m", "1t", "3d"

### 3. Chat (`/chat`)
- **Samtaler:** `getConversations()` med filtrering (repo/privat via conv.id prefix)
- **Meldinger:** `getChatHistory(convId)` for aktiv samtale
- **Send:** `sendMessage()` med repo-tilkobling
- **Ny samtale:** Oppretter med `repoConversationId()` / `inkognitoConversationId()`
- **SearchParams:** `useSearchParams()` for auto-start (msg param), wrappet i Suspense
- **Agent-meldinger:** `AgentStream` for messageType som inneholder "agent"

### 4. Skills (`/skills`)
- **Liste:** `listSkills()` erstatter hardkodede skills
- **Mapping:** `name`, `executionPhase`, `priority`, `tokenEstimate`, `confidenceScore`, `totalUses`, `routingRules`
- **Toggle:** `toggleSkill(id, enabled)` med refresh
- **Stats:** Dynamisk telling av aktive skills

### 5. AI (`/ai`)
- **Providers:** `listProviders()` med nested modeller
- **Kostnad:** `getCostSummary()` for 7-dagers chart og daglig trend
- **Token-budsjett:** `getPhaseMetrics()` for fase-basert bruk
- **Modell-tabell:** Flatet fra providers.models med pris/tags/status

### 6. Komponenter (`/komponenter`)
- **Liste:** `listComponents()` erstatter hardkodede komponenter
- **Søk:** `searchComponents(query, category)` for filtrering
- **Bruk:** `useComponentApi(componentId, repo)` via "Bruk"-knapp
- **Filter:** Client-side filtrering på tags (frontend/backend)

### 7. MCP (`/mcp`)
- **Servere:** `listMCPServers()` erstatter hardkodede servere
- **Installer:** `installMCPServer(id)` med refresh
- **Avinstaller:** `uninstallMCPServer(id)` med refresh
- **Routing toggle:** localStorage-persist

### 8. Integrasjoner (`/integrasjoner`)
- **Liste:** `listIntegrations()` for tilkoblede tjenester
- **Statiske:** Linear, GitHub, Sentry, Vercel, Resend, Brave Search som faste entries
- **Koble til:** `saveIntegration()` for nye tilkoblinger
- **Stats:** Dynamisk beregning fra merged liste

### 9. Memory (`/memory`)
- **Stats:** `getMemoryStats()` for totalt antall, typer, relevans
- **Minner:** `searchMemories("", {limit:20})` for siste minner
- **Mapping:** `memoryType`, `sourceRepo`, `relevanceScore`, `accessCount`, `createdAt`
- **Kode-mønstre:** Filtrert fra minner med type "code_pattern"
- **Integritet:** Hardkodet (security display)

### 10. Monitor (`/monitor`)
- **Helse-sjekker:** `getMonitorHealth()` flatet fra repos-objekt
- **Healing:** `getHealingStatus()` for healing events
- **Stats:** Dynamisk beregning fra sjekk-resultater

### 11. Sandbox (`/sandbox`)
- **Kjøringer:** `listBuilderJobs()` erstatter hardkodede sandbox-runs
- **Detaljer:** `getBuilderJob(jobId)` for build-steg ved valg
- **Stats:** Dynamisk pass/warn/fail fra job-status

### 12. Innstillinger (`/innstillinger`)
- **Profil:** `getMe()` for navn, e-post, rolle, siste innlogging
- **Revoke:** `logout()` + redirect til /login
- **Toggles:** localStorage-persist for alle innstillinger
- **Feature flags:** Hardkodet (admin-only visning)
- **API-nøkler:** Hardkodet maskert (sikkerhet)

---

## Mønster brukt

```tsx
// Alle sider følger dette mønsteret:
import { useApiData } from "@/lib/hooks";
import { apiFunction } from "@/lib/api";

const { data, loading, error, refresh } = useApiData(() => apiFunction(), []);

// Loading state:
if (loading) return <span>Laster...</span>;

// Data med fallback:
const items = data?.items ?? [];
```

## Ikke endret
- Layout (`(dashboard)/layout.tsx`) — uendret
- Backend — ingen filer endret
- Design tokens / styling — kun inline styles, ingen endringer
- Delte komponenter — alle uendret
