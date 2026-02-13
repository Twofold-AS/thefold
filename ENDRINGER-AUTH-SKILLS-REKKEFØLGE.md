# TheFold — Endringer: Auth, Skills og Oppdatert Rekkefølge

> Besluttet: 11. februar 2025
> Kontekst: Erstatter deler av den opprinnelige planen i BYGGEPLAN.md og THEFOLD-OVERSIKT.md

---

## Hva er endret fra opprinnelig plan

### 1. Auth: Fra passord til e-post OTP

**Før:** Enkel `admin`/passord-login med HMAC-token i `gateway/auth.ts`. Planen var å bytte til OAuth/Clerk/NextAuth i steg 5.

**Nå:** E-post OTP (engangskode) som **første prioritet** — bygges FØR frontend-backend-kobling.

**Hvorfor:** To faste brukere med kjente e-poster. Ingen passord å lekke, ingen kostnad for auth-tjeneste, enklere UX.

**Beslutninger:**
- Brukere: `mikkis@twofold.no` og `mikael@twofold.no` — seedes i databasen, ingen åpen registrering
- OTP sendes via **Resend.com** (3000 gratis e-poster/mnd, sender fra `noreply@twofold.no`)
- 6-sifret kode, SHA-256 hashet i DB, 5 min utløp, engangsbruk
- Rate limiting: maks 3 forsøk per kode, maks 5 koder per e-post per time, 15 min lockout
- Etter vellykket OTP: signert HMAC-token (gjenbruker eksisterende system) med utløpstid (7 dager)
- Login-side viser kun e-postfelt → "Skriv inn kode" → dashboard
- Konto-enumerering forhindres: ukjente e-poster får samme respons som kjente
- Audit-logging: alle innloggingsforsøk lagres (IP, tidspunkt, suksess/feil)

**Ny Encore secret:** `ResendAPIKey`

### 2. Brukerprofiler med forskjellige roller

**Før:** Én admin-bruker, ingen profiler.

**Nå:** Flerbruker-system med egne profiler.

**Database — ny `users`-service med tabeller:**
```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'viewer'
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- otp_codes
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- login_audit
CREATE TABLE login_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Seed-data (kjøres ved første oppstart):**
```sql
INSERT INTO users (email, name, role) VALUES
  ('mikkis@twofold.no', 'Mikkis', 'admin'),
  ('mikael@twofold.no', 'Mikael', 'admin');
```

**Preferences JSONB inneholder per bruker:**
- Foretrukket AI-modell per oppgavetype (planning, coding, review)
- Aktive skills
- Notifikasjonsvalg
- Tema-preferanser

### 3. Security-side i dashboardet

**Ny side: `/settings/security`**

Innhold:
- Bytt e-post (med OTP-bekreftelse på ny e-post)
- Se aktive sessions, logg ut alle enheter
- Se siste innlogginger (IP, tidspunkt, user-agent) — fra `login_audit`
- Admin: se alle brukere, deaktiver kontoer
- Agent audit-log: hva TheFold-agenten har gjort (sandbox-operasjoner, PRs, Linear-oppdateringer)

### 4. Skills-system for AI-modeller

**Før:** System-prompts var hardkodet i `ai/ai.ts` per oppgavetype (planning, coding, review).

**Nå:** Modell-agnostisk skills-system som injiseres dynamisk i system-prompten.

**Hva er en skill:**
En skill er et gjenbrukbart instruksjons-fragment som gjelder uansett hvilken AI-modell som brukes. Skills lagres i databasen og administreres fra dashboardet.

**Database — ny tabell i `ai`-servicen (eller egen `skills`-service):**
```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,        -- selve instruksjonen som injiseres
  applies_to TEXT[] DEFAULT '{}',       -- ['planning', 'coding', 'review', 'chat']
  scope TEXT DEFAULT 'global',          -- 'global' | 'repo:{reponame}'
  enabled BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Eksempler på innebygde skills (seedes):**
