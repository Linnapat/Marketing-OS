import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        ivory: "#FAF8F4",
        surface: "#FFFFFF",
        panel: "#211F1C", // charcoal panels / sidebar
        panelAlt: "#3A3630",
        charcoal: "#211F1C",
        // Text
        ink: "#211F1C",
        muted: "#6b6258",
        faint: "#9A9387",
        // Accent (champagne gold)
        accent: {
          DEFAULT: "#B8945A",
          soft: "#FBF8EE",
          border: "#E8CCA0",
        },
        // Borders / hairlines
        line: "#ECE6DA",
        line2: "#E5DECF",
        line3: "#F0EBE0",
        line4: "#F4EFE5",
        // Status
        status: {
          gold: "#C68A1E",
          goldBg: "#FBF8EE",
          red: "#B33A2E",
          redBg: "#FFF5F4",
          green: "#4E7A4E",
          greenBg: "#EEF4EE",
          blue: "#3E5C9A",
          blueBg: "#eef1f8",
          orange: "#C2691E",
          orangeBg: "#FBF1E9",
        },
        // Brands
        brand: {
          teppen: "#B33A2E",
          omakase: "#3E5C9A",
          mainichi: "#4E7A4E",
          touka: "#C68A1E",
        },
      },
      borderRadius: {
        card: "16px",
        cardLg: "18px",
        pill: "999px",
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "system-ui", "-apple-system", "sans-serif"],
      },
      maxWidth: {
        content: "1380px",
      },
    },
  },
  plugins: [],
};
export default config;
