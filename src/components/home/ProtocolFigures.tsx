"use client";

import { formatUnits } from "viem";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useTokenBurn } from "@/components/data/useTokenBurn";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { formatUsd, usdgToNumber } from "@/lib/format";
import { sumColumn } from "@/lib/vault-math";

function Cell({ label, sub, value, note }: { label: string; sub: string; value: string; note: string }) {
  return (
    <article className="home-figure">
      <header>
        <span className="home-figure-label">{label}</span>
        <small className="mono">{sub}</small>
      </header>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

export function ProtocolFigures() {
  const { snapshot, error } = useProtocolVaults();
  const burn = useTokenBurn();
  const rows = snapshot?.rows.filter((r) => r.kind === "single" || r.kind === "managed") ?? null;
  const total = (key: "assets" | "fees") => (rows ? formatUsd(usdgToNumber(sumColumn(rows, key))) : "—");
  const ready = burn?.status === "ready" && burn.burnedRaw !== null && Number.isInteger(burn.decimals);
  const burned = ready ? Number(formatUnits(BigInt(burn!.burnedRaw!), burn!.decimals!)).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
  const share =
    ready && burn?.totalSupplyRaw && BigInt(burn.totalSupplyRaw) > 0n ? Number((BigInt(burn.burnedRaw!) * 10_000n) / BigInt(burn.totalSupplyRaw)) / 100 : null;
  const inRange = rows ? rows.filter((r) => r.apr !== null).length : null;
  return (
    <>
      <Cell label="Total value locked" sub="USDG · all vaults" value={total("assets")} note={`Across ${rows ? rows.length : "—"} Stock Token vaults, read from the chain and refreshed every 15 seconds.`} />
      <Cell label="Fees earned, lifetime" sub="gross · incl. unclaimed" value={total("fees")} note="Trading fees collected by the vaults' LP positions, including fees earned but not yet claimed." />
      <Cell
        label={`${BRAND.token} burned`}
        sub="0x…dEaD balance"
        value={burned}
        note={ready ? `${share?.toLocaleString("en-US", { maximumFractionDigits: 2 })}% of supply. 20% of claimed fees funds buybacks and burns.` : burn ? "Burn data unavailable right now." : "Reading the burn address…"}
      />
      <Cell label="Vaults with a live APR" sub="rolling 24h window" value={inRange === null ? "—" : String(inRange)} note="Fee APR is estimated from observed pool fees over the last 24 hours; it warms up as samples accumulate." />
      <Cell label="Chain" sub="chain id 4663" value={CHAIN_NAME} note="Every vault, market and token contract lives on Robinhood Chain and is verifiable on Blockscout." />
      <Cell label="Fee split" sub="on claimed fees only" value="70 / 10 / 20" note={error ? "Some totals could not refresh; retrying automatically." : `70% compounds, 10% runs the protocol, 20% is reserved for ${BRAND.token} buybacks.`} />
    </>
  );
}