- **"Encore.ts Rules"** — Aldri bruk Express/dotenv, kun encore-primitiver. Gjelder: coding.
- **"TypeScript Strict"** — Bruk strict mode, prefer const, exhaustive switch. Gjelder: coding, review.
- **"Security Awareness"** — Aldri hardkode secrets, aldri commit .env, scan for injections. Gjelder: coding, review.
- **"Norwegian Docs"** — Skriv PR-beskrivelser og Linear-kommentarer på norsk. Gjelder: review.
- **"Test Coverage"** — Skriv tester for ny funksjonalitet, bruk vitest. Gjelder: coding.

**Hvordan det fungerer i AI-servicen:**
```
1. Agent kaller ai.planTask() med model="claude-sonnet-4-..."
2. AI-servicen henter alle enabled skills der applies_to inkluderer "planning"
3. System-prompt bygges: BASE_PROMPT + skill.prompt_fragment for hver aktive skill
4. Kallet sendes til riktig provider (Anthropic/OpenAI/Moonshot)
→ Resultatet er modell-agnostisk — samme regler uansett provider
```

**Ny side: `/skills`**
- Liste over alle skills med on/off toggle
- Opprett ny skill (navn, beskrivelse, prompt-fragment, gjelder for, scope)
- Rediger eksisterende
- Forhåndsvis hvordan system-prompten ser ut med aktive skills

### 5. Chat-integrasjon deprioritert

**Før:** Chat var steg 1 — koble frontend til chat-service API.

**Nå:** Chat (som i AI-samtale) flyttes til **senere** fordi:
- API-nøkkel (Anthropic) er ikke fylt på enda
- Chat-service CRUD fungerer allerede (testet) — den lagrer meldinger fint
- Agentens rapporter vil vises i chatten uansett
- Det som trengs nå er at frontend kan VISE meldinger fra chatten, ikke at AI svarer

**Konkret:** Frontend kobles til chat-service for å vise/sende meldinger, men AI-svaret (ai.chat()) aktiveres først når API-nøkkel er klar. Chatten fungerer som en "log" for agentens aktivitet inntil da.

---

## Oppdatert rekkefølge (erstatter "Neste steg" i THEFOLD-OVERSIKT.md)

### Steg 1: Users-service + OTP Auth ← VI ER HER
- Opprett `users`-service med database (users, otp_codes, login_audit)
- Seed mikkis@ og mikael@
- Tre API-endepunkter: `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/logout`
- Resend-integrasjon for å sende OTP-kode
- Rate limiting og sikkerhet
- Oppdater `gateway/auth.ts` til å bruke users-tabellen
- Oppdater frontend login-side: e-postfelt → OTP-felt → dashboard
- Skriv tester

### Steg 2: Brukerprofiler + Preferences
- Profil-side i frontend (navn, avatar, preferanser)
- Settings lagrer til users.preferences JSONB
- Security-fane med innloggingshistorikk

### Steg 3: Skills-system
- Skills-tabell i databasen, seed innebygde skills
- AI-servicen bygger system-prompt dynamisk fra aktive skills
- `/skills`-side i frontend for administrasjon
- Test at skills gjelder uavhengig av valgt AI-modell

### Steg 4: Koble frontend til backend (uten AI-svar)
- API-klient med auth (Bearer token fra OTP-session)
- Home-siden: ekte stats fra backend
- Chat: vise meldinger fra chat-service (agentens rapporter)
- Tasks: vise Linear-tasks
- Environments: vise repos fra GitHub
- Memory: søk og vis minner

### Steg 5: Aktiver AI-chat
- Fyll på Anthropic API-nøkkel
- Koble chat-input til ai.chat() via backend
- Test at samtaler fungerer med valgt modell og aktive skills

### Steg 6: Deploy til VPS
- Dockerfiler for backend og frontend
- Docker Compose med PostgreSQL (pgvector), Caddy
- Resend DNS-setup for twofold.no
- Test at OTP-login fungerer i prod

### Steg 7: Ende-til-ende test
- Opprett task i Linear → TheFold plukker opp → PR → rapport i chat

### Steg 8: Polering
- Kostnadskalkulator, budsjettgrenser, notifikasjoner
- Feilhåndtering og retry-logikk

---

## Første steg: Claude Code-prompt for Users + OTP

Kopier dette direkte til Claude Code i repoet:

```
Les CLAUDE.md, PROSJEKTKONTEKST.md og ENDRINGER-AUTH-SKILLS-REKKEFØLGE.md først.

Vi bygger nå users-service med e-post OTP-autentisering. Gjør følgende:

1. OPPRETT `users/`-service (ny Encore.ts-service):
   - Database med tre tabeller: users, otp_codes, login_audit
   - Migrasjonsfiler som oppretter tabellene
   - Seed-fil som setter inn de to brukerne:
     - mikkis@twofold.no (name: "Mikkis", role: "admin")
     - mikael@twofold.no (name: "Mikael", role: "admin")

2. LEGG TIL ny secret: ResendAPIKey
   - `encore secret set --dev ResendAPIKey`

3. IMPLEMENTER tre endepunkter:
   
   POST /auth/request-otp { email: string }
   - Sjekk at e-post finnes i users-tabellen
   - Generer 6-sifret kode (crypto.randomInt)
   - Hash med SHA-256, lagre i otp_codes med 5 min expires_at
   - Send kode via Resend API (POST https://api.resend.com/emails)
   - Rate limit: maks 5 koder per e-post per time
   - Returner alltid { success: true } uansett om e-post finnes (forhindre enumerering)
   - Logg forsøket i login_audit
   
   POST /auth/verify-otp { email: string, code: string }
   - Finn nyeste ubrukte OTP for denne brukeren
   - Sjekk at attempts < 3, at koden ikke er utløpt
   - Inkrementer attempts uansett
   - Hvis code_hash matcher: sett used=true, generer HMAC-token (gjenbruk generateToken fra gateway), returner token + user-objekt
   - Hvis feil: returner feil, logg i audit
   - Etter 3 feil forsøk: lås ut i 15 min
   
   POST /auth/logout { } (krever auth)
   - Ugyldiggjør token (legg til token-blacklist eller bruk short-lived tokens)
   - Logg i audit

4. OPPDATER gateway/auth.ts:
   - Fjern hardkodet admin/passord login
   - Behold HMAC-token-verifisering (verifyToken)
   - Legg til token-utløpstid (7 dager) i payload
   - La generateToken inkludere userId fra users-tabellen
   - Fjern det gamle login-endepunktet

5. OPPDATER frontend login-side:
   - Steg 1: E-postfelt + "Send kode"-knapp
   - Steg 2: 6-sifret kode-input (auto-fokus mellom felt) + "Logg inn"-knapp
   - Steg 3: Redirect til /home
   - Vis feilmeldinger: "Kode utløpt", "Feil kode", "For mange forsøk"
   - Design: behold eksisterende mørkt tema og TheFold-stil

6. SKRIV TESTER:
   - Test at request-otp returnerer success for kjent e-post
   - Test at request-otp returnerer success for UKJENT e-post (enumerering)
   - Test at verify-otp med riktig kode returnerer token
   - Test at verify-otp med feil kode øker attempts
   - Test at utløpt kode avvises
   - Test rate limiting (6. forespørsel innen en time avvises)
   - Test at generert token fungerer med gateway auth handler

Husk: KUN Encore-primitiver. Ingen Express, dotenv, process.env.
Resend API: POST https://api.resend.com/emails med Authorization: Bearer {ResendAPIKey}
Body: { from: "TheFold <noreply@twofold.no>", to: [email], subject: "Din innloggingskode", html: "..." }
```

---

## Filer som påvirkes

### Nye filer:
- `users/users.ts` — service med database og API-endepunkter
- `users/migrations/001_create_tables.up.sql`
- `users/seed.ts` — seed brukere ved oppstart
- `users/users.test.ts` — tester

### Endrede filer:
- `gateway/auth.ts` — fjern hardkodet login, legg til token-utløp
- `frontend/src/app/login/page.tsx` — OTP-flyt istedenfor passord
- `frontend/src/lib/auth.ts` — oppdater token-håndtering
- `.env.example` — legg til ResendAPIKey

### Senere (ikke nå):
- `ai/ai.ts` — dynamisk skill-injection i system-prompts
- Ny `skills`-tabell og service
- `/skills`-side i frontend
- `/settings/security`-side i frontend
