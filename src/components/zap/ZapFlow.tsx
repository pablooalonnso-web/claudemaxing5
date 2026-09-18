"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, encodeAbiParameters, formatUnits, keccak256, pad, parseUnits, toHex, type Address, type Hex, type PublicClient } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, RefreshCw } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { txErrorMessage } from "@/components/vaults/txError";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { erc20Abi } from "@/lib/abis";
import { BASKET_TVL_FLOOR, rankVaults } from "@/lib/basket";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain, USDG_ADDRESS } from "@/lib/chain";
import { formatPercent } from "@/lib/format";
import { buildDepositQuote, encodeApprove, encodeDeposit } from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";
import { TRADE_TOKENS, type TradeToken, type TradeQuote } from "@/lib/trade-tokens";

type StepId = "approveIn" | "swap" | "approveUsdg" | "deposit";
type StepStatus = "pending" | "active" | "done" | "failed" | "skipped";
type Step = { id: StepId; label: string; status: StepStatus; hash?: Hex; error?: string };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const amt = (raw: bigint, dec: number, sig = 6) => Number(formatUnits(raw, dec)).toLocaleString("en-US", { maximumSignificantDigits: sig });
const SOURCES = TRADE_TOKENS.filter((t) => t.symbol !== BRAND.token);
const MIN_USDG = parseUnits("10", 6);

function parseAmount(v: string, decimals: number, t: TFunction) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v) || (v.split(".")[1]?.length ?? 0) > decimals) throw new Error(t("error.invalidAmount"));
  const raw = parseUnits(v, decimals);
  if (raw <= 0n) throw new Error(t("error.aboveZero"));
  return raw;
}

/** For the preview the router deposit is quoted as if the swapped USDG were already in the wallet (balance override, slot 1 on USDG). */
function previewClient(owner: Address, usdg: bigint): PublicClient {
  const client = publicClient();
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(1), { size: 32 })]));
  const stateOverride = [{ address: USDG_ADDRESS, stateDiff: [{ slot, value: pad(toHex(usdg), { size: 32 }) }] }];
  return { ...client, readContract: (a: Parameters<PublicClient["readContract"]>[0]) => client.readContract((a.address ?? "").toLowerCase() === USDG_ADDRESS.toLowerCase() ? ({ ...a, stateOverride } as never) : (a as never)) } as PublicClient;
}

