import localFont from "next/font/local";

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

export const dmMono = localFont({
  src: [
    { path: "../fonts/dm-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dm-mono-400-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dm-mono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/dm-mono-500-latin-ext.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
  fallback: ["SF Mono", "Menlo", "monospace"],
  adjustFontFallback: "Arial",
});

export const instrumentSerif = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-italic-latin.woff2", weight: "400", style: "italic" },
    { path: "../fonts/instrument-serif-italic-latin-ext.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});
