"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Lock, RefreshCw } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { erc20Abi, managedVaultAbi } from "@/lib/abis";
import { BASKET_MIN_PER_VAULT, BASKET_SIZES, BASKET_TVL_FLOOR, rankVaults, rebalanceHints, splitBudget, type BasketPosition, type RankedVault } from "@/lib/basket";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain, USDG_ADDRESS } from "@/lib/chain";
import { buildDepositQuote, describeTxError, encodeApprove, encodeDeposit } from "@/lib/managed-vault";
import { formatPercent } from "@/lib/format";

type LegStatus = "pending" | "approving" | "depositing" | "done" | "failed" | "skipped";
type Leg = { vault: RankedVault; amount: bigint; shares: bigint | null; status: LegStatus; hash?: Hex; error?: string };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUsdg = (raw: bigint) => Number(formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });

function parseAmount(value: string) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) throw new Error("Enter a valid USDG amount");
  const raw = parseUnits(value, 6);
  if (raw <= 0n) throw new Error("Enter an amount above zero");
  return raw;
}

export function BasketStrategy() {
  const { rows, singles, error: feedError } = useProtocolVaults();
  const { address: owner, connect, walletClient, chainId, switchChain, available } = useWallet();
  const [size, setSize] = useState<(typeof BASKET_SIZES)[number]>(4);
  const [amount, setAmount] = useState("");
  const [usdgBalance, setUsdgBalance] = useState<bigint | null>(null);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [positions, setPositions] = useState<BasketPosition[] | null>(null);
  /** Vaults the router cannot quote right now (price guard, thin range); the next ranked vault takes their place. */
  const [excluded, setExcluded] = useState<Record<string, string>>({});
  const busyRef = useRef(false);

  const ranking = useMemo(() => (rows ? rankVaults(rows, singles) : []), [rows, singles]);
  const top = ranking.filter((v) => !excluded[v.pin.vault]).slice(0, size);
  const skipped = ranking.filter((v) => excluded[v.pin.vault]);
  const lockedRanking = legs?.map((l) => l.vault) ?? null;

  const refreshWallet = useCallback(async () => {
    if (!owner) {
      setUsdgBalance(null);
      setPositions(null);
      return;
    }
    const client = publicClient();
    try {
      setUsdgBalance(await client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }));
    } catch {}
    if (!rows) return;
    try {
      const list = await Promise.all(
        singles.map(async (pin) => {
          const shares = await client.readContract({ address: pin.vault as Address, abi: managedVaultAbi, functionName: "balanceOf", args: [owner] });
          const row = rows.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
          const supply = row?.snapshot?.extras?.totalSupply ? BigInt(row.snapshot.extras.totalSupply) : null;
          const assets = row?.snapshot?.assets ? BigInt(row.snapshot.assets) : null;
          const value = shares > 0n && supply && supply > 0n && assets !== null ? Number(formatUnits((assets * shares) / supply, 6)) : 0;
          return { pin, shares, value };
        }),
      );
      setPositions(list);
    } catch {}
  }, [owner, rows, singles]);

  useEffect(() => {
    void refreshWallet();
    const t = setInterval(() => document.visibilityState === "visible" && void refreshWallet(), 30_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, refreshWallet);
    return () => {
      clearInterval(t);
      window.removeEventListener(BRAND.vaultUpdatedEvent, refreshWallet);
    };
  }, [refreshWallet]);

  // Plan: equal split across the top vaults, with a live share estimate per leg.
  const plan = useMemo(() => {
    if (legs) return null;
    let raw: bigint;
    try {
      raw = parseAmount(amount);
    } catch {
      return null;
    }
    if (top.length < size) return null;
    const split = splitBudget(raw, size);
    return top.map((vault, i) => ({ vault, amount: split[i] }));
  }, [amount, top, size, legs]);
  const perLegTooSmall = plan ? plan.some((p) => Number(formatUnits(p.amount, 6)) < BASKET_MIN_PER_VAULT) : false;
  const overBalance = plan && usdgBalance !== null ? plan.reduce((a, p) => a + p.amount, 0n) > usdgBalance : false;

  const [estimates, setEstimates] = useState<Record<string, bigint | null>>({});
  useEffect(() => {
    if (!plan || !owner || perLegTooSmall || overBalance) {
      setEstimates({});
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const out: Record<string, bigint | null> = {};
      for (const p of plan) {
        try {
          const q = await buildDepositQuote(p.vault.pin.preview, owner, p.amount, false);
          out[p.vault.pin.vault] = q.shares;
        } catch (e) {
          if (!alive) return;
          const msg = e instanceof Error ? e.message : "";
          const reason = /validatePool|Waiting for valid prices/i.test(msg) ? "the price guard is holding deposits right now" : /below the minimum|safe swap size/i.test(msg) ? "this amount does not fit its pool" : "the router could not quote it";
          setExcluded((x) => ({ ...x, [p.vault.pin.vault]: reason }));
          return; // the ranking shifts; this effect runs again for the replacement
        }
        if (alive) setEstimates({ ...out });
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, size, owner, perLegTooSmall, overBalance, plan?.map((p) => p.vault.pin.vault).join(",")]);
  useEffect(() => {
    if (!amount) setExcluded({});
  }, [amount]);

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
        const entry = leg.vault.pin.preview;
        try {
          setNote(`${leg.vault.pin.symbol}: checking allowance…`);
          const allowance = await client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [owner, entry.router as Address] });
          if (allowance < leg.amount) {
            update(i, { status: "approving" });
            setNote(`${leg.vault.pin.symbol}: approve ${fmtUsdg(leg.amount)} USDG in your wallet`);
            if (allowance > 0n) await send(USDG_ADDRESS, encodeApprove(entry.router as Address, 0n));
            await send(USDG_ADDRESS, encodeApprove(entry.router as Address, leg.amount));
          }
          update(i, { status: "depositing" });
          setNote(`${leg.vault.pin.symbol}: building the deposit…`);
          const quote = await buildDepositQuote(entry, owner, leg.amount, true);
          if (Date.now() > quote.expires - 15_000) throw new Error("Quote expired. Retry this leg.");
          setNote(`${leg.vault.pin.symbol}: confirm the deposit in your wallet`);
          const hash = await send(entry.router as Address, encodeDeposit(quote.entry));
          update(i, { status: "done", hash, shares: quote.shares });
          window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
        } catch (e) {
          update(i, { status: "failed", error: describeTxError(e) });
          for (let j = i + 1; j < startLegs.length; j++) update(j, { status: "skipped" });
          setNote("");
          setError(`${leg.vault.pin.symbol} did not complete. Fix the issue and retry from this leg; completed legs stay as they are.`);
          return;
        }
      }
      setNote("Basket complete. Every leg is a normal vault position in your wallet.");
      await refreshWallet();
    } catch (e) {
      setError(describeTxError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function start() {
    if (!plan) return;
    const initial: Leg[] = plan.map((p) => ({ vault: p.vault, amount: p.amount, shares: estimates[p.vault.pin.vault] ?? null, status: "pending" }));
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

  const hints = positions ? rebalanceHints(positions, ranking, size) : null;
  const total = plan ? plan.reduce((a, p) => a + p.amount, 0n) : 0n;
  const canStart = !!plan && !!owner && !busy && !perLegTooSmall && !overBalance && plan.every((p) => estimates[p.vault.pin.vault]);

  return (
    <div className="basket">
      <section className="basket-panel" aria-labelledby="basket-plan-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">01 · Volatile basket</p>
            <h2 id="basket-plan-heading">One deposit, the top {size} vaults.</h2>
          </div>
          <span className="strategy-status strategy-status-live">
            <i aria-hidden="true" /> Live · you sign each step
          </span>
        </div>
        <div className="basket-controls">
          <label className="amount-box amount-box-input" htmlFor="basket-amount">
            <div className="amount-box-top">
              <span>Total USDG</span>
              <span>
                Balance <b className="mono">{usdgBalance === null ? "–" : fmtUsdg(usdgBalance)}</b>
                {usdgBalance !== null ? (
                  <>
                    {" "}
                    ·{" "}
                    <button type="button" className="max-link" disabled={busy} onClick={() => setAmount(formatUnits(usdgBalance, 6))}>
                      Max
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <div className="wallet-amount-main">
              <input id="basket-amount" inputMode="decimal" placeholder="0.00" disabled={busy || !!legs} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>USDG</span>
            </div>
          </label>
          <div className="basket-size" role="radiogroup" aria-label="Number of vaults">
            <span>Vaults</span>
            {BASKET_SIZES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={size === n} className={size === n ? "active" : ""} disabled={busy || !!legs} onClick={() => setSize(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <ol className="basket-legs" aria-label="Basket plan">
          {(lockedRanking ?? top).map((v, i) => {
            const leg = legs?.[i];
            const legAmount = leg?.amount ?? plan?.[i]?.amount ?? null;
            const est = leg?.shares ?? (legAmount ? estimates[v.pin.vault] : null);
            return (
              <li key={v.pin.vault} className={`basket-leg${leg ? ` is-${leg.status}` : ""}`}>
                <span className="basket-rank">{String(i + 1).padStart(2, "0")}</span>
                <StockLogo symbol={v.pin.symbol} size={36} />
                <div className="basket-leg-main">
                  <b>{v.pin.symbol} vault</b>
                  <span>
                    {formatPercent(v.apr)} fee APR · {usd(v.tvl)} in vault
                  </span>
                </div>
                <div className="basket-leg-amount">
                  <b className="mono">{legAmount !== null ? `${fmtUsdg(legAmount)} USDG` : "–"}</b>
                  <span className="mono">{est === undefined ? "quoting…" : est === null ? (legAmount ? "no quote" : "") : `≈ ${Number(formatUnits(est, 18)).toLocaleString("en-US", { maximumSignificantDigits: 5 })} shares`}</span>
                </div>
                <span className={`basket-leg-status ${leg ? leg.status : "plan"}`}>
                  {!leg ? (
                    <Link href={v.pin.href}>
                      Vault <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  ) : leg.status === "done" ? (
                    <a href={leg.hash ? explorerTx(leg.hash) : "#"} target="_blank" rel="noopener noreferrer">
                      <Check size={13} aria-hidden="true" /> Deposited
                    </a>
                  ) : leg.status === "failed" ? (
                    <>
                      <CircleAlert size={13} aria-hidden="true" /> Failed
                    </>
                  ) : leg.status === "approving" ? (
                    "Approving…"
                  ) : leg.status === "depositing" ? (
                    "Depositing…"
                  ) : leg.status === "skipped" ? (
                    "Waiting"
                  ) : (
                    "Queued"
                  )}
                </span>
              </li>
            );
          })}
          {!lockedRanking && skipped.length ? (
            <li className="basket-leg basket-leg-empty">
              {skipped.map((v) => `${v.pin.symbol} skipped: ${excluded[v.pin.vault]}`).join(". ")}. The next vault in the ranking takes its place.
            </li>
          ) : null}
          {!lockedRanking && top.length < size ? (
            <li className="basket-leg basket-leg-empty">
              {rows ? `Only ${ranking.length} vaults currently qualify (open, with a realized APR and at least ${usd(BASKET_TVL_FLOOR)} in them). Pick a smaller basket.` : "Reading the vault ranking…"}
            </li>
          ) : null}
        </ol>

        <div className="basket-foot">
          <div className="basket-foot-copy" aria-live="polite">
            {error ? (
              <p className="basket-error">{error}</p>
            ) : note ? (
              <p>{note}</p>
            ) : perLegTooSmall ? (
              <p>Each vault needs at least {BASKET_MIN_PER_VAULT} USDG. Raise the amount or choose fewer vaults.</p>
            ) : overBalance ? (
              <p>That is more USDG than the wallet holds.</p>
            ) : plan ? (
              <p>
                {fmtUsdg(total)} USDG across {size} vaults, {size} approvals and {size} deposits to sign. Each leg is an ordinary vault position you can exit on its vault page at any time.
              </p>
            ) : (
              <p>Ranked by realized 24h fee APR among open vaults with at least {usd(BASKET_TVL_FLOOR)} in them. The ranking is read from the chain every 15 seconds{feedError ? " and is currently stale" : ""}.</p>
            )}
          </div>
          {!owner ? (
            <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
              {available ? "Connect wallet" : "No wallet detected"}
            </button>
          ) : legs && legs.some((l) => l.status === "failed") ? (
            <button type="button" className="hex hex-green" onClick={retry} disabled={busy}>
              <RefreshCw size={14} aria-hidden="true" /> Retry from the failed leg
            </button>
          ) : legs && legs.every((l) => l.status === "done") ? (
            <Link className="hex hex-green" href="/portfolio">
              See it in your portfolio <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : legs ? (
            <button type="button" className="hex hex-green" disabled>
              <span className="managed-progress-spinner" aria-hidden="true" /> Signing…
            </button>
          ) : (
            <button type="button" className="hex hex-green" onClick={start} disabled={!canStart}>
              Start the basket <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <section className="basket-panel basket-rebalance" aria-labelledby="basket-rebalance-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">Your basket</p>
            <h2 id="basket-rebalance-heading">Rotation is suggested, never automatic.</h2>
          </div>
        </div>
        {!owner ? (
          <p className="basket-muted">Connect a wallet to compare its vault positions with the current top {size}.</p>
        ) : !hints ? (
          <p className="basket-muted">Reading your positions…</p>
        ) : hints.held.length === 0 ? (
          <p className="basket-muted">No vault positions in this wallet yet. Start a basket above and this panel tracks it against the ranking.</p>
        ) : (
          <div className="basket-hints">
            <div>
              <h3>
                Held <small>{hints.held.length} vaults · {usd(hints.held.reduce((a, p) => a + p.value, 0))}</small>
              </h3>
              <ul>
                {hints.held.map((p) => {
                  const inTop = hints.top.some((r) => r.pin.vault.toLowerCase() === p.pin.vault.toLowerCase());
                  return (
                    <li key={p.pin.vault}>
                      <StockLogo symbol={p.pin.symbol} size={26} />
                      <span>{p.pin.symbol}</span>
                      <b className="mono">{usd(p.value)}</b>
                      <em className={inTop ? "in" : "out"}>{inTop ? "in the top" : "left the top"}</em>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Suggested moves</h3>
              {hints.dropped.length === 0 && hints.missing.length === 0 ? (
                <p className="basket-muted">Your positions match the current top {size}. Nothing to do.</p>
              ) : (
                <ul>
                  {hints.dropped.map((p) => (
                    <li key={`out-${p.pin.vault}`}>
                      <StockLogo symbol={p.pin.symbol} size={26} />
                      <span>{p.pin.symbol} fell out of the top {size}</span>
                      <Link href={p.pin.href}>
                        Withdraw on its page <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                  {hints.missing.map((r) => (
                    <li key={`in-${r.pin.vault}`}>
                      <StockLogo symbol={r.pin.symbol} size={26} />
                      <span>
                        {r.pin.symbol} entered at {formatPercent(r.apr)}
                      </span>
                      <Link href={r.pin.href}>
                        Deposit on its page <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="basket-muted basket-small">
                <Lock size={12} aria-hidden="true" /> {BRAND.name} never moves your funds. Every change is a transaction you sign.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
