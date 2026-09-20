"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { erc20Abi, lendingMarketAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import { describeTxError } from "@/lib/managed-vault";
import type { LendingMarketPin } from "@/lib/registry";
import type { LendingMarketRow, LendingPosition } from "@/server/lending";
import { stateLabel, useLendingMarkets } from "./LendingDirectory";
import { Term, TIPS } from "./LendingTip";

type Role = "earn" | "borrow";
type Action = "lend" | "withdraw" | "pledge" | "borrow" | "repay" | "unlock";

const fmt6 = (raw: string | bigint, f = 2) => formatUnitsFixed(typeof raw === "bigint" ? raw.toString() : raw, 6, f);
const fmt18 = (raw: bigint) => Number(formatUnits(raw, 18)).toLocaleString(undefined, { maximumSignificantDigits: 7 });

function parseAmount(value: string, decimals: number, t: TFunction) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) throw new Error(t("ws.err.invalidAmount"));
  const raw = parseUnits(value, decimals);
  if (raw <= 0n) throw new Error(t("ws.err.aboveZero"));
  return raw;
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

export function LendingMarketWorkspace({ pin, initial }: { pin: LendingMarketPin; initial: LendingMarketRow | null }) {
  const t = useT("lending");
  const params = useSearchParams();
  const { rows } = useLendingMarkets(initial ? [initial] : null);
  const market = rows?.find((r) => r.pinId === pin.id) ?? initial;
  const { address: owner, ready, connect, walletClient, chainId, switchChain } = useWallet();
  const [role, setRole] = useState<Role>(params?.get("view") === "borrow" ? "borrow" : "earn");
  const [action, setAction] = useState<Action>("lend");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex | null>(null);
  const [position, setPosition] = useState<LendingPosition | null>(null);
  const [balances, setBalances] = useState<{ usdg: bigint; shares: bigint } | null>(null);
  const busyRef = useRef(false);
  const symbol = pin.symbol;

  useEffect(() => {
    setAction(role === "earn" ? "lend" : "borrow");
    setAmount("");
  }, [role]);

  const refreshOwner = useCallback(async () => {
    if (!owner) {
      setPosition(null);
      setBalances(null);
      return;
    }
    try {
      const res = await fetch(`/api/lending/v2/markets/${pin.slug}/positions/${owner}`, { cache: "no-store" });
      if (res.ok) setPosition((await res.json()) as LendingPosition);
    } catch {}
    try {
      const client = publicClient();
      const [usdg, shares] = await Promise.all([
        client.readContract({ address: pin.usdg as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
        client.readContract({ address: pin.vault as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      ]);
      setBalances({ usdg, shares });
    } catch {}
  }, [owner, pin]);

  useEffect(() => {
    void refreshOwner();
    const timer = setInterval(refreshOwner, 15_000);
    return () => clearInterval(timer);
  }, [refreshOwner]);

  const acc = market?.accounting;
  const decimals = market?.tokens.usdg.decimals ?? 6;
  const util = acc && BigInt(acc.supplied) > 0n ? Number((BigInt(acc.borrowed) * 10_000n) / BigInt(acc.supplied)) / 100 : 0;
  const active = market?.contractState.name === "Active";
  const supplyRate = market ? formatRate18(market.rates.supplyApr) : "–";
  const borrowRate = market ? formatRate18(market.rates.borrowApr) : "–";
  const priceOk = !!market?.valuation && market.oracle.available;
  const maxLtv = market ? Number(market.config.maxLtvBps) / 100 : null;

  async function send(to: Address, data: Hex, label: string) {
    if (!walletClient || !owner) throw new Error(t("ws.err.connect"));
    const client = publicClient();
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    setStatus(t("ws.status.confirm", { label }));
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 125n + 99n) / 100n });
    setHash(tx);
    setStatus(t("ws.status.waiting"));
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(t("ws.err.reverted"));
  }

  async function ensureAllowance(token: Address, needed: bigint) {
    if (!owner) return;
    const current = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, pin.market as Address] });
    if (current >= needed) return;
    if (current > 0n) await send(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pin.market as Address, 0n] }), t("ws.tx.approvalReset"));
    await send(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pin.market as Address, needed] }), t("ws.tx.approval"));
  }

  async function run() {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setHash(null);
    setStatus(t("ws.status.checking"));
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const marketAddress = pin.market as Address;
      const call = (fn: "supply" | "withdraw" | "pledge" | "withdrawCollateral" | "borrow", value: bigint) =>
        encodeFunctionData({ abi: lendingMarketAbi, functionName: fn, args: [value] });
      if (action === "lend") {
        const raw = parseAmount(amount, decimals, t);
        await ensureAllowance(pin.usdg as Address, raw);
        await send(marketAddress, call("supply", raw), t("ws.tx.lending"));
      } else if (action === "withdraw") {
        const raw = parseAmount(amount, decimals, t);
        if (!position || !market) throw new Error(t("ws.err.positionLoading"));
        const tss = BigInt(market.accounting.totalSupplyShares);
        const supplied = BigInt(market.accounting.supplied);
        const units = supplied === 0n ? 0n : (raw * tss + supplied - 1n) / supplied;
        const capped = units > BigInt(position.supplyShares) ? BigInt(position.supplyShares) : units;
        if (capped === 0n) throw new Error(t("ws.err.withinPosition"));
        await send(marketAddress, call("withdraw", capped), t("ws.tx.withdrawal"));
      } else if (action === "pledge") {
        const raw = parseAmount(amount, 18, t);
        await ensureAllowance(pin.vault as Address, raw);
        await send(marketAddress, call("pledge", raw), t("ws.tx.collateralLock"));
      } else if (action === "unlock") {
        const raw = parseAmount(amount, 18, t);
        await send(marketAddress, call("withdrawCollateral", raw), t("ws.tx.collateralUnlock"));
      } else if (action === "borrow") {
        const raw = parseAmount(amount, decimals, t);
        await send(marketAddress, call("borrow", raw), t("ws.tx.borrow"));
      } else if (action === "repay") {
        const raw = parseAmount(amount, decimals, t);
        await ensureAllowance(pin.usdg as Address, raw);
        await send(marketAddress, encodeFunctionData({ abi: lendingMarketAbi, functionName: "repay", args: [owner, raw] }), t("ws.tx.repayment"));
      }
      setStatus(t("ws.status.confirmedUpdating"));
      window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      await refreshOwner();
      setAmount("");
      setStatus(t("ws.status.complete"));
    } catch (e) {
      setStatus("");
      setError(describeTxError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const actionMeta = useMemo(() => {
    const balUsdg = balances ? fmt6(balances.usdg) : "–";
    const balShares = balances ? fmt18(balances.shares) : "–";
    const lentValue = position ? fmt6(position.suppliedValue) : "–";
    const locked = position ? fmt18(BigInt(position.collateralShares)) : "–";
    const debt = position ? fmt6(position.debt) : "–";
    const maxBorrow = position ? fmt6(position.maxBorrow) : "–";
    switch (action) {
      case "lend":
        return { label: t("action.lend.label"), unit: "USDG", balance: balUsdg, balanceRaw: balances?.usdg ?? null, dec: decimals, cta: t("action.lend.cta"), bullets: [t("action.lend.b1"), t("action.lend.b2", { rate: supplyRate }), t("action.lend.b3"), t("action.lend.b4")] };
      case "withdraw":
        return { label: t("action.withdraw.label"), unit: "USDG", balance: lentValue, balanceRaw: position ? BigInt(position.suppliedValue) : null, dec: decimals, cta: t("action.withdraw.cta"), bullets: [t("action.withdraw.b1"), t("action.withdraw.b2"), t("action.withdraw.b3")] };
      case "pledge":
        return { label: t("action.pledge.label"), unit: t("ws.form.shares", { symbol }), balance: balShares, balanceRaw: balances?.shares ?? null, dec: 18, cta: t("action.pledge.cta"), bullets: [t("action.pledge.b1"), t("action.pledge.b2"), t("action.pledge.b3", { ltv: maxLtv ?? "–" })] };
      case "unlock":
        return { label: t("action.unlock.label"), unit: t("ws.form.shares", { symbol }), balance: locked, balanceRaw: position ? BigInt(position.collateralShares) : null, dec: 18, cta: t("action.unlock.cta"), bullets: [t("action.unlock.b1"), t("action.unlock.b2"), t("action.unlock.b3")] };
      case "borrow":
        return { label: t("action.borrow.label"), unit: "USDG", balance: maxBorrow, balanceRaw: position ? BigInt(position.maxBorrow) : null, dec: decimals, cta: t("action.borrow.cta"), bullets: [t("action.borrow.b1", { rate: borrowRate }), t("action.borrow.b2"), t("action.borrow.b3")] };
      case "repay":
        return { label: t("action.repay.label"), unit: "USDG", balance: debt, balanceRaw: position ? BigInt(position.debt) : null, dec: decimals, cta: t("action.repay.cta"), bullets: [t("action.repay.b1"), t("action.repay.b2"), t("action.repay.b3")] };
    }
  }, [action, balances, position, decimals, supplyRate, borrowRate, symbol, maxLtv, t]);

  const setPct = (pct: number) => {
    if (!actionMeta.balanceRaw) return;
    setAmount(formatUnits((actionMeta.balanceRaw * BigInt(pct)) / 100n, actionMeta.dec));
  };

  const tabs: [Action, string][] = role === "earn" ? [["lend", t("ws.tab.lend")], ["withdraw", t("ws.tab.withdraw")]] : [["borrow", t("ws.tab.borrow")], ["repay", t("ws.tab.repay")], ["pledge", t("ws.tab.pledge")], ["unlock", t("ws.tab.unlock")]];

  return (
    <div className="ln-page ln-v2 masthead-page">
      <section className="masthead masthead-bleed">
        <div className="masthead-inner">
          <nav className="masthead-crumb ln-breadcrumb" aria-label={t("ws.crumb.aria")}>
            <Link href="/lending">{t("ws.crumb.lending")}</Link>
            <span>/</span>
            <span>{t("ws.pair", { symbol })}</span>
          </nav>
          <div className="masthead-head">
            <div className="masthead-identity ln-market-head">
              <span className="ln-stack" aria-hidden="true">
                <span className="ln-token-icon ln-token-icon-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/stock-tokens/${pin.slug}.png`} alt="" />
                </span>
                <span className="ln-token-icon ln-token-icon-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brands/usdg.png" alt="" />
                </span>
              </span>
              <div>
                <h1>{t("ws.pair", { symbol })}</h1>
                <div className="masthead-tags ln-meta">
                  <span className={`vault-table-tag ${active ? "vault-table-tag-open" : "vault-table-tag-paused"}`}>{market ? (!market.oracle.available && !active ? t("state.stale") : stateLabel(t, market.contractState.name)) : t("state.checking")}</span>
                  <span className="dtag">
                    {t("ws.tag.borrowAgainst", { symbol })}{" "}
                    <Term label="" title={t("ws.tag.vaultShares")} tip={t("ws.tag.vaultSharesTip", { brand: BRAND.name })} />
                  </span>
                  <span className="dtag">{priceOk ? t("ws.tag.priceAvailable") : t("ws.tag.priceUnavailable")}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="ln-stats">
            <div>
              <small>
                <Term label={t("ws.stat.lentToMarket")} tip={t(TIPS.lent)} />
              </small>
              <strong>{acc ? fmt6(acc.supplied) : "–"}</strong>
              <small>
                <Term label={t("ws.stat.utilBorrowed", { util: util.toFixed(2) })} title={t("ws.stat.currentlyBorrowed")} tip={t(TIPS.utilised)} />
              </small>
            </div>
            <div>
              <small>
                <Term label={t("ws.stat.borrowed")} tip={t(TIPS.borrowed)} />
              </small>
              <strong>{acc ? fmt6(acc.borrowed) : "–"}</strong>
              <small>{t("ws.stat.inclInterest")}</small>
            </div>
            <div>
              <small>
                <Term label={t("ws.stat.available")} tip={t(TIPS.available)} />
              </small>
              <strong>{acc ? fmt6(acc.cash) : "–"}</strong>
              <small>{t("ws.stat.notLent")}</small>
            </div>
            <div className="up">
              <small>
                <Term label={t("ws.stat.borrowersPay")} tip={t(TIPS.borrowersPay)} />
              </small>
              <strong>{borrowRate}</strong>
              <small>
                <Term label={t("ws.stat.variableApr")} tip={t(TIPS.variable)} />
              </small>
            </div>
            <div className="up">
              <small>
                <Term label={t("ws.stat.lendersEarn")} tip={t(TIPS.lendersEarn)} />
              </small>
              <strong>{supplyRate}</strong>
              <small>
                <Term label={t("ws.stat.variableApr")} tip={t(TIPS.variable)} />
              </small>
            </div>
          </div>
        </div>
      </section>
      <nav className="ln-role-switch" aria-label={t("ws.role.aria")}>
        <button type="button" aria-selected={role === "earn"} onClick={() => setRole("earn")}>
          <span className="ln-role-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="9" cy="7" rx="6" ry="2.6" />
              <path d="M3 7v5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" />
              <path d="M3 12v5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-5" />
              <path d="M15 9.6c3.4.2 6 1.3 6 2.6v5c0 1.4-2.7 2.6-6 2.6" />
            </svg>
          </span>
          <strong>{t("ws.role.earn")}</strong>
          <span>{t("ws.role.earnDesc")}</span>
        </button>
        <button type="button" aria-selected={role === "borrow"} onClick={() => setRole("borrow")}>
          <span className="ln-role-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15.5" r="1.3" />
            </svg>
          </span>
          <strong>{t("ws.role.borrow")}</strong>
          <span>{t("ws.role.borrowDesc", { symbol })}</span>
        </button>
      </nav>
      {role === "earn" ? (
        <section className="sv-card ln-supply-hero">
          <div>
            <p className="eyebrow">{t("ws.earn.eyebrow")}</p>
            <h2>{owner ? (position && BigInt(position.supplyShares) > 0n ? t("ws.earn.earning") : t("ws.earn.lendTo")) : t("ws.earn.connect")}</h2>
            <p>{t("ws.earn.desc")}</p>
          </div>
          <div className="ln-kv">
            <div>
              <span>
                <Term label={t("ws.stat.lentToMarket")} tip={t(TIPS.lent)} />
              </span>
              <strong>{acc ? fmt6(acc.supplied) : "–"} USDG</strong>
              <small>{t("ws.earn.byAll")}</small>
            </div>
            <div>
              <span>
                <Term label={t("ws.stat.lendersEarn")} tip={t(TIPS.lendersEarn)} />
              </span>
              <strong>{supplyRate}</strong>
              <small>{t("ws.earn.notForecast")}</small>
            </div>
            <div>
              <span>
                <Term label={t("ws.earn.notBorrowed")} title={t("ws.stat.available")} tip={t(TIPS.available)} />
              </span>
              <strong>{acc ? fmt6(acc.cash) : "–"} USDG</strong>
              <small>{t("ws.earn.withdrawLimited")}</small>
            </div>
          </div>
        </section>
      ) : (
        <section className="sv-card ln-supply-hero">
          <div>
            <p className="eyebrow">{t("ws.borrow.eyebrow")}</p>
            <h2>{owner ? (position && BigInt(position.debt) > 0n ? t("ws.borrow.yourLoan") : t("ws.borrow.lockToBorrow", { symbol })) : t("ws.borrow.connect")}</h2>
            <p>{t("ws.borrow.desc", { symbol })}</p>
          </div>
          <div className="ln-kv">
            <div>
              <span>
                <Term label={t("ws.borrow.limit")} title={t("ws.borrow.ltv")} tip={t(TIPS.ltv)} />
              </span>
              <strong>{maxLtv !== null ? `${maxLtv}%` : "–"}</strong>
              <small>{t("ws.borrow.ofLocked")}</small>
            </div>
            <div>
              <span>
                <Term label={t("ws.stat.borrowersPay")} tip={t(TIPS.borrowersPay)} />
              </span>
              <strong>{borrowRate}</strong>
              <small>{t("ws.earn.notForecast")}</small>
            </div>
            <div>
              <span>
                <Term label={t("ws.borrow.health")} tip={t(TIPS.healthFactor)} />
              </span>
              <strong>{position ? (position.healthFactor === null ? t("ws.borrow.noLoan") : position.healthFactor.toFixed(2)) : "–"}</strong>
              <small>{position ? t("ws.borrow.oweSummary", { debt: fmt6(position.debt), shares: fmt18(BigInt(position.collateralShares)) }) : t("ws.borrow.connectToView")}</small>
            </div>
          </div>
        </section>
      )}
      <div className="ln-grid">
        <div className="ln-col">
          <section className="sv-card">
            <h2>{t("ws.how.title")}</h2>
            <div className="ln-path ln-path-static">
              {(role === "earn"
                ? [
                    [t("ws.how.earn1.title"), t("ws.how.earn1.copy")],
                    [t("ws.how.earn2.title"), t("ws.how.earn2.copy", { symbol })],
                    [t("ws.how.earn3.title"), t("ws.how.earn3.copy")],
                  ]
                : [
                    [t("ws.how.borrow1.title"), t("ws.how.borrow1.copy", { symbol })],
                    [t("ws.how.borrow2.title"), t("ws.how.borrow2.copy", { ltv: maxLtv ?? "–" })],
                    [t("ws.how.borrow3.title"), t("ws.how.borrow3.copy")],
                  ]
              ).map(([title, copy], i) => (
                <div className="ln-path-step" key={title}>
                  <span className="ln-path-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
            <p className="ln-note">
              {t("ws.how.note.before")}
              <Term label={t("ws.how.note.reserve")} title={t("ws.how.note.reserveTitle")} tip={t(TIPS.reserve)} />
              {t("ws.how.note.after")}
            </p>
          </section>
          <section className="sv-card">
            <div className="sv-card-head">
              <div>
                <h2>{t("ws.sign.title")}</h2>
                <p>{t("ws.sign.desc")}</p>
              </div>
            </div>
            <div className="ln-kv">
              <div>
                <span>
                  <Term label={t("ws.sign.loanPrice")} tip={t(TIPS.loanPrice)} />
                </span>
                <strong className="ln-kv-text">{priceOk ? t("ws.sign.available") : t("ws.sign.unavailable")}</strong>
                <small>{t("ws.sign.belowMarket")}</small>
              </div>
              <div>
                <span>{t("ws.sign.withdrawalPrice")}</span>
                <strong className="ln-kv-text">{priceOk ? t("ws.sign.available") : t("ws.sign.unavailable")}</strong>
                <small>{t("ws.sign.usedWhen")}</small>
              </div>
              <div>
                <span>{t("ws.sign.newLoans")}</span>
                <strong className="ln-kv-text">{active ? t("ws.sign.open") : t("ws.sign.paused")}</strong>
                <small>{active ? t("ws.sign.marketActive") : t("ws.sign.marketIs", { state: stateLabel(t, market?.contractState.name, "stateLower") })}</small>
              </div>
            </div>
            <p className="ln-note">{t("ws.sign.note")}</p>
          </section>
        </div>
        <aside className="ln-action">
          <div className="tabs vault-action-tabs ln-supplier-tabs" role="tablist" aria-label={role === "earn" ? t("ws.tabs.lendAria") : t("ws.tabs.borrowAria")}>
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={action === key} className={action === key ? "active" : ""} disabled={busy} onClick={() => setAction(key)}>
                {label}
              </button>
            ))}
          </div>
          <fieldset className="ln-form ln-supplier-form" disabled={busy}>
            <label className="amount-box amount-box-input ln-amount-box">
              <span className="amount-box-top">
                <span>{actionMeta.label}</span>
                <span>
                  {action === "borrow" ? t("ws.form.available") : t("ws.form.balance")} <b>{owner ? actionMeta.balance : "–"}</b>
                </span>
              </span>
              <span className="wallet-amount-main">
                <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span>
                  {actionMeta.unit === "USDG" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brands/usdg.png" alt="" /> USDG
                    </>
                  ) : (
                    actionMeta.unit
                  )}
                </span>
              </span>
            </label>
            <div className="ln-amount-shortcuts" aria-label={t("ws.form.shortcuts")}>
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(25)}>
                25%
              </button>
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(50)}>
                50%
              </button>
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(100)}>
                {t("ws.form.max")}
              </button>
            </div>
            <div className="ln-whathappens">
              <h3>{t("ws.form.whatHappens")}</h3>
              <ul>
                {actionMeta.bullets.map((b) => (
                  <CheckItem key={b}>{b}</CheckItem>
                ))}
              </ul>
            </div>
            {owner ? (
              <button type="button" className="btn btn-primary btn-block managed-submit" disabled={busy || !active} onClick={() => void run()}>
                {busy ? t("ws.form.working") : active ? actionMeta.cta : t("ws.form.marketPaused")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-block managed-submit" disabled={!ready} onClick={() => void connect()}>
                {t("ws.form.connect")}
              </button>
            )}
          </fieldset>
          {status || hash || error ? (
            <div className="managed-transaction-result">
              {status ? (
                <p className="managed-transaction-progress" role="status" aria-live="polite">
                  {status}
                </p>
              ) : null}
              {hash ? (
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                  {t("ws.form.viewTx")}
                </a>
              ) : null}
              {error ? (
                <p className="managed-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="ln-note">{t("ws.form.note")}</p>
        </aside>
      </div>
    </div>
  );
}
