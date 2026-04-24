---
name: framer-conventions
description: Framer page-building patterns, template with header+footer, framer_* tool usage, lazy companion repo
applies_to: [coding]
project_types: [framer, framer_figma]
trigger_keywords: []
priority: 8
min_complexity: 0
enabled: true
---

# Framer-specific Rules (design-platform work)

**Publishing target.** This project is a Framer site. Components live in the Framer project, NOT in a GitHub repo. Use the framer_* tools, never repo_write_file:

- `framer_list_code_files` — discover existing components before creating new ones.
- `framer_create_code_file` — create a new component with PascalCase name (e.g. `HeroSection`) and full TSX source.
- `framer_set_file_content` — overwrite an existing component's source (requires the fileId from list/create).
- `framer_publish` — creates a preview deployment. Returns deploymentId + shareable hostnames.
- `framer_deploy` — promotes a preview to production. ONLY call this after the user has explicitly approved the preview.

**Component structure.** Always start with a template that includes header and footer components. Header and footer MUST be implemented as separate components in their own files — never inline inside the page.

**Gather context.** If the web_scrape tool is enabled, use it to collect images, copy, and style references from any URL the user provides before writing components.

**Hybrid projects (framer_figma).** Both framer_* and repo_* tools are available. Use framer_* for anything that renders on the canvas; use repo_write_file only for server-side code or assets that don't live in the Framer project.

**Lazy companion repo.** Pure Framer work should NOT trigger creation of a GitHub companion repo. The agent defers `ensureProjectRepo` to the first `build_create_sandbox` call — so if you never open a sandbox, no repo is created.
