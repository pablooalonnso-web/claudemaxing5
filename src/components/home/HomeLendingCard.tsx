import Image from "next/image";
import Link from "next/link";
import { StockLogo } from "@/components/StockLogo";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import type { LendingMarketRow } from "@/server/lending";

export function HomeLendingCard({ market }: { market: LendingMarketRow | null }) {
  if (!market) {
    return (
      <div className="home-market-grid">
        <div className="home-market-card home-market-soon">
          <div className="home-market-head">
            <span className="home-market-name">
              <b>Lending market</b>
              <small>Figures temporarily unavailable</small>
            </span>
          </div>
          <p className="fine-print">Live rates could not be read from the chain. Retrying on the next visit.</p>
        </div>
      </div>
    );
  }
  const symbol = market.pin.symbol;
  const slug = market.pin.slug;
  const util = market.rates.utilizationBps / 100;
  const active = market.contractState.name === "Active";
  return (
    <div className="home-market-grid">
      <Link className="home-market-card" href={`/lending/${slug}`}>
        <div className="home-market-head">
          <span className="home-market-marks" aria-hidden="true">
            <StockLogo symbol={symbol} size={32} />
            <Image src="/brands/usdg.png" alt="" width={32} height={32} />
          </span>
          <span className="home-market-name">
            <b>{symbol} vault shares → USDG</b>
            <small>Live lending market</small>
          </span>
          <span className={`vault-table-tag ${active ? "vault-table-tag-open" : "vault-table-tag-paused"}`}>{market.contractState.name}</span>
        </div>
        <div className="home-market-rates">
          <span className="home-market-rate home-market-supply">
            <small>Lenders earn</small>
            <strong className="mono">{formatRate18(market.rates.supplyApr)}</strong>
          </span>
          <span className="home-market-rate">
            <small>Borrowers pay</small>
            <strong className="mono">{formatRate18(market.rates.borrowApr)}</strong>
          </span>
        </div>
        <span className="home-market-util">
          <span className="home-market-bar">
            <i style={{ width: `${util}%` }} />
          </span>
          <small className="mono">
            {util.toFixed(2)}% utilized · {formatUnitsFixed(market.accounting.cash, market.tokens.usdg.decimals, 0)} USDG available
          </small>
        </span>
      </Link>
    </div>
  );
}
