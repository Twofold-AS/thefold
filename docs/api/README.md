# TheFold API Documentation

## Overview

TheFold exposes a REST API built with [Encore.ts](https://encore.dev). All services are mounted under a single gateway.

**Local base URL:** `http://localhost:4000`
**Production base URL:** configured via `NEXT_PUBLIC_API_URL`

---

## Auto-generated API Explorer

Encore generates a live API explorer at the local development dashboard:

```
http://localhost:9400
```

Navigate to **API Explorer** to browse all endpoints, inspect schemas, and make test calls directly from the browser.

---

## OpenAPI / Swagger

To generate a typed OpenAPI spec, use the Encore CLI:

```bash
encore gen client <app-id> --lang=openapi
```

This outputs an `openapi.json` file you can import into Postman, Insomnia, or any OpenAPI-compatible tool.

To generate a TypeScript client:

```bash
encore gen client <app-id> --lang=typescript --env=local
```

---

## Authentication

All endpoints marked `auth: true` require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued by the `POST /users/login` OTP flow. Tokens expire after 7 days and can be revoked with `POST /gateway/revoke`.

Internal endpoints (exposed only within the service mesh) are not accessible from the public internet.

---

## Services & Endpoints

### gateway
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gateway/revoke` | Bearer | Revoke the current token |
| POST | `/gateway/token` | — | Internal: issue a new token |

### chat
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chat/send` | Bearer | Send a message (supports tool-use loop) |
| GET | `/chat/history` | Bearer | Fetch conversation history |
| GET | `/chat/conversations` | Bearer | List conversations |
| DELETE | `/chat/conversation` | Bearer | Delete a conversation |
| POST | `/chat/review/approve` | Bearer | Approve a pending code review |
| POST | `/chat/review/changes` | Bearer | Request changes on a review |
| POST | `/chat/review/reject` | Bearer | Reject a review |

### agent
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/agent/start` | Bearer | Start an autonomous task |
| GET | `/agent/stream` | Bearer | SSE stream for live agent events |
| GET | `/agent/job` | Bearer | Get job status |
| GET | `/agent/review/get` | Bearer | Get a code review |
| GET | `/agent/review/list` | Bearer | List code reviews |
| POST | `/agent/review/approve` | Bearer | Approve review → create PR |
| POST | `/agent/review/request-changes` | Bearer | Request changes |
| POST | `/agent/review/reject` | Bearer | Reject and destroy sandbox |
| POST | `/agent/project/start` | Bearer | Start a project (multi-task) |
| GET | `/agent/project/status` | Bearer | Project execution status |
| GET | `/agent/audit` | Bearer | Audit log |

### tasks
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/tasks/create` | Bearer | Create a task |
| GET | `/tasks/list` | Bearer | List tasks (filter by status/repo) |
| GET | `/tasks/get` | Bearer | Get a single task |
| DELETE | `/tasks/delete` | Bearer | Soft-delete a task |
| POST | `/tasks/sync-linear` | Bearer | Pull tasks from Linear |
| POST | `/tasks/plan-order` | Bearer | AI-order tasks by dependencies |
| GET | `/tasks/stats` | Bearer | Task statistics |

### ai
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ai/chat` | Bearer | Direct AI chat (no tool-use) |
| GET | `/ai/providers` | Bearer | List AI providers and models |
| POST | `/ai/providers/save` | Bearer | Upsert a provider |
| POST | `/ai/models/save` | Bearer | Upsert a model |
| POST | `/ai/models/toggle` | Bearer | Enable/disable a model |
| POST | `/ai/models/delete` | Bearer | Delete a model |
| POST | `/ai/estimate-sub-agent-cost` | Bearer | Preview sub-agent cost |

### memory
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/memory/store` | Bearer | Store a memory |
| POST | `/memory/search` | Bearer | Semantic + keyword search |
| GET | `/memory/list` | Bearer | List memories |
| DELETE | `/memory/delete` | Bearer | Delete a memory |
| POST | `/memory/re-embed` | Bearer | Re-embed memories (OpenAI) |

### skills
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/skills/list` | Bearer | List skills |
| POST | `/skills/create` | Bearer | Create a skill |
| PUT | `/skills/update` | Bearer | Update a skill |
| DELETE | `/skills/delete` | Bearer | Delete a skill |

### github
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/github/repos` | Bearer | List accessible repos |
| GET | `/github/tree` | Bearer | Get file tree |
| POST | `/github/repo/create` | Bearer | Create a new repo |

### sandbox
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/sandbox/create` | Internal | Create sandbox |
| POST | `/sandbox/validate` | Internal | Run validation pipeline (tsc+lint+test) |
| DELETE | `/sandbox/destroy` | Internal | Destroy sandbox |

---

## SSE Stream

The `/agent/stream` endpoint uses Server-Sent Events.

### Connecting

```javascript
const source = new EventSource(
  `http://localhost:4000/agent/stream?taskId=${taskId}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

### Event types

| Event | Description |
|-------|-------------|
| `agent.status` | Phase/status change |
| `agent.message` | AI text output |
| `agent.tool_use` | Before each tool call |
| `agent.tool_result` | After each tool call |
| `agent.thinking` | AI reasoning trace |
| `agent.progress` | Step-level progress |
| `agent.error` | Error (may be recoverable) |
| `agent.done` | Task completed — includes summary |
| `agent.heartbeat` | Keepalive (every 15s) |

### Wire format

```
id: <uuid>
event: agent.status
data: {"timestamp":"2026-04-10T12:00:00.000Z","data":{"status":"planning","phase":"planning"}}

```

---

## Error format

All errors follow the Encore API error format:

```json
{
  "code": "not_found",
  "message": "task not found",
  "details": null
}
```

Common codes: `unauthenticated`, `permission_denied`, `not_found`, `invalid_argument`, `resource_exhausted`, `internal`.
