# TheFold — Oppdatert plan (12. april 2026)

## Fase 1: Kritiske fikser (gjør først)
- [x] Duplikat AgentEventBus i event-bus.ts — FIKSET nå
- [x] Fjern død kode (9 ubrukte komponenter) — FIKSET nå
- [ ] Verifiser useAgentStream.ts parser SSE-events riktig etter tool-loop.ts field renames (messageId → fjernet, errorType → code, retryable → recoverable, summary → finalText)
- [ ] Legg til type assertions på callAIWithFallback returns i execution.ts, confidence.ts, context-builder.ts, completion.ts

## Fase 2: Chat UX (viktigst for brukeren)
- [ ] SSE sanntidsstreaming av agent-tekst (nå brukes polling som fallback)
- [ ] Koble processAIResponse SSE-events til frontend — events emitteres men frontend kobler ikke alltid til riktig stream
- [ ] Auto-refresh når review er klar (polling stopper for tidlig)
- [ ] Verifiser at review-knappene (Godkjenn/Avvis/Be om endringer) faktisk kaller backend
- [ ] Vis diff/filendringer i review-panelet
- [ ] Typing-indikator med live status-oppdateringer fra SSE (Tenker → Henter kontekst → Genererer svar)
- [ ] Replay-buffer ved SSE reconnect (getBuffer() finnes men brukes ikke i stream.ts)

## Fase 3: Manglende sider
- [ ] Lag /settings/models side — AI model CRUD (backend endpoints finnes: /ai/providers, /ai/models/save, etc.)
- [ ] Lag /review/[id] side — dedikert code review med fil-diffs, AI review-sammendrag, kvalitetsscore
- [ ] Koble shared-komponenter (ConnectionStatus, ErrorBoundary, LoadingSkeleton, TimeAgo, StatusBadge) inn i sidene

## Fase 4: Agent-pålitelighet
- [ ] Agent bør kjøre full tool-loop for direkte chat, ikke bare lage task-record
- [ ] Bedre feilhåndtering når agent feiler midt i arbeid
- [ ] Context manager — sliding window for lange samtaler
- [ ] Multi-agent koordinering (sub-agents for parallelle oppgaver)
- [ ] Heartbeat-timeout detection i frontend

## Fase 5: Frontend polish
- [ ] Bruk useApiData hook konsekvent (finnes i lib/hooks.ts men brukes bare i 2 av 15+ sider)
- [ ] Responsive design-gjennomgang
- [ ] Error boundaries på alle sider (ErrorBoundary.tsx finnes men brukes ikke)
- [ ] Loading skeletons (LoadingSkeleton.tsx finnes men brukes ikke)
- [ ] Keyboard shortcuts (Cmd+Enter for send, Esc for avbryt)
- [ ] Toast-varsler for bakgrunns-events

## Fase 6: Testing
- [ ] E2E test av chat send → response → review → approve flow
- [ ] SSE connection/reconnection testing
- [ ] Agent tool-loop integration tests
- [ ] Load testing av concurrent SSE connections
- [ ] Storybook — ekskluder .stories.tsx fra hoved tsc-config

## Bugs fikset 11-12. april
- /knowledge, /projects, /builds 404 — FIKSET (server kjørte fra feil worktree + manglende imports)
- 50s responstid — FIKSET (parallelliserte GitHub API-kall)
- Ingen typing-indikator — FIKSET (TypingIndicator komponent med pulserende dots)
- Meldinger vises ikke uten refresh — FIKSET (polling fallback)
- Agent spør om bekreftelse — FIKSET (AI prompt endret til auto-start)
- Dobbelt robot-ikon — FIKSET (sletter tom placeholder)
- Review-knapper koblet opp — FIKSET (onClick → API)
- Duplikat AgentEventBus — FIKSET (fjernet merge-artifact)
- 9 døde komponenter — FIKSET (slettet)

## Teknisk gjeld
- api.ts shim (3 linjer) re-eksporterer fra api/ moduler — fungerer men bør fjernes når alle imports er oppdatert
- ~80 `~encore/clients` TS-feil er forventet (Encore genererer types ved build)
- 3289 frontend TS-feil er miljø-avhengige (krever Next.js plugin aktiv)
