import Image from "next/image";
import { StockLogo } from "@/components/StockLogo";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import type { LendingMarketRow } from "@/server/lending";

/** The live lending market rendered as a "screen" inside a hatched frame. */
export function LendingFrame({ market }: { market: LendingMarketRow | null }) {
  if (!market) {
    return (
      <div className="home-lend-screen">
        <div className="home-lend-row">
          <b>Lending market</b>
          <small className="mono">Figures temporarily unavailable</small>
        </div>
      </div>
    );
  }
  const util = market.rates.utilizationBps / 100;
  const symbol = market.pin.symbol;
  return (
    <div className="home-lend-screen">
      <div className="home-lend-row">
        <span className="home-lend-marks" aria-hidden="true">
          <StockLogo symbol={symbol} size={28} />
          <Image src="/brands/usdg.png" alt="" width={28} height={28} />
        </span>
        <span>
          <b>{symbol} vault shares → USDG</b>
          <small className="mono">{market.contractState.name} · live market</small>
        </span>
      </div>
      <div className="home-lend-rates">
        <span className="home-lend-rate home-lend-rate-supply">
          <small>Lenders earn</small>
          <strong>{formatRate18(market.rates.supplyApr)}</strong>
        </span>
        <span className="home-lend-rate">
          <small>Borrowers pay</small>
          <strong>{formatRate18(market.rates.borrowApr)}</strong>
        </span>
      </div>
      <div className="home-lend-util">
        <span className="home-lend-bar">
          <i style={{ width: `${util}%` }} />
        </span>
        <small className="mono">
          {util.toFixed(2)}% utilized · {formatUnitsFixed(market.accounting.cash, market.tokens.usdg.decimals, 0)} USDG available
        </small>
      </div>
      <div className="home-lend-comment">
        <span className="mono">chainlink · {market.oracle.available ? "feed fresh" : "feed stale"}</span>
        <span className="mono">max LTV {Number(market.config.maxLtvBps) / 100}%</span>
      </div>
    </div>
  );
}
