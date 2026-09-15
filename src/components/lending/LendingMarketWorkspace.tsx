"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { erc20Abi, lendingMarketAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { formatRate18, formatUnitsFixed } from "@/lib/format";
import { describeTxError } from "@/lib/managed-vault";
import type { LendingMarketPin } from "@/lib/registry";
import type { LendingMarketRow, LendingPosition } from "@/server/lending";
import { useLendingMarkets } from "./LendingDirectory";
import { Term, TIPS } from "./LendingTip";

type Role = "earn" | "borrow";
type Action = "lend" | "withdraw" | "pledge" | "borrow" | "repay" | "unlock";

const fmt6 = (raw: string | bigint, f = 2) => formatUnitsFixed(typeof raw === "bigint" ? raw.toString() : raw, 6, f);
const fmt18 = (raw: bigint) => Number(formatUnits(raw, 18)).toLocaleString(undefined, { maximumSignificantDigits: 7 });

function parseAmount(value: string, decimals: number) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) throw new Error("Enter a valid amount");
  const raw = parseUnits(value, decimals);
  if (raw <= 0n) throw new Error("Enter an amount above zero");
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
    const t = setInterval(refreshOwner, 15_000);
    return () => clearInterval(t);
  }, [refreshOwner]);

  const acc = market?.accounting;
  const decimals = market?.tokens.usdg.decimals ?? 6;
  const util = acc && BigInt(acc.supplied) > 0n ? Number((BigInt(acc.borrowed) * 10_000n) / BigInt(acc.supplied)) / 100 : 0;
  const active = market?.contractState.name === "Active";
  const supplyRate = market ? formatRate18(market.rates.supplyApr) : "—";
  const borrowRate = market ? formatRate18(market.rates.borrowApr) : "—";
  const priceOk = !!market?.valuation && market.oracle.available;
  const maxLtv = market ? Number(market.config.maxLtvBps) / 100 : null;

  async function send(to: Address, data: Hex, label: string) {
    if (!walletClient || !owner) throw new Error("Connect your wallet");
    const client = publicClient();
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    setStatus(`Confirm ${label} in your wallet.`);
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 125n + 99n) / 100n });
    setHash(tx);
    setStatus("Waiting for confirmation…");
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error("Transaction reverted; no change was completed.");
  }

  async function ensureAllowance(token: Address, needed: bigint) {
    if (!owner) return;
    const current = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, pin.market as Address] });
    if (current >= needed) return;
    if (current > 0n) await send(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pin.market as Address, 0n] }), "approval reset");
    await send(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pin.market as Address, needed] }), "approval");
  }

  async function run() {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setHash(null);
    setStatus("Checking the market…");
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const marketAddress = pin.market as Address;
      const call = (fn: "supply" | "withdraw" | "pledge" | "withdrawCollateral" | "borrow", value: bigint) =>
        encodeFunctionData({ abi: lendingMarketAbi, functionName: fn, args: [value] });
      if (action === "lend") {
        const raw = parseAmount(amount, decimals);
        await ensureAllowance(pin.usdg as Address, raw);
        await send(marketAddress, call("supply", raw), "lending");
      } else if (action === "withdraw") {
        const raw = parseAmount(amount, decimals);
        if (!position || !market) throw new Error("Your position is still loading");
        const tss = BigInt(market.accounting.totalSupplyShares);
        const supplied = BigInt(market.accounting.supplied);
        const units = supplied === 0n ? 0n : (raw * tss + supplied - 1n) / supplied;
        const capped = units > BigInt(position.supplyShares) ? BigInt(position.supplyShares) : units;
        if (capped === 0n) throw new Error("Enter an amount within your position");
        await send(marketAddress, call("withdraw", capped), "withdrawal");
      } else if (action === "pledge") {
        const raw = parseAmount(amount, 18);
        await ensureAllowance(pin.vault as Address, raw);
        await send(marketAddress, call("pledge", raw), "collateral lock");
      } else if (action === "unlock") {
        const raw = parseAmount(amount, 18);
        await send(marketAddress, call("withdrawCollateral", raw), "collateral unlock");
      } else if (action === "borrow") {
        const raw = parseAmount(amount, decimals);
        await send(marketAddress, call("borrow", raw), "borrow");
      } else if (action === "repay") {
        const raw = parseAmount(amount, decimals);
        await ensureAllowance(pin.usdg as Address, raw);
        await send(marketAddress, encodeFunctionData({ abi: lendingMarketAbi, functionName: "repay", args: [owner, raw] }), "repayment");
      }
      setStatus("Transaction confirmed. Updating your position…");
      window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      await refreshOwner();
      setAmount("");
      setStatus("Transaction complete. Your position is updated.");
    } catch (e) {
      setStatus("");
      setError(describeTxError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const actionMeta = useMemo(() => {
    const balUsdg = balances ? fmt6(balances.usdg) : "—";
    const balShares = balances ? fmt18(balances.shares) : "—";
    const lentValue = position ? fmt6(position.suppliedValue) : "—";
    const locked = position ? fmt18(BigInt(position.collateralShares)) : "—";
    const debt = position ? fmt6(position.debt) : "—";
    const maxBorrow = position ? fmt6(position.maxBorrow) : "—";
    switch (action) {
      case "lend":
        return { label: "You lend", unit: "USDG", balance: balUsdg, balanceRaw: balances?.usdg ?? null, dec: decimals, cta: "Lend", bullets: ["Your USDG moves from your wallet into the market", `You start earning the current ${supplyRate} rate, paid by borrowers`, "You can withdraw later when enough USDG is not borrowed and the market's pricing and state allow it", "Nothing is locked for a fixed time"] };
      case "withdraw":
        return { label: "You withdraw", unit: "USDG", balance: lentValue, balanceRaw: position ? BigInt(position.suppliedValue) : null, dec: decimals, cta: "Withdraw", bullets: ["USDG plus earned interest returns to your wallet", "Limited to what is not currently borrowed", "Needs a current share price and an open market"] };
      case "pledge":
        return { label: "You lock", unit: `${symbol} vault shares`, balance: balShares, balanceRaw: balances?.shares ?? null, dec: 18, cta: "Lock shares", bullets: ["Your vault shares move into the market as collateral", "They keep earning vault fees while locked", `You can borrow up to ${maxLtv ?? "—"}% of their value in USDG`] };
      case "unlock":
        return { label: "You unlock", unit: `${symbol} vault shares`, balance: locked, balanceRaw: position ? BigInt(position.collateralShares) : null, dec: 18, cta: "Unlock shares", bullets: ["Shares return to your wallet", "Your loan must stay backed after the unlock", "Needs a current share price and an open market"] };
      case "borrow":
        return { label: "You borrow", unit: "USDG", balance: maxBorrow, balanceRaw: position ? BigInt(position.maxBorrow) : null, dec: decimals, cta: "Borrow", bullets: [`USDG is sent to your wallet; you pay the current ${borrowRate} rate`, "Interest is added to what you owe; nothing is taken from your shares automatically", "If your locked shares fall in value the market can sell them to repay the loan"] };
      case "repay":
        return { label: "You repay", unit: "USDG", balance: debt, balanceRaw: position ? BigInt(position.debt) : null, dec: decimals, cta: "Repay", bullets: ["USDG moves from your wallet to the market", "Your loan and its interest decrease", "Repaying everything lets you unlock all your shares"] };
    }
  }, [action, balances, position, decimals, supplyRate, borrowRate, symbol, maxLtv]);

  const setPct = (pct: number) => {
    if (!actionMeta.balanceRaw) return;
    setAmount(formatUnits((actionMeta.balanceRaw * BigInt(pct)) / 100n, actionMeta.dec));
  };

  const tabs: [Action, string][] = role === "earn" ? [["lend", "Lend"], ["withdraw", "Withdraw"]] : [["borrow", "Borrow"], ["repay", "Repay"], ["pledge", "Lock shares"], ["unlock", "Unlock"]];

  return (
    <div className="ln-page ln-v2 masthead-page">
      <section className="masthead masthead-bleed">
        <div className="masthead-inner">
          <nav className="masthead-crumb ln-breadcrumb" aria-label="Breadcrumb">
            <Link href="/lending">Lending</Link>
            <span>/</span>
            <span>{symbol} vault shares → USDG</span>
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
                <h1>{symbol} vault shares → USDG</h1>
                <div className="masthead-tags ln-meta">
                  <span className={`vault-table-tag ${active ? "vault-table-tag-open" : "vault-table-tag-paused"}`}>{market?.contractState.name ?? "Checking"}</span>
                  <span className="dtag">
                    Borrow USDG against {symbol} vault shares{" "}
                    <Term label="" title="Vault shares" tip={`Your share of a ${BRAND.name} vault. Their value follows the vault’s Stock Token position and the fees it earns.`} />
                  </span>
                  <span className="dtag">Share prices {priceOk ? "available" : "unavailable"}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="ln-stats">
            <div>
              <small>
                <Term label="Lent to this market" tip={TIPS.lent} />
              </small>
              <strong>{acc ? fmt6(acc.supplied) : "—"}</strong>
              <small>
                <Term label={`${util.toFixed(2)}% currently borrowed`} title="Currently borrowed" tip={TIPS.utilised} />
              </small>
            </div>
            <div>
              <small>
                <Term label="Borrowed" tip={TIPS.borrowed} />
              </small>
              <strong>{acc ? fmt6(acc.borrowed) : "—"}</strong>
              <small>Including interest</small>
            </div>
            <div>
              <small>
                <Term label="Available to borrow" tip={TIPS.available} />
              </small>
              <strong>{acc ? fmt6(acc.cash) : "—"}</strong>
              <small>Not yet lent out</small>
            </div>
            <div className="up">
              <small>
                <Term label="Borrowers pay" tip={TIPS.borrowersPay} />
              </small>
              <strong>{borrowRate}</strong>
              <small>
                <Term label="Variable APR" tip={TIPS.variable} />
              </small>
            </div>
            <div className="up">
              <small>
                <Term label="Lenders earn" tip={TIPS.lendersEarn} />
              </small>
              <strong>{supplyRate}</strong>
              <small>
                <Term label="Variable APR" tip={TIPS.variable} />
              </small>
            </div>
          </div>
        </div>
      </section>
      <nav className="ln-role-switch" aria-label="What do you want to do?">
        <button type="button" aria-pressed={role === "earn"} onClick={() => setRole("earn")}>
          <span className="ln-role-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="9" cy="7" rx="6" ry="2.6" />
              <path d="M3 7v5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" />
              <path d="M3 12v5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-5" />
              <path d="M15 9.6c3.4.2 6 1.3 6 2.6v5c0 1.4-2.7 2.6-6 2.6" />
            </svg>
          </span>
          <strong>Earn interest</strong>
          <span>Lend your USDG to borrowers. Withdraw when the market has unborrowed USDG, a current price and is open.</span>
        </button>
        <button type="button" aria-pressed={role === "borrow"} onClick={() => setRole("borrow")}>
          <span className="ln-role-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15.5" r="1.3" />
            </svg>
          </span>
          <strong>Borrow USDG</strong>
          <span>Lock your {symbol} vault shares as collateral and borrow against them.</span>
        </button>
      </nav>
      {role === "earn" ? (
        <section className="sv-card ln-supply-hero">
          <div>
            <p className="eyebrow">Earn interest</p>
            <h2>{owner ? (position && BigInt(position.supplyShares) > 0n ? "Your USDG is earning" : "Lend USDG to this market") : "Connect your wallet to lend USDG"}</h2>
            <p>Borrowers pay interest on what they use. Your USDG is not locked for a set time, but withdrawals are limited to what is not currently borrowed and need a current share price and an open market.</p>
          </div>
          <div className="ln-kv">
            <div>
              <span>
                <Term label="Lent to this market" tip={TIPS.lent} />
              </span>
              <strong>{acc ? fmt6(acc.supplied) : "—"} USDG</strong>
              <small>By all lenders</small>
            </div>
            <div>
              <span>
                <Term label="Lenders earn" tip={TIPS.lendersEarn} />
              </span>
              <strong>{supplyRate}</strong>
              <small>Variable APR · not a forecast</small>
            </div>
            <div>
              <span>
                <Term label="Not currently borrowed" title="Available to borrow" tip={TIPS.available} />
              </span>
              <strong>{acc ? fmt6(acc.cash) : "—"} USDG</strong>
              <small>Withdrawals are limited to this</small>
            </div>
          </div>
        </section>
      ) : (
        <section className="sv-card ln-supply-hero">
          <div>
            <p className="eyebrow">Borrow USDG</p>
            <h2>{owner ? (position && BigInt(position.debt) > 0n ? "Your loan" : `Lock ${symbol} vault shares to borrow`) : "Connect your wallet to borrow USDG"}</h2>
            <p>Lock {symbol} vault shares as collateral. Your shares keep earning vault fees while the loan stays backed by shares worth more than what you owe.</p>
          </div>
          <div className="ln-kv">
            <div>
              <span>
                <Term label="Borrow limit" title="Loan-to-value" tip={TIPS.ltv} />
              </span>
              <strong>{maxLtv !== null ? `${maxLtv}%` : "—"}</strong>
              <small>Of locked share value</small>
            </div>
            <div>
              <span>
                <Term label="Borrowers pay" tip={TIPS.borrowersPay} />
              </span>
              <strong>{borrowRate}</strong>
              <small>Variable APR · not a forecast</small>
            </div>
            <div>
              <span>
                <Term label="Health factor" tip={TIPS.healthFactor} />
              </span>
              <strong>{position ? (position.healthFactor === null ? "No loan" : position.healthFactor.toFixed(2)) : "—"}</strong>
              <small>{position ? `Owe ${fmt6(position.debt)} USDG · ${fmt18(BigInt(position.collateralShares))} shares locked` : "Connect wallet to view"}</small>
            </div>
          </div>
        </section>
      )}
      <div className="ln-grid">
        <div className="ln-col">
          <section className="sv-card">
            <h2>How lending works</h2>
            <div className="ln-path ln-path-static">
              {(role === "earn"
                ? [
                    ["Lend USDG", "Your USDG joins the market’s pool. You receive a share of the pool that grows with interest."],
                    ["Borrowers use it", `Loans are always backed by locked ${symbol} vault shares worth more than the loan.`],
                    ["Withdraw", "Take out your USDG plus interest when enough is not borrowed and the market’s pricing and state allow it."],
                  ]
                : [
                    ["Lock shares", `Move ${symbol} vault shares into the market as collateral. They keep earning vault fees.`],
                    ["Borrow USDG", `Draw USDG up to ${maxLtv ?? "—"}% of the locked value. Interest accrues on what you owe.`],
                    ["Repay and unlock", "Repay any time. Once the loan is cleared, unlock every share back to your wallet."],
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
              Every loan must stay backed by locked shares worth more than the loan. If a liquidation is delayed and losses exceed the{" "}
              <Term label="market’s reserve" title="Market reserve" tip={TIPS.reserve} />, the value of lent USDG can decrease.
            </p>
          </section>
          <section className="sv-card">
            <div className="sv-card-head">
              <div>
                <h2>Before you sign</h2>
                <p>Checked again the moment you confirm.</p>
              </div>
            </div>
            <div className="ln-kv">
              <div>
                <span>
                  <Term label="Price used for loans" tip={TIPS.loanPrice} />
                </span>
                <strong className="ln-kv-text">{priceOk ? "Available" : "Unavailable"}</strong>
                <small>A little below market, on purpose</small>
              </div>
              <div>
                <span>Withdrawal price</span>
                <strong className="ln-kv-text">{priceOk ? "Available" : "Unavailable"}</strong>
                <small>Used when shares are unlocked or sold</small>
              </div>
              <div>
                <span>New loans</span>
                <strong className="ln-kv-text">{active ? "Open" : "Paused"}</strong>
                <small>{active ? "Market is active" : `Market is ${market?.contractState.name?.toLowerCase() ?? "unavailable"}`}</small>
              </div>
            </div>
            <p className="ln-note">Every transaction is simulated against the live market before your wallet opens. If anything changed, you see it here first.</p>
          </section>
        </div>
        <aside className="ln-action">
          <div className="tabs vault-action-tabs ln-supplier-tabs" role="tablist" aria-label={role === "earn" ? "Lend action" : "Borrow action"}>
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={action === key} aria-pressed={action === key} className={action === key ? "active" : ""} disabled={busy} onClick={() => setAction(key)}>
                {label}
              </button>
            ))}
          </div>
          <fieldset className="ln-form ln-supplier-form" disabled={busy}>
            <label className="amount-box amount-box-input ln-amount-box">
              <span className="amount-box-top">
                <span>{actionMeta.label}</span>
                <span>
                  {action === "borrow" ? "Available" : "Balance"} <b>{owner ? actionMeta.balance : "—"}</b>
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
            <div className="ln-amount-shortcuts" aria-label="Amount shortcuts">
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(25)}>
                25%
              </button>
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(50)}>
                50%
              </button>
              <button type="button" disabled={!owner || !actionMeta.balanceRaw} onClick={() => setPct(100)}>
                Max
              </button>
            </div>
            <div className="ln-whathappens">
              <h3>What happens when you confirm</h3>
              <ul>
                {actionMeta.bullets.map((b) => (
                  <CheckItem key={b}>{b}</CheckItem>
                ))}
              </ul>
            </div>
            {owner ? (
              <button type="button" className="btn btn-primary btn-block managed-submit" disabled={busy || !active} onClick={() => void run()}>
                {busy ? "Working…" : active ? actionMeta.cta : "Market paused"}
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-block managed-submit" disabled={!ready} onClick={() => void connect()}>
                Connect wallet
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
                  View transaction ↗
                </a>
              ) : null}
              {error ? (
                <p className="managed-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="ln-note">If approval is needed, your wallet asks first, then returns you here. Your wallet pays network gas.</p>
        </aside>
      </div>
    </div>
  );
}
