# Z-HOTFIX — Fiks kjente feil + DB-opprydding + Secrets-oppsett

## KONTEKST

Prosjekt Z er fullført. thefold-verify viser 572/609 tester (93.9%).
33 feil er pre-eksisterende. Denne prompten fikser dem.

Les først:
- CLAUDE.md
- KONTOSOPPSETT.md (generert av ZU)
- Z-PROSJEKT-PLAN.md (for kontekst)

---

## DEL 1: FIKS TEST-FEIL (33 stk)

### Kategori 1: MCP pre-seed (14 feil)

**Årsak:** Migrasjon `mcp/migrations/3_z_cleanup_servers.up.sql` slettet github/postgres servere. Tester i `mcp/mcp.test.ts` forventer fortsatt disse.

**Fiks:**
1. Åpne `mcp/mcp.test.ts`
2. Oppdater alle tester som refererer til "github" eller "postgres" MCP-servere
3. Erstatt med serverne som faktisk eksisterer etter migrasjon 3 (context7, brave-search, puppeteer, sentry, linear)
4. Oppdater antall-asserts (f.eks. `expect(servers.length).toBe(6)` → riktig tall)
5. Legg til tester for de nye serverne (sentry, linear)

```bash
# Finn alle referanser til gamle servere:
grep -n "github\|postgres" mcp/mcp.test.ts
```

### Kategori 2: Sandbox timeout (5 feil)

**Årsak:** npm install i sandbox tar >120s på Windows. Testene har for kort timeout.

**Fiks:**
1. Åpne `sandbox/sandbox.test.ts`
2. Finn alle tester med `{ timeout: ... }` eller som kjører npm install
3. Øk timeout til 300000 (5 min) for tester som involverer npm:

```typescript
it("should validate with npm install", { timeout: 300_000 }, async () => {
```

4. Alternativt: legg til `skip` condition for CI/Windows:
```typescript
const isCI = process.env.CI === "true";
it.skipIf(isCI)("should validate with npm install", ...);
```

### Kategori 3: ~encore/clients mock-feil (10 feil)

**Årsak:** Z-tester bruker `vi.mock("encore.dev/storage/sqldb")` som ikke fungerer med Encore runtime. SQLDatabase kan ikke mockes direkte.

**Fiks for HVER testfil (tasks, skills, chat, github, users):**

Mønsteret som FUNGERER (se `agent/helpers.test.ts` som referanse):

```typescript
// FEIL — dette fungerer IKKE:
vi.mock("encore.dev/storage/sqldb", () => ({
  SQLDatabase: vi.fn(() => ({ exec: vi.fn(), query: vi.fn() })),
}));

// RIKTIG — mock ~encore/clients i stedet:
vi.mock("~encore/clients", () => ({
  tasks: { createTask: vi.fn(), updateTaskStatus: vi.fn() },
  // ... andre services
}));
```

Fiks disse filene:
- `tasks/z-tasks-master.test.ts`
- `tasks/z-linear-sync.test.ts`
- `skills/skills-filter.test.ts` (om den feiler)
- `chat/z-review-from-chat.test.ts`
- `chat/progress-message.test.ts`
- `github/github-app.test.ts`

For testfiler som trenger DB-tilgang, bruk Encore sin testmodus:
```typescript
// Tester som trenger ekte DB — kjør med encore test (ikke vitest direkte)
// Disse trenger IKKE mock av SQLDatabase — Encore gir test-DB automatisk
```

### Kategori 4: E2E mock (2 feil)

**Årsak:** `Cannot read properties of undefined (reading 'length')` i context-builder.

**Fiks:**
1. Åpne `agent/e2e-mock.test.ts`
2. Finn hvor `length` kalles på undefined
3. Mest sannsynlig: `mockGitHubTree` returnerer tree som `string[]` men koden forventer `{ path: string }[]`

```bash
grep -n "\.length" agent/e2e-mock.test.ts
grep -n "mockGitHubTree" agent/test-helpers/mock-services.ts
```

4. Fiks mock-dataen til å matche faktisk type:
```typescript
// I mock-services.ts:
export function mockGitHubTree() {
  return {
    tree: ["agent/agent.ts", "chat/chat.ts", "package.json"],
    treeString: "agent/agent.ts\nchat/chat.ts\npackage.json",
    packageJson: { dependencies: {} },
  };
}
```

Sjekk at context-builder.ts håndterer begge tree-formater (string[] og {path,type}[]).

### Kategori 5: Templates substitution (1 feil)

**Årsak:** Variabel-substitusjon test forventer gammel path-format. ZL endret templates → komponentbibliotek.

**Fiks:**
1. Finn testfilen:
```bash
grep -rn "substituteVariables\|useTemplate\|variable" templates/ registry/ --include="*.test.ts"
```
2. Oppdater testen til å bruke ny `useComponent` / `substituteVariables` fra registry/
3. Fjern referanser til gammel templates-service

