"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { erc20Abi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { buildDepositQuote, buildWithdrawQuote, depositStatusOf, encodeApprove, encodeDeposit, encodeWithdraw, readManagedState, type ManagedLiveState } from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";
import { txErrorMessage } from "./txError";

const fmt = (raw: bigint, decimals: number) => Number(formatUnits(raw, decimals)).toLocaleString(undefined, { maximumSignificantDigits: 7 });

function parseAmount(value: string, decimals: number, t: TFunction) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) throw new Error(t("error.invalidAmount"));
  const raw = parseUnits(value, decimals);
  if (raw <= 0n) throw new Error(t("error.aboveZero"));
  return raw;
}

type TxKind = "resetApproval" | "approval" | "deposit" | "tokenWithdrawal" | "usdgWithdrawal";

export function ManagedVaultActions({ pin, onState }: { pin: VaultPin; onState?: (s: ManagedLiveState | null) => void }) {
  const t = useT("vaults");
  const entry = pin.preview;
  const { address: owner, ready, connect, walletClient, chainId, switchChain } = useWallet();
  const [state, setState] = useState<ManagedLiveState | null>(null);
  const [usdgBalance, setUsdgBalance] = useState<bigint | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("100");
  const [toUsdg, setToUsdg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(() => t("tx.processing"));
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [refresh]);

  // Live deposit quote while the user types.
  useEffect(() => {
    if (!owner || mode !== "deposit" || busy) return;
    let raw: bigint;
    try {
      raw = parseAmount(amount, 6, t);
    } catch {
      setQuoteShares(null);
      return;
    }
    if (usdgBalance !== null && raw > usdgBalance) {
      setQuoteShares(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const q = await buildDepositQuote(entry, owner, raw, false);
        if (alive) setQuoteShares({ amount, shares: q.shares, expires: q.quotedAt + 15_000 });
      } catch {
        if (alive) setQuoteShares(null);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [amount, owner, mode, busy, entry, usdgBalance, t]);

  const ensureNetwork = async () => {
    if (chainId !== robinhoodChain.id) await switchChain();
  };

  async function send(to: Address, data: Hex, kind: TxKind) {
    if (!walletClient || !owner) throw new Error(t("error.connect"));
    const label = t(`tx.label.${kind}`);
    const client = publicClient();
    setProgress(t("tx.preparing", { label }));
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    setStatus(t("tx.confirmInWallet", { label }));
    setProgress(kind === "approval" ? t("tx.approveInWallet") : kind === "deposit" ? t("tx.confirmDeposit") : t("tx.confirmWithdraw"));
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 120n) / 100n });
    setHash(tx);
    setStatus(t("tx.waiting"));
    setProgress(kind === "approval" ? t("tx.approving") : kind === "deposit" ? t("tx.depositing") : t("tx.withdrawing"));
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(t("error.reverted"));
    setStatus(t("tx.confirmed", { label }));
    return receipt;
  }

  async function ensureAllowance(token: Address, spender: Address, needed: bigint) {
    if (!owner) return;
    const current = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
    if (current >= needed) return;
    if (current > 0n) await send(token, encodeApprove(spender, 0n), "resetApproval");
    await send(token, encodeApprove(spender, needed), "approval");
  }

  async function run(action: "deposit" | "withdraw") {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setHash(null);
    setReceived(null);
    setStatus(t("tx.checkingWallet"));
    try {
      await ensureNetwork();
      if (action === "deposit") {
        const raw = parseAmount(amount, 6, t);
        setStatus(t("tx.checkingDeposit"));
        await ensureAllowance(entry.asset as Address, entry.router as Address, raw);
        setProgress(t("tx.preparingDeposit"));
        const quote = await buildDepositQuote(entry, owner, raw, true);
        setQuoteShares({ amount, shares: quote.shares, expires: quote.expires });
        if (Date.now() > quote.expires - 15_000) throw new Error(t("error.quoteExpired"));
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
        if (!state) throw new Error(t("error.stateLoading"));
        if (!/^\d+(?:\.\d{1,2})?$/.test(percent)) throw new Error(t("error.percentRange"));
        const bps = parseUnits(percent, 2);
        if (bps <= 0n || bps > 10_000n) throw new Error(t("error.percentRange"));
        const shares = (state.balance * bps) / 10_000n;
        if (shares === 0n) throw new Error(t("error.noShares"));
        if (toUsdg) await ensureAllowance(entry.vault as Address, entry.router as Address, shares);
        setStatus(t("tx.checkingWithdrawal"));
        setProgress(t("tx.preparingWithdrawal"));
        const quote = await buildWithdrawQuote(entry, owner, shares, toUsdg);
        if (Date.now() > quote.expires - 15_000) throw new Error(t("error.quoteExpired"));
        await send(quote.kind === "tokens" ? (entry.vault as Address) : (entry.router as Address), encodeWithdraw(quote), quote.kind === "tokens" ? "tokenWithdrawal" : "usdgWithdrawal");
      }
      setStatus(t("tx.confirmedUpdating"));
      setProgress(t("tx.updatingBalance"));
      window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      await refresh();
      setStatus(t("tx.complete"));
    } catch (e) {
      setStatus("");
      setError(txErrorMessage(e, t));
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
            <p className="eyebrow">{t("actions.positionEyebrow")}</p>
            <strong>
              {positionValue === null ? "–" : positionValue.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
              <small>USDG</small>
            </strong>
            <div className="earn-account-summary-meta">
              <span>{t("actions.shares", { n: fmt(shares, 18) })}</span>
              <Link href="/portfolio">{t("actions.portfolio")}</Link>
            </div>
          </div>
        ) : (
          <div className="single-vault-wallet-intro">
            <h2>{t("actions.firstDeposit")}</h2>
            <p>{owner ? t("actions.noPosition") : t("actions.connectIntro")}</p>
          </div>
        )}
        <div className="tabs vault-action-tabs" role="tablist" aria-label={t("actions.tabsAria")}>
          <button type="button" role="tab" disabled={busy} aria-selected={mode === "deposit"} aria-pressed={mode === "deposit"} className={mode === "deposit" ? "active" : ""} onClick={() => setMode("deposit")}>
            {t("actions.deposit")}
          </button>
          <button type="button" role="tab" disabled={busy} aria-selected={mode === "withdraw"} aria-pressed={mode === "withdraw"} className={mode === "withdraw" ? "active" : ""} onClick={() => setMode("withdraw")}>
            {t("actions.withdraw")}
          </button>
        </div>
        {mode === "deposit" ? (
          <>
            <label className="amount-box amount-box-input" htmlFor="managed-amount">
              <div className="amount-box-top">
                <span>{t("actions.youDeposit")}</span>
                <span>
                  {t("actions.balance")} <b className="mono">{usdgBalance === null ? "–" : fmt(usdgBalance, 6)}</b> ·{" "}
                  <button type="button" className="max-link" disabled={usdgBalance === null || busy} onClick={() => usdgBalance !== null && setAmount(formatUnits(usdgBalance, 6))}>
                    {t("actions.max")}
                  </button>
                </span>
              </div>
              <div className="wallet-amount-main">
                <input id="managed-amount" inputMode="decimal" disabled={busy} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span>USDG</span>
              </div>
            </label>
            <div className="wallet-quote-row" aria-live="polite">
              <span>{received !== null && !amount ? t("actions.youReceived") : t("actions.youReceive")}</span>
              <strong className="mono" title={received !== null && !amount ? t("actions.titleConfirmed") : liveQuote !== null ? t("actions.titleEstimated") : t("actions.titlePending")}>
                {t("actions.vaultSharesValue", { value: received !== null && !amount ? fmt(received, 18) : liveQuote !== null ? `≈ ${fmt(liveQuote, 18)}` : "–" })}
              </strong>
            </div>
            {deposit.blocked ? <p className="wallet-guard-note">{t("actions.depositsUnavailable")}</p> : null}
            {owner ? (
              <button className="btn btn-primary managed-submit" disabled={busy || deposit.blocked} aria-busy={busy} aria-live="polite" onClick={() => void run("deposit")}>
                {busy ? submitLabel : deposit.blocked ? t("actions.depositsPaused") : t("actions.deposit")}
              </button>
            ) : (
              <button className="btn btn-primary managed-submit" disabled={!ready} onClick={() => void connect()}>
                {t("actions.connect")}
              </button>
            )}
          </>
        ) : (
          <>
            <label htmlFor="managed-percent">{t("actions.portion")}</label>
            <div className="managed-input">
              <input id="managed-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
              <span>%</span>
            </div>
            <div className="managed-presets">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} onClick={() => setPercent(String(p))}>
                  {p === 100 ? t("actions.max") : `${p}%`}
                </button>
              ))}
            </div>
            {!state?.recovery ? (
              <>
                <label htmlFor="managed-receive">{t("actions.receive")}</label>
                <select id="managed-receive" value={toUsdg ? "usdg" : "tokens"} onChange={(e) => setToUsdg(e.target.value === "usdg")}>
                  <option value="tokens">{state?.symbols.join(" + ") ?? t("actions.poolTokens")}</option>
                  <option value="usdg">{t("actions.usdgSwap")}</option>
                </select>
                <p>{toUsdg ? t("actions.convertedNote") : t("actions.tokensNote")}</p>
              </>
            ) : null}
            {owner ? (
              <button className="btn btn-primary managed-submit" disabled={busy || !state?.balance || state.cases.every(Boolean)} aria-busy={busy} aria-live="polite" onClick={() => void run("withdraw")}>
                {busy ? submitLabel : t("actions.withdraw")}
              </button>
            ) : (
              <button className="btn btn-primary managed-submit" disabled={!ready} onClick={() => void connect()}>
                {t("actions.connect")}
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
                {t("actions.viewTx")}
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
          <aside className="managed-refund-note" aria-label={t("actions.refundAria")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <path d="M12 7.5h.01" />
            </svg>
            <p>{t("actions.refundNote")}</p>
          </aside>
        ) : null}
        <details>
          <summary>{t("actions.how")}</summary>
          <p>{t("actions.howBody")}</p>
        </details>
      </section>
    </div>
  );
}
