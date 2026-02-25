# PROMPT — Dither, Chat-bugs, AgentStatus, knapper, ikon-fixes

## Kontekst

TheFold frontend (Next.js 14, App Router). Stiler via `T`-objekt fra `@/lib/tokens`. Ingen backend-endringer.

**Bugs som skal fikses:**
1. Dither-bakgrunnsanimasjon bak ChatComposer (overview + chat "ny samtale")
2. ChatComposer-bredde: skal fylle hele content-bredden (1636px, ikke 672px)
3. Chat-redirect fra overview mister meldingen — må sende dobbelt
4. Når ghost/privat er aktiv på overview og bruker sender melding → skal lande i Privat-tab på chat
5. AgentStream vises ikke (mangler content-prop)
6. Knapper i ChatInput (skills, sub-agent, modell-valg) gjør ingenting
7. Skills-ikon → Wand2 (tryllestav) i sidebar og chat
8. Privat-ikon → ordentlig spøkelse (Ghost fra lucide-react)
9. Hydration mismatch — Toggle bruker localStorage i initial state

---

## BUG 9: Hydration mismatch (fiks FØRST)

### Problemet

I `page.tsx` (overview) bruker Toggle-states `localStorage` i initial useState:

```tsx
const [agentOn, setAgentOn] = useState(() => {
  if (typeof window === "undefined") return true;  // server: true
  return localStorage.getItem("tf_agentMode") !== "false";  // client: kan være false
});
```

Server renderer `checked=true`, client renderer `checked=false` → hydration mismatch.

### Fix i `frontend/src/app/(dashboard)/page.tsx`

Erstatt alle tre useState-initialisatorene med defaultverdier, og bruk useEffect for å lese fra localStorage:

```tsx
const [agentOn, setAgentOn] = useState(true);
const [subAgOn, setSubAgOn] = useState(false);
const [privat, setPrivat] = useState(false);

// Les fra localStorage etter hydration
useEffect(() => {
  setAgentOn(localStorage.getItem("tf_agentMode") !== "false");
  setSubAgOn(localStorage.getItem("tf_subAgents") === "true");
  setPrivat(localStorage.getItem("tf_private") === "true");
}, []);
```

Behold de eksisterende useEffect-ene som skriver til localStorage.

---

## BUG 1: Dither-bakgrunnsanimasjon

### 1a. Installer avhengigheter

```bash
cd frontend
npm install three @react-three/fiber @react-three/postprocessing postprocessing
npm install -D @types/three
```

### 1b. Opprett `frontend/src/components/Dither.tsx`

Kopier **hele** Dither-komponenten uendret fra vedlegget til denne chatten (den med waveVertexShader, waveFragmentShader, ditherFragmentShader, RetroEffectImpl, DitheredWaves, default export Dither). Ca 280 linjer. Bruk den eksakt som gitt.

### 1c. Opprett `frontend/src/components/DitherBackground.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";
import { T } from "@/lib/tokens";

const Dither = dynamic(() => import("./Dither"), { ssr: false });

interface DitherBackgroundProps {
  children: React.ReactNode;
}

