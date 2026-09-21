"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Lock, RefreshCw } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { txErrorMessage } from "@/components/vaults/txError";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { erc20Abi, lendingMarketAbi, managedVaultAbi } from "@/lib/abis";
import { ALLOCATOR_MIN_PER_LEG, ALLOCATOR_MODEL, ALLOCATOR_TVL_FLOOR, DRIFT_POINTS, PROFILES, propose, rebalance, RISK_PROFILES, type ExclusionCode, type Holding, type Position, type RiskProfile } from "@/lib/allocator";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain, USDG_ADDRESS } from "@/lib/chain";
import { buildDepositQuote, encodeApprove, encodeDeposit } from "@/lib/managed-vault";
import { formatPercent } from "@/lib/format";
import type { LendingMarketRow } from "@/server/lending";

type LegStatus = "pending" | "approving" | "depositing" | "done" | "failed" | "skipped";
type Leg = { position: Position; shares: bigint | null; status: LegStatus; hash?: Hex; error?: string };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUsdg = (raw: bigint) => Number(formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (w: number) => `${(w * 100).toFixed(1)}%`;
const SOURCE_URL = `${BRAND.repoUrl}/blob/main/src/lib/allocator.ts`;

function parseAmount(value: string, t: TFunction) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) throw new Error(t("error.invalidUsdg"));
  const raw = parseUnits(value, 6);
  if (raw <= 0n) throw new Error(t("error.aboveZero"));
  return raw;
}

function Mark({ p, size }: { p: Pick<Position, "kind" | "symbol">; size: number }) {
  if (p.kind === "vault") return <StockLogo symbol={p.symbol} size={size} />;
  return (
    <span className="alloc-usdg" style={{ width: size, height: size }}>
      <Image src="/brands/usdg.png" alt="" width={size} height={size} />
    </span>
  );
}

