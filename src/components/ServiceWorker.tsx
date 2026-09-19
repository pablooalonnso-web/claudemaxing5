"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes Vertex installable. It caches the app
 * shell only; chain data and API responses always go to the network. Registration
 * is deliberately deferred to load so it never competes with the first render.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* An unavailable service worker must never break the page. */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
