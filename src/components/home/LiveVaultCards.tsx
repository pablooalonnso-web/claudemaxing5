"use client";

import { ArrowRight, Landmark, Percent, Ruler } from "lucide-react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { BrandMark } from "@/components/BrandMark";
import { stockName } from "@/components/StockLogo";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import Link from "next/link";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { formatPercent, formatPrice, formatUsd, usdgToNumber } from "@/lib/format";
import type { VaultPin } from "@/lib/registry";
import type { VaultSnapshotRow } from "@/lib/snapshot-types";
import { primaryPosition, rangePosition } from "@/lib/vault-math";
import { useT } from "@/i18n/client";

type Card = { pin: VaultPin; row: VaultSnapshotRow | null; tvl: number | null; apr: number | null };

const TINTS = ["seafoam", "ice", "sky"] as const;
/** Below this much USDG a 24h fee APR says more about one trade than about the pool, so the card shows a dash instead. */
const APR_TVL_FLOOR = 1_000;
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function prices(row: VaultSnapshotRow | null) {
  const pos = primaryPosition(row?.snapshot?.holdings?.positions);
  if (!pos || pos.lower === null || pos.upper === null || pos.current === null) return null;
  const lower = Math.min(pos.lower, pos.upper);
  const upper = Math.max(pos.lower, pos.upper);
  return { lower, upper, current: pos.current, inRange: pos.inRange, pct: rangePosition(lower, upper, pos.current) };
}

function VaultCard({ card, tint }: { card: Card; tint: (typeof TINTS)[number] }) {
  const t = useT("home");
  const p = prices(card.row);
  const pool = card.row?.snapshot?.holdings?.positions?.[0]?.pool;
  const venue = card.pin.symbol && pool?.length === 66 ? "Uniswap V4" : "Uniswap V3";
  const widths = p ? { lower: 52, current: p.pct === null ? 70 : 52 + (p.pct / 100) * 42, upper: 94 } : { lower: 40, current: 60, upper: 80 };
  const tooSmall = card.tvl !== null && card.tvl < APR_TVL_FLOOR;
  const aprLabel = card.apr === null ? t("cards.apr.warming") : tooSmall ? t("cards.apr.small") : t("cards.apr.24h");
  const apr = card.apr === null || tooSmall ? "–" : formatPercent(card.apr);
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
              <small>{t("cards.tvl")}</small>
            </span>
          </span>
          <span>
            <i>
              <Percent size={14} strokeWidth={1.5} aria-hidden="true" />
            </i>
            <span>
              <b>{apr}</b>
              <small>{aprLabel}</small>
            </span>
          </span>
          <span>
            <i>
              <Ruler size={14} strokeWidth={1.5} aria-hidden="true" />
            </i>
            <span>
              <b>{p ? (p.inRange ? t("cards.inRange") : t("cards.outOfRange")) : "–"}</b>
              <small>{t("cards.lp")}</small>
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
            <em className="mono">{p ? formatPrice(p.lower) : t("cards.lower")}</em>
          </div>
          <div className="home-vault-line add">
            <span className="mono">01</span>
            <span className="mono">+</span>
            <i style={{ width: `${widths.current}%` }} />
            <em className="mono">{p ? formatPrice(p.current) : t("cards.current")}</em>
          </div>
          <div className="home-vault-line add">
            <span className="mono">02</span>
            <span className="mono">+</span>
            <i style={{ width: `${widths.upper}%` }} />
            <em className="mono">{p ? formatPrice(p.upper) : t("cards.upper")}</em>
          </div>
        </div>
        <div className="home-vault-comment">
          <span className="home-vault-author">
            <BrandMark size={16} color="#28E99F" />
            <span>{BRAND.name.toLowerCase()}</span>
          </span>
          <p>
            {p
              ? p.inRange
                ? t("cards.comment.inRange", { lower: formatPrice(p.lower), upper: formatPrice(p.upper) })
                : t("cards.comment.outOfRange", { lower: formatPrice(p.lower), upper: formatPrice(p.upper) })
              : t("cards.comment.waiting")}
          </p>
        </div>
        <div className="home-vault-foot mono">
          {t("cards.open")} <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>
    </PrefetchLink>
  );
}

export function LiveVaultCards() {
  const t = useT("home");
  const { singles, snapshot, rows, error } = useProtocolVaults();
  const cards: Card[] = singles.map((pin) => {
    const summary = snapshot?.rows.find((r) => r.vault.toLowerCase() === pin.vault.toLowerCase()) ?? null;
    const row = rows?.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase()) ?? null;
    return { pin, row, tvl: usdgToNumber(summary?.assets ?? null), apr: summary?.apr ?? null };
  });
  // Deepest pools first: TVL is the figure a reader can trust at a glance, APR only breaks ties.
  const ranked = [...cards].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1) || (b.apr ?? -1) - (a.apr ?? -1)).slice(0, 3);
  const readAt = snapshot ? timeFormat.format(snapshot.observedAt) : null;
  return (
    <div className="home-vault-cards-wrap">
      <div className="home-vault-cards">
        {ranked.map((card, i) => (
          <VaultCard key={card.pin.id} card={card} tint={TINTS[i]} />
        ))}
      </div>
      <p className="home-vault-updated" aria-live={error ? "polite" : "off"}>
        {readAt === null
          ? t("cards.reading", { chain: CHAIN_NAME })
          : error
            ? t("cards.lastRead", { chain: CHAIN_NAME, time: readAt })
            : t("cards.readAt", { chain: CHAIN_NAME, time: readAt })}{" "}
        <Link href="/vaults">{t("cards.seeAll", { count: singles.length })}</Link>
      </p>
    </div>
  );
}
