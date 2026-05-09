import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#FAFAF7",
        ink: "#1A1A1A",
        muted: "#5C5C58",
        rule: "#E4E2DC",
        accent: "#8B1A1A",
        accentMuted: "#C28A8A",
        evidence: "#1F3A5F",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
        serif: ["var(--font-serif)", ...defaultTheme.fontFamily.serif],
      },
      fontSize: {
        micro: ["10px", { lineHeight: "14px", letterSpacing: "0.04em" }],
      },
      animation: {
        pulseRing: "pulseRing 1.6s ease-in-out infinite",
        cursorBlink: "cursorBlink 1.1s steps(2, jump-none) infinite",
      },
      keyframes: {
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(139, 26, 26, 0.5)" },
          "50%": { boxShadow: "0 0 0 6px rgba(139, 26, 26, 0)" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
