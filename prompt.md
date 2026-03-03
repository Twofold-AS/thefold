Sprint 6.24 — planTask streaming + frontend polling-stopp

Endring 1: Bytt planTask til streaming
Fil: ai/ai.ts
planTask() bruker client.messages.create() (non-streaming) for Anthropic-kall. Anthropic SDK kaster nå feil umiddelbart med meldingen "Streaming is strongly recommended for operations that may take longer than 10 minutes". Feilen treffer både Sonnet og Opus (upgrade-modellen), så hele planTask feiler.
Bytt til streaming: bruk client.messages.stream() eller tilsvarende, og samle opp response-chunks til en komplett streng. Deretter kjør eksisterende JSON-parsing og repareringslogikk (fra 6.22) på den ferdige strengen.
Sjekk hvordan callAnthropicWithTools i chat allerede håndterer streaming — bruk samme mønster. Hvis det finnes en felles callAnthropic-funksjon som planTask bruker, fiks den der slik at alle kall som går gjennom den får streaming automatisk.

Endring 2: Stopp frontend history-polling ved feil
Fil: frontend/src/app/(dashboard)/chat/page.tsx
Etter at agenten feiler, fortsetter frontend å polle history-endepunktet aggressivt (15+ kall på noen sekunder). Polling må stoppe når agenten er ferdig — enten suksess eller feil.
Finn polling-logikken (sannsynligvis en setInterval eller setTimeout-loop som kaller history-endepunktet). Legg til sjekk: hvis siste mottatte agent-melding har status: "failed" eller phase: "Feilet", stopp polling. Gjør det samme for status: "done" hvis det ikke allerede er håndtert.

Ikke endre noe annet. maxTokens-økningen fra 6.23 og JSON-reparering fra 6.22 beholdes.