import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        ivory: "#F8F7F3",
        surface: "#FFFFFF",
        panel: "#17172A",
        panelAlt: "#23233A",
        charcoal: "#17172A",
        // Text
        ink: "#17172A",
        muted: "#3E3E55",
        faint: "#8A879A",
        // Accent (creative purple)
        accent: {
          DEFAULT: "#6C5CE7",
          soft: "#EEE9FF",
          border: "#D9D0FF",
        },
        // Borders / hairlines
        line: "#ECEAF2",
        line2: "#E3E0EC",
        line3: "#F1EFF6",
        line4: "#F6F4FA",
        // Status
        status: {
          gold: "#D7B76A",
          goldBg: "#FFF3D7",
          red: "#FF6B6B",
          redBg: "#FFF0F0",
          green: "#8CCF5F",
          greenBg: "#F0F8D8",
          blue: "#62C7F2",
          blueBg: "#EDF8FE",
          orange: "#FFA94D",
          orangeBg: "#FFF3E5",
        },
        // Brands
        brand: {
          teppen: "#6C5CE7",
          omakase: "#5A7CFF",
          mainichi: "#8CCF5F",
          touka: "#FFA94D",
        },
      },
      borderRadius: {
        card: "20px",
        cardLg: "24px",
        pill: "999px",
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "system-ui", "-apple-system", "sans-serif"],
      },
      maxWidth: {
        content: "1440px",
      },
    },
  },
  plugins: [],
};
export default config;
