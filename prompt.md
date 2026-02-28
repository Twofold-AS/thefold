# PROMPT — TheFold Hotfix Runde 8

> **Les CLAUDE.md først. thefold-app.jsx er den definitive design-referansen.**
> **VIKTIG: Gjør ALT i denne prompten sekvensiellt. IKKE bruk sub-agenter. Én agent, én oppgave om gangen.**
> **PixelBlast-komponenten fra ReactBits ble FEIL implementert i Runde 7 — sub-agenten laget en Canvas2D-versjon i stedet for den ekte WebGL-versjonen med `three` + `postprocessing`. Denne runden fikser dette.**

---

## HVA SOM FUNGERER (IKKE ENDRE)

- ✅ Middleware: server-side auth guard
- ✅ Twofold-AS: 0 treff i koden (migrasjon ferdig)
- ✅ OpenAI secret: satt korrekt
- ✅ GitHub App: installert i thefold-dev
- ✅ DB warmup: alle 15 services logger "warmed"
- ✅ listProviders: retry med backoff
- ✅ Brukerens melding vises optimistisk
- ✅ Polling henter AI-svar (svaret FINNES i DB)

---

## REKKEFØLGE — GJØR DETTE I DENNE REKKEFØLGEN

1. Bug 1 — AI-svarets tekst rendres ikke
2. Bug 2 — Dobbelt robot-ikon under tenking
3. Bug 3 — Shimmer-effekten er feil type
4. Bug 4 — Repo er hardkodet "thefold-api"
5. Bug 5 — Stats på overview viser ikke data
6. Bug 6 — PixelBlast er feil implementert (Canvas2D → WebGL)
7. Bug 7 — PixelBlast som bakgrunn på overview og chat (ikke bare login)
8. Bug 8 — AI system prompt: fjern markdown-stjerner og fiks repo-tilgang
9. Bug 9 — Error handling for token-grenser
10. Bug 10 — Token-priser fra OpenRouter/Fireworks (nice to have)

---

## Bug 1 — KRITISK: AI-svarets TEKST rendres ikke (bare robot-ikon vises)

### Bevis
Encore-loggen viser at svaret ER lagret i DB (487 tegn). Frontend henter det via polling. Men renderingskoden viser bare robot-ikonet, ikke `content`.

### Rot-årsak
I meldingsrendering-loopen sjekkes `messageType` eller `role` feil. Assistant-meldinger med messageType "chat" rendres kanskje ikke.

### Fix — Meldingsrendering i chat/page.tsx

Finn meldingsrendering-loopen. Den MÅ håndtere begge roller:

```tsx
{msgData.map((m, i) => {
  // SKIP agent_status og agent_progress meldinger mens vi tenker
  if (sending && m.messageType === "agent_status") return null;
  if (m.messageType === "agent_progress") return null;

  return (
    <div key={m.id || i} style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      justifyContent: m.role === "user" ? "flex-end" : "flex-start",
    }}>
      {/* Robot-ikon for assistant — KUN for chat-meldinger, ikke agent_status */}
      {m.role === "assistant" && m.messageType !== "agent_status" && (
        <div style={{
          width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
          background: T.surface, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <RobotIcon size={16} />
        </div>
      )}

      <div style={{ maxWidth: 540 }}>
        {/* BRUKER-MELDINGER */}
        {m.role === "user" && (
          <div style={{
            background: T.subtle, border: `1px solid ${T.border}`,
            borderRadius: T.r, padding: "10px 16px",
            fontSize: 13, lineHeight: 1.6, color: T.text,
          }}>
            {m.content}
          </div>
        )}

        {/* ASSISTANT-MELDINGER — VIS CONTENT! DETTE ER DET SOM MANGLER */}
        {m.role === "assistant" && m.messageType !== "agent_status" && m.content && (
          <div style={{
            fontSize: 13, lineHeight: 1.65, color: T.text,
            paddingTop: 4,
          }}>
            {m.content}
          </div>
        )}
      </div>

      {/* Tidspunkt */}
      <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, alignSelf: "flex-end" }}>
        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : ""}
      </span>
    </div>
  );
})}
```

