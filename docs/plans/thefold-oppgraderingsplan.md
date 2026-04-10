# TheFold Hjerne — Oppgraderingsplan: Fra 85% til 100%

> Implementeringsplanen tar TheFold til ~85%. Denne planen beskriver hva som trengs for de siste 15%.
> Dette er avanserte features som bygger på at alt fra implementeringsplanen fungerer.
> Noen av disse er langsiktige og krever eksperimentering.

---

## Oversikt: Hva mangler etter 85%?

| System | Etter impl.plan | Gap til 100% | Hva mangler |
|---|---|---|---|
| Hjernestammen | 95% | 5% | Graceful recovery, auto-resume etter krasj |
| Lillehjernen | 90% | 10% | Full incremental validation, parallel builds |
| Prefrontal cortex | 92% | 8% | Kreativ problemløsning, alternativ-vurdering |
| Hippocampus | 80% | 20% | Tematisk konsolidering, episodisk minne |
| Synscortex | 80% | 20% | Visuell forståelse, mønstergjenkjenning på tvers av prosjekter |
| Motorisk cortex | 85% | 15% | Auto-akkumulert capability scoring, adaptive modellvalg |
| Amygdala | 75% | 25% | Anomali-deteksjon, proaktiv risiko-vurdering |
| Brocas + Wernickes | 82% | 18% | Routing patterns, kontekst-komprimering per oppgavetype |
| Autonome nervesystemet | 65% | 35% | Proaktivitet, selv-reparering av egen kode |
| Basalgangliene | 35% | 65% | Automatiserte vaner, 0-token routing |

---

## Fase 1: Basalgangliene — Automatiserte vaner (35% → 90%)

**Prioritet: Høy. Effekt: Stor token-besparelse. Kompleksitet: Moderat.**

Dette er den enkleste og mest verdifulle oppgraderingen. TheFold gjør i dag alt "bevisst" — hvert kall krever AI-tenkning. Basalgangliene automatiserer det som er lært.

### Routing patterns

Ny tabell:

```sql
CREATE TABLE routing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_hash TEXT NOT NULL UNIQUE,
  task_keywords TEXT[],
  file_patterns TEXT[],
  label_patterns TEXT[],
  specialist TEXT NOT NULL,           -- coding, review, debug, architecture
  model_recommendation TEXT,
  confidence FLOAT DEFAULT 0.5,
  hit_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Oppbygging:** Etter hver fullført oppgave, lagre et routing pattern:
- Keywords fra oppgavebeskrivelsen (top 5 tf-idf)
- Filtyper som ble endret (.ts, .tsx, .sql)
- Labels fra task
- Modell som ble brukt
- Om resultatet var vellykket

**Matching:** Før AI-klassifisering i chat auto-routing:
1. Ekstraher keywords fra ny melding
2. Søk routing_patterns: keyword overlap + file pattern match
3. Hvis confidence > 0.8 og hit_count > 5: bruk pattern direkte (0 tokens)
4. Ellers: fall gjennom til AI-klassifisering som i dag

**Effekt:** 70-80% av requests rutes uten AI-kall etter 4-8 uker. ~2.5M tokens spart per 1000 meldinger.

### Mønster-gjenkjenning for kjente oppgavetyper

Når TheFold har sett 10+ oppgaver av typen "database migration":
- Den vet alltid hvilke filer som er relevante (migrations/, db.ts, types)
- Den vet hvilket modell-nivå som trengs (vanligvis medium)
- Den vet vanlige feil (IF NOT EXISTS, column conflicts)

Lagre dette som "task type profiles" — automatisk bygget fra knowledge + routing patterns:

```sql
CREATE TABLE task_type_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL UNIQUE,        -- database_migration, api_endpoint, frontend_component, etc.
  typical_files TEXT[],
  typical_model TEXT,
  typical_complexity FLOAT,
  common_pitfalls TEXT[],               -- Fra knowledge med denne kategorien
  average_tokens INT,
  average_retries FLOAT,
  sample_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effekt:** For kjente oppgavetyper kan TheFold hoppe over mye av planleggingsfasen. "Ah, dette er en database migration — jeg vet nøyaktig hva jeg trenger."

### Gjenværende gap til 100%

De siste 10% krever at TheFold oppdager *nye* mønstre — ikke bare gjenbruker kjente. Det er mønstergjenkjenning over tid, der systemet selv identifiserer at "de siste 20 frontend-oppgavene brukte alle Tailwind" og oppretter en profil uten å bli bedt om det. Dette er mer eksperimentelt og hører til søvn-systemets utvidede ansvar.

