import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      // Base colors are wired through `rgb(var(--color-x-rgb) / <alpha-value>)`
      // so utilities like `bg-bg/80` or `border-danger/40` produce a real
      // translucent color. The `-subtle` and `-border` keys point at the
      // already-composite vars in tokens.css and are not meant to chain
      // further `/<alpha>` modifiers.
      colors: {
        bg: "rgb(var(--color-bg-rgb) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--color-surface-rgb) / <alpha-value>)",
          elevated: "rgb(var(--color-surface-elevated-rgb) / <alpha-value>)",
          overlay: "rgb(var(--color-surface-overlay-rgb) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--color-border-rgb) / <alpha-value>)",
          strong: "rgb(var(--color-border-strong-rgb) / <alpha-value>)",
          subtle: "rgb(var(--color-border-subtle-rgb) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--color-text-primary-rgb) / <alpha-value>)",
          secondary: "rgb(var(--color-text-secondary-rgb) / <alpha-value>)",
          tertiary: "rgb(var(--color-text-tertiary-rgb) / <alpha-value>)",
          "on-accent": "rgb(var(--color-text-on-accent-rgb) / <alpha-value>)",
          "on-brand-accent": "rgb(var(--color-text-on-brand-accent-rgb) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover-rgb) / <alpha-value>)",
          active: "rgb(var(--color-accent-active-rgb) / <alpha-value>)",
          subtle: "var(--color-accent-subtle)",
          border: "var(--color-accent-border)",
        },
        // Magenta brand accent — used for celebration / win moments only.
        // `brand-accent` is the canonical name; `highlight` survives as an
        // alias so existing `bg-highlight*` callsites flip without churn.
        "brand-accent": {
          DEFAULT: "rgb(var(--color-brand-accent-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-brand-accent-hover-rgb) / <alpha-value>)",
          subtle: "var(--color-brand-accent-subtle)",
          border: "var(--color-brand-accent-border)",
        },
        win: {
          DEFAULT: "rgb(var(--color-win-rgb) / <alpha-value>)",
          subtle: "var(--color-win-subtle)",
        },
        highlight: {
          DEFAULT: "rgb(var(--color-highlight-rgb) / <alpha-value>)",
          hover: "var(--color-highlight-hover)",
          subtle: "var(--color-highlight-subtle)",
          border: "var(--color-highlight-border)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success-rgb) / <alpha-value>)",
          subtle: "var(--color-success-subtle)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning-rgb) / <alpha-value>)",
          subtle: "var(--color-warning-subtle)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger-rgb) / <alpha-value>)",
          subtle: "var(--color-danger-subtle)",
        },
        info: {
          DEFAULT: "rgb(var(--color-info-rgb) / <alpha-value>)",
          subtle: "var(--color-info-subtle)",
        },
      },
      spacing: {
        "1": "var(--space-1)",
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        "6": "var(--space-6)",
        "8": "var(--space-8)",
        "10": "var(--space-10)",
        "12": "var(--space-12)",
        "16": "var(--space-16)",
        "20": "var(--space-20)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        xs: ["var(--font-size-xs)", { lineHeight: "var(--line-height-normal)" }],
        sm: ["var(--font-size-sm)", { lineHeight: "var(--line-height-normal)" }],
        base: ["var(--font-size-base)", { lineHeight: "var(--line-height-normal)" }],
        lg: ["var(--font-size-lg)", { lineHeight: "var(--line-height-snug)" }],
        xl: ["var(--font-size-xl)", { lineHeight: "var(--line-height-snug)" }],
        "2xl": ["var(--font-size-2xl)", { lineHeight: "var(--line-height-tight)" }],
        "3xl": ["var(--font-size-3xl)", { lineHeight: "var(--line-height-tight)" }],
        "4xl": ["var(--font-size-4xl)", { lineHeight: "var(--line-height-tight)" }],
        "5xl": ["var(--font-size-5xl)", { lineHeight: "var(--line-height-tight)" }],
        "6xl": ["var(--font-size-6xl)", { lineHeight: "var(--line-height-tight)" }],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
      ringColor: {
        DEFAULT: "var(--ring-color)",
      },
    },
  },
  plugins: [],
};

export default config;
