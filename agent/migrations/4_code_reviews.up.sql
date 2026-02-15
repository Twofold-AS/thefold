CREATE TABLE code_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) NOT NULL,
    task_id TEXT NOT NULL,
    project_task_id UUID,
    sandbox_id TEXT NOT NULL,
    files_changed JSONB NOT NULL,
    ai_review JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id UUID,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    pr_url TEXT
);

CREATE INDEX idx_code_reviews_status ON code_reviews(status);
CREATE INDEX idx_code_reviews_conversation ON code_reviews(conversation_id);
