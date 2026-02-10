# TheFold — Development Instructions

## What is TheFold?
An autonomous fullstack development agent. It reads tasks from Linear, reads/writes code via GitHub, validates in a sandbox, and delivers PRs with documentation.

## Architecture (8 Encore.ts services)
```
gateway  → Auth (Bearer token with HMAC)
chat     → Communication channel (user ↔ TheFold), PostgreSQL
ai       → Claude API orchestration, system prompts, structured output
agent    → The brain: autonomous task execution loop
github   → Read/write repos via GitHub API
sandbox  → Isolated code execution, validation (tsc, eslint, tests)
linear   → Task management, cron sync, status updates
memory   → pgvector semantic search, persistent context
docs     → Context7 MCP for up-to-date library documentation
```

## Critical Rules
- ALL APIs: `api()` from "encore.dev/api"
- ALL secrets: `secret()` from "encore.dev/config"
- ALL databases: `SQLDatabase` from "encore.dev/storage/sqldb"
- ALL pub/sub: `Topic`/`Subscription` from "encore.dev/pubsub"
- NEVER Express, Fastify, dotenv, process.env
- NEVER hardcode keys, tokens, passwords

## Agent Flow
1. Linear task picked up (cron or user request via chat)
2. GitHub: read project tree + relevant files
3. Memory: search for relevant context
4. Context7: look up library docs
5. AI: plan the work (structured JSON output)
6. Sandbox: clone repo, write files, validate (tsc + eslint + tests)
7. If validation fails: AI reads error, fixes, retries (max 3)
8. GitHub: create branch + PR with documentation
9. Linear: update task to "In Review" with documentation comment
10. Memory: store key decisions for future context
11. Chat: report to user with full explanation

## Running
```bash
encore run              # all services + local infra
# Dashboard: http://localhost:9400
```

## Self-hosting
```bash
encore build docker thefold:latest --config infra-config.json
docker compose up -d
```

## Key Files
- `agent/agent.ts` — The autonomous loop (most critical file)
- `ai/ai.ts` — System prompts and Claude API calls
- `sandbox/sandbox.ts` — Code execution and validation
- `github/github.ts` — Repository operations
