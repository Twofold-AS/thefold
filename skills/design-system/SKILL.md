---
name: design-system
description: Design token approach, semantic colors, typography scales, component variants
applies_to: [coding]
project_types: [framer, figma, framer_figma]
trigger_keywords: [design, color, style, font, typography, component, layout, responsive]
priority: 7
min_complexity: 0
enabled: true
---

# Design System Skill

Build interfaces using design tokens, not inline values.

## Structure
When a project has a design.md attached (typically `{project-name}-design.md` in project_designs), use its frontmatter as the source of truth:
- `colors:` → semantic color tokens (primary, secondary, surface, on-surface, error)
- `typography:` → type scales (body-md, headline-lg, etc.)
- `rounded:` → border-radius scale

Reference tokens, never hardcode values.

## Rules
- Never use direct classes like `text-white`, `bg-black`, `text-[#fff]`
- Use semantic tokens: `text-primary`, `bg-surface`, `text-on-surface`
- Typography via token classes: `text-body-md`, `text-headline-lg`
- Border-radius via scale: `rounded-md` maps to design's `rounded.md`

## When no design.md exists
If the project has no attached design.md yet, ask the user for their preference or scrape a reference site and extract branding before building.

## Do's and Don'ts
- Do use tokens consistently across all components
- Don't mix hardcoded values and tokens in the same component
- Do maintain WCAG 4:1 contrast ratios
- Don't introduce new colors without adding them to the design.md
