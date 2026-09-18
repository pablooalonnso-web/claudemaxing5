"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeAbiParameters, formatUnits, keccak256, pad, toHex, type Address, type Hex, type PublicClient } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, RefreshCw } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { erc20Abi, managedVaultAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { buildWithdrawQuote, describeTxError, encodeApprove, encodeWithdraw, type WithdrawQuote } from "@/lib/managed-vault";
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
    const t = setTimeout(async () => {
      const out: Record<string, { ok: boolean; text: string }> = {};
      for (const leg of plan) {
        try {
          const q = await buildWithdrawQuote(leg.pin.preview, owner, leg.shares, toUsdg, previewClient(leg.pin.preview.vault as Address, leg.pin.preview.router as Address, owner));
          out[leg.pin.vault] = { ok: true, text: describeQuote(q, leg.pin) };
        } catch (e) {
          out[leg.pin.vault] = { ok: false, text: e instanceof Error ? e.message : "No quote" };
        }
        if (alive) setQuotes({ ...out });
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, toUsdg, legs, plan.map((p) => `${p.pin.vault}:${p.shares}`).join(",")]);

  function describeQuote(q: WithdrawQuote, pin: VaultPin) {
    if (q.kind === "usdg") return `≈ ${Number(formatUnits(q.amount, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG`;
    const stockIsToken0 = pin.preview.asset.toLowerCase() !== pin.preview.token0.toLowerCase();
    const stock = stockIsToken0 ? q.amounts[0] : q.amounts[1];
    const usdg = stockIsToken0 ? q.amounts[1] : q.amounts[0];
    return `≈ ${Number(formatUnits(stock, 18)).toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${pin.symbol} + ${Number(formatUnits(usdg, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG`;
  }

  async function send(to: Address, data: Hex) {
    if (!walletClient || !owner) throw new Error("Connect your wallet");
    const client = publicClient();
    await client.call({ account: owner, to, data });
    const gas = await client.estimateGas({ account: owner, to, data });
    const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 120n) / 100n });
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error("Transaction reverted; nothing changed.");
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
              setNote(`${leg.pin.symbol}: approve the router to redeem your shares`);
              await send(entry.vault as Address, encodeApprove(entry.router as Address, leg.shares));
            }
          }
          update(i, { status: "withdrawing" });
          setNote(`${leg.pin.symbol}: building the withdrawal…`);
          const quote = await buildWithdrawQuote(entry, owner, leg.shares, toUsdg);
          if (Date.now() > quote.expires - 15_000) throw new Error("Quote expired. Retry this leg.");
          setNote(`${leg.pin.symbol}: confirm the withdrawal in your wallet`);
          const hash = await send(quote.kind === "tokens" ? (entry.vault as Address) : (entry.router as Address), encodeWithdraw(quote));
          update(i, { status: "done", hash, received: describeQuote(quote, leg.pin) });
          window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
        } catch (e) {
          update(i, { status: "failed", error: describeTxError(e) });
          for (let j = i + 1; j < startLegs.length; j++) update(j, { status: "skipped" });
          setNote("");
          setError(`${leg.pin.symbol} did not complete. Retry from this leg; finished legs stay as they are.`);
          return;
        }
      }
      setNote("Exit complete. Balances refresh in a moment.");
      await refresh();
    } catch (e) {
      setError(describeTxError(e));
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
          <p className="eyebrow">Exit</p>
          <h2 id="basket-exit-heading">Leave several vaults in one flow.</h2>
        </div>
        <span className="strategy-status strategy-status-live">
          <i aria-hidden="true" /> Live · you sign each step
        </span>
      </div>
      {!owner ? (
        <div className="basket-foot">
          <p className="basket-muted">Connect a wallet to see which vaults you hold and exit the ones you pick.</p>
          <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
            {available ? "Connect wallet" : "No wallet detected"}
          </button>
        </div>
      ) : !positions ? (
        <p className="basket-muted">Reading your positions…</p>
      ) : positions.length === 0 ? (
        <p className="basket-muted">No vault positions in this wallet. Nothing to exit.</p>
      ) : (
        <>
          <div className="basket-exit-controls">
            <div className="basket-size" role="radiogroup" aria-label="Share of each position to withdraw">
              <span>Withdraw</span>
              {PERCENTS.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={percent === n} className={percent === n ? "active" : ""} disabled={busy || !!legs} onClick={() => setPercent(n)}>
                  {n}%
                </button>
              ))}
            </div>
            <div className="basket-size" role="radiogroup" aria-label="Receive">
              <span>Receive</span>
              <button type="button" role="radio" aria-checked={toUsdg} className={toUsdg ? "active" : ""} disabled={busy || !!legs} onClick={() => setToUsdg(true)}>
                USDG
              </button>
              <button type="button" role="radio" aria-checked={!toUsdg} className={!toUsdg ? "active" : ""} disabled={busy || !!legs} onClick={() => setToUsdg(false)}>
                Tokens
              </button>
            </div>
            {!legs ? (
              <button type="button" className="basket-link" disabled={busy} onClick={() => setSelected(selected.size === positions.length ? new Set() : new Set(positions.map((p) => p.pin.vault)))}>
                {selected.size === positions.length ? "Clear" : "Select all"}
              </button>
            ) : null}
          </div>
          <ol className="basket-legs" aria-label="Positions">
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
                      aria-label={`Include ${p.pin.symbol}`}
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
                    <b>{p.pin.symbol} vault</b>
                    <span>
                      {Number(formatUnits(p.shares, 18)).toLocaleString("en-US", { maximumSignificantDigits: 5 })} shares · {p.value === null ? "valuing…" : usd(p.value)}
                    </span>
                  </div>
                  <div className="basket-leg-amount">
                    <b className="mono">{legs ? `${percent}%` : on ? `${percent}%` : "–"}</b>
                    <span className="mono">{leg?.received ?? (on ? (q ? q.text : "quoting…") : "")}</span>
                  </div>
                  <span className={`basket-leg-status ${leg ? leg.status : "plan"}`}>
                    {!leg ? (
                      <Link href={p.pin.href}>
                        Vault <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    ) : leg.status === "done" ? (
                      <a href={leg.hash ? explorerTx(leg.hash) : "#"} target="_blank" rel="noopener noreferrer">
                        <Check size={13} aria-hidden="true" /> Withdrawn
                      </a>
                    ) : leg.status === "failed" ? (
                      <>
                        <CircleAlert size={13} aria-hidden="true" /> Failed
                      </>
                    ) : leg.status === "approving" ? (
                      "Approving…"
                    ) : leg.status === "withdrawing" ? (
                      "Withdrawing…"
                    ) : leg.status === "skipped" ? (
                      "Waiting"
                    ) : (
                      "Queued"
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
                <p>Pick the vaults to leave. Each exit is the same redemption the vault page makes: to USDG through the router&apos;s protected swap, or to both pool tokens.</p>
              ) : plan.some((p) => quotes[p.pin.vault] && !quotes[p.pin.vault].ok) ? (
                <p>{plan.filter((p) => quotes[p.pin.vault] && !quotes[p.pin.vault].ok).map((p) => `${p.pin.symbol}: ${quotes[p.pin.vault].text}`).join(" · ")}</p>
              ) : (
                <p>
                  {percent}% of {plan.length} position{plan.length === 1 ? "" : "s"}, about {usd(totalValue)}, {toUsdg ? "to USDG" : "to tokens"}. {toUsdg ? `${plan.length} approval${plan.length === 1 ? "" : "s"} and ` : ""}
                  {plan.length} withdrawal{plan.length === 1 ? "" : "s"} to sign, one after another.
                </p>
              )}
            </div>
            {legs && legs.some((l) => l.status === "failed") ? (
              <button type="button" className="hex hex-green" onClick={retry} disabled={busy}>
                <RefreshCw size={14} aria-hidden="true" /> Retry from the failed leg
              </button>
            ) : legs && legs.every((l) => l.status === "done") ? (
              <button type="button" className="hex hex-green" onClick={reset}>
                Done <Check size={14} aria-hidden="true" />
              </button>
            ) : legs ? (
              <button type="button" className="hex hex-green" disabled>
                <span className="managed-progress-spinner" aria-hidden="true" /> Signing…
              </button>
            ) : (
              <button type="button" className="hex hex-green" onClick={start} disabled={!allQuoted || busy}>
                Exit selected <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
