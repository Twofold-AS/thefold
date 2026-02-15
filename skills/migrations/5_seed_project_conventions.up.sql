-- Seed skill: Project Conventions
-- Used by the Project Orchestrator to inject per-project conventions into all sub-tasks

INSERT INTO skills (
    name,
    description,
    prompt_fragment,
    applies_to,
    scope,
    category,
    tags,
    execution_phase,
    priority,
    token_estimate,
    routing_rules,
    enabled
) VALUES (
    'Project Conventions',
    'Kompakt konvensjonsdokument som sikrer konsistent kode på tvers av alle oppgaver i et prosjekt. Erstattes dynamisk per prosjekt med conventions fra project_plans.',
    E'## Project Conventions\nThis skill is dynamically replaced with project-specific conventions during orchestrated execution.\nWhen no project conventions are active, follow the standard project patterns.',
    ARRAY['planning', 'coding', 'review'],
    'global',
    'quality',
    ARRAY['conventions', 'consistency', 'orchestrator'],
    'inject',
    1,
    500,
    '{"keywords": ["project", "orchestrator", "decompose", "conventions"]}'::jsonb,
    true
);
