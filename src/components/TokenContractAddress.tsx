"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { TOKEN_ADDRESS } from "@/lib/chain";

export function TokenContractAddress() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(TOKEN_ADDRESS);
      setState("copied");
    } catch {
      setState("error");
    }
  }
  useEffect(() => {
    if (state !== "copied") return;
    const t = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(t);
  }, [state]);
  const help =
    state === "copied"
      ? `${BRAND.token} contract address copied`
      : state === "error"
        ? `Could not copy. Try again or use the ${BRAND.token} contract link in the footer.`
        : `Copy ${BRAND.token} contract address`;
  return (
    <span className="header-token">
      <button
        className="header-token-copy"
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${BRAND.token} contract address`}
        aria-describedby="token-copy-help"
      >
        <span>{state === "copied" ? "Copied" : `$${BRAND.token}`}</span>
        {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      <span className="header-token-help" id="token-copy-help" role="tooltip">
        {help}
      </span>
      <span className="sr-only" role="status">
        {state === "idle" ? "" : help}
      </span>
    </span>
  );
}
