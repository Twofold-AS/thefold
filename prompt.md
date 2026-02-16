# Kostnads-dashboard, Skills-forenkling, Repo-header

## Instruksjoner

Les disse filene FØR du begynner — les HELE filen:
1. `skills/skills.ts` — HELE filen, alle endepunkter og queries
2. `skills/engine.ts` — resolve, executePreRun, executePostRun
3. `skills/migrations/` — Alle migrasjonsfiler, forstå tabellstrukturen
4. `frontend/src/app/(dashboard)/skills/page.tsx`
5. `frontend/src/app/(dashboard)/repo/[name]/` — Alle sider (oversikt, chat, oppgaver, aktivitet etc.)
6. `frontend/src/app/(dashboard)/repo/[name]/layout.tsx` — Repo-layout med header og tabs
7. `frontend/src/components/PageHeaderBar.tsx` — Header-komponent
8. `ai/ai.ts` — Se hvordan skills brukes i prompts, finn calculateCost
9. `chat/chat.ts` — Se hvordan kostnad lagres per melding

---

## DEL 1: KOSTNADS-DASHBOARD

### 1.1 Backend: Kostnads-aggregering

Legg til endepunkt i ai/ai.ts eller chat/chat.ts:

```typescript
export const getCostSummary = api(
  { method: "GET", path: "/chat/costs", expose: true, auth: true },
  async (): Promise<CostSummary> => {
    // Hent totale kostnader fra metadata i messages
    const today = await db.queryRow<{ total: number; tokens: number; count: number }>`
      SELECT 
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*) as count
      FROM messages 
      WHERE role = 'assistant' 
      AND metadata IS NOT NULL 
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE
    `;
    
    const thisWeek = await db.queryRow<{ total: number; tokens: number; count: number }>`
      SELECT 
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*) as count
      FROM messages 
      WHERE role = 'assistant' 
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('week', CURRENT_DATE)
    `;
    
    const thisMonth = await db.queryRow<{ total: number; tokens: number; count: number }>`
      SELECT 
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*) as count
      FROM messages 
      WHERE role = 'assistant' 
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
    `;
    
    // Per-modell breakdown
    const perModel = await db.query<{ model: string; total: number; tokens: number; count: number }>`
      SELECT 
        metadata->>'model' as model,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*) as count
      FROM messages 
      WHERE role = 'assistant' 
      AND metadata IS NOT NULL
      AND metadata->>'model' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY metadata->>'model'
      ORDER BY total DESC
    `;
    
    // Daily trend siste 14 dager
    const dailyTrend = await db.query<{ date: string; total: number; tokens: number }>`
      SELECT 
        created_at::date::text as date,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens
      FROM messages 
      WHERE role = 'assistant' 
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY created_at::date
      ORDER BY date ASC
    `;
    
    return { today, thisWeek, thisMonth, perModel, dailyTrend };
  }
);
```

### 1.2 Frontend: Kostnads-side

Opprett `frontend/src/app/(dashboard)/settings/costs/page.tsx`:

Vis:
- 3 kort i topp: I dag ($X.XX), Denne uken ($X.XX), Denne måneden ($X.XX)
- Per-modell tabell: Modell | Antall kall | Tokens | Kostnad
- 14-dagers trend som enkel bar-chart (CSS, ikke chart-bibliotek)
- Under hver AI-melding i chatten vises allerede tokens/kostnad (fra Prompt R)

Legg til "Kostnader" lenke i Settings-siden.

### 1.3 Budsjett-alert (enkel versjon)

I `processAIResponse` etter ai.chat():

```typescript
// Sjekk daglig kostnad
const dailyCost = await db.queryRow<{ total: number }>`
  SELECT COALESCE(SUM((metadata->>'cost')::numeric), 0) as total
  FROM messages WHERE role = 'assistant' AND metadata->>'cost' IS NOT NULL
  AND created_at >= CURRENT_DATE
`;

if (dailyCost && dailyCost.total > 5.0) {
  console.warn(`BUDGET ALERT: Daily cost $${dailyCost.total.toFixed(2)} exceeds $5.00`);
  // Kan legge til i AI-svar som info:
  // aiResponse.content += `\n\n*Obs: Daglig AI-kostnad er nå $${dailyCost.total.toFixed(2)}*`;
}
```

---

## DEL 2: SKILLS-FORENKLING

