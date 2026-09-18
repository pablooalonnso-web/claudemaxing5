"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { TOKEN_ADDRESS } from "@/lib/chain";
import { useT } from "@/i18n/client";

/** The protocol token contract address, shown in full-ish form with a one-click copy. */
export function ContractAddress({ compact = false }: { compact?: boolean }) {
  const t = useT("wallet");
  const [copied, setCopied] = useState(false);
  const short = `${TOKEN_ADDRESS.slice(0, 6)}…${TOKEN_ADDRESS.slice(-4)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <button type="button" className={`ca-button${compact ? " ca-compact" : ""}`} onClick={copy} title={TOKEN_ADDRESS} aria-label={t("ca.copy", { address: TOKEN_ADDRESS })}>
      <span className="ca-label">{t("ca.label")}</span>
      <span className="ca-addr">{compact ? short : TOKEN_ADDRESS}</span>
      {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.75} aria-hidden="true" />}
      <span className="ca-copied" aria-live="polite">{copied ? t("ca.copied") : ""}</span>
    </button>
  );
}
