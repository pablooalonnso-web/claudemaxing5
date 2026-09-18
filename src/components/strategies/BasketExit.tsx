"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeAbiParameters, formatUnits, keccak256, pad, toHex, type Address, type Hex, type PublicClient } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, RefreshCw } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { txErrorMessage } from "@/components/vaults/txError";
import { useT } from "@/i18n/client";
import { erc20Abi, managedVaultAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { buildWithdrawQuote, encodeApprove, encodeWithdraw, type WithdrawQuote } from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";

type Position = { pin: VaultPin; shares: bigint; value: number | null };
type LegStatus = "pending" | "approving" | "withdrawing" | "done" | "failed" | "skipped";
type Leg = { pin: VaultPin; shares: bigint; status: LegStatus; hash?: Hex; error?: string; received?: string };

/**
 * Share allowances live in mapping slot 1 on the vault. For the preview quote the
 * router's redemption is simulated as if the allowance were already granted, so
 * the user sees what comes back before signing anything.
 */
function previewClient(vault: Address, router: Address, owner: Address): PublicClient {
  const client = publicClient();
  const inner = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(1), { size: 32 })]));
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [router, inner]));
  const stateOverride = [{ address: vault, stateDiff: [{ slot, value: ("0x" + "f".repeat(64)) as Hex }] }];
  return { ...client, simulateContract: (args: Parameters<PublicClient["simulateContract"]>[0]) => client.simulateContract({ ...args, stateOverride } as never) } as PublicClient;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const PERCENTS = [25, 50, 100] as const;

