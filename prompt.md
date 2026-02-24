# Z-CLEANUP — Rename, flagg-opprydding, docs, testing

## KONTEKST

Z-HOTFIX er kjørt. Secrets satt, embedding migrert, testfeil fikset.
Denne prompten rydder opp i navngiving, feature flags, og docs.

Les først:
- CLAUDE.md
- GRUNNMUR-STATUS.md
- .claude/skills/thefold-verify/SKILL.md

---

## DEL 1: RENAME Z-PREFIXED FILER

Alle filer med `z-` prefix skal renames. Bruk `git mv` for å bevare historikk.
Etter rename: oppdater ALLE imports og referanser i hele prosjektet.

### Testfiler

```bash
git mv agent/z-confidence-question.test.ts agent/confidence-question.test.ts
git mv agent/z-sub-agent-display.test.ts agent/sub-agent-display.test.ts
git mv agent/token-policy.test.ts agent/token-policy.test.ts  # denne er OK allerede
git mv ai/z-dynamic-sub-agents.test.ts ai/dynamic-sub-agents.test.ts
git mv ai/provider-abstraction.test.ts ai/provider-abstraction.test.ts  # OK
git mv chat/z-review-from-chat.test.ts chat/review-from-chat.test.ts
git mv chat/progress-message.test.ts chat/progress-message.test.ts  # OK
git mv chat/z-performance.test.ts chat/performance.test.ts
git mv chat/z-legacy-cleanup.test.ts chat/legacy-cleanup.test.ts
git mv gateway/z-email.test.ts gateway/email.test.ts
git mv github/github-app.test.ts github/github-app.test.ts  # OK
git mv integrations/z-two-way.test.ts integrations/two-way.test.ts
git mv mcp/z-mcp-functional.test.ts mcp/mcp-functional.test.ts
git mv memory/z-openai-embeddings.test.ts memory/openai-embeddings.test.ts
git mv registry/z-component-library.test.ts registry/component-library.test.ts
git mv registry/z-healing.test.ts registry/healing.test.ts
git mv tasks/z-tasks-master.test.ts tasks/tasks-master.test.ts
git mv tasks/z-linear-sync.test.ts tasks/linear-sync.test.ts
git mv web/web.test.ts web/web.test.ts  # OK
```

Kjør dette for å finne alle:
```bash
find . -name "z-*" -not -path "*/node_modules/*" -not -path "*/.git/*"
```

### Migrasjonsfiler

Migrasjoner kan IKKE renames — Encore tracker dem ved filnavn. Hvis du endrer navn, tror Encore det er en ny migrasjon og kjører den på nytt.

**IKKE rename migrasjoner.** La dem stå som de er:
- `chat/migrations/6_z_performance_and_types.up.sql` — behold
- `tasks/migrations/3_z_external_id.up.sql` — behold
- `memory/migrations/8_z_embedding_dimension.up.sql` — behold
- `registry/migrations/2_z_merge_templates.up.sql` — behold
- `mcp/migrations/3_z_cleanup_servers.up.sql` — behold

### Etter rename

```bash
# Verifiser at ingen filer har z- prefix lenger (unntatt migrasjoner):
find . -name "z-*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/migrations/*"
# Bør returnere 0 resultater

# Verifiser at ingen imports refererer til gamle filnavn:
grep -rn "z-confidence-question\|z-sub-agent-display\|z-dynamic-sub-agents\|z-review-from-chat\|z-performance\|z-legacy-cleanup\|z-email\|z-two-way\|z-mcp-functional\|z-openai-embeddings\|z-component-library\|z-healing\|z-tasks-master\|z-linear-sync" --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules | grep -v .git
# Bør returnere 0 resultater
```

---

## DEL 2: FEATURE FLAG OPPRYDDING

### Rename Z-prefixed flags

Feature flags skal IKKE ha prosjekt-prefix. De beskriver HVA de gjør, ikke HVILKET prosjekt de kom fra.

| Gammelt navn | Nytt navn | Fil |
|-------------|-----------|-----|
| ZNewMessageContract | ProgressMessageEnabled | agent/messages.ts, chat/chat.ts |
| ZMultiProvider | MultiProviderEnabled | ai/provider-registry.ts |
| ZGitHubApp | GitHubAppEnabled | github/github-app.ts, github/github.ts |
| ZDynamicSubAgents | DynamicSubAgentsEnabled | ai/orchestrate-sub-agents.ts |
| ZHealingEnabled | HealingPipelineEnabled | registry/healing.ts |

For HVER flag:

1. Finn alle referanser:
```bash
grep -rn "ZNewMessageContract" --include="*.ts" | grep -v node_modules
```

2. Erstatt secret-deklarasjonen:
```typescript
// FRA:
const ZNewMessageContract = secret("ZNewMessageContract");
// TIL:
const ProgressMessageEnabled = secret("ProgressMessageEnabled");
```