export function Allocator() {
  const t = useT("allocator");
  const { rows, singles, error: feedError } = useProtocolVaults();
  const { address: owner, connect, walletClient, chainId, switchChain, available } = useWallet();
  const [profile, setProfile] = useState<RiskProfile>("balanced");
  const [amount, setAmount] = useState("");
  const [usdgBalance, setUsdgBalance] = useState<bigint | null>(null);
  const [lending, setLending] = useState<LendingMarketRow[] | null>(null);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  /** Legs the router cannot quote right now; the next ranked candidate takes their place. */
  const [excluded, setExcluded] = useState<Record<string, ExclusionCode>>({});
  const [estimates, setEstimates] = useState<Record<string, bigint | null>>({});
  const busyRef = useRef(false);

  // Lending markets come from the same API the lending page uses.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/lending/v2/markets", { cache: "no-store" });
        const j = (await res.json()) as { data?: LendingMarketRow[] };
        if (alive && Array.isArray(j.data)) setLending(j.data);
      } catch {
        if (alive) setLending((x) => x ?? []);
      }
    };
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const raw = useMemo(() => {
    try {
      return parseAmount(amount, t);
    } catch {
      return null;
    }
  }, [amount, t]);

  const proposal = useMemo(() => (rows ? propose({ rows, pins: singles, lending: lending ?? [], profile, amount: raw ?? 0n, exclude: excluded }) : null), [rows, singles, lending, profile, raw, excluded]);
  const positions = legs?.map((l) => l.position) ?? proposal?.positions ?? [];
  const spec = PROFILES[profile];
  const perLegTooSmall = raw !== null && positions.some((p) => Number(formatUnits(p.amount, 6)) < ALLOCATOR_MIN_PER_LEG);
  const overBalance = raw !== null && usdgBalance !== null ? raw > usdgBalance : false;

  const refreshWallet = useCallback(async () => {
    if (!owner) {
      setUsdgBalance(null);
      setHoldings(null);
      return;
    }
    const client = publicClient();
    try {
      setUsdgBalance(await client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }));
    } catch {}
    if (!rows) return;
    try {
      const vaults = await Promise.all(
        singles.map(async (pin): Promise<Holding> => {
          const shares = await client.readContract({ address: pin.vault as Address, abi: managedVaultAbi, functionName: "balanceOf", args: [owner] }).catch(() => 0n);
          const row = rows.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
          const supply = row?.snapshot?.extras?.totalSupply ? BigInt(row.snapshot.extras.totalSupply) : null;
          const assets = row?.snapshot?.assets ? BigInt(row.snapshot.assets) : null;
          const value = shares > 0n && supply && supply > 0n && assets !== null ? Number(formatUnits((assets * shares) / supply, 6)) : 0;
          return { kind: "vault", id: pin.id, symbol: pin.symbol, href: pin.href, value };
        }),
      );
      const markets = await Promise.all(
        (lending ?? []).map(async (m): Promise<Holding> => {
          const shares = await client.readContract({ address: m.pin.market as Address, abi: lendingMarketAbi, functionName: "supplyShares", args: [owner] }).catch(() => 0n);
          const tss = BigInt(m.accounting.totalSupplyShares);
          const value = shares > 0n && tss > 0n ? Number(formatUnits((shares * BigInt(m.accounting.supplied)) / tss, 6)) : 0;
          return { kind: "lending", id: m.pinId, symbol: m.pin.symbol, href: `/lending/${m.pin.slug}`, value };
        }),
      );
      setHoldings([...vaults, ...markets]);
    } catch {}
  }, [owner, rows, singles, lending]);

  useEffect(() => {
    void refreshWallet();
    const timer = setInterval(() => document.visibilityState === "visible" && void refreshWallet(), 30_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, refreshWallet);
    return () => {
      clearInterval(timer);
      window.removeEventListener(BRAND.vaultUpdatedEvent, refreshWallet);
    };
  }, [refreshWallet]);

  // Share estimates for vault legs, quoted the way the vault page does. A vault the router refuses is swapped out.
  const legKey = proposal?.positions.map((p) => `${p.id}:${p.amount}`).join(",") ?? "";
  useEffect(() => {
    if (!proposal || raw === null || !owner || perLegTooSmall || overBalance || legs) {
      setEstimates({});
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const out: Record<string, bigint | null> = {};
      for (const p of proposal.positions) {
        if (p.kind !== "vault" || !p.pin) continue;
        try {
          const q = await buildDepositQuote(p.pin.preview, owner, p.amount, false);
          out[p.id] = q.shares;
        } catch {
          if (!alive) return;
          const vault = p.pin.vault.toLowerCase();
          setExcluded((x) => ({ ...x, [vault]: "router" }));
          return; // the proposal changes; this effect runs again for the replacement
        }
        if (alive) setEstimates({ ...out });
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey, owner, perLegTooSmall, overBalance, !!legs]);
  useEffect(() => {
    if (!amount) setExcluded({});
  }, [amount]);

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

  async function ensureAllowance(spender: Address, needed: bigint, symbol: string) {
    if (!owner) return;
    const allowance = await publicClient().readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
    if (allowance >= needed) return false;
    setNote(t("note.approve", { symbol, amount: fmtUsdg(needed) }));
    if (allowance > 0n) await send(USDG_ADDRESS, encodeApprove(spender, 0n));
    await send(USDG_ADDRESS, encodeApprove(spender, needed));
    return true;
  }

  const update = (i: number, patch: Partial<Leg>) => setLegs((ls) => (ls ? ls.map((l, j) => (j === i ? { ...l, ...patch } : l)) : ls));

  async function runFrom(startLegs: Leg[], from: number) {
    if (!owner || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      for (let i = from; i < startLegs.length; i++) {
        const leg = startLegs[i];
        if (leg.status === "done") continue;
        const p = leg.position;
        try {
          setNote(t("note.checkingAllowance", { symbol: p.symbol }));
          if (p.kind === "vault" && p.pin) {
            const entry = p.pin.preview;
            update(i, { status: "approving" });
            await ensureAllowance(entry.router as Address, p.amount, p.symbol);
            update(i, { status: "depositing" });
            setNote(t("note.building", { symbol: p.symbol }));
            const quote = await buildDepositQuote(entry, owner, p.amount, true);
            if (Date.now() > quote.expires - 15_000) throw new Error(t("error.quoteExpiredLeg"));
            setNote(t("note.confirm", { symbol: p.symbol }));
            const hash = await send(entry.router as Address, encodeDeposit(quote.entry));
            update(i, { status: "done", hash, shares: quote.shares });
          } else if (p.kind === "lending" && p.market) {
            const market = p.market.pin.market as Address;
            update(i, { status: "approving" });
            await ensureAllowance(market, p.amount, p.symbol);
            update(i, { status: "depositing" });
            setNote(t("note.confirmSupply", { symbol: p.symbol }));
            // the market takes a floor on the units it issues: 0.1% under the quote, the way its own transactions do
            const tss = BigInt(p.market.accounting.totalSupplyShares);
            const supplied = BigInt(p.market.accounting.supplied);
            const minUnits = supplied === 0n ? 0n : (((p.amount * tss) / supplied) * 9_990n) / 10_000n;
            const hash = await send(market, encodeFunctionData({ abi: lendingMarketAbi, functionName: "supply", args: [p.amount, minUnits] }));
            update(i, { status: "done", hash });
          }
          window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
        } catch (e) {
          update(i, { status: "failed", error: txErrorMessage(e, t) });
          for (let j = i + 1; j < startLegs.length; j++) update(j, { status: "skipped" });
          setNote("");
          setError(t("error.legFailed", { symbol: p.symbol }));
          return;
        }
      }
      setNote(t("note.complete"));
      await refreshWallet();
    } catch (e) {
      setError(txErrorMessage(e, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function start() {
    if (!proposal || raw === null) return;
    const initial: Leg[] = proposal.positions.map((p) => ({ position: p, shares: estimates[p.id] ?? null, status: "pending" }));
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
    setAmount("");
    setNote("");
    setError("");
  }

  // Rebalance: what the wallet holds versus what the model proposes for the same total today.
  const drift = useMemo(() => {
    if (!holdings || !rows) return null;
    const total = holdings.reduce((a, h) => a + h.value, 0);
    if (total <= 0) return { total: 0, drifts: [], moves: 0 };
    const target = propose({ rows, pins: singles, lending: lending ?? [], profile, amount: parseUnits(total.toFixed(6), 6) });
    return rebalance(holdings, target);
  }, [holdings, rows, singles, lending, profile]);

  const ready = !!proposal && positions.length > 0;
  const canStart = ready && raw !== null && !!owner && !busy && !perLegTooSmall && !overBalance && positions.every((p) => p.kind !== "vault" || estimates[p.id]);
  const quoting = raw !== null && !!owner && positions.some((p) => p.kind === "vault" && estimates[p.id] === undefined);
  const excludedList = proposal?.excluded.filter((x) => x.code === "router") ?? [];

  return (
    <div className="basket allocator">
      <section className="basket-panel" aria-labelledby="alloc-plan-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("plan.eyebrow", { model: ALLOCATOR_MODEL })}</p>
            <h2 id="alloc-plan-heading">{t("plan.title")}</h2>
          </div>
          <span className="strategy-status strategy-status-live">
            <i aria-hidden="true" /> {t("plan.live")}
          </span>
        </div>

        <div className="alloc-controls">
          <label className="amount-box amount-box-input" htmlFor="alloc-amount">
            <div className="amount-box-top">
              <span>{t("plan.amount")}</span>
              <span>
                {t("plan.balance")} <b className="mono">{usdgBalance === null ? "–" : fmtUsdg(usdgBalance)}</b>
                {usdgBalance !== null ? (
                  <>
                    {" "}
                    ·{" "}
                    <button type="button" className="max-link" disabled={busy || !!legs} onClick={() => setAmount(formatUnits(usdgBalance, 6))}>
                      {t("plan.max")}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <div className="wallet-amount-main">
              <input id="alloc-amount" inputMode="decimal" placeholder="0.00" disabled={busy || !!legs} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>USDG</span>
            </div>
          </label>
          <div className="alloc-risk" role="radiogroup" aria-label={t("plan.riskAria")}>
            {RISK_PROFILES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={profile === id} className={profile === id ? "active" : ""} disabled={busy || !!legs} onClick={() => setProfile(id)}>
                <b>{t(`risk.${id}`)}</b>
                <span>{t(`risk.${id}.sub`)}</span>
              </button>
            ))}
          </div>
        </div>

        <ol className="basket-legs alloc-legs" aria-label={t("plan.legsAria")}>
          {positions.map((p, i) => {
            const leg = legs?.[i];
            const est = leg?.shares ?? (raw !== null ? estimates[p.id] : null);
            const c = p.components;
            return (
              <li key={p.id} className={`basket-leg alloc-leg${leg ? ` is-${leg.status}` : ""}`}>
                <span className="basket-rank">{String(i + 1).padStart(2, "0")}</span>
                <Mark p={p} size={36} />
                <div className="basket-leg-main">
                  <b>{p.kind === "vault" ? t("legs.vault", { symbol: p.symbol }) : t("legs.lending", { symbol: p.symbol })}</b>
                  <span className="alloc-score" title={t("legs.scoreTitle", { yield: c.yield, depth: c.depth, health: c.health, stability: c.stability })}>
                    <span className="alloc-score-bars" aria-hidden="true">
                      {(["yield", "depth", "health", "stability"] as const).map((k) => (
                        <i key={k} style={{ height: `${Math.max(8, c[k])}%` }} />
                      ))}
                    </span>
                    {t("legs.score", { score: p.score.toFixed(0) })} · {p.kind === "vault" ? t("legs.metaVault", { apr: formatPercent(p.apr), tvl: usd(p.tvl) }) : t("legs.metaLending", { apr: formatPercent(p.apr), tvl: usd(p.tvl) })}
                  </span>
                </div>
                <div className="basket-leg-amount">
                  <b className="mono">{pct(p.weight)}</b>
                  <span className="mono">
                    {raw !== null ? t("legs.amount", { amount: fmtUsdg(p.amount) }) : ""}
                    {raw !== null && owner && p.kind === "vault" ? (est === undefined ? ` · ${t("legs.quoting")}` : est === null ? ` · ${t("legs.noQuote")}` : ` · ${t("legs.shares", { n: Number(formatUnits(est, 18)).toLocaleString("en-US", { maximumSignificantDigits: 5 }) })}`) : ""}
                  </span>
                </div>
                <span className={`basket-leg-status ${leg ? leg.status : "plan"}`}>
                  {!leg ? (
                    <Link href={p.href}>
                      {p.kind === "vault" ? t("legs.vaultLink") : t("legs.marketLink")} <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  ) : leg.status === "done" ? (
                    <a href={leg.hash ? explorerTx(leg.hash) : "#"} target="_blank" rel="noopener noreferrer">
                      <Check size={13} aria-hidden="true" /> {p.kind === "vault" ? t("legs.deposited") : t("legs.supplied")}
                    </a>
                  ) : leg.status === "failed" ? (
                    <>
                      <CircleAlert size={13} aria-hidden="true" /> {t("legs.failed")}
                    </>
                  ) : leg.status === "approving" ? (
                    t("legs.approving")
                  ) : leg.status === "depositing" ? (
                    p.kind === "vault" ? t("legs.depositing") : t("legs.supplying")
                  ) : leg.status === "skipped" ? (
                    t("legs.waiting")
                  ) : (
                    t("legs.queued")
                  )}
                </span>
                <ul className="alloc-reasons" aria-label={t("legs.reasonsAria", { symbol: p.symbol })}>
                  {p.reasons.map((r, j) => (
                    <li key={j} className={r.code === "outOfRange" || r.code === "oracleStale" || r.code === "poolDrift" || r.code === "aprStale" ? "warn" : ""}>
                      {t(`reason.${r.code}`, "tvl" in r.params ? { ...r.params, tvl: usd(Number(r.params.tvl)) } : r.params)}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {!legs && excludedList.length ? (
            <li className="basket-leg basket-leg-empty">
              {excludedList.map((x) => t("legs.skipped", { symbol: x.symbol })).join(". ")}. {t("legs.skippedNext")}
            </li>
          ) : null}
          {!legs && proposal && positions.length === 0 ? <li className="basket-leg basket-leg-empty">{t("legs.none", { floor: usd(ALLOCATOR_TVL_FLOOR) })}</li> : null}
          {!proposal ? <li className="basket-leg basket-leg-empty">{t("legs.reading")}</li> : null}
        </ol>

        <div className="basket-foot">
          <div className="basket-foot-copy" aria-live="polite">
            {error ? (
              <p className="basket-error">{error}</p>
            ) : note ? (
              <p>{note}</p>
            ) : perLegTooSmall ? (
              <p>{t("foot.tooSmall", { min: ALLOCATOR_MIN_PER_LEG, n: positions.length })}</p>
            ) : overBalance ? (
              <p>{t("foot.overBalance")}</p>
            ) : raw !== null && proposal ? (
              <p>{t("foot.plan", { total: fmtUsdg(raw), n: positions.length, lending: pct(proposal.lendingShare), steps: positions.length * 2 })}</p>
            ) : (
              <p>{t("foot.idle", { profile: t(`risk.${profile}`), stale: feedError ? t("foot.stale") : "" })}</p>
            )}
          </div>
          {!owner ? (
            <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
              {available ? t("foot.connect") : t("foot.noWallet")}
            </button>
          ) : legs && legs.some((l) => l.status === "failed") ? (
            <button type="button" className="hex hex-green" onClick={retry} disabled={busy}>
              <RefreshCw size={14} aria-hidden="true" /> {t("foot.retry")}
            </button>
          ) : legs && legs.every((l) => l.status === "done") ? (
            <span className="alloc-foot-actions">
              <button type="button" className="basket-link" onClick={reset}>
                {t("foot.again")}
              </button>
              <Link className="hex hex-green" href="/portfolio">
                {t("foot.portfolio")} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </span>
          ) : legs ? (
            <button type="button" className="hex hex-green" disabled>
              <span className="managed-progress-spinner" aria-hidden="true" /> {t("foot.signing")}
            </button>
          ) : (
            <button type="button" className="hex hex-green" onClick={start} disabled={!canStart}>
              {quoting ? t("foot.quoting") : t("foot.start")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <div className="alloc-grid">
        <section className="basket-panel" aria-labelledby="alloc-model-heading">
          <div className="basket-panel-head">
            <div>
              <p className="eyebrow">{t("model.eyebrow")}</p>
              <h2 id="alloc-model-heading">{t("model.title", { profile: t(`risk.${profile}`) })}</h2>
            </div>
          </div>
          <p className="basket-muted">{t("model.lead")}</p>
          <dl className="alloc-weights">
            {(["yield", "depth", "health", "stability"] as const).map((k) => (
              <div key={k}>
                <dt>
                  <b>{t(`model.${k}`)}</b>
                  <span>{t(`model.${k}.sub`)}</span>
                </dt>
                <dd>
                  <i style={{ width: `${spec.weights[k] * 100}%` }} aria-hidden="true" />
                  <span className="mono">{Math.round(spec.weights[k] * 100)}%</span>
                </dd>
              </div>
            ))}
          </dl>
          <ul className="alloc-limits">
            <li>{t("model.maxPositions", { n: spec.maxPositions })}</li>
            <li>{t("model.maxWeight", { pct: Math.round(spec.maxWeight * 100) })}</li>
            <li>{spec.lendingFloor > 0 ? t("model.lendingFloor", { pct: Math.round(spec.lendingFloor * 100) }) : t("model.noFloor")}</li>
            <li>{t("model.floor", { floor: usd(ALLOCATOR_TVL_FLOOR) })}</li>
          </ul>
          <p className="basket-muted basket-small">
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              {t("model.source")} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a href={`/api/allocator?amount=${raw !== null ? amount : "1000"}&risk=${profile}`} target="_blank" rel="noopener noreferrer">
              {t("model.json")} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </p>
        </section>

        <section className="basket-panel basket-rebalance" aria-labelledby="alloc-rebalance-heading">
          <div className="basket-panel-head">
            <div>
              <p className="eyebrow">{t("hints.eyebrow")}</p>
              <h2 id="alloc-rebalance-heading">{t("hints.title")}</h2>
            </div>
          </div>
          {!owner ? (
            <p className="basket-muted">{t("hints.connect")}</p>
          ) : !drift ? (
            <p className="basket-muted">{t("hints.reading")}</p>
          ) : drift.total <= 0 ? (
            <p className="basket-muted">{t("hints.none")}</p>
          ) : (
            <div className="alloc-hints">
              <p className="basket-muted">{drift.moves === 0 ? t("hints.match", { total: usd(drift.total), profile: t(`risk.${profile}`), points: DRIFT_POINTS }) : t("hints.moves", { n: drift.moves, total: usd(drift.total), profile: t(`risk.${profile}`) })}</p>
              <ul>
                {drift.drifts.map((d) => (
                  <li key={d.id}>
                    <Mark p={d} size={26} />
                    <span>
                      {d.kind === "vault" ? d.symbol : t("hints.lendingName", { symbol: d.symbol })}
                      <small>{t("hints.heldTarget", { held: pct(d.held), target: pct(d.target) })}</small>
                    </span>
                    <em className={d.move}>{t(`hints.move.${d.move}`)}</em>
                    <Link href={d.href}>
                      {d.move === "trim" || d.move === "exit" ? t("hints.withdrawPage") : t("hints.depositPage")} <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="basket-muted basket-small">
                <Lock size={12} aria-hidden="true" /> {t("hints.never", { brand: BRAND.name })}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
