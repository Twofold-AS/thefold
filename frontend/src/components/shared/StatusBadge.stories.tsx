import type { Meta, StoryObj } from "@storybook/react";
import StatusBadge from "./StatusBadge";

const meta: Meta<typeof StatusBadge> = {
  title: "Shared/StatusBadge",
  component: StatusBadge,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#0D0D10" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["done", "active", "pending", "error", "warning", "info"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {
  args: { variant: "done", children: "done" },
};

export const Active: Story = {
  args: { variant: "active", children: "in_progress" },
};

export const Pending: Story = {
  args: { variant: "pending", children: "backlog" },
};

export const Error: Story = {
  args: { variant: "error", children: "blocked" },
};

export const Warning: Story = {
  args: { variant: "warning", children: "warning" },
};

export const Info: Story = {
  args: { variant: "info", children: "in_review" },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <StatusBadge variant="done">done</StatusBadge>
      <StatusBadge variant="active">in_progress</StatusBadge>
      <StatusBadge variant="pending">backlog</StatusBadge>
      <StatusBadge variant="error">blocked</StatusBadge>
      <StatusBadge variant="warning">warning</StatusBadge>
      <StatusBadge variant="info">in_review</StatusBadge>
    </div>
  ),
};

export const LongLabel: Story = {
  args: { variant: "active", children: "pending_review" },
};
