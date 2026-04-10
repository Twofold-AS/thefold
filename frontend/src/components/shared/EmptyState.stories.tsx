import type { Meta, StoryObj } from "@storybook/react";
import { Inbox, SearchX, FolderOpen } from "lucide-react";
import EmptyState from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Shared/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#0D0D10" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    icon: { control: false },
    action: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: "No items found",
  },
};

export const WithHint: Story = {
  args: {
    message: "No tasks yet",
    hint: "Create a task to get started",
  },
};

export const WithIcon: Story = {
  args: {
    message: "Nothing here",
    hint: "Your inbox is empty",
    icon: <Inbox size={24} />,
  },
};

export const TasksEmpty: Story = {
  args: {
    message: "No tasks found",
    hint: "Start a conversation in Chat to create your first task",
    icon: <FolderOpen size={24} />,
  },
};

export const SearchEmpty: Story = {
  args: {
    message: "No results",
    hint: 'No tasks match "deploy"',
    icon: <SearchX size={24} />,
  },
};

export const WithAction: Story = {
  args: {
    message: "No skills configured",
    hint: "Add skills to enhance AI behaviour",
    icon: <Inbox size={24} />,
    action: (
      <button
        style={{
          padding: "6px 14px",
          fontSize: 12,
          borderRadius: 4,
          background: "rgba(99,102,241,0.15)",
          color: "#818CF8",
          border: "1px solid rgba(99,102,241,0.3)",
          cursor: "pointer",
        }}
      >
        Add skill
      </button>
    ),
  },
};
