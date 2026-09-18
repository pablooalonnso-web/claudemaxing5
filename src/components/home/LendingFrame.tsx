import Image from "next/image";
import { StockLogo } from "@/components/StockLogo";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import type { LendingMarketRow } from "@/server/lending";
import { getT } from "@/i18n/server";

/** The live lending market rendered as a "screen" inside a hatched frame. */
export async function LendingFrame({ market }: { market: LendingMarketRow | null }) {
  const t = await getT("home");
  if (!market) {
    return (
      <div className="home-lend-screen">
        <div className="home-lend-row">
          <b>{t("lend.market")}</b>
          <small className="mono">{t("lend.unavailable")}</small>
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
          <b>{t("lend.pair", { symbol })}</b>
          <small className="mono">{t("lend.live", { name: market.contractState.name })}</small>
        </span>
      </div>
      <div className="home-lend-rates">
        <span className="home-lend-rate home-lend-rate-supply">
          <small>{t("lend.lendersEarn")}</small>
          <strong>{formatRate18(market.rates.supplyApr)}</strong>
        </span>
        <span className="home-lend-rate">
          <small>{t("lend.borrowersPay")}</small>
          <strong>{formatRate18(market.rates.borrowApr)}</strong>
        </span>
      </div>
      <div className="home-lend-util">
        <span className="home-lend-bar">
          <i style={{ width: `${util}%` }} />
        </span>
        <small className="mono">{t("lend.util", { util: util.toFixed(2), cash: formatUnitsFixed(market.accounting.cash, market.tokens.usdg.decimals, 0) })}</small>
      </div>
      <div className="home-lend-comment">
        <span className="mono">{market.oracle.available ? t("lend.feedFresh") : t("lend.feedStale")}</span>
        <span className="mono">{t("lend.maxLtv", { ltv: Number(market.config.maxLtvBps) / 100 })}</span>
      </div>
    </div>
  );
}
