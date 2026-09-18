"use client";

import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { shortAddress, useWallet } from "./WalletProvider";
import { useT } from "@/i18n/client";

export function WalletConnectButton({ large = false }: { large?: boolean }) {
  const t = useT("wallet");
  const { ready, address, connect, connecting } = useWallet();
  const label = address ? shortAddress(address) : t("connect");
  if (ready && address) {
    return (
      <Link
        href="/portfolio"
        className={`wallet-button wallet-button-connected${large ? " wallet-button-large" : ""}`}
        aria-label={t("openPortfolio", { address: label })}
      >
        <i className="wallet-avatar" aria-hidden="true" />
        {label}
        <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button
      className={`wallet-button${large ? " wallet-button-large" : ""}`}
      type="button"
      disabled={!ready || connecting}
      onClick={() => void connect()}
      title={t("connect.title", { name: BRAND.name })}
    >
      <Wallet size={large ? 18 : 16} strokeWidth={1.5} />
      {ready ? (connecting ? t("connecting") : label) : t("loading")}
    </button>
  );
}
