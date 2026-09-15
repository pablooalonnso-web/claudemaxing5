import localFont from "next/font/local";

/** Body face. */
export const dmSans = localFont({
  src: [
    { path: "../fonts/dm-sans-latin.woff2", style: "normal" },
    { path: "../fonts/dm-sans-latin-ext.woff2", style: "normal" },
  ],
  weight: "100 1000",
  display: "swap",
  variable: "--font-sans",
  fallback: ["DM Sans Fallback", "Arial"],
  adjustFontFallback: "Arial",
});

/** Display face for headings, buttons and quotes. */
export const anybody = localFont({
  src: [
    { path: "../fonts/anybody-latin.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/anybody-italic-latin.woff2", weight: "100 900", style: "italic" },
  ],
  display: "swap",
  variable: "--font-anybody",
  fallback: ["Anybody Fallback", "Arial Black", "Arial"],
  adjustFontFallback: "Arial",
});

/** Utility face for labels, navigation and figures. */
export const spaceMono = localFont({
  src: [
    { path: "../fonts/space-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/space-mono-700-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
  fallback: ["Space Mono Fallback", "Menlo", "monospace"],
  adjustFontFallback: "Arial",
});

/** Handwritten annotations. */
export const nanumPen = localFont({
  src: [{ path: "../fonts/nanum-pen-latin.woff2", weight: "400", style: "normal" }],
  display: "swap",
  variable: "--font-handwriting",
  fallback: ["Comic Sans MS", "cursive"],
  adjustFontFallback: false,
});
