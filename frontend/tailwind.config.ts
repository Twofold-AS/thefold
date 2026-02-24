import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"ABC Diatype Plus"', "system-ui", "sans-serif"],
        brand: ['"Ivar Text"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"GeistMono"', '"Courier New"', "monospace"],
        logotype: ['"TheFold Brand"', "system-ui", "sans-serif"],
      },
      colors: {
        // Brand heat scale (Firecrawl-inspired, TheFold orange)
        heat: {
          4: "rgba(255, 107, 44, 0.04)",
          8: "rgba(255, 107, 44, 0.08)",
          12: "rgba(255, 107, 44, 0.12)",
          16: "rgba(255, 107, 44, 0.16)",
          20: "rgba(255, 107, 44, 0.20)",
          40: "rgba(255, 107, 44, 0.40)",
          90: "rgba(255, 107, 44, 0.90)",
          DEFAULT: "#FF6B2C",
        },
        // Surfaces
        surface: {
          DEFAULT: "#171717",
          raised: "#1F1F1F",
          overlay: "#252525",
        },
        // Backgrounds
        bg: {
          base: "#0A0A0A",
          lighter: "#141414",
        },
        // Semantic
        forest: "#42C366",
        crimson: "#EB3424",
        honey: "#ECB730",
        amethyst: "#9061FF",
        bluetron: "#2A6DFB",
        // shadcn compatibility
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        sidebar: "256px",
        topbar: "56px",
      },
      maxWidth: {
        container: "1112px",
      },
      letterSpacing: {
        tight: "-0.01em",
        tighter: "-0.02em",
        display: "-0.03em",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        "pulse-heat": "pulseHeat 2s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
        "dot-grid": "dotGrid 1.6s ease-in-out infinite",
        "logo-glow": "logoGlow 2s ease-in-out infinite",
        "step-enter": "stepEnter 0.3s ease-out forwards",
        "message-in": "messageIn 0.3s ease-out forwards",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
        pulseHeat: {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.7", filter: "brightness(1.3)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        dotGrid: {
          "0%, 100%": { opacity: "0.2" },
          "25%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        logoGlow: {
          "0%, 100%": { filter: "drop-shadow(0 0 2px rgba(255,107,44,0.3))" },
          "50%": { filter: "drop-shadow(0 0 8px rgba(255,107,44,0.6))" },
        },
        stepEnter: {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        messageIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