3. Erstatt alle bruk:
```typescript
// FRA:
if (ZNewMessageContract() === "true") {
// TIL:
if (ProgressMessageEnabled() === "true") {
```

4. Sett nye secrets (kopier verdien fra gammel):
```bash
# Les gammel verdi, sett ny:
encore secret set ProgressMessageEnabled --type prod
encore secret set MultiProviderEnabled --type prod
encore secret set GitHubAppEnabled --type prod
encore secret set DynamicSubAgentsEnabled --type prod
encore secret set HealingPipelineEnabled --type prod
```

### Fjern ubrukte flags

Sjekk om disse fortsatt har referanser:
```bash
grep -rn "SkillsPipelineEnabled" --include="*.ts" | grep -v node_modules
grep -rn "AgentModular" --include="*.ts" | grep -v node_modules
```

Hvis ingen referanser: ignorer (de finnes ikke i kode).
Hvis referanser: fjern dem — all kode skal bruke ny modulær path.

### Oppdater thefold-verify STEG 4

Erstatt hele feature flag-tabellen i `.claude/skills/thefold-verify/SKILL.md`:

```markdown
| Flag | Default | Tjeneste | Beskrivelse |
|------|---------|----------|-------------|
| AgentStateMachineStrict | false | agent | Strikt state-validering |
| MonitorEnabled | false | monitor | Monitoring cron-jobber |
| MCPRoutingEnabled | false | mcp | MCP tool-routing til agent |
| SandboxAdvancedPipeline | false | sandbox | Avansert sandbox-pipeline |
| SubAgentsEnabled | false | agent | Sub-agent orkestrering (legacy toggle) |
| RegistryExtractionEnabled | false | registry | Auto-extraction etter builds |
| ProgressMessageEnabled | false | agent/chat | Ny meldingskontrakt (én oppdaterbar melding) |
| MultiProviderEnabled | false | ai | Multi-provider AI (OpenRouter, Fireworks, OpenAI) |
| GitHubAppEnabled | false | github | GitHub App auth (erstatter PAT) |
| DynamicSubAgentsEnabled | false | ai | AI-planner styrer sub-agent oppsett |
| HealingPipelineEnabled | false | registry | Kvalitetshealing + ukentlig vedlikehold |
```

---

## DEL 3: OPPDATER DOKUMENTASJON

### CLAUDE.md — legg til Z-prosjekt endringer

Finn seksjonen som lister filer/services og legg til:

```markdown
## Z-prosjekt nye filer og endringer

### Nye services
- `web/` — Web scraping via Firecrawl (web.ts, encore.service.ts)

### Nye filer (backend)
- `ai/provider-interface.ts` — AIProvider interface + StandardRequest/StandardResponse
- `ai/provider-registry.ts` — Provider registry med fallback
- `ai/providers/anthropic.ts` — Anthropic provider
- `ai/providers/openrouter.ts` — OpenRouter provider
- `ai/providers/fireworks.ts` — Fireworks provider
- `ai/providers/openai.ts` — OpenAI provider
- `github/github-app.ts` — GitHub App JWT auth + installation tokens
- `gateway/email.ts` — E-post via Resend (jobb-fullføring, healing, feil)
- `registry/healing.ts` — Healing pipeline (kvalitet + vedlikehold cron)

### Endrede kontrakter
- `agent/messages.ts` — AgentProgress erstatter 6 gamle AgentMessage-typer
  - Typer: ProgressStep, ProgressReport, AgentProgress
  - Funksjoner: serializeProgress(), deserializeProgress(), convertLegacy()
- `agent/helpers.ts` — reportProgress() erstatter report() og think()
  - addStep(), buildSteps() for progressiv steg-bygging
- `chat/chat.ts` — Nye endpoints:
  - POST /chat/review/approve
  - POST /chat/review/changes
  - POST /chat/review/reject
  - Pub/Sub: chatResponses topic + responseRouter subscriber
- `tasks/tasks.ts` — external_id + external_source for Linear import
  - syncStatusToLinear() for toveis status-sync
- `memory/memory.ts` — OpenAI embeddings (text-embedding-3-small, 1536 dim)
  - POST /memory/re-embed endpoint
- `github/github.ts` — POST /github/repo/create
- `mcp/mcp.ts` — POST /mcp/validate
- `registry/registry.ts` — useComponent, listComponents, substituteVariables

### Nye secrets
- OpenAIApiKey — OpenAI embeddings
- GitHubAppId — GitHub App ID
- GitHubAppPrivateKey — GitHub App private key (.pem)
- FirecrawlApiKey — Firecrawl web scraping
- OpenRouterApiKey — OpenRouter multi-model
- FireworksApiKey — Fireworks inference
- TheFoldEmail — Avsenderadresse for notifikasjoner

### Feature flags (alle default false)
- ProgressMessageEnabled — Ny meldingskontrakt
- MultiProviderEnabled — Multi-provider AI
- GitHubAppEnabled — GitHub App auth
- DynamicSubAgentsEnabled — Dynamisk sub-agent oppsett
- HealingPipelineEnabled — Healing pipeline
```

