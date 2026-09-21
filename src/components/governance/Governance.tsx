"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Landmark, RefreshCw, ShieldCheck } from "lucide-react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { txErrorMessage } from "@/components/vaults/txError";
import { useT } from "@/i18n/client";
import { erc20Abi } from "@/lib/abis";
import { fmtUsdg6 } from "@/lib/allocator-v1";
import { BRAND } from "@/lib/brand";
import { explorerAddress, explorerTx, publicClient, robinhoodChain, TOKEN_ADDRESS } from "@/lib/chain";
import { encodeApprove } from "@/lib/managed-vault";
import {
  draftDepositCap,
  draftSplit,
  draftWhitelistModule,
  encodeAllocatorExecute,
  encodeAllocatorPropose,
  encodeCancel,
  encodeClaim,
  encodeDistribute,
  encodeExecute,
  encodeFinalize,
  encodePropose,
  encodeStake,
  encodeUnstake,
  encodeVote,
  encodeWithdrawStake,
  fmtVertex,
  GOVERNANCE_LAUNCH,
  governanceDeployed,
  handOverCalls,
  lendingModuleAbi,
  lendingModuleMarket,
  readGovernance,
  type GovernanceState,
  type Proposal,
  type ProposalDraft,
} from "@/lib/governance";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SOURCE = (f: string) => `${BRAND.repoUrl}/blob/main/contracts/${f}`;
const when = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const hours = (s: bigint) => `${Number(s) / 3600}h`;

type Template = "module" | "split" | "cap";