export default function DitherBackground({ children }: DitherBackgroundProps) {
  return (
    <div style={{ position: "relative", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Dither canvas — absolutt posisjonert bak innholdet */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <Dither
          waveColor={[0.39, 0.4, 0.95]}
          waveSpeed={0.03}
          waveFrequency={3}
          waveAmplitude={0.3}
          colorNum={4}
          pixelSize={2}
          disableAnimation={false}
          enableMouseInteraction={false}
          mouseRadius={0.3}
        />
      </div>
      {/* Gradient overlay — gjør tekst lesbart */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: `radial-gradient(ellipse at center 40%, transparent 0%, ${T.bg}ee 60%, ${T.bg} 80%)`,
          pointerEvents: "none",
        }}
      />
      {/* Innhold over dither */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
```

---

## BUG 2: ChatComposer-bredde — full content-bredde

### Problemet

ChatComposer har `maxWidth: 672` på input-wrapperen. Den skal fylle hele innholdsområdet (parent er content-area som allerede er 1636px bred).

### Fix i `frontend/src/components/ChatComposer.tsx`

Erstatt **hele filen**:

```tsx
"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";
import DitherBackground from "@/components/DitherBackground";

interface ChatComposerProps {
  onSubmit?: (msg: string, repo: string | null, ghost: boolean) => void;
  heading?: string;
}

export default function ChatComposer({ onSubmit, heading }: ChatComposerProps) {
  const [repo, setRepo] = useState<string | null>("thefold-api");
  const [ghost, setGhost] = useState(false);

  return (
    <DitherBackground>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          minHeight: 400,
          padding: "0 24px",
        }}
      >
        <div style={{ paddingBottom: 32, textAlign: "center" }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: T.text,
              letterSpacing: "-0.03em",
            }}
          >
            {heading || "Når AI sier umulig, sier Mikael Kråkenes neste"}
          </h2>
        </div>
        {/* Full bredde — fyller content-area */}
        <div style={{ width: "100%", position: "relative" }}>
          {/* Glow under chatboksen */}
          <div
            style={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%)",
              width: "60%",
              height: 40,
              background: "radial-gradient(ellipse at center, rgba(99,102,241,0.25) 0%, transparent 70%)",
              pointerEvents: "none",
              filter: "blur(20px)",
              zIndex: 0,
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <ChatInput
              repo={ghost ? null : repo}
              onSubmit={(msg, r) => onSubmit && onSubmit(msg, r ?? null, ghost)}
              onRepoChange={setRepo}
              ghost={ghost}
              onGhostChange={setGhost}
            />
          </div>
        </div>
      </div>
    </DitherBackground>
  );
}
```

Endringer:
- Fjernet `maxWidth: 672` — nå `width: "100%"` (fyller parent)
- Lagt til `padding: "0 24px"` på ytre div for litt pust
- Wrappet med DitherBackground
- Når `ghost` er true, sender `repo={null}` til ChatInput

Fjern også `maxWidth: 672` fra ChatInput.tsx sin rot-div dersom den finnes der (sjekk `maxWidth: compact ? undefined : 672`). Endre til:

```tsx
maxWidth: compact ? undefined : undefined,
```

Eller fjern `maxWidth`-linjen helt.

---

## BUG 8: Privat-ikon — bytt til ordentlig Ghost

### Problemet

Ghost-ikonet i ChatInput er en håndtegnet SVG som ikke ser ut som et spøkelse.

### Fix i `frontend/src/components/ChatInput.tsx`

Importer Ghost fra lucide-react øverst:

```tsx
import { Ghost } from "lucide-react";
```

Erstatt ghost PillIcon-innholdet (den håndtegnede SVG-en) med:

```tsx
<PillIcon
  tooltip="Privat — kun synlig for deg"
  active={ghost}
  onClick={() => onGhostChange && onGhostChange(!ghost)}
>
  <Ghost size={14} />
</PillIcon>
```

---

## BUG 3 + 4: Chat-redirect fra overview — send melding + ghost-modus

### Problemet

I `page.tsx` (overview):
```tsx
const onStartChat = (msg: string, repo: string | null, ghost: boolean) => {
  router.push("/chat");  // ← meldingen og ghost forsvinner!
};
```

### Fix i `frontend/src/app/(dashboard)/page.tsx`

```tsx
const onStartChat = (msg: string, repo: string | null, ghost: boolean) => {
  const params = new URLSearchParams();
  if (msg) params.set("msg", msg);
  if (repo) params.set("repo", repo);
  if (ghost) params.set("ghost", "1");
  router.push(`/chat?${params.toString()}`);
};
```

### Fix i `frontend/src/app/(dashboard)/chat/page.tsx` — les ghost fra searchParams

Oppdater autoMsg-effekten til å lese repo og ghost fra query params, og sett riktig tab:

```tsx
// Auto-send msg from search params (overview redirect)
useEffect(() => {
  if (autoMsg && !autoMsgSent.current) {
    autoMsgSent.current = true;
    setNewChat(false);

    const repoParam = searchParams.get("repo");
    const ghostParam = searchParams.get("ghost") === "1";

    // Sett riktig tab basert på ghost
    if (ghostParam) {
      setTab("Privat");
    }

    const convId = ghostParam
      ? inkognitoConversationId()
      : repoParam
        ? repoConversationId(repoParam)
        : repoConversationId("thefold-api");

    setAc(convId);
    setSending(true);
    sendMessage(convId, autoMsg, { repoName: repoParam || undefined })
      .then((result) => {
        refreshConvs();
        if (result.agentTriggered) {
          startPolling();
        }
      })
      .catch(() => {})
      .finally(() => setSending(false));
  }
}, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## BUG 5: AgentStream vises ikke

### Verifisering

Sjekk i chat/page.tsx om AgentStream allerede har `content`-prop. Basert på koden er det allerede fikset:

```tsx
<AgentStream content={m.content} onCancel={() => ac && cancelChatGeneration(ac)} />
```

Hvis dette allerede er på plass, er bug 5 fikset. Hvis ikke, legg til `content={m.content}` og `onCancel`.

### Ekstra: parseProgress i AgentStream.tsx

Backend sender `{ type: "progress", status, phase, ... }`. Oppdater parseProgress:

```tsx
function parseProgress(content?: string): AgentProgress | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    const data = parsed?.type === "progress" ? parsed : parsed;
    if (data && typeof data.status === "string" && typeof data.phase === "string") {
      return data as AgentProgress;
    }
    return null;
  } catch {
    return null;
  }
}
```

Legg også til `"thinking"` i AgentProgress status-type:

```tsx
interface AgentProgress {
  status: "thinking" | "working" | "done" | "failed" | "waiting";
  // ...resten uendret
}
```

Og i PHASE_LABELS, legg til:
```tsx
thinking: "Tenker",
context: "Analyserer",
confidence: "Vurderer",
building: "Bygger",
clarification: "Trenger avklaring",
```

---

## BUG 6: Knapper i ChatInput gjør ingenting

### Fix: Nye props i ChatInput

Legg til nye props i `ChatInputProps`:

```tsx
interface ChatInputProps {
  compact?: boolean;
  repo?: string | null;
  onSubmit?: (value: string, repo?: string | null) => void;
  onRepoChange?: (repo: string | null) => void;
  ghost?: boolean;
  onGhostChange?: (ghost: boolean) => void;
  isPrivate?: boolean;
  // NYE:
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
}
```

Legg til state: `const [skillsOpen, setSkillsOpen] = useState(false);`

### Sub-agent PillIcon — legg til onClick og active:

```tsx
<PillIcon
  tooltip="Sub-agenter"
  active={subAgentsEnabled}
  onClick={() => onSubAgentsToggle && onSubAgentsToggle()}
>
  {/* eksisterende SVG uendret */}
</PillIcon>
```

### Skills PillIcon — erstatt med dropdown:

```tsx
<div style={{ position: "relative" }}>
  <PillIcon
    tooltip="Skills"
    active={(selectedSkillIds?.length ?? 0) > 0}
    onClick={() => setSkillsOpen(p => !p)}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" /><path d="M19 14v4" />
      <path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />
    </svg>
  </PillIcon>
  {skillsOpen && skills && skills.length > 0 && (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 6,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        padding: "4px 0",
        minWidth: 200,
        maxHeight: 240,
        overflow: "auto",
        zIndex: 100,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {skills.filter(s => s.enabled).map(skill => {
        const selected = selectedSkillIds?.includes(skill.id) ?? false;
        return (
          <div
            key={skill.id}
            onClick={() => {
              if (!onSkillsChange || !selectedSkillIds) return;
              onSkillsChange(
                selected
                  ? selectedSkillIds.filter(id => id !== skill.id)
                  : [...selectedSkillIds, skill.id]
              );
            }}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontFamily: T.sans,
              color: selected ? T.accent : T.textSec,
              background: selected ? T.accentDim : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              border: `1px solid ${selected ? T.accent : T.border}`,
              background: selected ? T.accent : "transparent",
            }} />
            {skill.name}
          </div>
        );
      })}
    </div>
  )}
</div>
```

### Wire opp i chat/page.tsx

Legg til state og API-kall i ChatPageInner:

```tsx
import { listSkills } from "@/lib/api";

// inne i ChatPageInner:
const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
const { data: skillsData } = useApiData(() => listSkills(), []);
const availableSkills = skillsData?.skills ?? [];
```

Send props til ChatInput i samtale-visningen:

```tsx
<ChatInput
  compact
  repo={curRepo || undefined}
  ghost={isGhost}
  onSubmit={handleSend}
  isPrivate={tab === "Privat"}
  skills={availableSkills}
  selectedSkillIds={selectedSkillIds}
  onSkillsChange={setSelectedSkillIds}
  subAgentsEnabled={subAgentsEnabled}
  onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
/>
```

Send `selectedSkillIds` med i `handleSend` og `startNewChat`:

```tsx
const handleSend = (value: string, repo?: string | null) => {
  if (!ac || !value) return;
  setSending(true);
  sendMessage(ac, value, {
    repoName: repo || curRepo || undefined,
    skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
  })
    .then((result) => {
      refreshMsgs();
      refreshConvs();
      if (result.agentTriggered) startPolling();
    })
    .catch(() => {})
    .finally(() => setSending(false));
};
```

---

## BUG 7: Skills-ikon → Wand2 (tryllestav) i sidebar

### Fix i `frontend/src/app/(dashboard)/layout.tsx`

Sidebar bruker allerede Lucide-ikoner. Endre Skills-ikonet:

**Nåværende:**
```tsx
import { ..., Sparkles, ... } from "lucide-react";
// ...
{ icon: Sparkles, label: "Skills", href: "/skills" },
```

**Nytt:**
```tsx
import { ..., Wand2, ... } from "lucide-react";
// Fjern Sparkles fra importen (med mindre den brukes andre steder)
// ...
{ icon: Wand2, label: "Skills", href: "/skills" },
```

---

## Filer som endres

| Fil | Endring |
|-----|---------|
| `components/Dither.tsx` | **NY** — kopier fra vedlegg |
| `components/DitherBackground.tsx` | **NY** — wrapper med gradient overlay |
| `components/ChatComposer.tsx` | Full bredde, DitherBackground, ghost→repo=null |
| `components/ChatInput.tsx` | Ghost→lucide Ghost-ikon, nye props (skills/subAgents), skills dropdown, fjern maxWidth:672 |
| `app/(dashboard)/page.tsx` | Fix hydration (localStorage i useEffect), fix onStartChat med query params |
| `app/(dashboard)/chat/page.tsx` | Fix autoMsg med ghost+repo params, sett tab, wire skills/subAgents, importer listSkills |
| `components/AgentStream.tsx` | parseProgress: håndter type:"progress", legg til "thinking" status og flere PHASE_LABELS |
| `app/(dashboard)/layout.tsx` | Sparkles → Wand2 for Skills |

## Verifisering

1. `npx next build` — ingen feil
2. Ingen hydration mismatch-warnings i konsollen
3. Overview: dither-animasjon bak chatboksen, chatboks fyller hele bredden
4. Overview: ghost-ikon er et tydelig spøkelse (Ghost fra lucide)
5. Overview: skriv "hei" → sendes til `/chat?msg=hei` → meldingen sendes automatisk, AI svarer
6. Overview: aktiver ghost, skriv melding → lander i Privat-tab på chat-siden
7. Chat: AgentStream viser fase/steg/rapport for agent_progress-meldinger
8. Chat: Skills-knapp åpner dropdown med tilgjengelige skills
9. Chat: Sub-agent-knapp toggler (visuell active-state)
10. Sidebar + ChatInput: Skills har tryllestav-ikon (Wand2)