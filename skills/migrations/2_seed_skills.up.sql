INSERT INTO skills (name, description, prompt_fragment, applies_to, scope) VALUES
(
  'Encore.ts Rules',
  'Enforces strict Encore.ts conventions — no Express, no dotenv, only Encore primitives.',
  E'## Encore.ts Rules (MANDATORY)\n- ONLY use `api()` from "encore.dev/api" for endpoints\n- ONLY use `secret()` from "encore.dev/config" for secrets\n- ONLY use `SQLDatabase` from "encore.dev/storage/sqldb" for databases\n- ONLY use `Topic`/`Subscription` from "encore.dev/pubsub" for messaging\n- ONLY use `CronJob` from "encore.dev/cron" for scheduled tasks\n- NEVER use Express, Fastify, Hono, Koa, or any HTTP framework\n- NEVER use process.env, dotenv, or .env files\n- NEVER hardcode API keys, tokens, passwords, or connection strings\n- Service-to-service calls use `~encore/clients`\n- Each service has its own `encore.service.ts` file',
  ARRAY['coding'],
  'global'
),
(
  'TypeScript Strict',
  'Enforces TypeScript strict mode, prefer const, exhaustive switches, proper typing.',
  E'## TypeScript Strict Mode\n- Always use strict TypeScript — no `any` types unless absolutely necessary\n- Prefer `const` over `let`, never use `var`\n- Use exhaustive switch statements with `never` default case\n- Prefer `interface` for object shapes, `type` for unions/intersections\n- Use TypeScript utility types (Record, Partial, Pick, Omit) over custom definitions\n- Always type function parameters and return values explicitly\n- Use `as const` for literal types where appropriate',
  ARRAY['coding', 'review'],
  'global'
),
(
  'Security Awareness',
  'Scans for common security issues — hardcoded secrets, injection, unsafe patterns.',
  E'## Security Rules\n- NEVER hardcode secrets, API keys, tokens, or passwords in source code\n- NEVER commit .env files or credentials\n- Validate and sanitize all user input at system boundaries\n- Use parameterized queries for all SQL operations (template literals with SQLDatabase)\n- Check for injection vulnerabilities: SQL injection, XSS, command injection\n- Ensure auth checks are present on all sensitive endpoints\n- Use HTTPS for all external API calls\n- Log security-relevant events (login attempts, permission changes)',
  ARRAY['coding', 'review'],
  'global'
),
(
  'Norwegian Docs',
  'Writes PR descriptions, Linear comments, and user-facing documentation in Norwegian.',
  E'## Norwegian Documentation\n- Write all PR descriptions in Norwegian\n- Write all Linear task comments in Norwegian\n- Write all user-facing UI text in Norwegian\n- Use technical terms in English where no good Norwegian equivalent exists\n- Code comments and variable names remain in English\n- Error messages shown to users should be in Norwegian',
  ARRAY['review'],
  'global'
),
(
  'Test Coverage',
  'Ensures tests are written for all new functionality using Vitest.',
  E'## Test Coverage Requirements\n- Write tests for every new API endpoint\n- Write tests for edge cases and error paths\n- Use Vitest as the test framework\n- Use `describe` and `it` blocks for clear test structure\n- Test database operations with real database (Encore test infrastructure)\n- Mock external API calls (Resend, GitHub, Linear)\n- Aim for coverage of happy path + at least 2 error cases per endpoint\n- Test validation and rate limiting logic',
  ARRAY['coding'],
  'global'
);