### Problem
Skills-systemet har 37 kolonner, 3 faser, kategorier, routing_rules, depends_on, conflicts_with — men det meste brukes ikke. Frontend viser hardkodede token-verdier. Scope kan bare velge "global" eller "TheFold" (hardkodet). Pipeline er overkomplisert for nåværende bruk.

### Løsning: Forenkle til det som FAKTISK brukes

#### 2.1 Backend: Forenkle resolve()

I skills/engine.ts resolve():
- Behold: scope-filter, enabled-filter, routing_rules keyword matching
- Fjern fra resolve-logikken (behold i DB for fremtiden): depends_on, conflicts_with, execution_phase groupering, token_budget_max
- Enklere flow: Hent alle enabled skills som matcher scope → filtrer på keywords → sorter på priority → returner

```typescript
export async function resolve(req: ResolveRequest): Promise<ResolveResponse> {
  // Hent alle enabled skills som matcher scope
  const allSkills = await db.query<Skill>`
    SELECT id, name, prompt_fragment, scope, priority, routing_rules, token_estimate
    FROM skills 
    WHERE enabled = true
    AND (scope = 'global' OR scope = ${`repo:${req.context}`})
    ORDER BY priority ASC
  `;
  
  // Filtrer på keywords fra task
  const matched = allSkills.filter(s => matchesRoutingRules(s.routing_rules, req.task));
  
  // Token-budsjett: summer opp og kutt når over
  let tokenBudget = req.totalTokenBudget || 4000;
  let tokenCount = 0;
  const selected = [];
  
  for (const skill of matched) {
    const estimate = skill.token_estimate || 200;
    if (tokenCount + estimate > tokenBudget) break;
    tokenCount += estimate;
    selected.push(skill);
  }
  
  return { skills: selected, totalTokens: tokenCount };
}
```

#### 2.2 Frontend skills-side: Forenkle UI

I skills/page.tsx — redesign:

**Fjern:**
- Pipeline-visualisering (pre_run → inject → post_run)
- Category badges
- Phase badges
- Confidence bar
- Token-visning per skill (var hardkodet)

**Behold/forbedre:**
- Grid med skill-kort
- Hver skill: navn, beskrivelse, on/off toggle, redigér-knapp
- "Ny skill" knapp som åpner enkel form

**Ny skill-form (forenklet):**
```
Navn:          [_______________]
Beskrivelse:   [_______________]
Prompt:        [_______________] (textarea — dette er det som injiseres i AI)
Aktiv:         [x]
Scope:         [Dropdown: Global / repo1 / repo2 / ...] ← Hent repoer fra GitHub
Keywords:      [_______________] (kommaseparert — triggere for auto-matching)
```

Fjern fra formen: category, phase, priority, depends_on, conflicts_with, tags, output_schema

#### 2.3 Scope-dropdown: Hent repoer dynamisk

I stedet for hardkodet "Global" / "TheFold":

```typescript
// Hent brukerens repoer fra GitHub
const repos = await listRepos(); // Allerede et endepunkt
const scopeOptions = [
  { value: "global", label: "Global (alle repoer)" },
  ...repos.map(r => ({ value: `repo:${r.name}`, label: r.name })),
];
```

#### 2.4 Fjern ubrukelige seeded skills

Slett skills som er "aktive" men ikke gjør noe nyttig. Sjekk hvilke skills som finnes i DB via seeds eller migrasjoner. Hvis de har generiske prompts som "Follow best practices" — de tilfører ingenting.

Behold KUN skills som har spesifikke, nyttige prompt_fragments. Legg til en migrasjon eller seed-cleanup:

```sql
-- Slett skills som er for generiske
DELETE FROM skills WHERE prompt_fragment LIKE '%best practices%' AND name NOT IN (...keep-list...);
```

Eller bedre: la det være opp til brukeren — men marker dem som disabled by default.

---

## DEL 3: REPO-HEADER REDESIGN

### Problem
- Sidebar-knapper dupliseres som tabs i headeren — dobbelt opp
- Headeren er ikke per-side
- Repo-helse viser "Ukjent"

### 3.1 Fjern tab-duplikat fra header

I `repo/[name]/layout.tsx`:
- FJERN tabs/celler i headeren som dupliserer sidebar-navigasjonen
- Headeren skal IKKE ha "Oversikt", "Chat", "Oppgaver", "Aktivitet" etc. — de er allerede i sidebar

### 3.2 Per-side header

