"use client";

import { formatUnits } from "viem";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useTokenBurn } from "@/components/data/useTokenBurn";
import { BRAND } from "@/lib/brand";
import { formatUsd, usdgToNumber } from "@/lib/format";
import { sumColumn } from "@/lib/vault-math";

function BurnCard() {
  const data = useTokenBurn();
  const ready = data?.status === "ready" && data.burnedRaw !== null && Number.isInteger(data.decimals);
  const burned = ready ? Number(formatUnits(BigInt(data!.burnedRaw!), data!.decimals!)).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";
  const share =
    ready && data?.totalSupplyRaw && BigInt(data.totalSupplyRaw) > 0n
      ? Number((BigInt(data.burnedRaw!) * 10_000n) / BigInt(data.totalSupplyRaw)) / 100
      : null;
  const label = data?.status === "ready" ? `${BRAND.token} burned onchain` : data ? "Burn data unavailable" : "Loading burn data…";
  return (
    <article className="stat-card">
      <span className="stat-label">Tokens burned</span>
      <strong className="stat-value">{burned}</strong>
      <span className="stat-note">
        {label}
        {share !== null ? ` · ${share.toLocaleString("en-US", { maximumFractionDigits: 2 })}% of supply` : ""}
        <br />
        20% of fees funds manual buybacks and burns.
      </span>
    </article>
  );
}

export function ProtocolTotals() {
  const { snapshot, error } = useProtocolVaults();
  const rows = snapshot?.rows.filter((r) => r.kind === "single" || r.kind === "managed") ?? null;
  const total = (key: "assets" | "fees") => (rows ? formatUsd(usdgToNumber(sumColumn(rows, key))) : "—");
  const complete = rows?.every((r) => r.assets !== null && r.fees !== null);
  return (
    <>
      <div className="stat-grid">
        <article className="stat-card">
          <span className="stat-label">Total value locked</span>
          <strong className="stat-value">{total("assets")}</strong>
          <span className="stat-note">
            USDG across {rows ? rows.length : "—"} Stock Token vault{rows && rows.length === 1 ? "" : "s"}
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Fees earned, lifetime</span>
          <strong className="stat-value">{total("fees")}</strong>
          <span className="stat-note">Gross, including unclaimed LP fees</span>
        </article>
        <BurnCard />
      </div>
      <p className="protocol-metrics-note" role="status">
        {error
          ? snapshot
            ? `Some totals could not refresh. Available observations from ${new Date(snapshot.observedAt).toLocaleTimeString()}. Retrying automatically.`
            : "Protocol totals are temporarily unavailable. Retrying automatically."
          : rows && !complete
            ? "Some vault metrics are unavailable; incomplete totals are not displayed."
            : rows && rows.length === 0
              ? "No individual vault is live yet. Figures appear once a reviewed deployment is published."
              : "Cached vault totals, refreshed automatically."}
      </p>
    </>
  );
}
