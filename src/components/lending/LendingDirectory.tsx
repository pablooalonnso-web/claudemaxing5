"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import type { LendingMarketRow, LendingMarketsResponse, LendingPosition } from "@/server/lending";

const v = (raw: bigint, decimals: number, fraction = 0) => formatUnitsFixed(raw.toString(), decimals, fraction);

export function useLendingMarkets(initial: LendingMarketRow[] | null) {
  const [rows, setRows] = useState<LendingMarketRow[] | null>(initial);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/lending/v2/markets", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as LendingMarketsResponse;
        if (json.schemaVersion !== 2 || !Array.isArray(json.data)) throw new Error();
        if (alive) {
          setRows(json.data);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { rows, error };
}

export function useLendingPositions(rows: LendingMarketRow[] | null, owner?: string) {
  const [positions, setPositions] = useState<Record<string, LendingPosition>>({});
  useEffect(() => {
    if (!owner || !rows) return void setPositions({});
    let alive = true;
    const load = async () => {
      const entries = await Promise.all(
        rows.map(async (r) => {
          try {
            const res = await fetch(`/api/lending/v2/markets/${r.pin.slug}/positions/${owner}`, { cache: "no-store" });
            if (!res.ok) throw new Error();
            return [r.pinId, (await res.json()) as LendingPosition] as const;
          } catch {
            return null;
          }
        }),
      );
      if (alive) setPositions(Object.fromEntries(entries.filter((e): e is readonly [string, LendingPosition] => e !== null)));
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [rows, owner]);
  return positions;
}

export function LendingDirectory({ initial }: { initial: LendingMarketRow[] | null }) {
  const { rows, error } = useLendingMarkets(initial);
  const { address: owner } = useWallet();
  const positions = useLendingPositions(rows, owner);
  const list = rows ?? [];
  const decimals = list[0]?.tokens.usdg.decimals ?? 6;
  const sum = (key: "supplied" | "borrowed" | "cash") => list.reduce((a, r) => a + BigInt(r.accounting[key]), 0n);
  const supplied = sum("supplied");
  const borrowed = sum("borrowed");
  const cash = sum("cash");
  const utilisation = supplied > 0n ? `${Number((borrowed * 10_000n) / supplied) / 100}%` : "—";
  const active = list.filter((r) => r.contractState.name === "Active").length;
  const lent = owner ? Object.values(positions).reduce((a, p) => a + BigInt(p.suppliedValue), 0n) : null;
  const owed = owner ? Object.values(positions).reduce((a, p) => a + BigInt(p.debt), 0n) : null;
  const hasPositions = owner && Object.keys(positions).length > 0;
  return (
    <main className="ln-page masthead-page">
      <section className="masthead masthead-bleed">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Lending · USDG markets</p>
              <h1>
                Borrow USDG while your <em className="serif">vault position keeps earning.</em>
              </h1>
            </div>
            <p className="masthead-intro">
              Lend USDG and earn interest paid by borrowers, or lock your vault shares and borrow USDG against them. Each market has its own USDG
              and its own losses.
            </p>
          </div>
          <div className="mast-stats ln-mast-stats">
            <div>
              <span>Lent to markets</span>
              <strong>{v(supplied, decimals)}</strong>
              <span>
                {list.length} market{list.length === 1 ? "" : "s"} · {active} active
              </span>
            </div>
            <div>
              <span>Borrowed</span>
              <strong>{v(borrowed, decimals)}</strong>
              <span>{utilisation} utilized</span>
            </div>
            <div>
              <span>Available to borrow</span>
              <strong>{v(cash, decimals)}</strong>
              <span>Not yet lent out</span>
            </div>
            <div className="mast-you">
              <span>You have lent</span>
              <strong>{owner && hasPositions ? v(lent ?? 0n, decimals, 2) : "—"}</strong>
              <span>{owner ? (hasPositions ? "Current value incl. interest" : "Loading your position") : "Connect wallet to view"}</span>
            </div>
            <div>
              <span>You owe</span>
              <strong>{owner ? v(owed ?? 0n, decimals, 2) : "—"}</strong>
              <span>{owner ? "Including interest" : "Connect wallet to view"}</span>
            </div>
          </div>
        </div>
      </section>
      {list.length === 0 ? (
        <section className="sv-card">
          <h2>Lending is temporarily unavailable</h2>
          <p>{error ? "Refresh to obtain a verified market snapshot." : "Reading the market from the chain…"}</p>
        </section>
      ) : (
        <div className="ln-table-scroll">
          <table className="ln-table">
            <colgroup>
              {[23, 10, 9, 9, 16, 9, 10, 14].map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {["Market", "Status", "Lenders earn", "Borrowers pay", "Currently borrowed", "Lent", "Available to borrow", "Actions"].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const acc = r.accounting;
                const util = BigInt(acc.supplied) > 0n ? `${Number((BigInt(acc.borrowed) * 10_000n) / BigInt(acc.supplied)) / 100}%` : "—";
                const slug = r.pin.slug;
                const symbol = r.pin.symbol;
                return (
                  <tr key={r.pinId}>
                    <td data-label="Market · collateral">
                      <Link className="ln-identity" href={`/lending/${slug}`}>
                        <span className="ln-stack" aria-hidden="true">
                          <span className="ln-token-icon">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/stock-tokens/${slug}.png`} alt="" />
                          </span>
                          <span className="ln-token-icon">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/brands/usdg.png" alt="" />
                          </span>
                        </span>
                        <span>
                          <b>{`${symbol} vault shares → USDG`}</b>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Status">
                      <span className={`vault-table-tag ${r.contractState.name === "Active" ? "vault-table-tag-open" : "vault-table-tag-paused"}`}>{r.contractState.name}</span>
                    </td>
                    <td data-label="Lenders earn" className="mono ln-rate-value">
                      {formatRate18(r.rates.supplyApr)}
                    </td>
                    <td data-label="Borrowers pay" className="mono ln-rate-value">
                      {formatRate18(r.rates.borrowApr)}
                    </td>
                    <td data-label="Currently borrowed" className="ln-span">
                      <span className="ln-util">
                        <span className="ln-util-bar">
                          <i style={{ width: util === "—" ? "0%" : util }} />
                        </span>
                        <small>{util} of lent USDG</small>
                      </span>
                    </td>
                    <td data-label="Lent" className="mono">
                      {formatUnitsFixed(acc.supplied, decimals, 0)}
                    </td>
                    <td data-label="Available to borrow" className="mono">
                      {formatUnitsFixed(acc.cash, decimals, 0)}
                    </td>
                    <td data-label="Actions">
                      <span className="ln-row-actions">
                        <Link className="btn btn-primary btn-sm" href={`/lending/${slug}?view=earn`}>
                          Lend
                        </Link>
                        <Link className="btn btn-ghost btn-sm" href={`/lending/${slug}?view=borrow`}>
                          Borrow
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ln-footnote">
        Rates are variable, current and not a forecast. Borrowing is limited by the USDG available, the value of locked vault shares, the borrow
        limit and vault-share concentration. Public liquidation may not be immediate.
      </p>
    </main>
  );
}
