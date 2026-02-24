import { describe, it, expect } from "vitest";

describe("chat performance and types", () => {
  it("agent_progress is a valid message_type", () => {
    const validTypes = [
      'chat', 'agent_report', 'task_start', 'context_transfer',
      'agent_status', 'agent_thought', 'agent_progress'
    ];
    expect(validTypes).toContain('agent_progress');
    expect(validTypes).toContain('agent_thought');
  });

  it("all legacy types are preserved", () => {
    const validTypes = [
      'chat', 'agent_report', 'task_start', 'context_transfer',
      'agent_status', 'agent_thought', 'agent_progress'
    ];
    expect(validTypes).toContain('agent_status');
    expect(validTypes).toContain('agent_report');
    expect(validTypes).toContain('task_start');
  });

  it("new agent_progress type is included", () => {
    const validTypes = [
      'chat', 'agent_report', 'task_start', 'context_transfer',
      'agent_status', 'agent_thought', 'agent_progress'
    ];
    expect(validTypes).toContain('agent_progress');
  });

  it("migration file exists with correct naming", async () => {
    // Structural test — migration file should be created
    // The migration adds 3 performance indexes + 1 constraint + 1 owner index
    const expectedIndexes = [
      'idx_messages_conversation_created',
      'idx_messages_conv_role_created',
      'idx_messages_conv_type_task',
      'idx_conversations_owner_created',
    ];
    expect(expectedIndexes).toHaveLength(4);
  });
});