export function Governance() {
  const t = useT("governance");
  const { address: wallet, connect, walletClient, chainId, switchChain, available } = useWallet();
  const [state, setState] = useState<GovernanceState | null>(null);
  const [stateError, setStateError] = useState("");
  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lastHash, setLastHash] = useState<Hex | null>(null);
  const [template, setTemplate] = useState<Template>("module");
  const [weight, setWeight] = useState(String(GOVERNANCE_LAUNCH.moduleWeightBps / 100));
  const [split, setSplit] = useState({ buyback: "30", stakers: "40", treasury: "30" });
  const [cap, setCap] = useState("5000");
  const [description, setDescription] = useState("");
  const busyRef = useRef(false);
  const deployed = governanceDeployed();

  const refresh = useCallback(async () => {
    if (!deployed) return;
    try {
      setState(await readGovernance(wallet ?? null));
      setStateError("");
    } catch (e) {
      setStateError(e instanceof Error ? e.message : String(e));
    }
  }, [wallet, deployed]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), 20_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(BRAND.vaultUpdatedEvent, refresh);
    };
  }, [refresh]);

  async function send(to: Address, data: Hex, label: string) {
    if (!walletClient || !wallet) throw new Error(t("error.connect"));
    const client = publicClient();
    await client.call({ account: wallet, to, data });
    const gas = await client.estimateGas({ account: wallet, to, data });
    setNote(label);
    const tx = await walletClient.sendTransaction({ account: wallet, chain: robinhoodChain, to, data, value: 0n, gas: (gas * 120n) / 100n });
    setLastHash(tx);
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(t("error.reverted"));
    return tx;
  }

  async function guarded(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      await fn();
      window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      await refresh();
    } catch (e) {
      setError(txErrorMessage(e, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const raw = useMemo(() => {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(amount)) return null;
    try {
      const v = parseUnits(amount, 18);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);
  const overBalance = !!state?.me && raw !== null && raw > (tab === "stake" ? state.me.vertex : state.me.staked);

  function stake() {
    if (!state || !raw || !wallet) return;
    void guarded(async () => {
      const client = publicClient();
      const current = await client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [wallet, state.staking.address] });
      if (current < raw) await send(TOKEN_ADDRESS, encodeApprove(state.staking.address, raw), t("tx.approve"));
      await send(state.staking.address, encodeStake(raw), t("tx.stake"));
      setNote(t("note.staked"));
      setAmount("");
    });
  }
  function unstake() {
    if (!state || !raw) return;
    void guarded(async () => {
      await send(state.staking.address, encodeUnstake(raw), t("tx.unstake"));
      setNote(t("note.unstaked", { days: Number(state.staking.cooldown) / 86_400 }));
      setAmount("");
    });
  }
  function withdrawStake() {
    if (!state) return;
    void guarded(async () => {
      await send(state.staking.address, encodeWithdrawStake(), t("tx.withdraw"));
      setNote(t("note.withdrawn"));
    });
  }
  function claim() {
    if (!state) return;
    void guarded(async () => {
      await send(state.staking.address, encodeClaim(), t("tx.claim"));
      setNote(t("note.claimed"));
    });
  }
  function distribute() {
    if (!state) return;
    void guarded(async () => {
      await send(state.splitter.address, encodeDistribute(), t("tx.distribute"));
      setNote(t("note.distributed"));
    });
  }
  function vote(id: number, support: 0 | 1 | 2) {
    if (!state) return;
    void guarded(async () => {
      await send(state.governor.address, encodeVote(id, support), t("tx.vote"));
      setNote(t("note.voted"));
    });
  }
  function execute(p: Proposal) {
    if (!state) return;
    void guarded(async () => {
      await send(state.governor.address, encodeExecute(p.id), t("tx.execute"));
      setNote(p.viaTimelock ? t("note.queued") : t("note.executed"));
    });
  }
  function finalize(p: Proposal) {
    if (!state) return;
    void guarded(async () => {
      await send(state.governor.address, encodeFinalize(p.id), t("tx.finalize"));
      setNote(t("note.finalized"));
    });
  }
  function cancel(p: Proposal) {
    if (!state) return;
    void guarded(async () => {
      await send(state.governor.address, encodeCancel(p.id), t("tx.cancel"));
      setNote(t("note.canceled"));
    });
  }

  const draft = useMemo<{ draft: ProposalDraft; summary: string } | null>(() => {
    if (!state) return null;
    try {
      if (template === "module") {
        if (!state.module) return null;
        const bps = Math.round(Number(weight) * 100);
        if (!(bps > 0 && bps <= 10_000)) return null;
        return { draft: draftWhitelistModule(state.allocator.address, state.module.address, "0x0000000000000000000000000000000000000000", bps), summary: t("draft.module", { symbol: lendingModuleMarket().symbol, pct: bps / 100 }) };
      }
      if (template === "split") {
        const b = Math.round(Number(split.buyback) * 100);
        const s = Math.round(Number(split.stakers) * 100);
        const tr = Math.round(Number(split.treasury) * 100);
        if (![b, s, tr].every((x) => x >= 0 && x <= 10_000) || b + s + tr !== 10_000) return null;
        return { draft: draftSplit(state.splitter.address, b, s, tr), summary: t("draft.split", { buyback: b / 100, stakers: s / 100, treasury: tr / 100 }) };
      }
      const c = parseUnits(cap, 6);
      if (c <= 0n) return null;
      return { draft: draftDepositCap(state.allocator.address, c), summary: t("draft.cap", { cap: fmtUsdg6(c) }) };
    } catch {
      return null;
    }
  }, [state, template, weight, split, cap, t]);

  function propose() {
    if (!state || !draft) return;
    void guarded(async () => {
      let d = draft.draft;
      if (template === "module" && state.module) {
        const stock = (await publicClient().readContract({ address: state.module.address, abi: lendingModuleAbi, functionName: "STOCK" })) as Address;
        d = draftWhitelistModule(state.allocator.address, state.module.address, stock, Math.round(Number(weight) * 100));
      }
      await send(state.governor.address, encodePropose(d.target, d.data, d.viaTimelock, description.trim() || draft.summary), t("tx.propose"));
      setNote(t("note.proposed"));
      setDescription("");
    });
  }

  const isAllocatorOwner = !!state && !!wallet && wallet.toLowerCase() === state.allocator.owner.toLowerCase();
  function queueHandOver() {
    if (!state) return;
    const calls = handOverCalls(state.splitter.address, state.governor.address);
    void guarded(async () => {
      if (!state.allocator.treasuryQueued) await send(state.allocator.address, encodeAllocatorPropose(calls.treasury), t("tx.handOverTreasury"));
      if (!state.allocator.ownerQueued) await send(state.allocator.address, encodeAllocatorPropose(calls.owner), t("tx.handOverOwner"));
      setNote(t("note.handOverQueued"));
    });
  }
  function executeHandOver() {
    if (!state) return;
    const calls = handOverCalls(state.splitter.address, state.governor.address);
    void guarded(async () => {
      if (state.allocator.treasuryReady && state.allocator.treasury.toLowerCase() !== state.splitter.address.toLowerCase()) await send(state.allocator.address, encodeAllocatorExecute(calls.treasury), t("tx.handOverTreasury"));
      if (state.allocator.ownerReady && state.allocator.owner.toLowerCase() !== state.governor.address.toLowerCase()) await send(state.allocator.address, encodeAllocatorExecute(calls.owner), t("tx.handOverOwner"));
      setNote(t("note.handOverDone"));
    });
  }

  // ------------------------------------------------------------------ not deployed yet
  if (!deployed) {
    const m = lendingModuleMarket();
    return (
      <section className="basket-panel" aria-labelledby="gov-pending-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("pending.eyebrow")}</p>
            <h2 id="gov-pending-heading">{t("pending.title")}</h2>
          </div>
          <span className="strategy-status">
            <RefreshCw size={12} aria-hidden="true" /> {t("pending.status")}
          </span>
        </div>
        <p className="basket-muted">{t("pending.lead")}</p>
        <ul className="alloc-limits">
          <li>{t("pending.staking")}</li>
          <li>{t("pending.governor")}</li>
          <li>{t("pending.splitter", { buyback: GOVERNANCE_LAUNCH.buybackBps / 100, stakers: GOVERNANCE_LAUNCH.stakersBps / 100, treasury: GOVERNANCE_LAUNCH.treasuryBps / 100 })}</li>
          <li>{t("pending.module", { symbol: m.symbol, pct: GOVERNANCE_LAUNCH.moduleWeightBps / 100 })}</li>
          <li>{t("pending.handOver")}</li>
        </ul>
        <p className="basket-muted basket-small">
          {["VertexStaking.sol", "VertexGovernor.sol", "VertexFeeSplitter.sol", "VertexLendingModule.sol"].map((f) => (
            <a key={f} href={SOURCE(f)} target="_blank" rel="noopener noreferrer">
              {f} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          ))}
        </p>
      </section>
    );
  }

  const me = state?.me ?? null;
  const proposals = state?.proposals ?? [];
  const stakeShare = state && state.staking.totalStaked > 0n && me ? Number((me.staked * 10_000n) / state.staking.totalStaked) / 100 : 0;
  const pendingReady = !!me && me.pendingAmount > 0n && state !== null && BigInt(Math.floor(Date.now() / 1000)) >= me.pendingReadyAt;

  return (
    <div className="gov-grid">
      {/* ------------------------------------------------------------ stake */}
      <section className="basket-panel" aria-labelledby="gov-stake-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("stake.eyebrow")}</p>
            <h2 id="gov-stake-heading">{t("stake.title")}</h2>
          </div>
          <span className="strategy-status">
            <ShieldCheck size={12} aria-hidden="true" /> {t("stake.status")}
          </span>
        </div>
        {stateError && !state ? <p className="basket-error">{stateError}</p> : null}
        {state ? (
          <dl className="gov-stats">
            <div>
              <dt>{t("stake.total")}</dt>
              <dd className="mono">{fmtVertex(state.staking.totalStaked)} VERTEX</dd>
            </div>
            <div>
              <dt>{t("stake.rewards")}</dt>
              <dd className="mono">{fmtUsdg6(state.staking.totalRewards)} USDG</dd>
            </div>
            <div>
              <dt>{t("stake.cooldown")}</dt>
              <dd className="mono">{Number(state.staking.cooldown) / 86_400} {t("stake.days")}</dd>
            </div>
            <div>
              <dt>{t("stake.mine")}</dt>
              <dd className="mono">{me ? `${fmtVertex(me.staked)} VERTEX` : "–"}</dd>
            </div>
            <div>
              <dt>{t("stake.share")}</dt>
              <dd className="mono">{me ? `${stakeShare.toFixed(2)}%` : "–"}</dd>
            </div>
            <div>
              <dt>{t("stake.earned")}</dt>
              <dd className="mono">{me ? `${fmtUsdg6(me.earned)} USDG` : "–"}</dd>
            </div>
          </dl>
        ) : (
          <p className="basket-muted">{t("state.reading")}</p>
        )}
        <div className="alloc-risk v1-tabs" role="tablist" aria-label={t("stake.tabsAria")}>
          <button type="button" role="tab" aria-selected={tab === "stake"} className={tab === "stake" ? "active" : ""} disabled={busy} onClick={() => { setTab("stake"); setAmount(""); }}>
            <b>{t("stake.tabStake")}</b>
            <span>{t("stake.tabStakeSub")}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "unstake"} className={tab === "unstake" ? "active" : ""} disabled={busy} onClick={() => { setTab("unstake"); setAmount(""); }}>
            <b>{t("stake.tabUnstake")}</b>
            <span>{t("stake.tabUnstakeSub")}</span>
          </button>
        </div>
        <div className="amount-box amount-box-input">
          <div className="amount-box-top">
            <label htmlFor="gov-amount">{tab === "stake" ? t("stake.amountStake") : t("stake.amountUnstake")}</label>
            {me ? (
              <button type="button" className="max-link" disabled={busy} onClick={() => setAmount(formatUnits(tab === "stake" ? me.vertex : me.staked, 18))}>
                {t("stake.max", { amount: fmtVertex(tab === "stake" ? me.vertex : me.staked) })}
              </button>
            ) : null}
          </div>
          <input id="gov-amount" className="wallet-amount-main" inputMode="decimal" placeholder="0" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value.replace(/,/g, "."))} />
          <p className="basket-muted basket-small">{overBalance ? t("stake.over") : tab === "stake" ? t("stake.noteStake") : t("stake.noteUnstake", { days: state ? Number(state.staking.cooldown) / 86_400 : 7 })}</p>
        </div>
        <div className="gov-actions">
          {!wallet ? (
            <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
              {t("stake.connect")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : tab === "stake" ? (
            <button type="button" className="hex hex-green" onClick={stake} disabled={busy || raw === null || overBalance}>
              {busy ? <span className="managed-progress-spinner" aria-hidden="true" /> : null} {t("stake.ctaStake")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="hex hex-green" onClick={unstake} disabled={busy || raw === null || overBalance}>
              {busy ? <span className="managed-progress-spinner" aria-hidden="true" /> : null} {t("stake.ctaUnstake")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          {me && me.pendingAmount > 0n ? (
            <button type="button" className="basket-link" disabled={busy || !pendingReady} onClick={withdrawStake}>
              {pendingReady ? t("stake.withdrawReady", { amount: fmtVertex(me.pendingAmount) }) : t("stake.withdrawWaiting", { amount: fmtVertex(me.pendingAmount), when: when(me.pendingReadyAt) })}
            </button>
          ) : null}
          {me && me.earned > 0n ? (
            <button type="button" className="basket-link" disabled={busy} onClick={claim}>
              {t("stake.claim", { amount: fmtUsdg6(me.earned) })}
            </button>
          ) : null}
        </div>
        {error ? <p className="basket-error">{error}</p> : null}
        {note && !error ? (
          <p className="basket-muted basket-small">
            {note}
            {lastHash ? (
              <>
                {" "}
                <a href={explorerTx(lastHash)} target="_blank" rel="noopener noreferrer">
                  {t("tx.view")} <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {state ? (
          <p className="basket-muted basket-small">
            <a href={explorerAddress(state.staking.address)} target="_blank" rel="noopener noreferrer">
              {short(state.staking.address)} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a href={SOURCE("VertexStaking.sol")} target="_blank" rel="noopener noreferrer">
              {t("source")} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <span>{state.staking.codeMatches ? <><Check size={12} aria-hidden="true" /> {t("state.codeMatches")}</> : <><CircleAlert size={12} aria-hidden="true" /> {t("state.codeDiffers")}</>}</span>
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ fee split and module */}
      <section className="basket-panel" aria-labelledby="gov-fee-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("fee.eyebrow")}</p>
            <h2 id="gov-fee-heading">{t("fee.title")}</h2>
          </div>
        </div>
        {state ? (
          <>
            <div className="gov-split" role="img" aria-label={t("fee.splitAria", { buyback: state.splitter.buybackBps / 100, stakers: state.splitter.stakersBps / 100, treasury: state.splitter.treasuryBps / 100 })}>
              <i className="buyback" style={{ width: `${state.splitter.buybackBps / 100}%` }} />
              <i className="stakers" style={{ width: `${state.splitter.stakersBps / 100}%` }} />
              <i className="treasury" style={{ width: `${state.splitter.treasuryBps / 100}%` }} />
            </div>
            <ul className="gov-legend">
              <li><i className="buyback" /> {t("fee.buyback", { pct: state.splitter.buybackBps / 100 })}</li>
              <li><i className="stakers" /> {t("fee.stakers", { pct: state.splitter.stakersBps / 100 })}</li>
              <li><i className="treasury" /> {t("fee.treasury", { pct: state.splitter.treasuryBps / 100 })}</li>
            </ul>
            <dl className="gov-stats">
              <div>
                <dt>{t("fee.pending")}</dt>
                <dd className="mono">{fmtUsdg6(state.splitter.pending)} USDG</dd>
              </div>
              <div>
                <dt>{t("fee.toStakers")}</dt>
                <dd className="mono">{fmtUsdg6(state.splitter.toStakers)} USDG</dd>
              </div>
              <div>
                <dt>{t("fee.source")}</dt>
                <dd>{state.allocator.handedOver ? t("fee.sourceLive") : t("fee.sourcePending")}</dd>
              </div>
            </dl>
            <div className="gov-actions">
              <button type="button" className="hex hex-green" onClick={distribute} disabled={busy || state.splitter.pending === 0n || !wallet}>
                {t("fee.distribute")} <ArrowRight size={14} aria-hidden="true" />
              </button>
              <span className="basket-muted basket-small">{t("fee.anyone")}</span>
            </div>
            {!state.allocator.handedOver ? (
              <div className="gov-form">
                <p className="basket-muted basket-small">{t("handOver.lead")}</p>
                <ol className="gov-steps">
                  <li className={state.allocator.treasuryQueued ? "is-done" : ""}><i /> {t("handOver.step1")}</li>
                  <li className={state.allocator.treasury.toLowerCase() === state.splitter.address.toLowerCase() && state.allocator.owner.toLowerCase() === state.governor.address.toLowerCase() ? "is-done" : ""}><i /> {t("handOver.step2")}</li>
                </ol>
                {isAllocatorOwner ? (
                  <div className="gov-actions">
                    {!(state.allocator.treasuryQueued && state.allocator.ownerQueued) ? (
                      <button type="button" className="hex hex-green" onClick={queueHandOver} disabled={busy}>
                        {t("handOver.queue")} <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    ) : state.allocator.treasuryReady || state.allocator.ownerReady ? (
                      <button type="button" className="hex hex-green" onClick={executeHandOver} disabled={busy}>
                        {t("handOver.execute")} <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="basket-muted basket-small">{t("handOver.waiting")}</span>
                    )}
                  </div>
                ) : (
                  <span className="basket-muted basket-small">{t("handOver.ownerOnly", { owner: short(state.allocator.owner) })}</span>
                )}
              </div>
            ) : null}
            {state.module ? (
              <div className="gov-form">
                <p className="eyebrow">{t("module.eyebrow")}</p>
                <dl className="gov-stats">
                  <div>
                    <dt>{t("module.market")}</dt>
                    <dd>
                      <Link href={`/lending/${lendingModuleMarket().slug}`}>{lendingModuleMarket().name}</Link>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("module.supplied")}</dt>
                    <dd className="mono">{state.module.supplied === null ? t("module.unpriced") : `${fmtUsdg6(state.module.supplied)} USDG`}</dd>
                  </div>
                  <div>
                    <dt>{t("module.status")}</dt>
                    <dd>{state.module.whitelisted ? t("module.whitelisted", { pct: state.module.weightBps / 100 }) : t("module.notWhitelisted")}</dd>
                  </div>
                  <div>
                    <dt>{t("module.allocatorPosition")}</dt>
                    <dd className="mono">{state.module.allocatorValue === null ? t("module.unpriced") : `${fmtUsdg6(state.module.allocatorValue)} USDG`}</dd>
                  </div>
                  <div>
                    <dt>{t("module.open")}</dt>
                    <dd>{state.module.open ? t("module.openYes") : t("module.openNo")}</dd>
                  </div>
                </dl>
                <p className="basket-muted basket-small">
                  <a href={explorerAddress(state.module.address)} target="_blank" rel="noopener noreferrer">
                    {short(state.module.address)} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                  <a href={SOURCE("VertexLendingModule.sol")} target="_blank" rel="noopener noreferrer">
                    {t("source")} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                  <span>{state.module.codeMatches ? <><Check size={12} aria-hidden="true" /> {t("state.codeMatches")}</> : <><CircleAlert size={12} aria-hidden="true" /> {t("state.codeDiffers")}</>}</span>
                </p>
              </div>
            ) : null}
            <p className="basket-muted basket-small">
              <a href={explorerAddress(state.splitter.address)} target="_blank" rel="noopener noreferrer">
                {short(state.splitter.address)} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <a href={SOURCE("VertexFeeSplitter.sol")} target="_blank" rel="noopener noreferrer">
                {t("source")} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <span>{state.splitter.codeMatches ? <><Check size={12} aria-hidden="true" /> {t("state.codeMatches")}</> : <><CircleAlert size={12} aria-hidden="true" /> {t("state.codeDiffers")}</>}</span>
              <span>{t("fee.recipients", { buyback: short(state.splitter.buyback), treasury: short(state.splitter.treasury) })}</span>
            </p>
          </>
        ) : (
          <p className="basket-muted">{t("state.reading")}</p>
        )}
      </section>

      {/* ------------------------------------------------------------ proposals */}
      <section className="basket-panel" aria-labelledby="gov-props-heading" style={{ gridColumn: "1 / -1" }}>
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("props.eyebrow")}</p>
            <h2 id="gov-props-heading">{t("props.title")}</h2>
          </div>
          {state ? (
            <span className="strategy-status">
              <Landmark size={12} aria-hidden="true" /> {t("props.rules", { delay: hours(state.governor.votingDelay), period: hours(state.governor.votingPeriod), quorum: state.governor.quorumBps / 100, threshold: state.governor.thresholdBps / 100 })}
            </span>
          ) : null}
        </div>
        {state ? (
          proposals.length ? (
            <ol className="gov-props">
              {proposals.map((p) => {
                const total = p.forVotes + p.againstVotes + p.abstainVotes;
                const pct = (v: bigint) => (total === 0n ? 0 : Number((v * 10_000n) / total) / 100);
                const canVote = p.state === "Active" && !!me && me.votes > 0n && !p.voted;
                const canCancel = !!wallet && (wallet.toLowerCase() === p.proposer.toLowerCase() || wallet.toLowerCase() === state.governor.guardian.toLowerCase()) && !["Executed", "Canceled"].includes(p.state);
                return (
                  <li key={p.id} className="gov-prop">
                    <div className="gov-prop-head">
                      <span className="mono">#{p.id}</span>
                      <b>{p.description || p.call}</b>
                      <span className={`gov-state is-${p.state.toLowerCase()}`}>{t(`state.${p.state}`)}</span>
                    </div>
                    <div className="gov-prop-call">
                      {p.targetName} · {p.call}
                      {p.viaTimelock ? ` · ${t("props.viaTimelock")}` : ""}
                    </div>
                    <div className="gov-bar" role="img" aria-label={t("props.tallyAria", { for: pct(p.forVotes), against: pct(p.againstVotes), abstain: pct(p.abstainVotes) })}>
                      <i className="for" style={{ width: `${pct(p.forVotes)}%` }} />
                      <i className="against" style={{ width: `${pct(p.againstVotes)}%` }} />
                      <i className="abstain" style={{ width: `${pct(p.abstainVotes)}%` }} />
                    </div>
                    <div className="gov-tally">
                      <span>{t("props.for")}<b className="mono">{fmtVertex(p.forVotes)}</b></span>
                      <span>{t("props.against")}<b className="mono">{fmtVertex(p.againstVotes)}</b></span>
                      <span>{t("props.quorum")}<b className="mono">{p.quorum > 0n ? fmtVertex(p.quorum) : "–"}</b></span>
                    </div>
                    <div className="gov-prop-foot">
                      <span>{p.state === "Pending" ? t("props.opens", { when: when(p.snapshot) }) : t("props.closes", { when: when(p.end) })}</span>
                      <span>{t("props.by", { who: short(p.proposer) })}</span>
                      {canVote ? (
                        <>
                          <button type="button" className="basket-link" disabled={busy} onClick={() => vote(p.id, 1)}>{t("props.voteFor")}</button>
                          <button type="button" className="basket-link" disabled={busy} onClick={() => vote(p.id, 0)}>{t("props.voteAgainst")}</button>
                          <button type="button" className="basket-link" disabled={busy} onClick={() => vote(p.id, 2)}>{t("props.voteAbstain")}</button>
                        </>
                      ) : p.voted && p.state === "Active" ? (
                        <span>{t("props.voted")}</span>
                      ) : null}
                      {p.state === "Succeeded" && wallet ? (
                        <button type="button" className="basket-link" disabled={busy} onClick={() => execute(p)}>{p.viaTimelock ? t("props.queue") : t("props.execute")}</button>
                      ) : null}
                      {p.state === "Queued" && wallet ? (
                        p.allocatorReady ? (
                          <button type="button" className="basket-link" disabled={busy} onClick={() => finalize(p)}>{t("props.finalize")}</button>
                        ) : (
                          <span>{t("props.reviewWindow")}</span>
                        )
                      ) : null}
                      {canCancel ? (
                        <button type="button" className="basket-link" disabled={busy} onClick={() => cancel(p)}>{t("props.cancel")}</button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="basket-muted">{t("props.none")}</p>
          )
        ) : null}
        {state && me ? (
          me.canPropose ? (
            <div className="gov-form">
              <p className="eyebrow">{t("new.eyebrow")}</p>
              <label>
                {t("new.template")}
                <select value={template} disabled={busy} onChange={(e) => setTemplate(e.target.value as Template)}>
                  {state.module ? <option value="module">{t("new.tplModule")}</option> : null}
                  <option value="split">{t("new.tplSplit")}</option>
                  <option value="cap">{t("new.tplCap")}</option>
                </select>
              </label>
              {template === "module" ? (
                <label>
                  {t("new.weight")}
                  <input inputMode="decimal" value={weight} disabled={busy} onChange={(e) => setWeight(e.target.value)} />
                </label>
              ) : template === "split" ? (
                <div className="gov-row">
                  <label>
                    {t("new.buyback")}
                    <input inputMode="decimal" value={split.buyback} disabled={busy} onChange={(e) => setSplit({ ...split, buyback: e.target.value })} />
                  </label>
                  <label>
                    {t("new.stakers")}
                    <input inputMode="decimal" value={split.stakers} disabled={busy} onChange={(e) => setSplit({ ...split, stakers: e.target.value })} />
                  </label>
                  <label>
                    {t("new.treasury")}
                    <input inputMode="decimal" value={split.treasury} disabled={busy} onChange={(e) => setSplit({ ...split, treasury: e.target.value })} />
                  </label>
                </div>
              ) : (
                <label>
                  {t("new.cap")}
                  <input inputMode="decimal" value={cap} disabled={busy} onChange={(e) => setCap(e.target.value)} />
                </label>
              )}
              <label>
                {t("new.description")}
                <textarea value={description} disabled={busy} placeholder={draft?.summary ?? ""} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="gov-actions">
                <button type="button" className="hex hex-green" onClick={propose} disabled={busy || !draft}>
                  {t("new.cta")} <ArrowRight size={14} aria-hidden="true" />
                </button>
                <span className="basket-muted basket-small">{draft ? (draft.draft.viaTimelock ? t("new.timelockNote") : t("new.directNote")) : t("new.invalid")}</span>
              </div>
            </div>
          ) : (
            <p className="basket-muted basket-small">{t("new.threshold", { pct: state.governor.thresholdBps / 100 })}</p>
          )
        ) : null}
        {state ? (
          <p className="basket-muted basket-small">
            <a href={explorerAddress(state.governor.address)} target="_blank" rel="noopener noreferrer">
              {short(state.governor.address)} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a href={SOURCE("VertexGovernor.sol")} target="_blank" rel="noopener noreferrer">
              {t("source")} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <span>{state.governor.codeMatches ? <><Check size={12} aria-hidden="true" /> {t("state.codeMatches")}</> : <><CircleAlert size={12} aria-hidden="true" /> {t("state.codeDiffers")}</>}</span>
            <span>{t("props.guardian", { who: short(state.governor.guardian) })}</span>
            <Link href="/allocator/v1">{t("props.allocatorLink")} <ArrowUpRight size={12} aria-hidden="true" /></Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
