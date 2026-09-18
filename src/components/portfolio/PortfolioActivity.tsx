"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useT } from "@/i18n/client";
import { BRAND } from "@/lib/brand";
import { explorerTx } from "@/lib/chain";
import { historyClient, loadActivity, type VaultActivity } from "@/lib/portfolio-history";
import { formatUtc } from "@/lib/format";

const usd = (n: number, d = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;

type Row = VaultActivity & { value: number | null; deposited: number; withdrawn: number; leftoverStock: number; change: number | null; changePct: number | null };

export function PortfolioActivity({ owner }: { owner: Address }) {
  const t = useT("portfolio");
  const { singles, rows: snapshots } = useProtocolVaults();
  const [activity, setActivity] = useState<VaultActivity[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setActivity(null);
    setError("");
    const load = async () => {
      try {
        const a = await loadActivity(owner, singles, historyClient());
        if (alive) setActivity(a);
      } catch (e) {
        if (alive) setError(e instanceof Error && /limit|range|invalid/i.test(e.message) ? t("activity.rpcError") : t("activity.readError"));
      }
    };
    void load();
    window.addEventListener(BRAND.vaultUpdatedEvent, load);
    return () => {
      alive = false;
      window.removeEventListener(BRAND.vaultUpdatedEvent, load);
    };
  }, [owner, singles, t]);

  const rows: Row[] | null = activity
    ? activity.map((a) => {
        const snap = snapshots?.find((r) => r.descriptor.vault.toLowerCase() === a.pin.vault.toLowerCase())?.snapshot;
        const supply = snap?.extras?.totalSupply ? BigInt(snap.extras.totalSupply) : null;
        const assets = snap?.assets ? BigInt(snap.assets) : null;
        const price = snap?.holdings?.positions?.[0]?.current ?? null;
        const heldShares = a.events.reduce((s, e) => s + (e.kind === "deposit" ? e.shares : -e.shares), 0n);
        const value = supply && supply > 0n && assets !== null ? Number(formatUnits((assets * (heldShares > 0n ? heldShares : 0n)) / supply, 6)) : null;
        const leftoverStock = a.events.filter((e) => e.kind === "deposit").reduce((s, e) => s + Number(formatUnits(e.stockIn, 18)), 0);
        const deposited = Number(formatUnits(a.usdgOut, 6)) - (price ? leftoverStock * price : 0);
        const withdrawn = Number(formatUnits(a.usdgIn, 6)) + (price ? Number(formatUnits(a.stockOut, 18)) * price : 0);
        const change = value === null ? null : value + withdrawn - deposited;
        return { ...a, value, deposited, withdrawn, leftoverStock, change, changePct: change === null || deposited <= 0 ? null : (change / deposited) * 100 };
      })
    : null;
  const totals = rows
    ? rows.reduce((t, r) => ({ deposited: t.deposited + r.deposited, withdrawn: t.withdrawn + r.withdrawn, value: t.value + (r.value ?? 0), change: t.change + (r.change ?? 0), txs: t.txs + r.events.length, pending: t.pending + (r.value === null ? 1 : 0) }), { deposited: 0, withdrawn: 0, value: 0, change: 0, txs: 0, pending: 0 })
    : null;

  return (
    <section className="wallet-vault-position portfolio-activity" aria-labelledby="activity-heading">
      <div className="wallet-section-heading">
        <div>
          <p className="eyebrow">{t("activity.eyebrow")}</p>
          <h2 id="activity-heading">{t("activity.title")}</h2>
        </div>
        <span className="portfolio-activity-count">{totals ? t("activity.txCount", { count: totals.txs }) : ""}</span>
      </div>
      {error ? (
        <p role="status" className="fine-print">
          {error}
        </p>
      ) : !rows ? (
        <p role="status">{t("activity.reading")}</p>
      ) : rows.length === 0 ? (
        <p role="status">{t("activity.empty")}</p>
      ) : (
        <>
          <div className="portfolio-activity-totals">
            <div>
              <span>{t("activity.deposited")}</span>
              <strong className="mono">{usd(totals!.deposited)}</strong>
            </div>
            <div>
              <span>{t("activity.withdrawn")}</span>
              <strong className="mono">{usd(totals!.withdrawn)}</strong>
            </div>
            <div>
              <span>{t("activity.heldNow")}</span>
              <strong className="mono">{usd(totals!.value)}</strong>
              {totals!.pending ? <small>{t(totals!.pending === 1 ? "activity.valuingOne" : "activity.valuingMany", { count: totals!.pending })}</small> : null}
            </div>
            <div className={totals!.change >= 0 ? "is-up" : "is-down"}>
              <span>{t("activity.change")}</span>
              <strong className="mono">{signed(totals!.change)}</strong>
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.pin.vault} className="portfolio-activity-vault">
              <button type="button" className="portfolio-activity-row" aria-expanded={open === r.pin.vault} onClick={() => setOpen(open === r.pin.vault ? null : r.pin.vault)}>
                <StockLogo symbol={r.pin.symbol} size={36} />
                <span>
                  <b>{r.pin.symbol}</b>
                  <small>
                    {t(r.deposits === 1 ? "activity.depositsOne" : "activity.depositsMany", { count: r.deposits })}
                    {r.withdrawals ? `, ${t(r.withdrawals === 1 ? "activity.withdrawalsOne" : "activity.withdrawalsMany", { count: r.withdrawals })}` : ""} · {t("activity.in", { amount: usd(r.deposited) })}
                    {r.withdrawn ? `, ${t("activity.out", { amount: usd(r.withdrawn) })}` : ""}
                  </small>
                </span>
                <span>
                  <b className="mono">{r.value === null ? "–" : usd(r.value)}</b>
                  <small className={`mono ${r.change === null ? "" : r.change >= 0 ? "is-up" : "is-down"}`}>{r.change === null ? t("activity.valuing") : `${signed(r.change)}${r.changePct === null ? "" : ` (${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%)`}`}</small>
                </span>
                <ChevronDown size={16} aria-hidden="true" className={open === r.pin.vault ? "is-open" : ""} />
              </button>
              {open === r.pin.vault ? (
                <ul className="portfolio-activity-events">
                  {r.events.map((e) => (
                    <li key={e.hash}>
                      <span className={`portfolio-activity-kind ${e.kind}`}>{t(`activity.kind.${e.kind}`)}</span>
                      <span>
                        {e.kind === "deposit"
                          ? `${usd(Number(formatUnits(e.usdgOut - e.usdgIn, 6)))} USDG${e.stockIn > 0n ? ` · ${t("activity.returned", { amount: Number(formatUnits(e.stockIn, 18)).toLocaleString("en-US", { maximumSignificantDigits: 4 }), symbol: r.pin.symbol })}` : ""}`
                          : `${e.usdgIn > 0n ? `${usd(Number(formatUnits(e.usdgIn - e.usdgOut, 6)))} USDG` : ""}${e.stockIn > 0n ? `${e.usdgIn > 0n ? " + " : ""}${Number(formatUnits(e.stockIn, 18)).toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${r.pin.symbol}` : ""}`}
                        <small>{t("activity.shares", { count: Number(formatUnits(e.shares, 18)).toLocaleString("en-US", { maximumSignificantDigits: 5 }) })}</small>
                      </span>
                      <span className="mono">{e.time ? formatUtc(e.time) : t("activity.block", { block: e.block.toString() })}</span>
                      <a href={explorerTx(e.hash)} target="_blank" rel="noopener noreferrer">
                        {t("activity.tx")} <ArrowUpRight size={12} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <p className="fine-print">{t("activity.footnote")}</p>
        </>
      )}
    </section>
  );
}