**DEBUG-STEG:** Legg til midlertidig console.log øverst i map-loopen:
```tsx
console.log("[MSG]", m.id, m.role, m.messageType, m.content?.substring(0, 50));
```

---

## Bug 2 — Dobbelt robot-ikon under tenking

Allerede løst i Bug 1 — agent_status meldinger filtreres ut mens `sending === true`.

---

## Bug 3 — Shimmer-effekten er feil type

### Nåværende
`.brand-shimmer` bruker `background-clip: text` — hele teksten er farget gradient.

### Ønsket (fra thefold-app.jsx AgentStream linje 82)
En firkant/boks med shimmer som glir OVER teksten — teksten forblir hvit, en semi-transparent indigo stripe glir horisontalt.

### Fix — ThinkingIndicator i chat/page.tsx

```tsx
{sending && (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{
      width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
      background: T.surface, border: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <RobotIcon size={16} />
    </div>
    <span style={{
      fontSize: 13, fontWeight: 500, fontFamily: T.mono,
      position: "relative", overflow: "hidden",
      color: T.text, padding: "2px 0",
    }}>
      TheFold tenker
      <span style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.18) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmerMove 2s linear infinite",
        pointerEvents: "none",
      }} />
    </span>
    <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>
      · {thinkSeconds}s
    </span>
  </div>
)}
```

Sørg for at `shimmerMove` keyframes finnes i globals.css:
```css
@keyframes shimmerMove {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**IKKE bruk `brand-shimmer` CSS-klassen.** Bruk overlay-span med `position: absolute`.

---

## Bug 4 — Repo er hardkodet "thefold-api"

### Fix
1. I `ChatComposer.tsx`: Endre `useState("thefold-api")` til `useState<string | null>(null)`
2. I `ChatInput.tsx`: Vis "Velg repo" som placeholder når repo er null
3. Når ny samtale opprettes, send BARE repo hvis brukeren har valgt et:

```tsx
const newConv = await createConversation({
  title: msg.substring(0, 50),
  ...(repo ? { repoName: repo } : {}),
});
```

---

## Bug 5 — Stats på overview viser ikke data

Backend endepunktene fungerer (Encore-logg bekrefter OK):
- `getCostSummary` → 25ms
- `getStats` → 22ms
- `getAuditStats` → 28ms

### Fix — Hent og vis ekte data i Overview page.tsx

```tsx
const { data: costData } = useApiData(() => getCostSummary(), []);
const { data: taskStats } = useApiData(() => getTaskStats(), []);

const stats = [
  { label: "TOKENS I DAG", value: costData?.totalTokensToday ? `${(costData.totalTokensToday / 1000).toFixed(1)}k` : "—" },
  { label: "KOSTNAD", value: costData?.totalCostToday != null ? `$${costData.totalCostToday.toFixed(2)}` : "—" },
  { label: "AKTIVE TASKS", value: taskStats?.activeCount != null ? String(taskStats.activeCount) : "—" },
  { label: "SUCCESS RATE", value: taskStats?.successRate != null ? `${taskStats.successRate}%` : "—" },
];
```

Sjekk backend API-responsene i DevTools Network-tab for å se den eksakte strukturen. Map feltene riktig.

---

## Bug 6 — KRITISK: PixelBlast er FEIL implementert

### Hva som skjedde
I Runde 7 ble PixelBlast bedt om å bruke ReactBits sin PixelBlast-komponent (WebGL, basert på `three` + `postprocessing`, inspirert av github.com/zavalit/bayer-dithering-webgl-demo). Men sub-agenten IGNORERTE dette og laget en egen Canvas2D pixel grid — en helt annen effekt.

### Hva som MÅ gjøres
Slett den nåværende `components/effects/PixelBlast.tsx` og hent den EKTE komponenten.

### Steg 1 — Hent ekte PixelBlast fra ReactBits
```bash
cd frontend
npx jsrepo add https://reactbits.dev/default/Backgrounds/PixelBlast
```

Hvis CLI ikke fungerer, gå til https://reactbits.dev/backgrounds/pixel-blast, kopier TypeScript-versjonen og lagre som `components/effects/PixelBlast.tsx`.

### Steg 2 — Installer dependencies
```bash
cd frontend && npm install three postprocessing
npm install -D @types/three
```

Sjekk hvilke dependencies den nedlastede PixelBlast faktisk importerer. Les import-statements i filen.

### Steg 3 — Verifiser at det er WebGL
Den ekte PixelBlast skal:
- Importere fra `three` (Scene, Camera, WebGLRenderer, ShaderMaterial, PlaneGeometry, etc.)
- Importere fra `postprocessing` ELLER ha inline GLSL shader-kode
- Ha Bayer-matrise dithering pattern i GLSL
- Bruke `<canvas>` med WebGL context (IKKE `canvas.getContext("2d")`)
- Ha props som: variant, pixelSize, color, patternScale, patternDensity, enableRipples, rippleSpeed, liquid, edgeFade, transparent

Hvis filen bruker `canvas.getContext("2d")` — det er FEIL versjon. Slett den og hent på nytt.

### Steg 4 — Oppdater login/page.tsx
```tsx
const PixelBlast = dynamic(() => import("@/components/effects/PixelBlast"), { ssr: false });

