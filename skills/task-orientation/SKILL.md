---
name: task-orientation
description: How to orient in a new or large codebase efficiently — manifests, memory, code-graph, component reuse
applies_to: [coding, planning]
project_types: []
trigger_keywords: []
priority: 7
min_complexity: 5
enabled: true
---

# Task Orientation

Before touching a large or unfamiliar codebase, build context efficiently.

## Orientation Checklist
1. Manifest — if project_manifests has entry, use it as primary overview
2. Memory — `memory_search` or `recall_memory` for prior decisions and insights on this project
3. Relevant files — `repo_find_relevant_files` ranks by task relevance, use before reading arbitrary files
4. Existing components — `find_component` + `use_component` before implementing anything reusable
5. Decomposition — `task_decompose_project` for multi-system work (complexity ≥ 5)

## Priorities
- Reuse > rewrite
- Read > guess
- Plan before execute (unless in Auto mode with low complexity)
- Verify via repo-evidence + Context7 before claiming framework facts
