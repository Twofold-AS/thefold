# TheFold — Kontosoppsett

## Secrets som MA settes (i rekkefølge):

### 1. OpenAI (for memory embeddings)
- Ga til platform.openai.com -> API Keys
- Opprett en ny nokkel med navnet "thefold-memory"
- Kjor:
```bash
encore secret set OpenAIApiKey --type local
encore secret set OpenAIApiKey --type dev
encore secret set OpenAIApiKey --type prod
```

### 2. GitHub App (for repo-tilgang)
- Ga til github.com -> Settings -> Developer settings -> GitHub Apps
- Opprett en ny app for thefold-dev organisasjonen
- Gi appen tilgang til: Contents (read/write), Pull requests (read/write), Issues (read)
- Installer appen pa organisasjonen
- Kjor:
```bash
encore secret set GitHubAppId --type prod
encore secret set GitHubAppPrivateKey --type prod
```
(lim inn HELE .pem-filen inkludert BEGIN/END linjer for private key)

### 3. Firecrawl (for web-tilgang) — VALGFRITT
- Ga til firecrawl.dev -> Dashboard -> API Keys
- Gratis tier: 500 sider/maned
- Kjor:
```bash
encore secret set FirecrawlApiKey --type prod
```

### 4. OpenRouter (for flere AI-modeller) — VALGFRITT
- Ga til openrouter.ai -> Keys
- Gir tilgang til modeller fra alle leverandorer via ett API
- Kjor:
```bash
encore secret set OpenRouterApiKey --type prod
```

### 5. Fireworks (for billige modeller) — VALGFRITT
- Ga til fireworks.ai -> API Keys
- Spesialisert pa raske, billige inferens
- Kjor:
```bash
encore secret set FireworksApiKey --type prod
```

### 6. TheFold e-post
- Sett opp e-postdomene i Resend for thefold.dev
- Verifiser DNS-records (SPF, DKIM, DMARC)
- Kjor:
```bash
encore secret set TheFoldEmail --type prod
```
(f.eks. "agent@thefold.dev")

## Feature flags (aktiver gradvis):

Alle feature flags er Encore secrets med verdien "true" eller "false".
Aktiver en om gangen, test mellom hver:

```bash
# Fase 1: Ny meldingskontrakt (ZA, ZB, ZC, ZD, ZE)
encore secret set ZNewMessageContract --type prod  # verdi: "true"

# Fase 2: Multi-provider AI (ZH)
encore secret set ZMultiProvider --type prod        # verdi: "true"

# Fase 3: GitHub App auth (ZK)
encore secret set ZGitHubApp --type prod            # verdi: "true"

# Fase 4: Dynamiske sub-agenter (ZN)
encore secret set ZDynamicSubAgents --type prod     # verdi: "true"

# Fase 5: Healing-pipeline (ZM)
encore secret set ZHealingEnabled --type prod       # verdi: "true"
```

## Re-embedding av minner:

Etter at OpenAIApiKey er konfigurert, ma alle eksisterende minner
re-embeddes (dimensjonsendring fra 1024 til 1536):

```bash
curl -X POST https://your-encore-app/memory/re-embed \
  -H "Authorization: Bearer <token>"
```

Dette kan ta tid avhengig av antall minner. Sjekk respons for
processed/failed-tall.

## Verifisering:

Etter oppsett, verifiser at alt fungerer:

1. **Memory:** Test sok i /memory/search — skal returnere resultater
2. **GitHub App:** Test /github/repo/create — skal opprette repo
3. **Web:** Test /web/health — skal returnere "ready"
4. **MCP:** Test /mcp/validate for installerte servere
5. **E-post:** Test ved a fullore en oppgave — skal motta e-post

## Eksisterende secrets (allerede konfigurert):

- `AuthSecret` — HMAC token signing
- `ResendApiKey` — Email OTP delivery
- `VoyageAPIKey` — Legacy embeddings (erstattet av OpenAIApiKey)
- `GitHubToken` — Legacy PAT (erstattet av GitHub App)
- `SandboxMode` — "docker" | "filesystem" (default: filesystem)