---

## Fase 2: Autonome nervesystemet — Proaktivitet (65% → 95%)

**Prioritet: Høy. Effekt: TheFold blir en ekte assistent. Kompleksitet: Høy.**

### Proaktiv problemdeteksjon

TheFold scanner repos periodisk og varsler deg om problemer den finner uten at du ber om det.

Ny CronJob: "proactive-scan"
```
Schedule: "0 7 * * 1-5" (hverdager kl 07:00)
```

**Hva den scanner:**
1. `pnpm audit` — kjente sårbarheter i dependencies
2. Dependency-versjoner — er noe kritisk utdatert?
3. Test-dekning — har den falt under en terskel?
4. Knowledge-basert: Sjekk kjente pitfalls fra knowledge mot nylig endrede filer

**Output:** Chat-notifikasjon med prioriterte funn. Kun ved funn — ingen "alt OK"-spam.

**Token-kostnad:** ~$0.01 per scan (ingen AI — alt er verktøy-basert).

**Konfigurerbar:** Bruker kan slå av/på, velge repos, sette terskler.

### Selv-reparering

Når proaktiv scan finner noe som TheFold kan fikse selv:
1. Opprett scheduled task med type "build"
2. Send chat-notifikasjon: "Fant utdatert dependency X med kjent sårbarhet. Skal jeg oppdatere?"
3. Bruker godkjenner → agent kjører oppgaven
4. Bruker avslår → knowledge: "Bruker vil ikke oppdatere X, respekter dette"

### Selv-forbedring av approaches

Under søvn: sammenlign approaches som ble brukt de siste ukene.
- Finn oppgaver med samme task_type der kvaliteten varierte
- Hva var forskjellig? Modellvalg? Plan-strategi? Kontekst?
- Generer ny knowledge: "For frontend_component er strategi A konsekvent bedre enn B"

### Gjenværende gap til 100%

De siste 5% er ekte autonomi — TheFold som bestemmer *hva* den skal gjøre uten input. "Jeg ser at test-dekningen i payment-service er 30% — jeg lager tester." Det krever et tillitsnivå og en approval-mekanisme som er trygg nok til å gi TheFold denne friheten.

---

## Fase 3: Hippocampus — Dyp hukommelse (80% → 95%)

**Prioritet: Medium. Effekt: Bedre langtidsminne. Kompleksitet: Moderat.**

### Tematisk konsolidering

I dag har TheFold mange individuelle knowledge-regler og minner. Den mangler evnen til å generalisere: "Alle disse 15 reglene om Encore.ts handler egentlig om 3 prinsipper."

Under søvn (utvidet):
1. Grupper knowledge etter category
2. For kategorier med > 20 regler: send til AI
3. "Konsolider disse reglene til 5-7 overordnede prinsipper som dekker alle."
4. Lagre som "meta-knowledge" med høyere confidence
5. Individuelle regler beholdes men lenkes til meta-regel

**Effekt:** Mer kompakt prompt-injection. 20 regler × 80 tokens = 1600 tokens. 5 meta-regler × 100 tokens = 500 tokens. Samme informasjon, 70% færre tokens.

### Episodisk minne

I dag lagrer memory enkelt-fakta. Den mangler "episoder" — sammenhengende historier om hva som skjedde.

Ny minnetype: `episode`

```sql
-- I eksisterende memory-tabell
INSERT INTO memories (category, content, trust_level)
VALUES ('episode', 'I prosjekt X, fase 3: PaymentService-integrasjonen feilet fordi...',  'agent');
```

Episoder er mer verdifulle enn enkelt-fakta for komplekse oppgaver. Når TheFold møter en lignende situasjon, kan den hente en hel episode i stedet for fragmenterte fakta.

**Oppbygging:** Etter fullførte prosjekter (orchestrator), ikke enkelt-oppgaver. Generer episode-summary fra alle fasers resultater.

### Gjenværende gap til 100%

De siste 5% er assosiativ hukommelse — evnen til å koble tilsynelatende urelaterte minner. "Denne feilen i payment-service ligner på noe jeg så i en auth-service for 3 måneder siden." Det krever cross-kategori pgvector-søk og en mer sofistikert retrieval-mekanisme.

---

## Fase 4: Synscortex — Utvidet syn (80% → 95%)