### Kategori 6: Sandbox afterAll timeout (1 feil)

**Årsak:** Sandbox cleanup tar for lang tid.

**Fiks:**
```typescript
// I sandbox testfil — øk afterAll timeout:
afterAll(async () => {
  // Cleanup
}, 60_000); // 60 sekunder for cleanup
```

### Kategori 7: Agent modul import-feil (confidence, execution, review-handler, completion)

**Årsak:** Disse testfilene importerer fra `~encore/auth` som krever Encore runtime.

**Fiks:** Oppdater mock-setup i toppen av HVER fil:

```typescript
// Legg til ØVERST i testfilen, FØR andre imports:
vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userId: "test-user" })),
}));

vi.mock("~encore/clients", () => ({
  ai: {
    assessConfidence: vi.fn(),
    assessComplexity: vi.fn(),
    planTask: vi.fn(),
    generateFile: vi.fn(),
    fixFile: vi.fn(),
    reviewCode: vi.fn(),
    chat: vi.fn(),
  },
  github: {
    getTree: vi.fn(),
    getFile: vi.fn(),
    findRelevantFiles: vi.fn(),
    createPR: vi.fn(),
  },
  memory: { search: vi.fn(), store: vi.fn() },
  sandbox: { create: vi.fn(), validate: vi.fn(), destroy: vi.fn() },
  builder: { start: vi.fn(), getJob: vi.fn() },
  tasks: { updateTaskStatus: vi.fn(), isCancelled: vi.fn(() => ({ cancelled: false })) },
  linear: { updateTask: vi.fn() },
  skills: { resolve: vi.fn(), executePreRun: vi.fn(), executePostRun: vi.fn() },
  cache: { getOrSetSkillsResolve: vi.fn() },
  registry: { findForTask: vi.fn(() => ({ components: [] })) },
  mcp: { installed: vi.fn(() => ({ servers: [] })) },
  docs: { lookupForTask: vi.fn(() => ({ results: [] })) },
}));

vi.mock("../chat/chat", () => ({
  agentReports: { publish: vi.fn() },
}));

vi.mock("encore.dev/config", () => ({
  secret: (name: string) => () => "false",
}));
```

Sjekk `agent/helpers.test.ts` og `agent/e2e-mock.test.ts` som referanse — de bruker dette mønsteret og passerer.

---

## DEL 2: FEATURE FLAG OPPRYDDING

### SkillsPipelineEnabled — mangler

Finn om den er fjernet bevisst eller glemt:
```bash
grep -rn "SkillsPipelineEnabled" --include="*.ts"
```

Hvis ingen referanser: fjern fra thefold-verify skill-filen.
Hvis referanser finnes: legg til secret-deklarasjon i riktig fil.

### AgentModular — fjernet (XK)

Bekreft at den er fjernet og at all kode bruker modulær path:
```bash
grep -rn "AgentModular" --include="*.ts"
```

Hvis funn: fjern referansene, alt skal bruke ny modulær kode.

---

## DEL 3: DATABASE-OPPRYDDING

### MCP servers — reset pre-seeded data

Etter migrasjon 3 slettet github/postgres, kan DB ha inkonsistent state.

```sql
-- Kjør via encore db shell mcp:

-- Slett alle pre-seeded servere og re-seed med riktige
DELETE FROM mcp_servers WHERE source = 'pre-seeded' OR source IS NULL;

-- Re-insert riktige servere (fra migrasjon 3)
-- (Migrasjonen gjør dette automatisk, men hvis DB er rotete:)
INSERT INTO mcp_servers (name, command, args, status, source) VALUES
  ('context7', 'npx', '["@context7/mcp-server"]', 'not_configured', 'pre-seeded'),
  ('brave-search', 'npx', '["@anthropic/mcp-server-brave-search"]', 'not_configured', 'pre-seeded'),
  ('puppeteer', 'npx', '["@anthropic/mcp-server-puppeteer"]', 'not_configured', 'pre-seeded'),
  ('sentry', 'npx', '["@sentry/mcp-server"]', 'not_configured', 'pre-seeded'),
  ('linear', 'npx', '["@linear/mcp-server"]', 'not_configured', 'pre-seeded')
ON CONFLICT (name) DO NOTHING;
```

### Memory embedding dimensjon

Migrasjon 8 endret vektor-dimensjon fra 1024 → 1536.
Sjekk at migrasjonen er kjørt:

```sql
-- Kjør via encore db shell memory:
SELECT column_name, udt_name 
FROM information_schema.columns 
WHERE table_name = 'memories' AND column_name = 'embedding';
-- Bør vise: vector(1536)
```