// I JSX:
<div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.4 }}>
  <PixelBlast
    variant="square"
    pixelSize={4}
    color="#B19EEF"
    patternScale={2}
    patternDensity={1}
    pixelSizeJitter={0}
    enableRipples
    rippleSpeed={0.4}
    rippleThickness={0.12}
    rippleIntensityScale={1.5}
    liquid={false}
    liquidStrength={0.12}
    liquidRadius={1.2}
    liquidWobbleSpeed={5}
    speed={0.5}
    edgeFade={0.25}
    transparent
  />
</div>
```

---

## Bug 7 — PixelBlast som bakgrunn på overview og chat (ikke bare login)

### Problem
PixelBlast brukes bare på login. Den skal også brukes på overview-siden og chat-siden.

### Fix — Overview page (app/(dashboard)/page.tsx)
Legg til PixelBlast som bakgrunn BAK innholdet:

```tsx
const PixelBlast = dynamic(() => import("@/components/effects/PixelBlast"), { ssr: false });

// I JSX — som FØRSTE child av rot-containeren:
<div style={{ position: "relative", minHeight: "100vh" }}>
  <div style={{
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 0, opacity: 0.12,
  }}>
    <PixelBlast
      variant="square"
      pixelSize={4}
      color="#B19EEF"
      patternScale={2}
      patternDensity={1}
      pixelSizeJitter={0}
      enableRipples
      rippleSpeed={0.4}
      rippleThickness={0.12}
      rippleIntensityScale={1.5}
      liquid={false}
      speed={0.3}
      edgeFade={0.25}
      transparent
    />
  </div>

  <div style={{ position: "relative", zIndex: 1 }}>
    {/* ... eksisterende overview innhold ... */}
  </div>