**Prioritet: Medium. Effekt: Bedre prosjektforståelse. Kompleksitet: Variabel.**

### Mønstergjenkjenning på tvers av prosjekter

TheFold ser i dag bare innenfor ett prosjekt. Den vet ikke at "prosjekt A og prosjekt B bruker begge Stripe — løsningen fra A kan gjenbrukes i B."

**Implementering:**
- Registry-service har allerede `used_by_repos` og `find-for-task`
- Utvid `find-for-task` til å bruke knowledge fra alle prosjekter
- Når TheFold planlegger: "Finnes det en komponent i registeret som gjør dette?"

### Kodebase-endringssporing

Utover prosjektmanifest: spor *hva som endrer seg over tid*.

```sql
CREATE TABLE repo_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  files_changed TEXT[],
  change_type TEXT,           -- feature, bugfix, refactor, migration
  task_id UUID,
  summary TEXT
);
```

**Effekt:** TheFold kan svare: "De siste 10 endringene i dette repoet var i frontend/ — kanskje vi bør fokusere backend-tester." Trendanalyse over tid.

### Visuell forståelse (eksperimentell)

Den ultimate oppgraderingen: TheFold kan "se" hva frontend-koden produserer.

**Konsept:** Etter generering av frontend-filer:
1. Bygg i sandbox (`pnpm build`)
2. Start dev server
3. Ta screenshot (Playwright/Puppeteer i Docker)
4. Send screenshot til vision-modell: "Ser dette riktig ut?"

**Utfordringer:** Tung å kjøre, krever grafisk rendering i Docker, vision-modeller er dyre. Men det er det eneste som gir TheFold ekte "syn" for UI-kode.

**Pragmatisk alternativ:** I stedet for screenshots, analyser CSS/Tailwind-klasser for layout-konsistens. Mye billigere, fanger grove feil (overlapping elements, missing responsive classes).

### Gjenværende gap til 100%

De siste 5% er spatial forståelse — evnen til å forstå *arkitekturen* visuelt, ikke bare filene. Hvordan tjenester henger sammen i et diagram, dataflyt gjennom systemet. Det er mer et UI-problem (visualisering i dashboard) enn et AI-problem.

---

## Fase 5: Amygdala — Intuisjon for fare (75% → 95%)

**Prioritet: Medium-høy. Effekt: Sikrere system. Kompleksitet: Moderat.**

### Statistisk anomali-deteksjon

Bygg en baseline av "normaloppførsel" for TheFold:
- Gjennomsnittlig token-bruk per oppgavetype
- Normal feilrate per uke
- Vanlig antall retries per kompleksitetsnivå
- Standard kostnad per oppgave

Ny tabell:

```sql
CREATE TABLE anomaly_baselines (
  metric TEXT PRIMARY KEY,
  mean FLOAT,
  stddev FLOAT,
  sample_count INT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT,
  expected_value FLOAT,
  actual_value FLOAT,
  deviation_sigmas FLOAT,
  severity TEXT,           -- info, warning, critical
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Deteksjon:** Etter hvert AI-kall, sjekk:
- Token-bruk > 3 sigma over baseline → alert
- Feilrate siste time > 3 sigma → alert
- Kostnad siste dag > 2 sigma → alert

**Respons:**
- Info: logg, vis i dashboard
- Warning: chat-notifikasjon
- Critical: pause agent, notifiser bruker

### Proaktiv risiko-vurdering

Før TheFold starter en oppgave med kompleksitet >= 8:
- Sjekk manifestet: hvilke tjenester påvirkes?
- Sjekk knowledge: er det kjente pitfalls for denne typen endring?
- Sjekk dependency graph: er det mange downstream-avhengigheter?

Generer en risiko-score. Høy risiko → foreslå dekomponering. Presentér risikoen til brukeren.

### Gjenværende gap til 100%

De siste 5% er adversarial detection — oppdage at AI-output inneholder ondsinnet kode, prompt injection i generert kode, eller uventet oppførsel. Det krever et eget sikkerhetslag som scanner all generert kode.

---

## Fase 6: Prefrontal cortex — Kreativ problemløsning (92% → 98%)

**Prioritet: Lav (avansert). Effekt: Bedre på vanskelige problemer. Kompleksitet: Høy.**

### Alternativ-vurdering

I dag lager TheFold én plan og følger den. Hvis den feiler, reviderer den planen.

Forbedring: For kompleksitet >= 8, generer 2-3 alternative planer. Vurder fordeler/ulemper for hver. Velg den beste — eller presenter alternativene til brukeren.

**Implementering:**
- Kjør ai.planTask() 2-3 ganger med ulike system-prompter (aggressiv vs. konservativ vs. modulær)
- Send alle planer til en evaluator (Haiku): "Hvilken plan er mest robust?"
- Eller: presenter alle til brukeren i review

**Kostnad:** 2-3x planlegging-tokens for komplekse oppgaver. Estimert $0.03 ekstra per oppgave.

### Refleksjon etter feil

Etter en oppgave som feilet (maks retries nådd):
- Generer en "post-mortem": hva gikk galt, hvorfor, hva burde vært gjort annerledes
- Lagre som knowledge med høy relevans
- Neste gang TheFold møter en lignende oppgave: den har en konkret leksjon

### Gjenværende gap til 100%

De siste 2% er kreativ innovasjon — evnen til å finne løsninger som ingen har tenkt på. Det er i praksis avhengig av modell-kvalitet, ikke system-design. TheFold kan ikke gjøre en modell mer kreativ — men den kan gi den bedre kontekst for å utfolde kreativiteten sin.

---

## Fase 7: De resterende systemene (Hjernestamme, Lillehjernen, Språk, Motorisk)

### Hjernestammen (95% → 100%)

- **Auto-resume etter krasj:** agent_jobs har checkpoints. Implementer at startTask() sjekker for uferdig job og fortsetter fra siste checkpoint i stedet for å starte på nytt.
- **Graceful shutdown:** Ved prosess-terminering, skriv checkpoint og marker job som "interrupted".

### Lillehjernen (90% → 98%)

- **Full incremental validation:** validateIncremental i alle builder-faser, ikke bare integrate.
- **Parallel builds:** For uavhengige filer (ingen imports mellom dem), generer parallelt med Promise.allSettled. Estimert 30-50% raskere builds.

### Brocas + Wernickes (82% → 95%)

- **Routing patterns:** Dekket i Fase 1 (basalgangliene).
- **Kontekst-komprimering per oppgavetype:** Ulike trimContext-strategier for coding (prioriter filer), review (prioriter hele filer), chat (prioriter memory).

### Motorisk cortex (85% → 95%)

- **Auto-akkumulert capability scoring:** Etter hvert AI-kall, logg modell + oppgavetype + kvalitetsscore. Over tid: beregn gjennomsnittlig kvalitet per modell per oppgavetype. Automatisk — ingen manuell benchmarking nødvendig.
- **Adaptive modellvalg:** Bruk capability scores i selectOptimalModel(). "For database_migration er Kimi historisk 92/100 og Sonnet 88/100 — bruk Kimi."

---

## Samlet veikart til 100%

```
Fase 1: Basalganglier (routing patterns + task profiles)          → 85% → 88%
Fase 2: Autonome nervesystem (proaktivitet + selv-reparering)     → 88% → 92%
Fase 3: Hippocampus (konsolidering + episodisk minne)             → 92% → 94%
Fase 4: Synscortex (cross-project + endringssporing)              → 94% → 95%
Fase 5: Amygdala (anomali-deteksjon + risiko-vurdering)           → 95% → 97%
Fase 6: Prefrontal (alternativ-vurdering + refleksjon)            → 97% → 98%
Fase 7: Resterende (auto-resume, parallel builds, adaptive model) → 98% → 99%
```

De siste 1% — ekte kreativ innovasjon, adversarial detection, spatial arkitekturforståelse — er research-problemer som løses over år, ikke sprinter. Et system på 99% er en ekstraordinært kapabel autonom utvikler.

---

## Realistisk tidslinje

```
Sprint 6:      Bugs + sikkerhet                    (nå)
Sprint 7-14:   Implementeringsplan                 (8 sprinter → ~85%)
Sprint 15-16:  Fase 1: Basalganglier               → ~88%
Sprint 17-19:  Fase 2: Proaktivitet                → ~92%
Sprint 20-21:  Fase 3: Dyp hukommelse              → ~94%
Sprint 22-23:  Fase 4+5: Syn + Sikkerhet           → ~97%
Sprint 24-25:  Fase 6+7: Avansert                  → ~99%
```

Total: ~25 sprinter fra i dag til fullverdig hjerne. Systemet er brukbart og verdifullt fra Sprint 7 — hver sprint legger til mer intelligens.
