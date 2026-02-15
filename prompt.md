# Chat: Backend timeout-fiks, Stopp-knapp, Agent-synlighet, Animasjoner

## Instruksjoner

Les disse filene FØR du begynner — les HELE filen:
1. `chat/chat.ts` — Spesielt `sendMessage`. Forstå hele flyten fra bruker sender melding til AI svarer.
2. `ai/ai.ts` — `chat()` funksjonen, `callAIWithFallback()`, system prompts
3. `frontend/src/app/(dashboard)/chat/page.tsx` — Chat UI
4. `frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx` — Repo chat UI
5. `frontend/src/components/AgentStatus.tsx` — Nåværende status-komponent
6. `frontend/src/app/globals.css` — Animasjoner
7. `frontend/src/lib/api.ts` — API-kall
8. Les `/mnt/skills/public/frontend-design/SKILL.md` for design-inspirasjon

---

## PROBLEM 1: AI-KALLET HENGER — Backend

### Diagnose

`sendMessage` i `chat/chat.ts` gjør sannsynligvis ALT synkront:
1. Lagrer brukermelding
2. Henter skills, memory, repo-kontekst (kan ta 5-30s)
3. Kaller AI API (kan ta 10-60s)
4. Lagrer AI-svar
5. Returnerer til frontend

Hvis noe i steg 2-3 feiler stille (timeout, API error som svelges), henger kallet for alltid. Frontend viser "Tenker..." i evigheten.

### Fiks A: Timeouts på alle eksterne kall

I `sendMessage`, wrap ALLE eksterne kall med en timeout-helper:

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    console.error(`Call timed out after ${ms}ms, using fallback`);
    return fallback;
  }
}
```

Bruk:
```typescript
// Skills: 5s timeout, fallback = tom liste
const skills = await withTimeout(skills.resolve(...), 5000, { skills: [] });

// Memory: 5s timeout, fallback = tom liste  
const memories = await withTimeout(memory.search(...), 5000, { results: [] });

// GitHub: 10s timeout, fallback = tom streng
const repoContext = await withTimeout(github.getTree(...), 10000, { tree: "" });

// AI: 60s timeout, fallback = feilmelding
const aiResponse = await withTimeout(
  ai.chat(...), 
  60000, 
  { content: "Beklager, AI-kallet tok for lang tid. Prøv igjen med en enklere melding.", modelUsed: "none", costUsd: 0 }
);
```

### Fiks B: Asynkron meldingshåndtering

Endre `sendMessage` til å returnere UMIDDELBART etter å ha lagret brukerens melding, og prosessere AI-svaret asynkront:

```typescript
export const sendMessage = api(
  { method: "POST", path: "/chat/send", expose: true, auth: true },
  async (req: SendMessageRequest): Promise<SendMessageResponse> => {
    const auth = getAuthData()!;
    
    // 1. Lagre brukermelding — returnerer umiddelbart til frontend
    const userMsg = await insertMessage(req.conversationId, auth.userID, "user", req.content);
    
    // 2. Lagre en placeholder "thinking" melding
    const placeholderId = await insertMessage(
      req.conversationId, "thefold", "assistant", 
      JSON.stringify({ type: "agent_status", phase: "Tenker", steps: [
        { label: "Starter...", icon: "search", status: "active" }
      ]}),
      "agent_status"  // messageType
    );
    
    // 3. Prosesser AI-svar asynkront (fire-and-forget)
    processAIResponse(req.conversationId, req.content, placeholderId.id, auth).catch(err => {
      console.error("AI processing failed:", err);
      // Oppdater placeholder med feilmelding
      updateMessageContent(placeholderId.id, "Beklager, noe gikk galt. Prøv igjen.");
      updateMessageType(placeholderId.id, "assistant");
    });
    
    // 4. Returner umiddelbart
    return { 
      userMessage: userMsg, 
      assistantMessage: { id: placeholderId.id, content: "", role: "assistant" } 
    };
  }
);

