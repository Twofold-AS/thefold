import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0D0D10" },
        { name: "light", value: "#ffffff" },
      ],
    },
    layout: "centered",
  },
};

export default preview;