export function BasketExit() {
  const t = useT("strategies");
  const { rows, singles } = useProtocolVaults();
  const { address: owner, connect, available, walletClient, chainId, switchChain } = useWallet();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState<(typeof PERCENTS)[number]>(100);
  const [toUsdg, setToUsdg] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!owner || !rows) {
      setPositions(null);
      return;
    }
    const client = publicClient();
    const list = await Promise.all(
      singles.map(async (pin) => {
        const shares = await client.readContract({ address: pin.vault as Address, abi: managedVaultAbi, functionName: "balanceOf", args: [owner] }).catch(() => 0n);
        const row = rows.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
        const supply = row?.snapshot?.extras?.totalSupply ? BigInt(row.snapshot.extras.totalSupply) : null;
        const assets = row?.snapshot?.assets ? BigInt(row.snapshot.assets) : null;
        const value = shares > 0n && supply && supply > 0n && assets !== null ? Number(formatUnits((assets * shares) / supply, 6)) : shares > 0n ? null : 0;
        return { pin, shares, value };
      }),
    );
    setPositions(list.filter((p) => p.shares > 0n));
  }, [owner, rows, singles]);
  useEffect(() => {
    void refresh();
    window.addEventListener(BRAND.vaultUpdatedEvent, refresh);
    return () => window.removeEventListener(BRAND.vaultUpdatedEvent, refresh);
  }, [refresh]);

  const plan = useMemo(() => (positions ?? []).filter((p) => selected.has(p.pin.vault)).map((p) => ({ pin: p.pin, shares: (p.shares * BigInt(percent)) / 100n, value: p.value === null ? null : (p.value * percent) / 100 })), [positions, selected, percent]);

  // Quote every selected leg the way the vault page does, so the user sees what comes back before signing.
  useEffect(() => {
    if (!owner || legs || plan.length === 0) {
      setQuotes({});
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const out: Record<string, { ok: boolean; text: string }> = {};
      for (const leg of plan) {
        try {
          const q = await buildWithdrawQuote(leg.pin.preview, owner, leg.shares, toUsdg, previewClient(leg.pin.preview.vault as Address, leg.pin.preview.router as Address, owner));
          out[leg.pin.vault] = { ok: true, text: describeQuote(q, leg.pin) };
        } catch (e) {
          out[leg.pin.vault] = { ok: false, text: e instanceof Error ? e.message : t("exit.noQuote") };
        }
        if (alive) setQuotes({ ...out });
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, toUsdg, legs, plan.map((p) => `${p.pin.vault}:${p.shares}`).join(",")]);

  function describeQuote(q: WithdrawQuote, pin: VaultPin) {
    if (q.kind === "usdg") return t("exit.usdgQuote", { n: Number(formatUnits(q.amount, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 }) });
    const stockIsToken0 = pin.preview.asset.toLowerCase() !== pin.preview.token0.toLowerCase();
    const stock = stockIsToken0 ? q.amounts[0] : q.amounts[1];
    const usdg = stockIsToken0 ? q.amounts[1] : q.amounts[0];
    return t("exit.tokensQuote", { stock: Number(formatUnits(stock, 18)).toLocaleString("en-US", { maximumSignificantDigits: 4 }), symbol: pin.symbol, usdg: Number(formatUnits(usdg, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 }) });
  }

  async function send(to: Address, data: Hex) {
    if (!walletClient || !owner) throw new Error(t("error.connect"));
    const client = publicClient();
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 120n) / 100n });
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(t("error.reverted"));
    return tx;
  }
  const update = (i: number, patch: Partial<Leg>) => setLegs((ls) => (ls ? ls.map((l, j) => (j === i ? { ...l, ...patch } : l)) : ls));

  async function runFrom(startLegs: Leg[], from: number) {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const client = publicClient();
      for (let i = from; i < startLegs.length; i++) {
        const leg = startLegs[i];
        if (leg.status === "done") continue;
        const entry = leg.pin.preview;
        try {
          if (toUsdg) {
            const allowance = await client.readContract({ address: entry.vault as Address, abi: erc20Abi, functionName: "allowance", args: [owner, entry.router as Address] });
            if (allowance < leg.shares) {
              update(i, { status: "approving" });
              setNote(t("exit.approveNote", { symbol: leg.pin.symbol }));
              await send(entry.vault as Address, encodeApprove(entry.router as Address, leg.shares));
            }
          }
          update(i, { status: "withdrawing" });
          setNote(t("exit.buildingNote", { symbol: leg.pin.symbol }));
          const quote = await buildWithdrawQuote(entry, owner, leg.shares, toUsdg);
          if (Date.now() > quote.expires - 15_000) throw new Error(t("error.quoteExpiredLeg"));
          setNote(t("exit.confirmNote", { symbol: leg.pin.symbol }));
          const hash = await send(quote.kind === "tokens" ? (entry.vault as Address) : (entry.router as Address), encodeWithdraw(quote));
          update(i, { status: "done", hash, received: describeQuote(quote, leg.pin) });
          window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
        } catch (e) {
          update(i, { status: "failed", error: txErrorMessage(e, t) });
          for (let j = i + 1; j < startLegs.length; j++) update(j, { status: "skipped" });
          setNote("");
          setError(t("exit.legFailed", { symbol: leg.pin.symbol }));
          return;
        }
      }
      setNote(t("exit.complete"));
      await refresh();
    } catch (e) {
      setError(txErrorMessage(e, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function start() {
    const initial: Leg[] = plan.map((p) => ({ pin: p.pin, shares: p.shares, status: "pending" }));
    setLegs(initial);
    void runFrom(initial, 0);
  }
  function retry() {
    if (!legs) return;
    const i = legs.findIndex((l) => l.status === "failed");
    if (i < 0) return;
    const reset = legs.map((l, j) => (j >= i ? { ...l, status: "pending" as LegStatus, error: undefined } : l));
    setLegs(reset);
    void runFrom(reset, i);
  }
  function reset() {
    setLegs(null);
    setSelected(new Set());
    setNote("");
    setError("");
  }

  const allQuoted = plan.length > 0 && plan.every((p) => quotes[p.pin.vault]?.ok);
  const totalValue = plan.reduce((a, p) => a + (p.value ?? 0), 0);

  return (
    <section className="basket-panel basket-exit" aria-labelledby="basket-exit-heading">
      <div className="basket-panel-head">
        <div>
          <p className="eyebrow">{t("exit.eyebrow")}</p>
          <h2 id="basket-exit-heading">{t("exit.title")}</h2>
        </div>
        <span className="strategy-status strategy-status-live">
          <i aria-hidden="true" /> {t("plan.live")}
        </span>
      </div>
      {!owner ? (
        <div className="basket-foot">
          <p className="basket-muted">{t("exit.connectIntro")}</p>
          <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
            {available ? t("foot.connect") : t("foot.noWallet")}
          </button>
        </div>
      ) : !positions ? (
        <p className="basket-muted">{t("hints.reading")}</p>
      ) : positions.length === 0 ? (
        <p className="basket-muted">{t("exit.none")}</p>
      ) : (
        <>
          <div className="basket-exit-controls">
            <div className="basket-size" role="radiogroup" aria-label={t("exit.percentAria")}>
              <span>{t("exit.withdraw")}</span>
              {PERCENTS.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={percent === n} className={percent === n ? "active" : ""} disabled={busy || !!legs} onClick={() => setPercent(n)}>
                  {n}%
                </button>
              ))}
            </div>
            <div className="basket-size" role="radiogroup" aria-label={t("exit.receive")}>
              <span>{t("exit.receive")}</span>
              <button type="button" role="radio" aria-checked={toUsdg} className={toUsdg ? "active" : ""} disabled={busy || !!legs} onClick={() => setToUsdg(true)}>
                USDG
              </button>
              <button type="button" role="radio" aria-checked={!toUsdg} className={!toUsdg ? "active" : ""} disabled={busy || !!legs} onClick={() => setToUsdg(false)}>
                {t("exit.tokens")}
              </button>
            </div>
            {!legs ? (
              <button type="button" className="basket-link" disabled={busy} onClick={() => setSelected(selected.size === positions.length ? new Set() : new Set(positions.map((p) => p.pin.vault)))}>
                {selected.size === positions.length ? t("exit.clear") : t("exit.selectAll")}
              </button>
            ) : null}
          </div>
          <ol className="basket-legs" aria-label={t("exit.positionsAria")}>
            {(legs ? legs.map((l) => positions.find((p) => p.pin.vault === l.pin.vault) ?? { pin: l.pin, shares: l.shares, value: null }) : positions).map((p, i) => {
              const leg = legs?.[i];
              const on = legs ? true : selected.has(p.pin.vault);
              const q = quotes[p.pin.vault];
              return (
                <li key={p.pin.vault} className={`basket-leg${leg ? ` is-${leg.status}` : ""}${!legs && !on ? " is-off" : ""}`}>
                  {!legs ? (
                    <input
                      type="checkbox"
                      className="basket-check"
                      checked={on}
                      disabled={busy}
                      aria-label={t("exit.include", { symbol: p.pin.symbol })}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.pin.vault);
                        else next.delete(p.pin.vault);
                        setSelected(next);
                      }}
                    />
                  ) : (
                    <span className="basket-rank">{String(i + 1).padStart(2, "0")}</span>
                  )}
                  <StockLogo symbol={p.pin.symbol} size={36} />
                  <div className="basket-leg-main">
                    <b>{t("legs.vault", { symbol: p.pin.symbol })}</b>
                    <span>{t("exit.sharesMeta", { n: Number(formatUnits(p.shares, 18)).toLocaleString("en-US", { maximumSignificantDigits: 5 }), value: p.value === null ? t("exit.valuing") : usd(p.value) })}</span>
                  </div>
                  <div className="basket-leg-amount">
                    <b className="mono">{legs ? `${percent}%` : on ? `${percent}%` : "–"}</b>
                    <span className="mono">{leg?.received ?? (on ? (q ? q.text : t("legs.quoting")) : "")}</span>
                  </div>
                  <span className={`basket-leg-status ${leg ? leg.status : "plan"}`}>
                    {!leg ? (
                      <Link href={p.pin.href}>
                        {t("legs.vaultLink")} <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    ) : leg.status === "done" ? (
                      <a href={leg.hash ? explorerTx(leg.hash) : "#"} target="_blank" rel="noopener noreferrer">
                        <Check size={13} aria-hidden="true" /> {t("exit.withdrawn")}
                      </a>
                    ) : leg.status === "failed" ? (
                      <>
                        <CircleAlert size={13} aria-hidden="true" /> {t("legs.failed")}
                      </>
                    ) : leg.status === "approving" ? (
                      t("legs.approving")
                    ) : leg.status === "withdrawing" ? (
                      t("exit.withdrawing")
                    ) : leg.status === "skipped" ? (
                      t("legs.waiting")
                    ) : (
                      t("legs.queued")
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="basket-foot">
            <div className="basket-foot-copy" aria-live="polite">
              {error ? (
                <p className="basket-error">{error}</p>
              ) : note ? (
                <p>{note}</p>
              ) : plan.length === 0 ? (
                <p>{t("exit.pick")}</p>
              ) : plan.some((p) => quotes[p.pin.vault] && !quotes[p.pin.vault].ok) ? (
                <p>{plan.filter((p) => quotes[p.pin.vault] && !quotes[p.pin.vault].ok).map((p) => `${p.pin.symbol}: ${quotes[p.pin.vault].text}`).join(" · ")}</p>
              ) : (
                <p>
                  {t("exit.summary", {
                    percent,
                    positions: t(plan.length === 1 ? "exit.positionsOne" : "exit.positionsMany", { n: plan.length }),
                    value: usd(totalValue),
                    target: toUsdg ? t("exit.toUsdg") : t("exit.toTokens"),
                    steps: `${toUsdg ? t(plan.length === 1 ? "exit.approvalsOne" : "exit.approvalsMany", { n: plan.length }) : ""}${t(plan.length === 1 ? "exit.withdrawalsOne" : "exit.withdrawalsMany", { n: plan.length })}`,
                  })}
                </p>
              )}
            </div>
            {legs && legs.some((l) => l.status === "failed") ? (
              <button type="button" className="hex hex-green" onClick={retry} disabled={busy}>
                <RefreshCw size={14} aria-hidden="true" /> {t("foot.retry")}
              </button>
            ) : legs && legs.every((l) => l.status === "done") ? (
              <button type="button" className="hex hex-green" onClick={reset}>
                {t("exit.done")} <Check size={14} aria-hidden="true" />
              </button>
            ) : legs ? (
              <button type="button" className="hex hex-green" disabled>
                <span className="managed-progress-spinner" aria-hidden="true" /> {t("foot.signing")}
              </button>
            ) : (
              <button type="button" className="hex hex-green" onClick={start} disabled={!allQuoted || busy}>
                {t("exit.exitSelected")} <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
