# TheFold Frontend Fix Plan

## Status Tracker
- [ ] Steg 1: Unicode-fix
- [ ] Steg 2: Shared hooks
- [ ] Steg 3: Overview → API
- [ ] Steg 4: Tasks → API
- [ ] Steg 5: Chat → API (privat/repo-modus)
- [ ] Steg 6: Skills → API
- [ ] Steg 7: AI → API
- [ ] Steg 8: Komponenter → API
- [ ] Steg 9: MCP → API
- [ ] Steg 10: Integrasjoner → API
- [ ] Steg 11: Memory → API
- [ ] Steg 12: Monitor → API
- [ ] Steg 13: Innstillinger → localStorage/API

---

## Steg 1: Unicode-fix

Søk-erstatt i alle `frontend/src/app/(dashboard)/*/page.tsx`:

| Escape | Tegn | Kontekst |
|--------|------|----------|
| `\u00e5` | å | Når, bestått, på, ennå |
| `\u00f8` | ø | støtte, utløpstid, kjør, Søk, Lør, Søn |
| `\u00e6` | æ | modulært, primær |
| `\u00e9` | é | (sjekk alle) |
| `\u2014` | — | em-dash |

Filer: page.tsx (overview), chat/page.tsx, tasks/page.tsx, skills/page.tsx, ai/page.tsx, komponenter/page.tsx

---

## Steg 2: Shared hooks & utils

Lag `frontend/src/lib/hooks.ts`:

```tsx
import { useState, useEffect, useCallback } from 'react'

export function useApiData<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Feil ved lasting')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh, setData }
}
```

---

## Steg 3: Overview → API

**Fil:** `frontend/src/app/(dashboard)/page.tsx`

**Hardkodet nå:**
- Stats: 12.4k tokens, $1.24, 3 tasks, 94%
- Aktivitet: 4 statiske elementer
- Toggles: onChange={() => {})

**Koble til:**
- `getTaskStats()` → aktive tasks, success rate
- `getCostSummary()` → tokens i dag, kostnad
- `listTheFoldTasks({ limit: 4 })` → siste aktivitet
- Toggles → localStorage preferences

---

## Steg 4: Tasks → API

**Fil:** `frontend/src/app/(dashboard)/tasks/page.tsx`

**Hardkodet nå:** 5 statiske tasks med fake kvalitetsrapporter

**Koble til:**
- `listTheFoldTasks()` → task-liste
- `getTask(id)` → detalj-panel
- `createTask()` → "Ny task" knapp
- `syncLinearTasks()` → "Importer fra Linear" knapp
- `approveReview(id)` → "Godkjenn" knapp
- `requestReviewChanges(id, feedback)` → "Be om endringer" knapp
- `rejectReview(id)` → "Avvis" knapp

---

## Steg 5: Chat → API (privat/repo-modus)

**Fil:** `frontend/src/app/(dashboard)/chat/page.tsx`

**VIKTIG:** To typer samtaler:
1. **Repo-samtaler** (offentlige) — synlige for alle brukere, knyttet til repo
2. **Private samtaler** — kun synlige for eieren

**Hardkodet nå:** 6 statiske samtaler, mock-meldinger

**Koble til:**
- `getConversations()` → samtale-liste (filtrer på privat/repo)
- `getChatHistory(id)` → meldinger for valgt samtale
- `sendMessage({ conversationId, content, repo, isPrivate })` → send melding
- Ny samtale oppretter via API med `isPrivate` flag
- Tabs: "Repo" viser offentlige, "Privat" viser brukerens egne

---

## Steg 6: Skills → API

**Fil:** `frontend/src/app/(dashboard)/skills/page.tsx`

**Hardkodet nå:** 6 statiske skills

**Koble til:**
- `listSkills()` → skill-liste
- `toggleSkill(id, enabled)` → toggle aktiv/deaktivert
- `updateSkill(id, data)` → "Rediger" knapp
- `createSkill(data)` → "Ny skill" knapp

---

## Steg 7: AI → API

**Fil:** `frontend/src/app/(dashboard)/ai/page.tsx`

**Hardkodet nå:** 4 providers, 4 modeller, fake kostnads-chart

