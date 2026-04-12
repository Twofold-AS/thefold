# TheFold — Forbedringsplan v3 ADDENDUM

> 12. april 2026. Siste korreksjoner til FINAL-planen.
> Les FINAL først, deretter dette dokumentet.

---

## 1: Korrigert forståelse av Templates vs. Registry

### Feil i FINAL-planen
FINAL-planen behandler Templates som en "mal-velger for brukeren i Innstillinger".

### Riktig forståelse
**Templates** er Bootstrap-maler — ferdiglagde startpunkter (Contact Form, OTP Auth, Stripe Payment, REST CRUD, File Upload). Brukes av AI-en når den starter et nytt prosjekt fra scratch. Variabel-substitusjon ({{APP_NAME}}, {{EMAIL_TO}}) gjør dem tilpassbare. Disse er statiske scaffolds.

**Registry/Komponenter** er det selvlærende biblioteket. Livssyklusen:

```
1. Agent bygger kode for en oppgave
   ↓
2. Etter vellykket build → extractor.ts kjører automatisk
   ↓
3. AI analyserer filene, finner gjenbrukbare komponenter
   (filtrerer: min 10 linjer, max 500, kvalitet > 60/100)
   ↓
4. Komponenter registreres i registry med:
   - Kode, filer, avhengigheter, tags
   - quality_score (AI-vurdert)
   - used_by_repos[] (sporer hvor de er i bruk)
   ↓
5. Neste gang AI bygger noe lignende:
   - find-for-task søker registry
   - use-component henter koden
   - used_by_repos oppdateres
   ↓
6. Når en komponent oppdateres (ny versjon, bugfix):
   - trigger-healing ser på used_by_repos[]
   - Oppretter task per repo som bruker den
   - Agent fikser komponenten i alle repos
   ↓
7. Ukentlig vedlikehold (registry/healing.ts cron):
   - AI evaluerer alle komponenter med quality_score < 80
   - Foreslår forbedringer
   - Oppretter healing-tasks
```

### Hva dette betyr for planen

**Registry/Komponenter er IKKE en konfig-side.** Det er en sentral del av AI-ens intelligens — den lærer gjenbrukbare mønstre. Siden bør gi:

1. **Oversikt** over alle lærte komponenter med kvalitetsscore
2. **Bruk-sporing** — hvilke repos bruker hvilke komponenter
3. **Healing-historikk** — når ble komponenter fikset og hvor
4. **Manuell kontroll** — godkjenn/avvis komponenter, trigger healing
5. **Import** — mulighet for bruker å registrere egne komponenter

**Anbefaling:** Flytt Komponenter fra Innstillinger tilbake som del av Hukommelse-siden. De er del av "hjernen", ikke konfigurasjon.

### Oppdatert Hukommelse-side tabs

```
[Minner]  [Mønstre]  [Komponenter]  [Skills]  [Kunnskap]  [Kodeindeks]  [Manifester]
```

**Komponenter-tab (revidert):**

