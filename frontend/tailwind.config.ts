import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"ABC Diatype Plus"', "system-ui", "sans-serif"],
        brand: ['"Ivar Text"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"Courier New"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
