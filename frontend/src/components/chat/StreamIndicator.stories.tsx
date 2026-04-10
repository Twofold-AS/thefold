import type { Meta, StoryObj } from "@storybook/react";
import { StreamIndicator } from "./StreamIndicator";

const meta: Meta<typeof StreamIndicator> = {
  title: "Chat/StreamIndicator",
  component: StreamIndicator,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#0D0D10" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    isThinking: { control: "boolean" },
    thinkingText: { control: "text" },
    activeTool: { control: "text" },
    progress: { control: { type: "range", min: 0, max: 100, step: 5 } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    isThinking: false,
    activeTool: null,
    progress: null,
  },
};

export const Thinking: Story = {
  args: {
    isThinking: true,
    thinkingText: "Analysing repository structure…",
    activeTool: null,
    progress: null,
  },
};

export const ThinkingNoText: Story = {
  args: {
    isThinking: true,
    thinkingText: null,
    activeTool: null,
  },
};

export const ToolRunning: Story = {
  args: {
    isThinking: false,
    activeTool: "read_file",
    progress: null,
  },
};

export const ToolWithProgress: Story = {
  args: {
    isThinking: false,
    activeTool: "repo_write_file",
    progress: 45,
  },
};

export const ProgressOnly: Story = {
  args: {
    isThinking: false,
    activeTool: null,
    progress: 72,
  },
};

export const FullProgress: Story = {
  args: {
    isThinking: false,
    activeTool: null,
    progress: 100,
  },
};

export const ThinkingWithTool: Story = {
  args: {
    isThinking: true,
    thinkingText: "Planning implementation…",
    activeTool: "search_code",
    progress: 30,
  },
};
