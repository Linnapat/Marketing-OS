import type { CSSProperties } from "react";

/** Chevron drawn as an inline SVG data URI so <select> reads as a dropdown. */
const chevron = (stroke: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

/** Light filter dropdown — matches the app's standard filter controls. */
export const SELECT_STYLE: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: "7px 30px 7px 12px", borderRadius: 10,
  border: "1px solid #E5DECF", background: "#fff", color: "#211F1C", cursor: "pointer",
  appearance: "none",
  backgroundImage: chevron("%239A9387"),
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
};

/** Dark-panel variant (white text on a dark card). */
export const SELECT_STYLE_DARK: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: "7px 30px 7px 12px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "#fff", cursor: "pointer",
  appearance: "none",
  backgroundImage: chevron("rgba(255,255,255,.7)"),
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
};