### Chat message_type constraint

Migrasjon 6 la til `agent_progress` og `agent_thought`.
Sjekk at constraint er oppdatert:

```sql
-- Kjør via encore db shell chat:
SELECT conname, consrc FROM pg_constraint 
WHERE conname = 'messages_message_type_check';
-- Bør inkludere: agent_progress, agent_thought
```

### Registry — templates merge

Migrasjon 2 la til nye kolonner. Sjekk at seeded data er korrekt:

```sql
-- Kjør via encore db shell registry:
SELECT name, type, quality_score, source FROM components LIMIT 10;
-- Bør vise seeded patterns med type='pattern' og source='seeded'
```

---

## DEL 4: SECRETS-OPPSETT

Sett opp secrets i denne rekkefølgen. For HVER secret:
1. Si til brukeren hva de trenger
2. Vent på at de gir deg verdien
3. Sett secreten via `encore secret set`
4. Verifiser at den fungerer

### Secret 1: OpenAIApiKey (PÅKREVD — memory embeddings)

```
Nå trenger jeg OpenAI API-nøkkelen du opprettet ("thefold-memory").
Gå til platform.openai.com → API Keys → kopier nøkkelen.

Kjør: encore secret set OpenAIApiKey --type dev
Lim inn nøkkelen.
```

Etter setting — verifiser:
```bash
# Test at embedding fungerer:
encore test memory/z-openai-embeddings.test.ts
```

### Secret 2: GitHubAppId + GitHubAppPrivateKey (NÅR GITHUB APP ER KLAR)

```
Nå trenger jeg GitHub App credentials.
1. Gå til github.com → Settings → Developer settings → GitHub Apps → din app
2. Kopiér App ID (tall øverst på siden)
3. Generer private key hvis du ikke har gjort det (knapp nederst → .pem-fil)

Kjør: encore secret set GitHubAppId --type dev
Lim inn App ID (bare tallet).

Kjør: encore secret set GitHubAppPrivateKey --type dev
Lim inn HELE innholdet av .pem-filen inkludert:
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```

Etter setting — verifiser:
```bash
encore test github/github-app.test.ts
```

### Secret 3: TheFoldEmail (FOR E-POST)

```
For e-post-notifikasjoner trenger jeg avsenderadressen.
Du bruker allerede Resend for OTP — bruk samme konto.

Sett opp et domene i Resend for thefold.dev (eller bruk en @resend.dev adresse).

Kjør: encore secret set TheFoldEmail --type dev
(f.eks. "agent@thefold.dev" eller "thefold@resend.dev")
```

### Secret 4-6: VALGFRIE (sett opp når du trenger dem)

OpenRouter, Fireworks, Firecrawl — kan settes opp senere.
Koden håndterer manglende nøkler gracefully (feature flags er false).

---

## DEL 5: RE-EMBED MINNER

Etter at OpenAIApiKey er satt og memory-migrasjonen er kjørt:

```bash
# Sjekk antall minner som trenger re-embedding:
encore db shell memory -c "SELECT COUNT(*) FROM memories WHERE embedding IS NULL;"

# Kjør re-embed (kan ta et par minutter avhengig av antall):
curl -X POST http://localhost:4000/memory/re-embed \
  -H "Authorization: Bearer <din-auth-token>"

# Verifiser:
encore db shell memory -c "SELECT COUNT(*) FROM memories WHERE embedding IS NULL;"
# Bør være 0
```

---

## DEL 6: VERIFISERING

Etter alle fikser, kjør full test-suite:

```bash
encore test ./... 2>&1 | tail -30
```

**Mål:** 600+/609 passert (opp fra 572). De gjenværende bør kun være sandbox-timeout (Windows-spesifikk).

Oppdater thefold-verify rapporten:

```
🔍 TheFold Verify — Post-Hotfix Rapport

BACKEND:         [X]/609 tester passert
NYE FEIL:        0
FIKSET:          [X] av 33 pre-eksisterende feil
SECRETS:         [X] av 3 påkrevde satt
MIGRASJONER:     Konsistente
RE-EMBED:        [X] minner migrert
FEATURE FLAGS:   Alle false (klar for gradvis aktivering)
```

---

## ETTER FULLFØRING

1. Oppdater `GRUNNMUR-STATUS.md` med Z-prosjekt features
2. Oppdater `CLAUDE.md` med nye filer, endepunkter og regler
3. Oppdater `.claude/skills/thefold-verify/SKILL.md` med:
   - Nye endepunkter (chat/review/*, web/scrape, github/repo/create, etc.)
   - Nye feature flags (Z*)
   - Nye migrasjoner
   - Ny service (web/)
4. Commit alt: `git commit -m "Z-HOTFIX: fix 33 pre-existing test failures + DB cleanup + secrets setup"`