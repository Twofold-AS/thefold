---
name: typescript-strict
description: TypeScript strict mode, exhaustive types, no any, proper error typing
applies_to: [coding, review]
project_types: [code, framer_figma, framer]
trigger_keywords: []
priority: 6
min_complexity: 0
enabled: true
---

# TypeScript Strict Mode

- Always use strict TypeScript — no `any` types unless absolutely necessary. When you reach for `any`, prefer `unknown` and narrow with a type-guard instead.
- Prefer `const` over `let`, never use `var`.
- Use exhaustive switch statements with `never` default case so the compiler flags unhandled variants.
- Prefer `interface` for object shapes, `type` for unions, intersections, and mapped types.
- Use TypeScript utility types (`Record`, `Partial`, `Pick`, `Omit`, `ReturnType`, `Parameters`) over bespoke definitions.
- Always type function parameters and return values explicitly on exported functions and public APIs. Internal helpers can rely on inference.
- Use `as const` for literal types where appropriate — especially config maps, enum-like objects, and discriminated-union tags.
- Prefer `readonly` on array and object types that are not meant to mutate downstream.
- For error handling, catch as `unknown` and narrow: `err instanceof Error ? err.message : String(err)`.
- Do not silence the compiler with `// @ts-ignore`. Use `// @ts-expect-error` with a reason when you genuinely need to, so it fails loudly when the underlying issue gets fixed.
