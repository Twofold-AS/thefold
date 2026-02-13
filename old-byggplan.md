# TheFold — Byggeplan for Claude Code

## Forutsetninger (ha klart FØR du starter)

- [ ] Hostinger KVM 4 VPS (4 vCPU, 16GB RAM, Ubuntu 24.04, Europa)
- [ ] Domene med DNS-tilgang
- [ ] Privat GitHub repo opprettet
- [ ] API-nøkler: Anthropic, Linear, GitHub PAT (repo scope), Voyage AI
- [ ] Encore CLI installert lokalt
- [ ] Docker installert lokalt

---

## Steg 1: Prosjektoppsett (30 min)

```
encore app create thefold --example=ts/hello-world
cd thefold
# Kopier inn alle filer fra TheFold-pakken
npm install
encore run
```

Si til Claude Code:
"Sett opp TheFold basert på disse filene. Verifiser at alle 8 services kompilerer og at encore run starter."

Ferdig: localhost:9400 viser alle services.

---

## Steg 2: Database + Memory (1-2 timer)

Si til Claude Code:
"Verifiser at chat- og memory-databasene opprettes. Test insert/query for meldinger. Test pgvector: lagre en embedding og gjør cosine similarity search. Skriv tester."

Ferdig: encore test ./chat/... ./memory/... passerer.

---

## Steg 3: AI-service (1-2 timer)

Sett Anthropic-nøkkel:
```
encore secret set --dev AnthropicAPIKey
```

Si til Claude Code:
"Test ai.chat() med en enkel melding. Test ai.planTask() med en task-beskrivelse og verifiser at den returnerer gyldig JSON med plan-steg. Test ai.reviewCode() med en enkel fil og verifiser JSON-output. Alle tre endepunkter må fungere."

Ferdig: Alle tre AI-endepunkter returnerer fornuftig output.

---

## Steg 4: GitHub-service (1-2 timer)

Sett GitHub token:
```
encore secret set --dev GitHubToken
```

Si til Claude Code:
"Test github.getTree() mot det faktiske repoet. Test github.getFile() for å lese en fil. Test github.findRelevantFiles() med en task-beskrivelse. Test github.createPR() — opprett en test-branch med en dummy-fil, verifiser at PR opprettes på GitHub. Rydd opp etter test."

Ferdig: Kan lese repo-struktur og opprette PRs programmatisk.

---

## Steg 5: Sandbox-service (2-3 timer)

Dette er den mest kritiske tjenesten. TheFold må kunne kjøre og validere kode isolert.

Si til Claude Code:
"Test sandbox.create() — klone repoet inn i en sandbox. Test sandbox.writeFile() — skriv en ny TypeScript-fil. Test sandbox.validate() — kjør tsc --noEmit og verifiser at den fanger typefeil. Test at en fil med bevisst feil gir validation.success = false med lesbar feilmelding. Test sandbox.destroy() rydder opp. Legg til path-traversal beskyttelse — verifiser at ../../etc/passwd blir avvist."

Ferdig: Kan klone, skrive, validere, og rydde opp sandboxer. Feil fanges korrekt.

---

## Steg 6: Linear-service (1 time)

Sett Linear-nøkkel:
```
encore secret set --dev LinearAPIKey
```

Si til Claude Code:
"Test linear.getAssignedTasks() — hent tasks med 'thefold' label. Test linear.getTask() for en enkelt task. Test linear.updateTask() — legg til en kommentar på en test-task. Verifiser at kommentaren vises i Linear."

Ferdig: Kan lese og oppdatere Linear tasks.

---

## Steg 7: Agent-loop (2-3 timer)

Alt over er ledd. Nå kobler vi dem sammen.

Si til Claude Code:
"Implementer agent.startTask() slik at den kjører hele flyten: les task fra Linear, les kode fra GitHub, planlegg med AI, utfør i sandbox, valider, og rapporter resultatet til chat. Start med en enkel test-task: 'Opprett en hello.ts fil som eksporterer en funksjon som returnerer Hello World'. Verifiser at hele loopen kjører og at resultatet havner i chatten. Håndter feil på hvert steg — hvis noe feiler skal det rapporteres til chat, ikke krasje stille."

