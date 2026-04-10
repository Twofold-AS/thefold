import type { Meta, StoryObj } from "@storybook/react";
import ToolCallCard from "./ToolCallCard";
import type { ToolCall } from "@/hooks/useAgentStream";

const meta: Meta<typeof ToolCallCard> = {
  title: "Chat/ToolCallCard",
  component: ToolCallCard,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#0D0D10" }],
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const readFileTool: ToolCall = {
  id: "tc-001",
  toolName: "read_file",
  input: { path: "src/gateway/auth.ts" },
  status: "done",
  result: "import { api } from 'encore.dev/api';\n// auth handler…",
  durationMs: 142,
  isError: false,
};

const writeFileTool: ToolCall = {
  id: "tc-002",
  toolName: "repo_write_file",
  input: {
    path: "src/api/users.ts",
    content: "export const getUser = api(…)",
  },
  status: "done",
  result: "File written successfully",
  durationMs: 88,
  isError: false,
};

const runningTool: ToolCall = {
  id: "tc-003",
  toolName: "sandbox_run_command",
  input: { command: "npx tsc --noEmit" },
  status: "running",
};

const errorTool: ToolCall = {
  id: "tc-004",
  toolName: "read_file",
  input: { path: "src/nonexistent.ts" },
  status: "error",
  result: "Error: ENOENT: no such file or directory",
  durationMs: 12,
  isError: true,
};

const searchTool: ToolCall = {
  id: "tc-005",
  toolName: "search_code",
  input: { query: "authHandler", pattern: "*.ts" },
  status: "done",
  result: JSON.stringify([
    { file: "gateway/gateway.ts", line: 14, snippet: "export const auth = authHandler…" },
    { file: "users/users.ts", line: 92, snippet: "const isAuth = authHandler(…)" },
  ]),
  durationMs: 320,
};

export const ReadFileDone: Story = {
  args: { toolCall: readFileTool },
};

export const WriteFileDone: Story = {
  args: { toolCall: writeFileTool },
};

export const Running: Story = {
  args: { toolCall: runningTool },
};

export const ErrorState: Story = {
  args: { toolCall: errorTool },
};

export const SearchCode: Story = {
  args: { toolCall: searchTool },
};

export const MultipleCards: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
      <ToolCallCard toolCall={readFileTool} />
      <ToolCallCard toolCall={runningTool} />
      <ToolCallCard toolCall={errorTool} />
    </div>
  ),
};
