import type { Meta, StoryObj } from "@storybook/react";
import ToolCallLine from "./ToolCallLine";
import type { ToolCallLineData } from "./types";

const meta: Meta<typeof ToolCallLine> = {
  title: "Chat/ToolCallLine",
  component: ToolCallLine,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
};

export default meta;
type Story = StoryObj<typeof ToolCallLine>;

const base = (overrides: Partial<ToolCallLineData>): ToolCallLineData => ({
  kind: "tool_call",
  id: "toolu_abc123",
  timestamp: Date.now(),
  toolName: "repo_read_file",
  status: "done",
  input: { path: "app/page.tsx" },
  result: { content: "export default function Page() {}" },
  durationMs: 213,
  ...overrides,
});

export const ReadFile: Story = {
  args: {
    data: base({
      toolName: "repo_read_file",
      input: { path: "app/page.tsx" },
      result: { content: "a".repeat(2147) },
      durationMs: 213,
    }),
  },
};

export const Running: Story = {
  args: {
    data: base({
      toolName: "build_run_command",
      status: "running",
      input: { command: "npm install" },
      durationMs: 12340,
    }),
  },
};

export const Error: Story = {
  args: {
    data: base({
      toolName: "repo_write_file",
      status: "error",
      isError: true,
      input: { path: "src/api.ts", content: "..." },
      result: { error: "ENOENT: sandbox not running" },
      errorMessage: "ENOENT: sandbox not running",
      durationMs: 42,
    }),
  },
};

export const Pending: Story = {
  args: {
    data: base({
      toolName: "task_plan",
      status: "pending",
      input: { taskDescription: "Build auth flow with OTP" },
    }),
  },
};

export const Skipped: Story = {
  args: {
    data: base({
      toolName: "build_validate",
      status: "skipped",
      input: { sandboxId: "sb_abc" },
      durationMs: 0,
    }),
  },
};