// Asynkron prosessering
async function processAIResponse(
  conversationId: string, 
  userContent: string, 
  placeholderId: string,
  auth: AuthData
) {
  // Steg 1: Oppdater status — henter kontekst
  await updateAgentStatus(placeholderId, {
    phase: "Forbereder",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: "Henter relevante skills", icon: "sparkle", status: "active" },
      { label: "Søker i minne", icon: "search", status: "pending" },
      { label: "Genererer svar", icon: "code", status: "pending" },
    ]
  });
  
  // Hent skills med timeout
  const resolvedSkills = await withTimeout(/* skills.resolve */, 5000, { skills: [] });
  
  await updateAgentStatus(placeholderId, {
    phase: "Forbereder",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: `${resolvedSkills.skills?.length || 0} skills funnet`, icon: "sparkle", status: "done" },
      { label: "Søker i minne", icon: "search", status: "active" },
      { label: "Genererer svar", icon: "code", status: "pending" },
    ]
  });
  
  // Hent memory med timeout
  const memories = await withTimeout(/* memory.search */, 5000, { results: [] });
  
  await updateAgentStatus(placeholderId, {
    phase: "Genererer svar",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: `${resolvedSkills.skills?.length || 0} skills funnet`, icon: "sparkle", status: "done" },
      { label: `${memories.results?.length || 0} minner funnet`, icon: "search", status: "done" },
      { label: "Genererer svar...", icon: "code", status: "active" },
    ]
  });
  
  // Kall AI med timeout
  const aiResponse = await withTimeout(/* ai.chat(...) */, 60000, { 
    content: "Beklager, AI-kallet tok for lang tid. Prøv igjen.", 
    modelUsed: "fallback", costUsd: 0 
  });
  
  // Erstatt placeholder med faktisk svar
  await updateMessageContent(placeholderId, aiResponse.content);
  await updateMessageType(placeholderId, "assistant");
}

// Hjelpefunksjoner
async function updateAgentStatus(messageId: string, status: object) {
  await db.exec`UPDATE messages SET content = ${JSON.stringify({ type: "agent_status", ...status })} WHERE id = ${messageId}`;
}

async function updateMessageContent(messageId: string, content: string) {
  await db.exec`UPDATE messages SET content = ${content}, updated_at = NOW() WHERE id = ${messageId}`;
}

async function updateMessageType(messageId: string, messageType: string) {
  await db.exec`UPDATE messages SET message_type = ${messageType}, updated_at = NOW() WHERE id = ${messageId}`;
}
```

### Fiks C: Stopp/avbryt endepunkt

Legg til i `chat/chat.ts`:

```typescript
// In-memory set for cancelled conversations
const cancelledConversations = new Set<string>();

export const cancelGeneration = api(
  { method: "POST", path: "/chat/cancel", expose: true, auth: true },
  async (req: { conversationId: string }): Promise<{ success: boolean }> => {
    cancelledConversations.add(req.conversationId);
    
    // Oppdater thinking-melding til avbrutt
    await db.exec`
      UPDATE messages 
      SET content = 'Generering avbrutt.', message_type = 'assistant'
      WHERE conversation_id = ${req.conversationId} 
        AND message_type = 'agent_status'
    `;
    
    return { success: true };
  }
);

// Sjekk i processAIResponse mellom hvert steg:
async function processAIResponse(...) {
  if (cancelledConversations.has(conversationId)) {
    cancelledConversations.delete(conversationId);
    return;
  }
  // ... hent skills ...
  
  if (cancelledConversations.has(conversationId)) {
    cancelledConversations.delete(conversationId);
    return;
  }
  // ... hent memory ...
  
  // osv.
}
```

Legg til `cancelGeneration` i `api.ts`:
```typescript
export async function cancelChatGeneration(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/cancel", { method: "POST", body: { conversationId } });
}
```

---

## PROBLEM 2: FRONTEND — Stopp-knapp + bedre animasjoner

### 2.1 Stopp-knapp

Når AI jobber (pollMode === "waiting"), vis en "Stopp" knapp under AgentStatus:

```tsx
{isWaitingForAI && (
  <div className="flex justify-start pl-4 mt-2">
    <button
      onClick={async () => {
        await cancelChatGeneration(activeConvId);
        setPollMode("idle");
        setIsWaitingForAI(false);
      }}
      className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors"
      style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
    >
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" />
      </svg>
      <span className="text-sm">Stopp generering</span>
    </button>
  </div>
)}
```

### 2.2 AgentStatus — Redesign med bedre animasjoner

Skriv om `AgentStatus.tsx` komplett. Bruk referansebildet som inspirasjon:

```tsx
"use client";
import { useState } from "react";

