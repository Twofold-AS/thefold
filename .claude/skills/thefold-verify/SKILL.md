# TheFold Verify — Fullstack Funksjonstest Skill

## Beskrivelse
Systematisk verifisering av alle TheFold-funksjoner: backend API-tester, endepunkt-sjekk, og frontend-verifisering.

## Bruk
Kjør denne skillen etter enhver stor endring (prosjekt X, Y, Z eller hotfixes).

```
Kjør thefold-verify
```

---

## STEG 1: Backend-tester

Kjør alle Encore-tester:

```bash
encore test ./... 2>&1 | tail -20
```

Rapporter:
- Totalt antall tester
- Passerende
- Feilende (list filnavn + testnavn)
- Skippede

**Krav:** 0 nye feil sammenlignet med forrige kjøring.

---

## STEG 2: Endepunkt-verifisering

Kjør tester per service og verifiser at endepunktene finnes og har korrekte typer:

### Auth (gateway/)
- `POST /gateway/create-token` (internal)
- `POST /gateway/revoke` → { revoked }
- `POST /gateway/revoke-token` (internal)

### Chat (chat/)
- `POST /chat/send` → { messageId }
- `GET /chat/history` → { messages[] }
- `GET /chat/conversations` → { conversations[] }
- `POST /chat/transfer-context` → { success }

### Agent (agent/)
- `POST /agent/start-task` → { taskId }
- `POST /agent/respond-to-clarification` → aksepterer
- `POST /agent/force-continue` → aksepterer
- `GET /agent/audit/log` → { entries[] }
- `GET /agent/audit/stats` → { totalTasks, successRate, averageDurationMs }
- `GET /agent/metrics/phases` → { phases[] }
- `GET /agent/metrics/task` → { taskId, phases[] }
- `GET /agent/costs/phases` → { data }
- `GET /agent/costs/task` → { taskId }
- `GET /agent/reviews` → { reviews[] }
- `GET /agent/review/:id` → { id, status, files }

### Memory (memory/)
- `POST /memory/search` → { results[] }
- `POST /memory/store` → { id }
- `POST /memory/extract` (internal) → { stored }
- `GET /memory/stats` → { total, byType, avgRelevanceScore, expiringSoon }

### Skills (skills/)
- `GET /skills/list` → { skills[] }
- `POST /skills/create` → { id }
- `POST /skills/toggle` → { enabled }

### Cache (cache/)
- `GET /cache/stats` → { embeddingHits, hitRate, totalEntries }

### Monitor (monitor/)
- `GET /monitor/health` → { repos: { [name]: checks[] } }

### GitHub, AI, Sandbox, Builder, Registry, Templates, MCP, Users
Kjør service-tester:
```bash
encore test ./github/... ./ai/... ./sandbox/... ./builder/... ./registry/... ./templates/... ./mcp/... ./users/...
```

---

## STEG 3: Agent modul-integrasjon

Verifiser alle dekomponerte moduler:

```bash
encore test ./agent/context-builder.test.ts
encore test ./agent/confidence.test.ts
encore test ./agent/execution.test.ts
encore test ./agent/review-handler.test.ts
encore test ./agent/completion.test.ts
encore test ./agent/helpers.test.ts
encore test ./agent/token-policy.test.ts
encore test ./agent/rate-limiter.test.ts
encore test ./agent/state-machine.test.ts
encore test ./agent/e2e.test.ts
encore test ./agent/e2e-mock.test.ts
```

---

## STEG 4: Feature flag-sjekk

Verifiser at alle feature flags er deklarert:

| Flag | Default | Tjeneste |
|------|---------|----------|
| AgentStateMachineStrict | false | agent |
| AgentModular | true | agent |
| MonitorEnabled | false | monitor |
| MCPRoutingEnabled | false | mcp |
| SandboxAdvancedPipeline | false | sandbox |
| SkillsPipelineEnabled | true | skills |
| SubAgentsEnabled | false | agent |
| RegistryAutoExtract | false | registry |

---

## STEG 5: Database-migrasjoner

```bash
ls -la agent/migrations/*.up.sql
ls -la memory/migrations/*.up.sql
ls -la gateway/migrations/*.up.sql
ls -la chat/migrations/*.up.sql
ls -la users/migrations/*.up.sql
ls -la cache/migrations/*.up.sql
ls -la ai/migrations/*.up.sql
ls -la monitor/migrations/*.up.sql
ls -la registry/migrations/*.up.sql
```

Sjekk sekvensielle numre, ingen gap.

---

## STEG 6: Import-regelsjekk

```bash
grep -rn "from ['\"]\.\./" agent/ ai/ memory/ skills/ github/ sandbox/ builder/ chat/ gateway/ registry/ templates/ mcp/ monitor/ users/ --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v "types" | grep -v "/db" | head -30
```

Tillatte unntak:
- `../chat/chat` for Topic-import (agentReports)
- Interne imports innenfor samme service

---

## STEG 7: Frontend-sjekk (krever browser)

| Side | URL | Sjekk |
|------|-----|-------|
| Home | /home | 9 kort med data fra API |
| Chat | /chat | Meldingsliste, input-felt |
| Repo Chat | /repo/[name]/chat | Samtaleliste |
| Review | /review | Liste med statusfilter |
| Review Detail | /review/[id] | Filer + knapper |
| Skills | /skills | Liste med toggles |
| Settings | /settings | 3 tabs |
| Security | /settings/security | Audit log |
| Environments | /environments | Repo-liste |
| Costs | /tools/costs | Periodevelger + data |

---

## STEG 8: Rapport

```
🔍 TheFold Verify — Rapport [dato]

BACKEND: [pass]/[total] tester ✅/❌
ENDEPUNKTER: [X] av [X] sjekket ✅/❌
AGENT-MODULER: [X] av 11 ✅/❌
FEATURE FLAGS: [X] av 8 ✅/❌
MIGRASJONER: Konsistente ✅/❌
IMPORT-REGLER: ✅/❌
FRONTEND: [X] av 10 sider ✅/❌

TOTALT: [X] av [X] sjekker bestått
```