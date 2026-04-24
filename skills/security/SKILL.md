---
name: security
description: Input validation, secret management, auth checks, injection prevention
applies_to: [coding, review]
project_types: []
trigger_keywords: []
priority: 9
min_complexity: 0
enabled: true
---

# Security Rules

- NEVER hardcode secrets, API keys, tokens, or passwords in source code
- NEVER commit .env files or credentials
- Validate and sanitize all user input at system boundaries
- Use parameterized queries for all SQL operations (template literals with SQLDatabase)
- Check for injection vulnerabilities: SQL injection, XSS, command injection
- Ensure auth checks are present on all sensitive endpoints
- Use HTTPS for all external API calls
- Log security-relevant events (login attempts, permission changes)
