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
    { path: "../fonts/instrument-sans-400-700-normal-latin.woff2", weight: "400 700", style: "normal" },
    { path: "../fonts/instrument-sans-400-700-italic-latin.woff2", weight: "400 700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-anybody",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/** Utility face for labels, navigation and figures. */
export const spaceMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500-normal-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-600-normal-latin.woff2", weight: "600 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
  fallback: ["SFMono-Regular", "Menlo", "monospace"],
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