```
┌─ Komponenter — AI-lærte gjenbrukbare moduler ──────────────────┐
│                                                                │
│  Totalt: 12 | Snitt kvalitet: 78% | Healing aktiv: 2          │
│                                                                │
│  🔍 [Søk...]  [Alle ▼]  [Sorter: kvalitet ▼]                 │
│                                                                │
│  ┌─ AuthMiddleware ────────────────────── 92/100 ── v2 ──────┐│
│  │  JWT-validering med refresh-token-støtte                    ││
│  │  Filer: 2 (auth.ts, types.ts) · 145 linjer                ││
│  │  Tags: auth, jwt, middleware                                ││
│  │                                                             ││
│  │  Brukt i: webapp, api-server, mobile (3 repos)             ││
│  │  Siste healing: 8. apr → 3 repos oppdatert                ││
│  │                                                             ││
│  │  [Se kode]  [Healing-historikk]  [Oppdater alle 🔄]       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ APIErrorHandler ──────────────────── 71/100 ── v1 ───────┐│
│  │  Standardisert feilhåndtering for Encore.ts APIs           ││
│  │  Filer: 1 (error-handler.ts) · 67 linjer                  ││
│  │  Tags: api, error-handling                                  ││
│  │                                                             ││
│  │  Brukt i: webapp (1 repo)                                   ││
│  │  ⚠️ Kvalitet under 80 — vedlikehold planlagt              ││
│  │                                                             ││
│  │  [Se kode]  [Forbedre kvalitet 🔧]                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                │
│  Healing-pipeline (aktive):                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ AuthMiddleware v2 → webapp       ⏳ in_progress (bygger) │ │
│  │ AuthMiddleware v2 → api-server   ○  pending              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Kjør vedlikehold 🔧]  [Registrer komponent +]               │
└────────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Liste | `POST /registry/list` |
| Søk | `POST /registry/search` |
| Detalj | `GET /registry/get` med `{componentId}` |
| Bruk (med variabler) | `POST /registry/use-with-vars` |
| Trigger healing | `POST /registry/trigger-healing` med `{componentId}` |
| Healing-status | `GET /registry/healing-status` |
| Kjør vedlikehold | `POST /registry/maintenance/run` |
| Heal enkelt | `POST /registry/heal` med `{componentId}` |

**Templates forblir i Innstillinger** som bootstrap-konfigurasjon — de er statiske startmaler, ikke lærte komponenter.

---

## 2: Skills-status — komplett gjennomgang

### Hva fungerer i dag

| Feature | Status | Detaljer |
|---------|--------|---------|
| CRUD (create, update, delete, list, get, toggle) | ✅ Fungerer | Alle 6 endpoints eksisterer og er eksponert |
| `resolve()` — match skills til oppgave | ✅ Fungerer | Bruker routing_rules (keywords, file_patterns, labels), token-budsjettering, prioritetssortering |
| `buildSystemPromptWithPipeline()` — inject i prompts | ✅ Fungerer | Kalles fra ai/prompts.ts for chat, review, diagnose, plan, generate |
| `logResult()` — logg suksess/feil | ✅ Fungerer | Oppdaterer success_count, failure_count, confidence_score |
| Routing rules matching | ✅ Fungerer | Sjekker keywords i task-beskrivelse, file_patterns mot repo-filer, labels mot task-labels |
| Token-budsjettering | ✅ Fungerer | Sorterer skills etter prioritet, inkluderer til budsjett er brukt opp |
| Phase-filtrering | ✅ Fungerer | Filtrerer på taskPhase felt |

### Hva er STUBBET

| Feature | Status | Detaljer |
|---------|--------|---------|
| `executePreRun()` | 🟡 Stub | Returnerer `{results: inputs.map(() => ({passed: true, enrichedContext: ""}))}` — aldri kalt fra produksjonskode |
| `executePostRun()` | 🟡 Stub | Returnerer `{results: inputs.map(() => ({passed: true, feedback: ""}))}` — aldri kalt fra produksjonskode |
| `token_budget_max` kolonnen | 🟡 Ubrukt | Finnes i DB-schema men sjekkes aldri mot faktisk bruk |
| `appliesTo` felt i create-modal | 🔴 Mangler i UI | Backend har `scope` felt men frontend-modalen sender det ikke |
| Skills tag/category filtering | 🟡 Seedet men ubrukt | Kategorier seeded i DB men aldri brukt i frontend-filtrering |

### Hva planen sier (sjekk ✅)

| Plan-punkt | I FINAL? |
|-----------|---------|
| Fiks appliesTo i create-modal | ✅ Sprint 1, bug #3 |
| Edit-modal med alle felter | ✅ Sprint 2, Hukommelse Skills-tab |
| Delete-knapp | ✅ Sprint 2 |
| Debug: previewPrompt + resolveSkills | ✅ Sprint 2, Hukommelse Skills-tab |
| Aktiver pre_run/post_run | ❌ MANGLER |
| Aktiver token_budget_max sjekk | ❌ MANGLER |
| Aktiver skills category filtering | ❌ MANGLER |

### Nye tillegg for skills

**Aktiver executePreRun:**
- Kall `skills.executePreRun()` ETTER `skills.resolve()` men FØR AI-kall i `ai/prompts.ts`
- Pre-run skills kan validere input, berike kontekst, sjekke forutsetninger
- Resultat sendes som ekstra kontekst til AI-kallet

**Aktiver executePostRun:**
- Kall `skills.executePostRun()` ETTER AI har returnert svar
- Post-run skills kan kvalitetssjekke output, kjøre security scan, validere format
- Resultat logges og vises i chat som "Skill-vurdering"

**Aktiver token_budget_max:**
- I `resolve()`, sjekk total tokens brukt vs. `token_budget_max` (default 4000)
- Vis advarsel hvis budsjett overskrides

**Aktiver category filtering:**
- I frontend Skills-tab, legg til filter per kategori: framework, language, security, style, quality, general
- I resolve(), bruk category som ekstra matchingskriterium

---

## 3: UI-konsistens — designsystem-opprydding

### Nåværende tilstand: 73% konsistens

| Kategori | Score | Problem |
|----------|-------|---------|
| Farger (T.* tokens) | 95% | Svært konsistent, nesten alt bruker tokens |
| Tag/Badge | 90% | Konsistent Tag-komponent brukt overalt |
| Skeleton loading | 85% | God bruk av Skeleton-komponent |
| Knapper | 65% | Blanding av Btn-komponent og inline-styles |
| Modaler | 50% | Hver side implementerer sin egen modal |
| Spacing | 55% | Hardkodede pikselverdier varierer (16/20/24/32) |
| Typografi | 60% | Font-størrelser varierer (12-24px uten system) |
| Empty states | 70% | De fleste sider har det, men ulikt format |
| Error states | 40% | Inkonsistent — noen sider har retry, andre ikke |
| Tabeller/lister | 50% | Blanding av grid, flexbox, tabeller uten felles mønster |

### Plan for UI-opprydding

#### Fase 1: Delte komponenter (Sprint 2)

Opprett/forbedre disse komponentene i `frontend/src/components/`:

**1. Modal.tsx (NY — erstatter alle inline modaler)**
```typescript
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  width?: "sm" | "md" | "lg"  // 400 / 560 / 720px
  children: React.ReactNode
  footer?: React.ReactNode
}
```
Erstatter: task create modal, skill create modal, MCP config modal, integration config modal, model add modal, review feedback modal.

**2. EmptyState.tsx (NY)**
```typescript
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```
Erstatter: alle "Ingen data"-meldinger med konsistent layout.

**3. ErrorState.tsx (NY)**
```typescript
interface ErrorStateProps {
  message: string
  retry?: () => void
  dismiss?: () => void
}
```
Erstatter: alle inline feilmeldinger. Alltid med retry-knapp.

**4. DataTable.tsx (NY)**
```typescript
interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (item: T) => void
  selectable?: boolean
}
```
Erstatter: task-liste, review-liste, audit-logg, memory-liste, cron-tabell.

**5. StatCard.tsx (NY)**
```typescript
interface StatCardProps {
  label: string
  value: string | number
  trend?: { direction: "up" | "down"; percent: number }
  onClick?: () => void
  color?: "default" | "success" | "warning" | "error"
}
```
Erstatter: alle stat-kort på dashboard, AI-side, memory-side, monitor-side.

**6. TabBar.tsx (NY)**
```typescript
interface TabBarProps {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}
```
Erstatter: alle inline tab-implementasjoner.

**7. ConfirmDialog.tsx (NY)**
```typescript
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: "danger" | "default"
  onConfirm: () => void
  onCancel: () => void
}
```
Erstatter: alle `window.confirm()` kall og inline bekreftelses-steg.

**8. Btn forbedring**
Eksisterende Btn-komponent utvides:
```typescript
interface BtnProps {
  variant: "primary" | "secondary" | "danger" | "ghost"
  size: "sm" | "md" | "lg"
  loading?: boolean       // ← MANGLER I DAG
  disabled?: boolean
  icon?: React.ReactNode  // ← MANGLER I DAG
  fullWidth?: boolean     // ← MANGLER I DAG
}
```

#### Fase 2: Spacing-system (Sprint 2)

Definer i `tokens.ts`:
```typescript
export const S = {
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 16,   // 16px
  lg: 24,   // 24px
  xl: 32,   // 32px
  xxl: 48,  // 48px
}
```

Erstatter alle hardkodede `padding: 20px`, `margin: 24px`, `gap: 16px` med `S.md`, `S.lg`, `S.md`.

#### Fase 3: Typografi-system (Sprint 2)

Definer i `tokens.ts`:
```typescript
export const F = {
  h1: { size: 24, weight: 700, lineHeight: 1.2 },
  h2: { size: 20, weight: 600, lineHeight: 1.3 },
  h3: { size: 16, weight: 600, lineHeight: 1.4 },
  body: { size: 14, weight: 400, lineHeight: 1.5 },
  small: { size: 12, weight: 400, lineHeight: 1.5 },
  mono: { size: 13, weight: 400, lineHeight: 1.5, family: T.mono },
}
```

#### Fase 4: Per-side opprydding (Sprint 3-5)

Når delte komponenter er på plass, oppdateres hver side:

| Side | Hva som oppdateres |
|------|-------------------|
| Oversikt | StatCard × 4, DataTable for reviews, EmptyState |
| Huginn | Modal for skills-velger, ErrorState for SSE-feil, ConfirmDialog for review |
| Muninn | Modal for rapport, StatCard for fremgang |
| Oppgaver | DataTable for oppgaveliste, Modal for create, TabBar, ConfirmDialog for slett |
| Drømmer | DataTable for drøm-logg, StatCard for stats, TabBar |
| Hukommelse | DataTable for minner/mønstre/kunnskap, TabBar, Modal for skills create/edit |
| Innstillinger | TabBar, Modal for alle config-dialoger, DataTable for cron/audit |

---

## 4: Fullstendig sjekkliste — alt som er i planen

### Funksjoner som beholdes (32 stk) ✅ Dekket i FINAL

### Halvferdige features å fikse (10 stk) ✅ Dekket i FINAL

### Tillegg fra FINAL (20 stk) ✅ Dekket

### Tillegg fra dette ADDENDUM (nye):

| # | Hva | Hvor | Sprint |
|---|-----|------|--------|
| A1 | Komponenter flyttes fra Innstillinger til Hukommelse | Hukommelse | 2 |
| A2 | Komponent-detalj med bruk-sporing + healing-historikk | Hukommelse → Komponenter | 2 |
| A3 | Aktiver executePreRun i skills pipeline | ai/prompts.ts | 3 |
| A4 | Aktiver executePostRun i skills pipeline | ai/prompts.ts | 3 |
| A5 | Aktiver token_budget_max sjekk | skills/engine.ts | 3 |
| A6 | Aktiver skills category filtering | Skills-tab | 2 |
| A7 | Modal.tsx — delt komponent | components/ | 2 |
| A8 | EmptyState.tsx — delt komponent | components/ | 2 |
| A9 | ErrorState.tsx — delt komponent | components/ | 2 |
| A10 | DataTable.tsx — delt komponent | components/ | 2 |
| A11 | StatCard.tsx — delt komponent | components/ | 2 |
| A12 | TabBar.tsx — delt komponent | components/ | 2 |
| A13 | ConfirmDialog.tsx — delt komponent | components/ | 2 |
| A14 | Btn loading/icon/fullWidth props | components/Btn.tsx | 2 |
| A15 | Spacing-system (S.*) i tokens.ts | lib/tokens.ts | 2 |
| A16 | Typografi-system (F.*) i tokens.ts | lib/tokens.ts | 2 |
| A17 | Per-side UI-opprydding med nye komponenter | Alle sider | 3-5 |

---

## 5: Oppdatert sprint-plan (endelig)

### Sprint 1 — Kritiske bugs + manglende endpoints (~8t)
Uendret fra FINAL.

### Sprint 2 — Sidestruktur + designsystem (~16t, opp fra 13t)
- Alt fra FINAL
- **+** Delte komponenter: Modal, EmptyState, ErrorState, DataTable, StatCard, TabBar, ConfirmDialog (A7-A13)
- **+** Btn forbedring (A14)
- **+** Spacing-system S.* (A15)
- **+** Typografi-system F.* (A16)
- **+** Komponenter flyttet til Hukommelse (A1-A2)
- **+** Skills category filtering (A6)

### Sprint 3 — Huginn (~16t)
- Alt fra FINAL
- **+** Aktiver pre_run/post_run i skills pipeline (A3-A4)
- **+** Aktiver token_budget_max (A5)
- **+** UI-opprydding med nye komponenter (A17)

### Sprint 4 — Drømmer + Hukommelse (~11t)
Uendret fra FINAL.

### Sprint 5 — Muninn BETA (~12t)
Uendret fra FINAL.

### Sprint 6 — Polish (~8t)
- Alt fra FINAL
- **+** Resterende UI-opprydding (A17)

**Total: ~71 timer (9-10 arbeidsdager)**

---

## 6: Filhierarki — alle plan-dokumenter

```
FORBEDRINGSPLAN-V3-FINAL.md         ← hoveddokument
FORBEDRINGSPLAN-V3-ADDENDUM.md      ← dette dokumentet (korreksjoner + UI-plan)
FORBEDRINGSPLAN-V3-OPPDATERT.md     ← superseded
FORBEDRINGSPLAN-V3.md               ← superseded
FORBEDRINGSPLAN-V2.md               ← superseded
FORBEDRINGSPLAN.md                  ← original (v1)
ÆRLIG-VURDERING.md                  ← uavhengig vurdering
```

**Les FINAL + ADDENDUM for komplett plan.**
