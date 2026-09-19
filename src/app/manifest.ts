import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Served at /manifest.webmanifest. Makes the site installable from the browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} · Managed liquidity vaults`,
    short_name: BRAND.name,
    description: BRAND.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F7F7F9",
    theme_color: "#3D3B4F",
    categories: ["finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vaults", url: "/vaults" },
      { name: "Portfolio", url: "/portfolio" },
      { name: "Verification", url: "/verify" },
    ],
  };
}
