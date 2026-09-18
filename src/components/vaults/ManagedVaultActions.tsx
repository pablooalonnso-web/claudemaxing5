"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { erc20Abi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import {
  buildDepositQuote,
  buildWithdrawQuote,
  depositStatusOf,
  describeTxError,
  encodeApprove,
  encodeDeposit,
  encodeWithdraw,
  readManagedState,
  type ManagedLiveState,
} from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";

const fmt = (raw: bigint, decimals: number) => Number(formatUnits(raw, decimals)).toLocaleString(undefined, { maximumSignificantDigits: 7 });

function parseAmount(value: string, decimals: number) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) throw new Error("Enter a valid amount");
  const raw = parseUnits(value, decimals);
  if (raw <= 0n) throw new Error("Enter an amount above zero");
  return raw;
}

export function ManagedVaultActions({ pin, onState }: { pin: VaultPin; onState?: (s: ManagedLiveState | null) => void }) {
  const entry = pin.preview;
  const { address: owner, ready, connect, walletClient, chainId, switchChain } = useWallet();
  const [state, setState] = useState<ManagedLiveState | null>(null);
  const [usdgBalance, setUsdgBalance] = useState<bigint | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("100");
  const [toUsdg, setToUsdg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Processing…");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex | null>(null);
  const [quoteShares, setQuoteShares] = useState<{ amount: string; shares: bigint; expires: number } | null>(null);
  const [received, setReceived] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await readManagedState(entry, owner);
      setState(s);
      onState?.(s);
    } catch {
      /* keep last */
    }
    if (owner) {
      try {
        setUsdgBalance(await publicClient().readContract({ address: entry.asset as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }));
      } catch {}
    } else setUsdgBalance(null);
  }, [entry, owner, onState]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [refresh]);

  // Live deposit quote while the user types.
  useEffect(() => {
    if (!owner || mode !== "deposit" || busy) return;
    let raw: bigint;
    try {
      raw = parseAmount(amount, 6);
    } catch {
      setQuoteShares(null);
      return;
    }
    if (usdgBalance !== null && raw > usdgBalance) {
      setQuoteShares(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const q = await buildDepositQuote(entry, owner, raw, false);
        if (alive) setQuoteShares({ amount, shares: q.shares, expires: q.quotedAt + 15_000 });
      } catch {
        if (alive) setQuoteShares(null);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amount, owner, mode, busy, entry, usdgBalance]);

  const ensureNetwork = async () => {
    if (chainId !== robinhoodChain.id) await switchChain();
  };

  async function send(to: Address, data: Hex, label: string) {
    if (!walletClient || !owner) throw new Error("Connect your wallet");
    const client = publicClient();
    setProgress(`Preparing ${label}…`);
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    setStatus(`Confirm ${label} in your wallet.`);
    setProgress(label === "approval" ? "Approve tokens in wallet" : label === "deposit" ? "Confirm deposit in wallet" : "Confirm withdrawal in wallet");
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 120n) / 100n });
    setHash(tx);
    setStatus("Waiting for confirmation…");
    setProgress(label === "approval" ? "Approving tokens…" : label === "deposit" ? "Depositing…" : "Withdrawing…");
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error("Transaction reverted; no change was completed.");
    setStatus(`${label} confirmed.`);
    return receipt;
  }

  async function ensureAllowance(token: Address, spender: Address, needed: bigint) {
    if (!owner) return;
    const current = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
    if (current >= needed) return;
    if (current > 0n) await send(token, encodeApprove(spender, 0n), "reset approval");
    await send(token, encodeApprove(spender, needed), "approval");
  }

  async function run(action: "deposit" | "withdraw") {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setHash(null);
    setReceived(null);
    setStatus("Checking your wallet and vault…");
    try {
      await ensureNetwork();
      if (action === "deposit") {
        const raw = parseAmount(amount, 6);
        setStatus("Checking the deposit…");
        await ensureAllowance(entry.asset as Address, entry.router as Address, raw);
        setProgress("Preparing deposit…");
        const quote = await buildDepositQuote(entry, owner, raw, true);
        setQuoteShares({ amount, shares: quote.shares, expires: quote.expires });
        if (Date.now() > quote.expires - 15_000) throw new Error("Quote expired. Please try again.");
        const receipt = await send(entry.router as Address, encodeDeposit(quote.entry), "deposit");
        let minted = 0n;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== entry.vault.toLowerCase()) continue;
          try {
            const ev = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
            if (ev.args.from === "0x0000000000000000000000000000000000000000" && ev.args.to.toLowerCase() === owner.toLowerCase()) minted += ev.args.value;
          } catch {}
        }
        if (minted > 0n) setReceived(minted);
        setAmount("");
      } else {
        if (!state) throw new Error("Vault state is still loading");
        if (!/^\d+(?:\.\d{1,2})?$/.test(percent)) throw new Error("Enter a percentage from 0.01 to 100");
        const bps = parseUnits(percent, 2);
        if (bps <= 0n || bps > 10_000n) throw new Error("Enter a percentage from 0.01 to 100");
        const shares = (state.balance * bps) / 10_000n;
        if (shares === 0n) throw new Error("No shares selected");
        if (toUsdg) await ensureAllowance(entry.vault as Address, entry.router as Address, shares);
        setStatus("Checking your withdrawal…");
        setProgress("Preparing withdrawal…");
        const quote = await buildWithdrawQuote(entry, owner, shares, toUsdg);
        if (Date.now() > quote.expires - 15_000) throw new Error("Quote expired. Please try again.");
        await send(quote.kind === "tokens" ? (entry.vault as Address) : (entry.router as Address), encodeWithdraw(quote), quote.kind === "tokens" ? "token withdrawal" : "USDG withdrawal");
      }
      setStatus("Transaction confirmed. Updating your position…");
      setProgress("Updating balance…");
      window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      await refresh();
      setStatus("Transaction complete. Your position is updated.");
    } catch (e) {
      setStatus("");
      setError(describeTxError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const deposit = depositStatusOf(state);
  const shares = state?.balance ?? null;
  const positionValue = state && state.value !== null && state.supply > 0n ? Number(formatUnits((state.value * state.balance) / state.supply, 6)) : null;
  const liveQuote = quoteShares && quoteShares.amount === amount && quoteShares.expires > now ? quoteShares.shares : null;
  const submitLabel = (
    <>
      <span className="managed-progress-spinner" aria-hidden="true" />
      {progress}
    </>
  );

  return (
    <div className="wallet-portfolio wallet-portfolio-compact">
      <section className="wallet-vault-actions managed-vault-actions">
        {owner && shares !== null && shares !== 0n ? (
          <div className="earn-account-summary">
            <p className="eyebrow">Your vault position</p>
            <strong>
              {positionValue === null ? "–" : positionValue.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
              <small>USDG</small>
            </strong>
            <div className="earn-account-summary-meta">
              <span>{fmt(shares, 18)} shares</span>
              <Link href="/portfolio">Portfolio ↗</Link>
            </div>
          </div>
        ) : (
          <div className="single-vault-wallet-intro">
            <h2>Make your first deposit</h2>
            <p>{owner ? "You don’t have a position in this vault yet." : "Connect your wallet to deposit or view your position."}</p>
          </div>
        )}
        <div className="tabs vault-action-tabs" role="tablist" aria-label="Vault action">
          <button type="button" role="tab" disabled={busy} aria-selected={mode === "deposit"} aria-pressed={mode === "deposit"} className={mode === "deposit" ? "active" : ""} onClick={() => setMode("deposit")}>
            Deposit
          </button>
          <button type="button" role="tab" disabled={busy} aria-selected={mode === "withdraw"} aria-pressed={mode === "withdraw"} className={mode === "withdraw" ? "active" : ""} onClick={() => setMode("withdraw")}>
            Withdraw
          </button>
        </div>
        {mode === "deposit" ? (
          <>
            <label className="amount-box amount-box-input" htmlFor="managed-amount">
              <div className="amount-box-top">
                <span>You deposit</span>
                <span>
                  Balance <b className="mono">{usdgBalance === null ? "–" : fmt(usdgBalance, 6)}</b> ·{" "}
                  <button type="button" className="max-link" disabled={usdgBalance === null || busy} onClick={() => usdgBalance !== null && setAmount(formatUnits(usdgBalance, 6))}>
                    Max
                  </button>
                </span>
              </div>
              <div className="wallet-amount-main">
                <input id="managed-amount" inputMode="decimal" disabled={busy} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span>USDG</span>
              </div>
            </label>
            <div className="wallet-quote-row" aria-live="polite">
              <span>{received !== null && !amount ? "You received" : "You receive"}</span>
              <strong
                className="mono"
                title={received !== null && !amount ? "Confirmed shares from your transaction" : liveQuote !== null ? "Estimated shares from your deposit quote" : "The share amount appears once your deposit quote is ready"}
              >
                {received !== null && !amount ? fmt(received, 18) : liveQuote !== null ? `≈ ${fmt(liveQuote, 18)}` : "–"} vault shares
              </strong>
            </div>
            {deposit.blocked ? <p className="wallet-guard-note">Deposits are currently unavailable for this vault.</p> : null}
            {owner ? (
              <button className="btn btn-primary managed-submit" disabled={busy || deposit.blocked} aria-busy={busy} aria-live="polite" onClick={() => void run("deposit")}>
                {busy ? submitLabel : deposit.blocked ? "Deposits paused" : "Deposit"}
              </button>
            ) : (
              <button className="btn btn-primary managed-submit" disabled={!ready} onClick={() => void connect()}>
                Connect wallet
              </button>
            )}
          </>
        ) : (
          <>
            <label htmlFor="managed-percent">Portion to withdraw</label>
            <div className="managed-input">
              <input id="managed-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
              <span>%</span>
            </div>
            <div className="managed-presets">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} onClick={() => setPercent(String(p))}>
                  {p === 100 ? "Max" : `${p}%`}
                </button>
              ))}
            </div>
            {!state?.recovery ? (
              <>
                <label htmlFor="managed-receive">Receive</label>
                <select id="managed-receive" value={toUsdg ? "usdg" : "tokens"} onChange={(e) => setToUsdg(e.target.value === "usdg")}>
                  <option value="tokens">{state?.symbols.join(" + ") ?? "Pool tokens"}</option>
                  <option value="usdg">USDG · includes a swap</option>
                </select>
                <p>{toUsdg ? "Converted in your transaction when a safe quote is available." : "Your share of both tokens, directly to your wallet."}</p>
              </>
            ) : null}
            {owner ? (
              <button className="btn btn-primary managed-submit" disabled={busy || !state?.balance || state.cases.every(Boolean)} aria-busy={busy} aria-live="polite" onClick={() => void run("withdraw")}>
                {busy ? submitLabel : "Withdraw"}
              </button>
            ) : (
              <button className="btn btn-primary managed-submit" disabled={!ready} onClick={() => void connect()}>
                Connect wallet
              </button>
            )}
          </>
        )}
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
        {mode === "deposit" ? (
          <aside className="managed-refund-note" aria-label="About deposit amounts">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <path d="M12 7.5h.01" />
            </svg>
            <p>
              Only the amount needed for the position is invested. Unused USDG and any leftover stock tokens return to your wallet in the same
              transaction. Your vault value can therefore be lower than the amount entered. For example, $97 invested from a $100 deposit. Refund
              amounts vary; swap fees, price impact and price changes also affect value.
            </p>
          </aside>
        ) : null}
        <details>
          <summary>How it works</summary>
          <p>Your deposit adds liquidity in your transaction. Withdrawals remove your share in your transaction. The keeper manages the range. Prices and fees can change; returns are not guaranteed.</p>
        </details>
      </section>
    </div>
  );
}