Si deretter:
"Test retry-logikken. Gi agenten en task som genererer kode med en bevisst typefeil. Verifiser at den leser feilen fra sandbox.validate(), ber AI om å fikse det, og prøver igjen. Maks 3 forsøk."

Ferdig: Agent kan fullføre en enkel task ende-til-ende med feilhåndtering.

---

## Steg 8: Chat + Frontend (2-3 timer)

Si til Claude Code:
"Bygg frontend-chatten i Next.js. Den trenger: innloggingsside (token-basert auth mot gateway), samtaleliste, chatvindu med meldingshistorikk, mulighet til å starte en task (velg fra Linear-tasks), sanntidsoppdateringer når agenten rapporterer fremgang. Bruk Tailwind for styling. Mørkt tema. Polling hvert 3. sekund for nye meldinger (SSE i fase 2)."

Ferdig: Kan logge inn, chatte, starte tasks, og se agentens fremgangsrapporter.

---

## Steg 9: Context7 / Docs (1 time)

Si til Claude Code:
"Integrer Context7 MCP-serveren. Installer @upstash/context7 eller sett opp HTTP-fallback. Test at docs.lookupForTask() returnerer relevant dokumentasjon for en task som nevner 'zod validation'. Koble dette inn i agent-loopen slik at AI-planlegging alltid inkluderer docs-kontekst."

Ferdig: Agent bruker oppdatert dokumentasjon i planleggingsfasen.

---

## Steg 10: Deploy til Hostinger VPS (1-2 timer)

```
# På VPS som root:
bash deploy/vps-setup.sh

# Som thefold-bruker:
git clone git@github.com:your-org/thefold.git
cd thefold
cp .env.example .env
nano .env  # fyll inn alle nøkler

encore build docker thefold:latest --config infra-config.json
docker compose up -d

sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Si til Claude Code:
"Hjelp meg å verifisere at produksjons-deployet fungerer. Sjekk at alle containere kjører, at HTTPS fungerer, at databasen er tilgjengelig, og at en enkel chat-melding kan sendes og besvares."

Ferdig: thefold.yourdomain.com viser chatten og du kan sende meldinger.

---

## Steg 11: Ende-til-ende test (1 time)

Opprett en ekte task i Linear med "thefold" label. Se at TheFold:
1. Finner tasken
2. Leser repoet
3. Planlegger arbeidet
4. Skriver kode i sandbox
5. Validerer (typesjekk)
6. Oppretter PR på GitHub
7. Dokumenterer i Linear
8. Rapporterer i chatten

---

## Total estimert tid: 12-18 timer aktivt arbeid

Dette er ikke 5-9 uker. Det er 2-3 dager konsentrert arbeid med Claude Code som gjør det meste av kodingen. Hvert steg bygger direkte på det forrige, ingenting må gjøres om.

---

## Ting å passe på

1. Sandbox-sikkerhet: path-traversal og command injection er de to største risikoene. Whitelist for kommandoer er allerede på plass, men test grundig.

2. Agent retry-loop: maks 3 forsøk er satt. Hvis den ikke klarer det på 3, rapporter feil og stopp. Aldri la den loope uendelig.

3. GitHub token scope: gi den KUN tilgang til det ene repoet den jobber med. Ikke bruk en token med org-wide tilgang.

4. Linear label: agenten plukker KUN opp tasks med "thefold" label. Uten dette vil den prøve å jobbe med alle tasks.

5. Memory-overflyt: sett en øvre grense for antall memories (f.eks. 10.000 rader). Eldre, lavrelevans-minner kan slettes med en cron.

6. Token-kostnader: agent-loopen bruker 3 AI-kall per task (plan, code, review). Med Sonnet er dette ~$0.10-0.50 per task. Overvåk dette.

7. Sandbox-opprydding: hvis agenten krasjer midt i, blir sandboxen liggende. Legg til en cron som sletter sandboxer eldre enn 1 time.