Hver side under repo/[name]/ skal ha sin egen header med:
- Side-tittel (stor tekst)
- Repo-navn under (liten tekst, muted)
- Side-spesifikke handlingsknapper til høyre

#### Oversikt (repo/[name]/page.tsx):
```
┌────────────────────────────────────────────────────────────┐
│ Oversikt                                    [Repo-helse]   │
│ thefold-site                                Synkronisert ● │
└────────────────────────────────────────────────────────────┘

Innhold:
- Repo-info kort (språk, størrelse, siste commit)
- "Snarveier" kort med knapper: Chat, Oppgaver, Aktivitet, Innstillinger
```

#### Chat (repo/[name]/chat/page.tsx):
```
┌────────────────────────────────────────────────────────────┐
│ Chat                          [AI-modell ▾] [Skills ▾]     │
│ thefold-site                  [+ Ny samtale] [Slett]        │
└────────────────────────────────────────────────────────────┘
```
(Chat-headeren beholder modell/skills selectors som allerede er der)

#### Oppgaver (repo/[name]/tasks/page.tsx):
```
┌────────────────────────────────────────────────────────────┐
│ Oppgaver                      [+ Ny oppgave] [Sync Linear] │
│ thefold-site                                                │
└────────────────────────────────────────────────────────────┘
```

#### Aktivitet (repo/[name]/activity/page.tsx):
```
┌────────────────────────────────────────────────────────────┐
│ Aktivitet                                                   │
│ thefold-site                                                │
└────────────────────────────────────────────────────────────┘
```

### 3.3 Repo-helse i header

I oversikt-headeren, vis repo-helse:
- Hent siste health check fra monitor-servicen: `GET /monitor/health`
- Vis status:
  - "Synkronisert" med grønn dot → Siste commit synkronisert, ingen feil
  - "Advarsler" med gul dot → Noen health checks har warnings
  - "Problemer" med rød dot → Health checks feilet
  - "Ukjent" med grå dot → Ingen health check kjørt ennå

Kall monitor fra frontend:
```typescript
const health = await getRepoHealth(repoName);
// Vis basert på resultatet
```

Legg til `getRepoHealth` i api.ts hvis det ikke finnes.

### 3.4 Oversikt: Snarveier-kort

```tsx
<div style={{ border: "1px solid var(--border)" }}>
  <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
    <span className="text-sm font-medium">Snarveier</span>
  </div>
  <div className="grid grid-cols-2 gap-0">
    <Link href={`/repo/${name}/chat`} className="px-4 py-3 text-sm hover:bg-white/5" 
      style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      Chat med AI
    </Link>
    <Link href={`/repo/${name}/tasks`} className="px-4 py-3 text-sm hover:bg-white/5"
      style={{ borderBottom: "1px solid var(--border)" }}>
      Oppgaver
    </Link>
    <Link href={`/repo/${name}/activity`} className="px-4 py-3 text-sm hover:bg-white/5"
      style={{ borderRight: "1px solid var(--border)" }}>
      Aktivitet
    </Link>
    <Link href={`/repo/${name}/settings`} className="px-4 py-3 text-sm hover:bg-white/5">
      Innstillinger
    </Link>
  </div>
</div>
```

---

## OPPSUMMERING

| # | Hva | Prioritet |
|---|-----|-----------|
| 1 | getCostSummary endpoint | HØY |
| 2 | Kostnads-side i settings | HØY |
| 3 | Budsjett-alert i processAIResponse | MEDIUM |
| 4 | Skills resolve() forenkling | HØY |
| 5 | Skills frontend forenkling | HØY |
| 6 | Scope-dropdown med dynamiske repoer | HØY |
| 7 | Fjern/deaktiver ubrukelige seeded skills | MEDIUM |
| 8 | Repo-header: fjern tab-duplikat | HØY |
| 9 | Per-side header med tittel + repo-navn | HØY |
| 10 | Repo-helse i oversikt-header | MEDIUM |
| 11 | Oversikt: snarveier-kort | MEDIUM |
| 12 | Oppgaver: "Ny oppgave" + "Sync Linear" i header | HØY |

## Oppdater dokumentasjon
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

## Rapport
✅ Fullført, ⚠️ Ikke fullført, 🐛 Bugs, 📋 Antall filer endret
Svar på:
1. Hvor mange skills fantes i DB? Hvor mange ble deaktivert?
2. Hva viser scope-dropdown nå?
3. Hvilke tabs ble fjernet fra repo-headeren?