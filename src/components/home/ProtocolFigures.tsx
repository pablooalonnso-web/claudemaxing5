"use client";

import { formatUnits } from "viem";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useTokenBurn } from "@/components/data/useTokenBurn";
import { CHAIN_NAME } from "@/lib/brand";
import { formatUsd, usdgToNumber } from "@/lib/format";
import { sumColumn } from "@/lib/vault-math";
import { useT } from "@/i18n/client";

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
  const t = useT("home");
  const { snapshot, error } = useProtocolVaults();
  const burn = useTokenBurn();
  const rows = snapshot?.rows.filter((r) => r.kind === "single" || r.kind === "managed") ?? null;
  const total = (key: "assets" | "fees") => (rows ? formatUsd(usdgToNumber(sumColumn(rows, key))) : "–");
  const ready = burn?.status === "ready" && burn.burnedRaw !== null && Number.isInteger(burn.decimals);
  const burned = ready ? Number(formatUnits(BigInt(burn!.burnedRaw!), burn!.decimals!)).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "–";
  const share =
    ready && burn?.totalSupplyRaw && BigInt(burn.totalSupplyRaw) > 0n ? Number((BigInt(burn.burnedRaw!) * 10_000n) / BigInt(burn.totalSupplyRaw)) / 100 : null;
  const inRange = rows ? rows.filter((r) => r.apr !== null).length : null;
  return (
    <>
      <Cell label={t("pf.tvl.label")} sub={t("pf.tvl.sub")} value={total("assets")} note={t("pf.tvl.note", { count: rows ? rows.length : "–" })} />
      <Cell label={t("pf.fees.label")} sub={t("pf.fees.sub")} value={total("fees")} note={t("pf.fees.note")} />
      <Cell
        label={t("pf.burned.label")}
        sub={t("pf.burned.sub")}
        value={burned}
        note={ready ? t("pf.burned.note", { share: share?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "" }) : burn ? t("pf.burned.unavailable") : t("pf.burned.reading")}
      />
      <Cell label={t("pf.live.label")} sub={t("pf.live.sub")} value={inRange === null ? "–" : String(inRange)} note={t("pf.live.note")} />
      <Cell label={t("pf.chain.label")} sub={t("pf.chain.sub")} value={CHAIN_NAME} note={t("pf.chain.note")} />
      <Cell label={t("pf.split.label")} sub={t("pf.split.sub")} value="70 / 20 / 10" note={error ? t("pf.split.error") : t("pf.split.note")} />
    </>
  );
}
