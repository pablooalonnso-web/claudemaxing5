"use client";

import { ArrowRight, Landmark, Percent, Ruler } from "lucide-react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { BrandMark } from "@/components/BrandMark";
import { stockName } from "@/components/StockLogo";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { BRAND } from "@/lib/brand";
import { formatPercent, formatPrice, formatUsd, usdgToNumber } from "@/lib/format";
import type { VaultPin } from "@/lib/registry";
import type { VaultSnapshotRow } from "@/lib/snapshot-types";
import { primaryPosition, rangePosition } from "@/lib/vault-math";

type Card = { pin: VaultPin; row: VaultSnapshotRow | null; tvl: number | null; apr: number | null };

const TINTS = ["seafoam", "ice", "sky"] as const;

function prices(row: VaultSnapshotRow | null) {
  const pos = primaryPosition(row?.snapshot?.holdings?.positions);
  if (!pos || pos.lower === null || pos.upper === null || pos.current === null) return null;
  const lower = Math.min(pos.lower, pos.upper);
  const upper = Math.max(pos.lower, pos.upper);
  return { lower, upper, current: pos.current, inRange: pos.inRange, pct: rangePosition(lower, upper, pos.current) };
}

function VaultCard({ card, tint }: { card: Card; tint: (typeof TINTS)[number] }) {
  const p = prices(card.row);
  const pool = card.row?.snapshot?.holdings?.positions?.[0]?.pool;
  const venue = card.pin.symbol && pool?.length === 66 ? "Uniswap V4" : "Uniswap V3";
  const widths = p ? { lower: 52, current: p.pct === null ? 70 : 52 + (p.pct / 100) * 42, upper: 94 } : { lower: 40, current: 60, upper: 80 };
  return (
    <PrefetchLink href={card.pin.href} className={`home-vault-card home-vault-card-${tint}`}>
      <div className="home-vault-card-head">
        <h3>{stockName(card.pin.symbol)}</h3>
        <div className="home-vault-stats">
          <span>
            <i>
              <Landmark size={14} strokeWidth={1.5} aria-hidden="true" />
            </i>
            <span>
              <b>{formatUsd(card.tvl)}</b>
              <small>TVL</small>
            </span>
          </span>
          <span>
            <i>
              <Percent size={14} strokeWidth={1.5} aria-hidden="true" />
            </i>
            <span>
              <b>{card.apr === null ? "—" : formatPercent(card.apr)}</b>
              <small>Fee APR · 24h</small>
            </span>
          </span>
          <span>
            <i>
              <Ruler size={14} strokeWidth={1.5} aria-hidden="true" />
            </i>
            <span>
              <b>{p ? (p.inRange ? "In range" : "Out of range") : "—"}</b>
              <small>LP position</small>
            </span>
          </span>
        </div>
      </div>
      <div className="home-vault-diff">
        <div className="home-vault-file">
          <span className="mono">
            {card.pin.symbol} / USDG · {venue}
          </span>
        </div>
        <div className="home-vault-lines">
          <div className="home-vault-line del">
            <span className="mono">01</span>
            <span className="mono">−</span>
            <i style={{ width: `${widths.lower}%` }} />
            <em className="mono">{p ? formatPrice(p.lower) : "lower"}</em>
          </div>
          <div className="home-vault-line add">
            <span className="mono">01</span>
            <span className="mono">+</span>
            <i style={{ width: `${widths.current}%` }} />
            <em className="mono">{p ? formatPrice(p.current) : "current"}</em>
          </div>
          <div className="home-vault-line add">
            <span className="mono">02</span>
            <span className="mono">+</span>
            <i style={{ width: `${widths.upper}%` }} />
            <em className="mono">{p ? formatPrice(p.upper) : "upper"}</em>
          </div>
        </div>
        <div className="home-vault-comment">
          <span className="home-vault-author">
            <BrandMark size={16} circle={false} accent="#28E99F" petal="#EEEEEE" />
            <span>{BRAND.name.toLowerCase()}</span>
          </span>
          <p>
            {p
              ? p.inRange
                ? `Price inside the ${formatPrice(p.lower)}–${formatPrice(p.upper)} band; fees accrue on every trade.`
                : `Price left the ${formatPrice(p.lower)}–${formatPrice(p.upper)} band; keeper rebalance pending.`
              : "Waiting for the next onchain observation."}
          </p>
        </div>
        <div className="home-vault-foot mono">
          Open vault <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>
    </PrefetchLink>
  );
}

export function LiveVaultCards() {
  const { singles, snapshot, rows } = useProtocolVaults();
  const cards: Card[] = singles.map((pin) => {
    const summary = snapshot?.rows.find((r) => r.vault.toLowerCase() === pin.vault.toLowerCase()) ?? null;
    const row = rows?.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase()) ?? null;
    return { pin, row, tvl: usdgToNumber(summary?.assets ?? null), apr: summary?.apr ?? null };
  });
  const ranked = [...cards].sort((a, b) => (b.apr ?? -1) - (a.apr ?? -1) || (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 3);
  return (
    <div className="home-vault-cards">
      {ranked.map((card, i) => (
        <VaultCard key={card.pin.id} card={card} tint={TINTS[i]} />
      ))}
    </div>
  );
}