**Koble til:**
- `listProviders()` → provider-kort (med nested modeller)
- `getCostSummary()` → 7-dagers kostnad chart
- `getPhaseMetrics()` → token-budsjett per fase
- `saveModel()` / `toggleModel()` → "Endre" knapp

---

## Steg 8: Komponenter → API

**Fil:** `frontend/src/app/(dashboard)/komponenter/page.tsx`

**Hardkodet nå:** 8 statiske komponenter

**Koble til:**
- `listComponents()` → komponent-liste
- `searchComponents(query)` → søk
- `useComponentApi(id)` → "Bruk" knapp

---

## Steg 9: MCP → API

**Fil:** `frontend/src/app/(dashboard)/mcp/page.tsx`

**Hardkodet nå:** 7 statiske MCP-servere

**Koble til:**
- `listMCPServers()` → server-liste
- `installMCPServer(id)` → "Installer" knapp
- `uninstallMCPServer(id)` → "Avinstaller" knapp
- `configureMCPServer(id, config)` → "Konfigurer" knapp

---

## Steg 10: Integrasjoner → API

**Fil:** `frontend/src/app/(dashboard)/integrasjoner/page.tsx`

**Hardkodet nå:** 8 statiske integrasjoner

**Koble til:**
- `listIntegrations()` → integrasjons-liste
- `saveIntegration(data)` → "Koble til" knapp
- `deleteIntegration(id)` → frakoblingslogikk

---

## Steg 11: Memory → API

**Fil:** `frontend/src/app/(dashboard)/memory/page.tsx`

**Hardkodet nå:** 6 minner, 4 kode-mønstre

**Koble til:**
- `searchMemories({ query: "", limit: 20 })` → minne-liste
- `getMemoryStats()` → top-metrikker (minner, mønstre, etc.)

---

## Steg 12: Monitor → API

**Fil:** `frontend/src/app/(dashboard)/monitor/page.tsx`

**Hardkodet nå:** 8 helse-sjekker, 4 healing events

**Koble til:**
- `getHealingStatus()` → healing pipeline data
- Helse-sjekker: behold hardkodet (monitor er cron-basert, ingen list-endpoint)
- "Kjør nå" → vis toast/melding

---

## Steg 13: Innstillinger → localStorage/API

**Fil:** `frontend/src/app/(dashboard)/innstillinger/page.tsx`

**Hardkodet nå:** Profil, auth, settings, API-nøkler, feature flags

**Koble til:**
- Profil: fra auth session data
- Toggles: lagre til localStorage, lese ved oppstart
- "Revoke alle tokens": kall `logout()` API
- Feature flags: behold hardkodet (admin-only visning)
- API-nøkler: behold maskert (sikkerhets-grunn)

---

## API-funksjoner som allerede finnes i `frontend/src/lib/api.ts`

Alle disse er ferdig implementert og klare til bruk:

```
// Chat
sendMessage, getChatHistory, getConversations, deleteConversation

// Tasks
listTheFoldTasks, createTask, getTask, getTaskStats, syncLinearTasks, cancelTask

// Reviews
getReview, listReviews, approveReview, requestReviewChanges, rejectReview

// Skills
listSkills, createSkill, updateSkill, toggleSkill, deleteSkill

// AI/Models
listProviders, listModels, saveProvider, saveModel, toggleModel, deleteModel

// Cost
getCostSummary, getPhaseMetrics, getTaskMetrics

// Memory
searchMemories, getMemoryStats, storeMemory

// MCP
listMCPServers, installMCPServer, uninstallMCPServer, configureMCPServer

// Komponenter
listComponents, searchComponents, useComponentApi, getHealingStatus

// Integrasjoner
listIntegrations, saveIntegration, deleteIntegration

// Auth
requestOtp, verifyOtp, logout
```

---

## Design-regler (IKKE endre)
- Tokens fra `@/lib/tokens` (T objekt)
- Font: Suisse Intl, Geist Mono, TheFold Brand
- Farger: Mørk tema, accent=#6366F1
- Layout: Sidebar + content, grid-basert
- Komponenter: Btn, Tag, Toggle, SectionLabel, GridRow, PixelCorners