</div>
```

### Fix — Chat page (app/(dashboard)/chat/page.tsx)
Samme tilnærming — PixelBlast som `position: fixed` bakgrunn med lav opacity (0.08-0.12).

### Viktig
- Dashboard-sider: lavere opacity (0.08-0.12) enn login (0.4) for lesbarhet
- Bruk `position: fixed` slik at bakgrunnen dekker hele viewporten
- `zIndex: 0` på PixelBlast, `zIndex: 1` på innholdet
- Fjern eventuell gammel Particles/Dither-bakgrunn

---

## Bug 8 — AI system prompt: fjern markdown-stjerner og fiks repo-tilgang

### Problem 1 — Markdown-formatering i svar
AI-en svarer med mye `**stjerner**` som vises som ren tekst med stjerner.

### Fix — Oppdater system prompt i backend
I `chat/chat.ts` eller `ai/ai.ts`, finn system-prompten. Legg til:

```
Svar ALLTID i ren tekst uten markdown-formatering. Aldri bruk **stjerner**, # headings, - bullets, eller annen markdown-syntaks. Skriv naturlig norsk/engelsk prosa med avsnitt og linjeskift for struktur.
```

### Problem 2 — AI nekter å lage repos
AI-en sier "kan ikke opprette repos" — men GitHub App HAR tilgang.

### Fix — Legg til createRepo i github service
Sjekk om `github/github.ts` har en `createRepo` endpoint. Hvis ikke:

```typescript
export const createRepo = api(
  { expose: true, auth: true, method: "POST", path: "/github/repos/create" },
  async (params: { name: string; description?: string; isPrivate?: boolean }): Promise<{ repo: RepoInfo }> => {
    const octokit = await getInstallationOctokit();
    const owner = getDefaultOwner();

    const { data } = await octokit.repos.createInOrg({
      org: owner,
      name: params.name,
      description: params.description || "",
      private: params.isPrivate !== false,
      auto_init: true,
    });

    return {
      repo: {
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        status: "healthy",
        errorCount: 0,
      },
    };
  }
);
```

### Fix — Oppdater system prompt om tilgang
Legg til i system-prompten:

```
Du har tilgang til GitHub via en installert GitHub App i thefold-dev organisasjonen. Du KAN opprette nye repositories, lese og skrive til repos, commite kode, og opprette branches. Ikke si at du ikke kan gjøre dette.
```

### Problem 3 — Auto-bytte repo
Når AI oppretter et repo, bør chatten bytte til det. I polling-loopen, sjekk om en agent_status melding inneholder repo-info og oppdater repo-velgeren automatisk.

---

## Bug 9 — Error handling for token-grenser

I `chat/page.tsx`, håndter feil fra sendMessage:

```tsx
try {
  await sendMessage({ ... });
} catch (e: any) {
  setMsgData(prev => prev.filter(m => m.id !== optId));
  setSending(false);

  const errorMsg = e?.message || "Noe gikk galt";
  if (errorMsg.includes("rate limit") || errorMsg.includes("quota")) {
    setError("Du har brukt opp token-kvoten. Vent litt eller oppgrader.");
  } else if (errorMsg.includes("insufficient")) {
    setError("Ikke nok credits. Sjekk API-nøklene dine.");
  } else {
    setError(errorMsg);
  }
}

// Vis error i UI:
{error && (
  <div style={{
    padding: "10px 16px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: T.r, fontSize: 12, color: T.error,
    display: "flex", alignItems: "center", gap: 8,
  }}>
    <span>⚠</span> {error}
    <span onClick={() => setError(null)} style={{ cursor: "pointer", marginLeft: "auto" }}>✕</span>
  </div>
)}
```

---

## Bug 10 — Token-priser fra OpenRouter/Fireworks (nice to have)

Lavprioritet. Bare gjør denne hvis alt annet er ferdig og fungerer.

OpenRouter har et offentlig API: `GET https://openrouter.ai/api/v1/models` som returnerer priser per modell.

---

## VERIFIKASJON — ALT MÅ SJEKKES

```
[  ] Send melding → brukerens melding vises UMIDDELBART
[  ] AI-svar TEKST vises etter 2-3s (ikke bare ikon!)
[  ] console.log viser at assistant-melding har content med tekst
[  ] KUN ÉTT robot-ikon under tenking (ikke to)
[  ] Shimmer er overlay-boks (hvit tekst, indigo stripe glir over)
[  ] Shimmer forsvinner når AI-svar mottas
[  ] ChatComposer repo-default er null (ikke "thefold-api")
[  ] Ny samtale opprettes UTEN hardkodet repo
[  ] Repo-pill viser "Velg repo" som default
[  ] Overview stats viser ekte tall (eller "—" hvis data mangler)
[  ] PixelBlast på login bruker WebGL (IKKE Canvas2D)
[  ] PixelBlast vises som bakgrunn på overview (opacity 0.08-0.12)
[  ] PixelBlast vises som bakgrunn på chat (opacity 0.08-0.12)
[  ] AI svarer UTEN **markdown-stjerner** — ren tekst
[  ] AI vet at den KAN opprette repos via GitHub App
[  ] createRepo endpoint eksisterer i github service
[  ] Feil fra sendMessage viser feilmelding i UI
[  ] Feilmelding kan lukkes med ✕
```

---

## SJEKKLISTE FRA FORRIGE RUNDER (må fortsatt fungere)

```
[✅] Middleware redirecter uautentiserte til /login
[✅] Login redirect til / (ikke /home)
[✅] Twofold-AS → 0 treff
[✅] Sidebar: brukernavn over kollaps
[✅] ChatInput: 800px bredde
[✅] Polling: 1.5s first, 2s interval, 60s max
[✅] Optimistisk brukermelding
```