export function ZapFlow() {
  const t = useT("zap");
  const { rows, singles } = useProtocolVaults();
  const { address: owner, connect, available, walletClient, chainId, switchChain } = useWallet();
  const [source, setSource] = useState<TradeToken>(SOURCES[0]);
  const [amount, setAmount] = useState("");
  const [vaultId, setVaultId] = useState<string>("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [swapQuote, setSwapQuote] = useState<{ usdgOut: bigint; quote: TradeQuote } | null | "none">(null);
  const [shares, setShares] = useState<bigint | null | "none">(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [received, setReceived] = useState<bigint | null>(null);
  const busyRef = useRef(false);

  const ranking = useMemo(() => (rows ? rankVaults(rows, singles) : []), [rows, singles]);
  const vaults: VaultPin[] = useMemo(() => {
    const ranked = ranking.map((r) => r.pin);
    const rest = singles.filter((p) => !ranked.some((r) => r.vault === p.vault));
    return [...ranked, ...rest];
  }, [ranking, singles]);
  const vault = vaults.find((v) => v.id === vaultId) ?? vaults[0];
  const isUsdg = source.address.toLowerCase() === USDG_ADDRESS.toLowerCase();

  // Source balance.
  useEffect(() => {
    if (!owner) return void setBalance(null);
    const client = publicClient();
    (source.native ? client.getBalance({ address: owner }) : client.readContract({ address: source.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }))
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [owner, source, steps]);

  // Step 1 of the preview: how much USDG the swap returns.
  let raw: bigint | null = null;
  try {
    raw = parseAmount(amount, source.decimals, t);
  } catch {}
  useEffect(() => {
    if (!raw || steps) return void setSwapQuote(null);
    if (isUsdg) return void setSwapQuote({ usdgOut: raw, quote: { providerId: "none", providerName: "", amountOutRaw: raw.toString(), netAmountOutRaw: raw.toString(), gasEstimate: "0", executable: true } });
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trade/quotes?${new URLSearchParams({ tokenIn: source.address, tokenOut: USDG_ADDRESS, amountIn: raw!.toString() })}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: { quotes: TradeQuote[] } };
        const q = json.data?.quotes.find((x) => x.executable);
        if (alive) setSwapQuote(q ? { usdgOut: BigInt(q.netAmountOutRaw), quote: q } : "none");
      } catch {
        if (alive) setSwapQuote("none");
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw?.toString(), source.address, isUsdg, steps]);

  // Step 2 of the preview: the router deposit with that USDG.
  useEffect(() => {
    if (!owner || !vault || !swapQuote || swapQuote === "none" || steps) return void setShares(null);
    if (swapQuote.usdgOut < MIN_USDG) return void setShares("none");
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const q = await buildDepositQuote(vault.preview, owner, swapQuote.usdgOut, false, previewClient(owner, swapQuote.usdgOut * 2n));
        if (alive) setShares(q.shares);
      } catch {
        if (alive) setShares("none");
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, vault?.vault, swapQuote === "none" ? "none" : swapQuote?.usdgOut.toString(), steps]);

  async function send(to: Address, data: Hex, value = 0n) {
    if (!walletClient || !owner) throw new Error(t("error.connect"));
    const client = publicClient();
    await client.call({ account: owner, to, data, value });
    const gas = await client.estimateGas({ account: owner, to, data, value });
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value, gas: (gas * 125n + 99n) / 100n });
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(t("error.reverted"));
    return { tx, receipt };
  }
  const setStep = (id: StepId, patch: Partial<Step>) => setSteps((s) => (s ? s.map((x) => (x.id === id ? { ...x, ...patch } : x)) : s));

  async function run(from: StepId) {
    if (!owner || !vault || !raw || !swapQuote || swapQuote === "none" || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const order: StepId[] = ["approveIn", "swap", "approveUsdg", "deposit"];
    let usdgBudget = swapQuote.usdgOut;
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const client = publicClient();
      for (const id of order.slice(order.indexOf(from))) {
        try {
          if (id === "approveIn") {
            if (isUsdg || source.native) {
              setStep(id, { status: "skipped" });
              continue;
            }
            setStep(id, { status: "active" });
            setNote(t("note.approveIn", { symbol: source.symbol }));
            const res = await fetch("/api/trade/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: swapQuote.quote.routeSummary, sender: owner, recipient: owner, slippageBps: 50 }) });
            const json = (await res.json()) as { data?: { routerAddress: Address } };
            if (!res.ok || !json.data) throw new Error(t("error.swapPrepare"));
            const allowance = await client.readContract({ address: source.address as Address, abi: erc20Abi, functionName: "allowance", args: [owner, json.data.routerAddress] });
            if (allowance < raw) await send(source.address as Address, encodeApprove(json.data.routerAddress, raw));
            setStep(id, { status: "done" });
          } else if (id === "swap") {
            if (isUsdg) {
              setStep(id, { status: "skipped" });
              continue;
            }
            setStep(id, { status: "active" });
            setNote(t("note.buildingSwap"));
            const res = await fetch("/api/trade/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: swapQuote.quote.routeSummary, sender: owner, recipient: owner, slippageBps: 50 }) });
            const json = (await res.json()) as { data?: { data: Hex; routerAddress: Address; amountOut: string }; error?: string };
            if (!res.ok || !json.data) throw new Error(json.error || t("error.swapPrepare"));
            setNote(t("note.confirmSwap", { symbol: source.symbol }));
            const { tx, receipt } = await send(json.data.routerAddress, json.data.data, source.native ? raw : 0n);
            let got = 0n;
            for (const log of receipt.logs) {
              if (log.address.toLowerCase() !== USDG_ADDRESS.toLowerCase()) continue;
              try {
                const ev = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
                if (ev.args.to.toLowerCase() === owner.toLowerCase()) got += ev.args.value;
              } catch {}
            }
            usdgBudget = got > 0n ? got : BigInt(json.data.amountOut);
            setStep(id, { status: "done", hash: tx });
          } else if (id === "approveUsdg") {
            setStep(id, { status: "active" });
            const allowance = await client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [owner, vault.preview.router as Address] });
            if (allowance < usdgBudget) {
              setNote(t("note.approveUsdg", { amount: amt(usdgBudget, 6), vault: vault.symbol }));
              if (allowance > 0n) await send(USDG_ADDRESS, encodeApprove(vault.preview.router as Address, 0n));
              await send(USDG_ADDRESS, encodeApprove(vault.preview.router as Address, usdgBudget));
            }
            setStep(id, { status: "done" });
          } else {
            setStep(id, { status: "active" });
            setNote(t("note.buildingDeposit", { vault: vault.symbol }));
            const bal = await client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
            const budget = usdgBudget > bal ? bal : usdgBudget;
            const quote = await buildDepositQuote(vault.preview, owner, budget, true);
            if (Date.now() > quote.expires - 15_000) throw new Error(t("error.quoteExpired"));
            setNote(t("note.confirmDeposit"));
            const { tx } = await send(vault.preview.router as Address, encodeDeposit(quote.entry));
            setStep(id, { status: "done", hash: tx });
            setReceived(quote.shares);
            window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
          }
        } catch (e) {
          setStep(id, { status: "failed", error: txErrorMessage(e, t) });
          for (const rest of order.slice(order.indexOf(id) + 1)) setStep(rest, { status: "pending" });
          setNote("");
          setError(t("error.stepFailed", { step: labelOf(id) }));
          return;
        }
      }
      setNote(t("note.done", { symbol: source.symbol, vault: vault.symbol }));
    } catch (e) {
      setError(txErrorMessage(e, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function labelOf(id: StepId) {
    return id === "approveIn" ? t("step.approveIn", { symbol: source.symbol }) : id === "swap" ? t("step.swap", { symbol: source.symbol }) : id === "approveUsdg" ? t("step.approveUsdg") : t("step.deposit", { vault: vault?.symbol ?? t("step.theVault") });
  }
  function start() {
    const ids: StepId[] = ["approveIn", "swap", "approveUsdg", "deposit"];
    setSteps(ids.map((id) => ({ id, label: labelOf(id), status: "pending" })));
    setReceived(null);
    void run("approveIn");
  }
  function retry() {
    const failed = steps?.find((s) => s.status === "failed");
    if (!failed) return;
    setSteps((s) => (s ? s.map((x) => (x.id === failed.id ? { ...x, status: "pending", error: undefined } : x)) : s));
    void run(failed.id);
  }
  function reset() {
    setSteps(null);
    setAmount("");
    setNote("");
    setError("");
    setReceived(null);
  }

  const overBalance = raw !== null && balance !== null && raw > balance;
  const ready = !!owner && !!vault && !!raw && !overBalance && swapQuote !== null && swapQuote !== "none" && typeof shares === "bigint";
  const rank = ranking.find((r) => r.pin.vault === vault?.vault);

  return (
    <div className="basket">
      <section className="basket-panel" aria-labelledby="zap-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("flow.eyebrow")}</p>
            <h2 id="zap-heading">{t("flow.title")}</h2>
          </div>
          <span className="strategy-status strategy-status-live">
            <i aria-hidden="true" /> {t("flow.live")}
          </span>
        </div>
        <div className="zap-grid">
          <label className="amount-box amount-box-input" htmlFor="zap-amount">
            <div className="amount-box-top">
              <span>{t("flow.youPay")}</span>
              <span>
                {t("flow.balance")} <b className="mono">{balance === null ? "–" : amt(balance, source.decimals)}</b>
                {balance !== null && !source.native ? (
                  <>
                    {" "}
                    ·{" "}
                    <button type="button" className="max-link" disabled={busy || !!steps} onClick={() => setAmount(formatUnits(balance, source.decimals))}>
                      {t("flow.max")}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <div className="wallet-amount-main">
              <input id="zap-amount" inputMode="decimal" placeholder="0.00" disabled={busy || !!steps} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select className="zap-select" aria-label={t("flow.sourceAria")} value={source.address} disabled={busy || !!steps} onChange={(e) => setSource(SOURCES.find((t) => t.address === e.target.value) ?? SOURCES[0])}>
                {SOURCES.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="zap-target">
            <span>{t("flow.into")}</span>
            <select className="zap-select zap-select-vault" aria-label={t("flow.vaultAria")} value={vault?.id ?? ""} disabled={busy || !!steps} onChange={(e) => setVaultId(e.target.value)}>
              {vaults.map((v) => {
                const r = ranking.find((x) => x.pin.vault === v.vault);
                return (
                  <option key={v.id} value={v.id}>
                    {r ? t("flow.vaultOptionApr", { symbol: v.symbol, apr: formatPercent(r.apr) }) : t("flow.vaultOption", { symbol: v.symbol })}
                  </option>
                );
              })}
            </select>
            {vault ? (
              <Link href={vault.href} className="zap-vault-link">
                <StockLogo symbol={vault.symbol} size={22} /> {rank ? t("flow.inVault", { tvl: usd(rank.tvl) }) : t("flow.vaultPage")} <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        <ol className="zap-route" aria-label={t("route.aria")}>
          <li>
            <b>{raw ? `${amt(raw, source.decimals)} ${source.symbol}` : `0 ${source.symbol}`}</b>
            <span>{t("route.youPay")}</span>
          </li>
          <li className="zap-arrow" aria-hidden="true">
            <ArrowRight size={16} />
          </li>
          <li>
            <b>{swapQuote === "none" ? t("route.noRoute") : swapQuote ? t("route.usdg", { n: amt(swapQuote.usdgOut, 6) }) : "–"}</b>
            <span>{isUsdg ? t("route.noSwap") : swapQuote && swapQuote !== "none" ? t("route.via", { provider: swapQuote.quote.providerName }) : t("route.aggregator")}</span>
          </li>
          <li className="zap-arrow" aria-hidden="true">
            <ArrowRight size={16} />
          </li>
          <li>
            <b>{received !== null ? t("route.shares", { n: amt(received, 18, 5) }) : shares === "none" ? t("route.cannotQuote") : typeof shares === "bigint" ? t("route.sharesEst", { n: amt(shares, 18, 5) }) : "–"}</b>
            <span>{vault ? t("route.vault", { symbol: vault.symbol }) : t("route.vaultFallback")}</span>
          </li>
        </ol>

        {steps ? (
          <ol className="basket-legs" aria-label={t("steps.aria")}>
            {steps.map((s, i) => (
              <li key={s.id} className={`basket-leg is-${s.status === "active" ? "depositing" : s.status}`}>
                <span className="basket-rank">{String(i + 1).padStart(2, "0")}</span>
                <div className="basket-leg-main" style={{ gridColumn: "2 / 4" }}>
                  <b>{s.label}</b>
                  <span>{s.error ?? (s.status === "skipped" ? t("steps.notNeeded") : "")}</span>
                </div>
                <span className={`basket-leg-status ${s.status}`}>
                  {s.status === "done" ? (
                    s.hash ? (
                      <a href={explorerTx(s.hash)} target="_blank" rel="noopener noreferrer">
                        <Check size={13} aria-hidden="true" /> {t("steps.done")}
                      </a>
                    ) : (
                      <>
                        <Check size={13} aria-hidden="true" /> {t("steps.done")}
                      </>
                    )
                  ) : s.status === "failed" ? (
                    <>
                      <CircleAlert size={13} aria-hidden="true" /> {t("steps.failed")}
                    </>
                  ) : s.status === "active" ? (
                    t("steps.inWallet")
                  ) : s.status === "skipped" ? (
                    t("steps.skipped")
                  ) : (
                    t("steps.queued")
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="basket-foot">
          <div className="basket-foot-copy" aria-live="polite">
            {error ? (
              <p className="basket-error">{error}</p>
            ) : note ? (
              <p>{note}</p>
            ) : overBalance ? (
              <p>{t("foot.overBalance", { symbol: source.symbol })}</p>
            ) : swapQuote === "none" ? (
              <p>{t("foot.noRoute")}</p>
            ) : shares === "none" ? (
              <p>{t("foot.cannotDeposit")}</p>
            ) : ready ? (
              <p>{t("foot.ready", { steps: isUsdg ? t("foot.readyUsdg") : source.native ? t("foot.readyNative") : t("foot.readyToken") })}</p>
            ) : (
              <p>{t("foot.enter", { floor: usd(BASKET_TVL_FLOOR) })}</p>
            )}
          </div>
          {!owner ? (
            <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
              {available ? t("foot.connect") : t("foot.noWallet")}
            </button>
          ) : steps && steps.some((s) => s.status === "failed") ? (
            <button type="button" className="hex hex-green" onClick={retry} disabled={busy}>
              <RefreshCw size={14} aria-hidden="true" /> {t("foot.retry")}
            </button>
          ) : steps && steps.every((s) => s.status === "done" || s.status === "skipped") ? (
            <button type="button" className="hex hex-green" onClick={reset}>
              {t("foot.again")} <Check size={14} aria-hidden="true" />
            </button>
          ) : steps ? (
            <button type="button" className="hex hex-green" disabled>
              <span className="managed-progress-spinner" aria-hidden="true" /> {t("foot.signing")}
            </button>
          ) : (
            <button type="button" className="hex hex-green" onClick={start} disabled={!ready || busy}>
              {t("foot.zapIn")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
