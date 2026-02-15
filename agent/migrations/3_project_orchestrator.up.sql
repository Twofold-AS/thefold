-- Project Orchestrator tables for decomposing large requests into atomic tasks
-- Steg 3.4, Del 1

CREATE TABLE project_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) NOT NULL,
    user_request TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning',
    current_phase INT DEFAULT 0,
    plan_data JSONB NOT NULL DEFAULT '{}',
    conventions TEXT,
    total_tasks INT DEFAULT 0,
    completed_tasks INT DEFAULT 0,
    failed_tasks INT DEFAULT 0,
    total_cost_usd DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES project_plans(id) ON DELETE CASCADE,
    phase INT NOT NULL DEFAULT 0,
    task_order INT NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    depends_on UUID[],
    output_files TEXT[],
    output_types TEXT[],
    context_hints TEXT[],
    linear_task_id VARCHAR(255),
    pr_url TEXT,
    cost_usd DECIMAL DEFAULT 0,
    error_message TEXT,
    attempt_count INT DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_phase ON project_tasks(project_id, phase, task_order);
