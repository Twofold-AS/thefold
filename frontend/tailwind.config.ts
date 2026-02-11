import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        general: ['"Suisse Intl"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "system-ui", "sans-serif"],
        brand: ['"TheFold Brand"', '"Suisse Intl"', "sans-serif"],
        heading: ['"Suisse Intl"', "sans-serif"],
        mono: ['"Suisse Intl Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