### GRUNNMUR-STATUS.md — legg til Z-features

Finn riktig seksjon og legg til alle nye features med 🟢 status:

```markdown
## Prosjekt Z — Ny funksjonalitet

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| AgentProgress meldingsformat | 🟢 | Én oppdaterbar melding per task |
| Review → Rapport inline | 🟢 | Godkjenn/avvis fra chat |
| Confidence → Naturlig spørsmål | 🟢 | Ingen "clarification"-tilstand |
| Tasks som master | 🟢 | Linear er importkilde, ikke trigger |
| AI provider-abstraksjon | 🟢 | Anthropic, OpenRouter, Fireworks, OpenAI |
| OpenAI embeddings | 🟢 | text-embedding-3-small, 1536 dim |
| Hard token-budsjett per fase | 🟢 | 8 faser med limits, building=200K |
| GitHub App auth | 🟢 | JWT + installation tokens, repo-oppretting |
| Komponentbibliotek | 🟢 | Registry + templates merged, 5 seeded patterns |
| Healing pipeline | 🟢 | Kvalitetshealing + fredag 03:00 cron |
| Dynamisk sub-agent | 🟢 | AI planner bestemmer oppsett |
| MCP fungerende | 🟢 | Config-krav, validering, sentry/linear servere |
| Web scraping | 🟢 | Firecrawl API, ny web/ service |
| Slack/Discord toveis | 🟢 | Response routing via Pub/Sub |
| E-post notifikasjoner | 🟢 | Resend for jobb-fullføring, healing, feil |
| DB performance indekser | 🟢 | 4 nye indekser, agent_progress type |
```

### thefold-verify — oppdater STEG 2 med nye endepunkter

Legg til i endepunkt-listen:

```markdown
### Chat (chat/) — NYE
- `POST /chat/review/approve` → { prUrl }
- `POST /chat/review/changes` → { success }
- `POST /chat/review/reject` → { success }

### Web (web/) — NY SERVICE
- `POST /web/scrape` (internal) → { title, content, links, metadata }
- `GET /web/health` → { status }

### GitHub (github/) — NYE
- `POST /github/repo/create` → { url, cloneUrl }

### MCP (mcp/) — NYE
- `POST /mcp/validate` → { status, message }

### Memory (memory/) — NYE
- `POST /memory/re-embed` → { processed, failed }

### Registry (registry/) — NYE
- `POST /registry/use` → { files[] }
- `POST /registry/list` → { components[] }
- `POST /registry/maintenance/run` → MaintenanceReport
```

---

## DEL 4: FULL TEST-KJØRING

Etter alt er renamed og oppdatert:

```bash
# 1. Verifiser at encore bygger uten feil:
encore build

# 2. Kjør alle tester:
encore test ./... 2>&1 | tee test-results.txt

# 3. Telle resultater:
grep -c "PASS" test-results.txt
grep -c "FAIL" test-results.txt

# 4. Hvis noen feil: sjekk at det ikke er rename-relatert:
grep "Cannot find module\|Module not found\|ENOENT" test-results.txt
```

**Mål:** 600+/609 passert. Gjenværende feil bør kun være sandbox-timeout (Windows).

```bash
# 5. Commit alt:
git add -A
git commit -m "cleanup: rename z-prefixed files, normalize feature flags, update docs

- Renamed ~15 test files (removed z- prefix)
- Renamed 5 feature flags (Z* → descriptive names)
- Updated CLAUDE.md with Z-project changes
- Updated GRUNNMUR-STATUS.md with Z-features
- Updated thefold-verify skill with new endpoints and flags
- All tests passing (600+/609)"
```

---

## DEL 5: RAPPORT

Etter fullføring, skriv til prosjekt-z-rapport.md:

```markdown
## Z-CLEANUP — Rapport

### Filer renamed: [X]
- Testfiler: [liste]
- Andre: [liste]

### Feature flags renamed: 5
- ZNewMessageContract → ProgressMessageEnabled
- ZMultiProvider → MultiProviderEnabled
- ZGitHubApp → GitHubAppEnabled
- ZDynamicSubAgents → DynamicSubAgentsEnabled
- ZHealingEnabled → HealingPipelineEnabled

### Feature flags fjernet: [X]
- [liste, om noen]

### Docs oppdatert:
- CLAUDE.md: ✅/❌
- GRUNNMUR-STATUS.md: ✅/❌
- thefold-verify: ✅/❌

### Test-resultat:
- Passert: [X]/609
- Feilet: [X]
- Nye feil etter cleanup: [X]
```