interface AgentStep {
  label: string;
  icon: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

interface AgentStatusProps {
  steps: AgentStep[];
  currentPhase: string;
  subPhase?: string;
  progress?: { current: number; total: number };
  isComplete?: boolean;
}

const ICON_MAP: Record<string, string> = {
  search: "🔍",
  sparkle: "✨",
  code: "💻",
  file: "📄",
  test: "🧪",
  deploy: "🚀",
  error: "⚡",
  check: "✓",
  service: "🔗",
  chart: "📊",
};

export function AgentStatus({ steps, currentPhase, subPhase, progress, isComplete }: AgentStatusProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="my-3 max-w-md message-enter">
      {/* Header med TheFold ikon + animert fasetekst */}
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        style={{ border: "1px solid var(--border)", borderBottom: collapsed ? "1px solid var(--border)" : "none" }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {/* TheFold ikon med pulsering */}
        <div className="relative shrink-0">
          <div className="w-8 h-8 flex items-center justify-center" style={{ border: "1px solid var(--border)" }}>
            <span className="font-brand text-xs" style={{ color: "var(--text-primary)" }}>TF</span>
          </div>
          {!isComplete && <div className="absolute -top-1 -right-1 agent-pulse" />}
        </div>
        
        {/* Fase-tekst med typewriter-animasjon */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span 
              className={`text-sm font-medium ${!isComplete ? "agent-shimmer" : ""}`}
              style={{ color: "var(--text-primary)" }}
            >
              {currentPhase}
            </span>
            {progress && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                ({progress.current}/{progress.total})
              </span>
            )}
          </div>
          {subPhase && (
            <span className="text-xs block truncate agent-typing" style={{ color: "var(--text-muted)" }}>
              {subPhase}
            </span>
          )}
        </div>
        
        {/* Collapse chevron */}
        <svg 
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          style={{ color: "var(--text-muted)" }}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
      
      {/* Steg-liste */}
      {!collapsed && steps.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
          {steps.map((step, i) => (
            <div 
              key={i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ 
                borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                animation: step.status === "active" ? "none" : `agent-step-enter 0.3s ease-out ${i * 0.08}s both`,
              }}
            >
              {/* Ikon */}
              <span className="w-5 text-center shrink-0">
                {step.status === "active" ? (
                  <span className="inline-block agent-spinner-small" />
                ) : step.status === "done" ? (
                  <span className="text-green-500 text-sm agent-check-in">✓</span>
                ) : step.status === "error" ? (
                  <span className="text-red-500 text-sm">✕</span>
                ) : (
                  <span className="text-sm opacity-30">{ICON_MAP[step.icon] || "○"}</span>
                )}
              </span>
              
              {/* Label med shimmer-effekt når active */}
              <span 
                className={`text-sm flex-1 ${step.status === "active" ? "agent-shimmer" : ""}`}
                style={{ 
                  color: step.status === "done" ? "var(--text-muted)" 
                       : step.status === "active" ? "var(--text-primary)" 
                       : "rgba(255,255,255,0.25)",
                  textDecoration: step.status === "done" ? "line-through" : "none",
                  textDecorationColor: "rgba(255,255,255,0.15)",
                }}
              >
                {step.label}
              </span>
              
              {/* Detail */}
              {step.detail && (
                <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 2.3 Nye CSS-animasjoner i globals.css

Legg til disse animasjonene (behold eksisterende, legg til nye):

```css
/* Shimmer-effekt på aktiv tekst — som andre AI-chatbots */
.agent-shimmer {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    rgba(255,255,255,0.4) 50%,
    var(--text-primary) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: agent-shimmer 2s ease-in-out infinite;
}
@keyframes agent-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Liten spinner for steg */
.agent-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: agent-spin 0.7s linear infinite;
  display: inline-block;
}

/* Steg fade-in med delay */
@keyframes agent-step-enter {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* TheFold logo-tekst shimmer (sidebar + chat avatar) */
.brand-shimmer {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    rgba(255,255,255,0.5) 40%,
    var(--text-primary) 80%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: brand-shimmer 3s ease-in-out infinite;
}
@keyframes brand-shimmer {
  0% { background-position: 300% 0; }
  100% { background-position: -300% 0; }
}
```

### 2.4 TheFold logo/tekst shimmer

I sidebar.tsx — "TheFold" teksten ved siden av ikonet:
```tsx
<span className="font-brand text-lg brand-shimmer">TheFold</span>
```

I chat — TheFold avatar ved meldinger (når AI svarer):
```tsx
<span className="font-brand text-xs brand-shimmer">TheFold</span>
```

Shimmer-effekten er subtil: teksten glitrer svakt, som om den tenker.

### 2.5 "TheFold tenker..." forbedret

Erstatt den enkle "TheFold tenker..." med en mer visuell indikator som vises UMIDDELBART etter bruker sender melding (før polling returnerer agent_status):

```tsx
{isWaitingForAI && !currentAgentStatus && (
  <div className="flex items-start gap-3 py-3 message-enter">
    <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ border: "1px solid var(--border)" }}>
      <span className="font-brand text-xs brand-shimmer">TF</span>
    </div>
    <div className="flex items-center gap-2 py-2">
      <div className="agent-pulse" />
      <span className="text-sm agent-shimmer">TheFold tenker</span>
      <span className="agent-dots">
        <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
      </span>
    </div>
  </div>
)}
```

Animerte dots:
```css
.agent-dots .dot {
  animation: agent-dot-bounce 1.4s ease-in-out infinite;
  display: inline-block;
  color: var(--text-muted);
}
.agent-dots .dot:nth-child(1) { animation-delay: 0s; }
.agent-dots .dot:nth-child(2) { animation-delay: 0.2s; }
.agent-dots .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes agent-dot-bounce {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
```

---

## PROBLEM 3: AI-EN DUMPER RÅ KODE I CHATTEN

### Diagnose

System prompten i `ai.chat()` forteller sannsynligvis AI-en at den skal generere kode. For en enkel chat-spørsmål som "Se over repoet" skal AI-en svare konversasjonelt, IKKE dumpe en plan med kode.

### Fiks i ai/ai.ts

Sjekk system prompten for `chat()`. Den bør ha instruksjoner som:

```
Du er TheFold, en AI-utviklingsagent. I chatten svarer du konversasjonelt og kort.

Regler:
- IKKE generer kode med mindre brukeren eksplisitt ber om det
- IKKE lag lange planer med mindre brukeren ber om det
- For spørsmål som "se over repoet": gi en kort oppsummering (3-5 setninger) av hva du finner
- For spørsmål som "hva bør vi endre": gi 3-5 konkrete forslag som korte punkter
- Bruk norsk
- Vær direkte og konsis
- Hvis brukeren vil at du GJØR endringer (ikke bare snakker om dem), forklar at de kan starte en task
```

Sjekk og fiks dette i system prompten.

---

## OPPSUMMERING

| # | Hva | Prioritet |
|---|-----|-----------|
| 1 | Backend: sendMessage returnerer umiddelbart, AI prosesseres asynkront | KRITISK |
| 2 | Backend: Timeouts på alle eksterne kall (5-60s) | KRITISK |
| 3 | Backend: cancelGeneration endepunkt | HØY |
| 4 | Frontend: Stopp-knapp under AgentStatus | HØY |
| 5 | Frontend: AgentStatus redesign med shimmer, steg-animasjoner | HØY |
| 6 | Frontend: "TheFold tenker..." umiddelbar med shimmer + dots | HØY |
| 7 | Frontend: TheFold logo shimmer i sidebar og chat | MEDIUM |
| 8 | CSS: shimmer, spinner-small, step-enter, dots animasjoner | MEDIUM |
| 9 | Backend: Fiks AI system prompt for konversasjonell chat | MEDIUM |

---

## Oppdater dokumentasjon
- `GRUNNMUR-STATUS.md`
- `KOMPLETT-BYGGEPLAN.md`

## Rapport
✅ Fullført, ⚠️ Ikke fullført, 🐛 Bugs, 📋 Antall filer endret