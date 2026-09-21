"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Layers, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import { useWallet } from "@/components/wallet/WalletProvider";
import { txErrorMessage } from "@/components/vaults/txError";
import { useT } from "@/i18n/client";
import { erc20Abi } from "@/lib/abis";
import { propose } from "@/lib/allocator";
import { ALLOCATOR_V1, ALLOCATOR_V1_LAUNCH, allocatorV1Abi, allocatorV1Address, allocatorV1Artifact, allocatorV1Bytecode, buildAllocate, buildDeallocate, encodeAllocatorDeposit, encodeAllocatorWithdraw, fmtShares12, fmtUsdg6, readAllocatorV1, type AllocatorV1State } from "@/lib/allocator-v1";
import { BRAND } from "@/lib/brand";
import { explorerAddress, explorerTx, publicClient, robinhoodChain, USDG_ADDRESS } from "@/lib/chain";
import { encodeApprove } from "@/lib/managed-vault";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SOURCE_URL = `${BRAND.repoUrl}/blob/main/contracts/VertexAllocatorV1.sol`;
type Step = { label: string; status: "pending" | "running" | "done" | "failed"; hash?: Hex; error?: string };

export function AllocatorV1() {
  const t = useT("allocator");
  const { rows, singles } = useProtocolVaults();
  const { address: wallet, connect, walletClient, chainId, switchChain, available } = useWallet();
  const [address, setAddress] = useState<Address | null>(null);
  const [state, setState] = useState<AllocatorV1State | null>(null);
  const [stateError, setStateError] = useState("");
  const [usdgBalance, setUsdgBalance] = useState<bigint | null>(null);
  const [shareBalance, setShareBalance] = useState<bigint | null>(null);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lastHash, setLastHash] = useState<Hex | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null);
  const [moduleAmount, setModuleAmount] = useState("");
  const busyRef = useRef(false);

  useEffect(() => setAddress(allocatorV1Address()), []);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const s = await readAllocatorV1(address, singles);
      setState(s);
      setStateError("");
    } catch (e) {
      setStateError(e instanceof Error ? e.message : String(e));
    }
    if (!wallet) {
      setUsdgBalance(null);
      setShareBalance(null);
      return;
    }
    const client = publicClient();
    try {
      const [u, s] = await Promise.all([
        client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
        client.readContract({ address, abi: allocatorV1Abi, functionName: "balanceOf", args: [wallet] }) as Promise<bigint>,
      ]);
      setUsdgBalance(u);
      setShareBalance(s);
    } catch {}
  }, [address, wallet, singles]);

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
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(amount)) return null;
    try {
      const v = parseUnits(amount, tab === "deposit" ? 6 : 12);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount, tab]);

  const capLeft = state && state.totalAssets !== null ? (state.depositCap > state.totalAssets ? state.depositCap - state.totalAssets : 0n) : null;
  const overCap = tab === "deposit" && raw !== null && capLeft !== null && raw - (raw * BigInt(state?.depositFeeBps ?? 0)) / 10_000n > capLeft;
  const overBalance = raw !== null && (tab === "deposit" ? usdgBalance !== null && raw > usdgBalance : shareBalance !== null && raw > shareBalance);
  const depositsPaused = !!state && (state.paused || state.totalAssets === null);

  function deposit() {
    if (!address || !wallet || raw === null) return;
    void guarded(async () => {
      const allowance = await publicClient().readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [wallet, address] });
      if (allowance < raw) {
        if (allowance > 0n) await send(USDG_ADDRESS, encodeApprove(address, 0n), t("v1.note.approve"));
        await send(USDG_ADDRESS, encodeApprove(address, raw), t("v1.note.approve"));
      }
      await send(address, encodeAllocatorDeposit(raw, wallet), t("v1.note.confirmDeposit"));
      setNote(t("v1.note.deposited"));
      setAmount("");
    });
  }

  function withdraw() {
    if (!address || !wallet || raw === null) return;
    void guarded(async () => {
      await send(address, encodeAllocatorWithdraw(raw, wallet), t("v1.note.confirmWithdraw"));
      setNote(t("v1.note.withdrawn"));
      setAmount("");
    });
  }

  // Keeper: put idle USDG to work following the v0 model, restricted to the whitelisted targets, one leg at a time.
  const isKeeper = !!state && !!wallet && (wallet.toLowerCase() === state.keeper.toLowerCase() || wallet.toLowerCase() === state.owner.toLowerCase());
  const plan = useMemo(() => {
    if (!state || !rows || state.idle < 10_000_000n) return null;
    const pins = singles.filter((p) => state.targets.some((x) => x.enabled && x.vault.toLowerCase() === p.vault.toLowerCase()));
    const p = propose({ rows, pins, lending: [], profile: "balanced", amount: state.idle });
    const total = state.totalAssets ?? state.idle;
    // Respect the contract's weight limit with a margin, since the router may return part of the budget.
    return p.positions
      .filter((x) => x.kind === "vault" && x.pin)
      .map((x) => {
        const target = state.targets.find((y) => y.kind === "vault" && y.vault.toLowerCase() === x.pin!.vault.toLowerCase())!;
        const room = (total * BigInt(target.maxWeightBps)) / 10_000n - (target.value ?? 0n);
        const budget = x.amount < room ? x.amount : room > 0n ? room : 0n;
        return { pin: x.pin!, target, budget: (budget * 98n) / 100n, score: x.score };
      })
      .filter((x) => x.budget >= 10_000_000n);
  }, [state, rows, singles]);

  function runAllocation() {
    if (!address || !plan || !plan.length) return;
    const initial: Step[] = plan.map((p) => ({ label: t("v1.keeper.step", { symbol: p.pin.symbol, amount: fmtUsdg6(p.budget) }), status: "pending" }));
    setSteps(initial);
    void guarded(async () => {
      for (let i = 0; i < plan.length; i++) {
        const leg = plan[i];
        setSteps((s) => s!.map((x, j) => (j === i ? { ...x, status: "running" } : x)));
        try {
          const { data } = await buildAllocate(address, leg.target, leg.budget);
          const hash = await send(address, data, t("v1.keeper.confirm", { symbol: leg.pin.symbol }));
          setSteps((s) => s!.map((x, j) => (j === i ? { ...x, status: "done", hash } : x)));
        } catch (e) {
          setSteps((s) => s!.map((x, j) => (j === i ? { ...x, status: "failed", error: txErrorMessage(e, t) } : j > i ? { ...x, status: "pending" } : x)));
          throw e;
        }
      }
      setNote(t("v1.keeper.done"));
    });
  }

  function runDeallocate(vault: Address) {
    if (!address || !state) return;
    const target = state.targets.find((x) => x.vault.toLowerCase() === vault.toLowerCase());
    if (!target || target.shares === 0n) return;
    void guarded(async () => {
      const { data, expected, minimum } = await buildDeallocate(address, target, target.shares, state.maxLossBps);
      await send(address, data, t("v1.keeper.confirmExit", { symbol: target.symbol, expected: fmtUsdg6(expected), floor: fmtUsdg6(minimum) }));
      setNote(t("v1.keeper.exited", { symbol: target.symbol }));
    });
  }

  const moduleTargets = state ? state.targets.filter((x) => x.kind === "module" && x.enabled) : [];
  const moduleRaw = useMemo(() => {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(moduleAmount)) return null;
    try {
      const v = parseUnits(moduleAmount, 6);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [moduleAmount]);
  function runModuleAllocation(target: (typeof moduleTargets)[number]) {
    if (!address || !moduleRaw) return;
    void guarded(async () => {
      const { data } = await buildAllocate(address, target, moduleRaw);
      await send(address, data, t("v1.keeper.confirm", { symbol: target.symbol }));
      setNote(t("v1.keeper.done"));
      setModuleAmount("");
    });
  }

  function deploy() {
    if (!walletClient || !wallet) return;
    void guarded(async () => {
      const eligible = singles.filter((p) => {
        const row = rows?.find((r) => r.descriptor.vault.toLowerCase() === p.vault.toLowerCase());
        const assets = row?.snapshot?.assets ? BigInt(row.snapshot.assets) : 0n;
        return assets >= ALLOCATOR_V1_LAUNCH.minTargetAssets;
      });
      if (!eligible.length) throw new Error(t("v1.deploy.noTargets"));
      setNote(t("v1.deploy.confirm"));
      const hash = await walletClient.deployContract({
        abi: allocatorV1Abi,
        bytecode: allocatorV1Bytecode,
        account: wallet,
        chain: robinhoodChain,
        args: [USDG_ADDRESS, wallet, wallet, wallet, wallet, ALLOCATOR_V1_LAUNCH.depositCap, ALLOCATOR_V1_LAUNCH.depositFeeBps, eligible.map((p) => p.vault as Address), eligible.map(() => ALLOCATOR_V1_LAUNCH.maxWeightBps)],
      });
      setLastHash(hash);
      const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 180_000, pollingInterval: 1000 });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(t("error.reverted"));
      setDeployedAddress(receipt.contractAddress);
      setAddress(receipt.contractAddress);
      setNote(t("v1.deploy.done", { address: receipt.contractAddress, block: receipt.blockNumber.toString() }));
    });
  }

  const eligibleForLaunch = singles.filter((p) => {
    const row = rows?.find((r) => r.descriptor.vault.toLowerCase() === p.vault.toLowerCase());
    return row?.snapshot?.assets ? BigInt(row.snapshot.assets) >= ALLOCATOR_V1_LAUNCH.minTargetAssets : false;
  });

  // ------------------------------------------------------------------ not deployed yet
  if (!address) {
    return (
      <div className="basket allocator">
        <section className="basket-panel" aria-labelledby="v1-deploy-heading">
          <div className="basket-panel-head">
            <div>
              <p className="eyebrow">{t("v1.deploy.eyebrow")}</p>
              <h2 id="v1-deploy-heading">{t("v1.deploy.title")}</h2>
            </div>
            <span className="strategy-status">
              <Lock size={12} aria-hidden="true" /> {t("v1.deploy.status")}
            </span>
          </div>
          <p className="basket-muted">{t("v1.deploy.lead")}</p>
          <ul className="alloc-limits">
            <li>{t("v1.deploy.cap", { cap: fmtUsdg6(ALLOCATOR_V1_LAUNCH.depositCap) })}</li>
            <li>{t("v1.deploy.fee", { pct: (ALLOCATOR_V1_LAUNCH.depositFeeBps / 100).toFixed(2) })}</li>
            <li>{t("v1.deploy.exitFee", { pct: (ALLOCATOR_V1_LAUNCH.exitFeeBps / 100).toFixed(2) })}</li>
            <li>{t("v1.deploy.weight", { pct: ALLOCATOR_V1_LAUNCH.maxWeightBps / 100 })}</li>
            <li>{t("v1.deploy.targets", { n: eligibleForLaunch.length, list: eligibleForLaunch.map((p) => p.symbol).join(", ") || "–", floor: usd(Number(formatUnits(ALLOCATOR_V1_LAUNCH.minTargetAssets, 6))) })}</li>
            <li>{t("v1.deploy.roles")}</li>
          </ul>
          <div className="basket-foot">
            <div className="basket-foot-copy" aria-live="polite">
              {error ? <p className="basket-error">{error}</p> : note ? <p>{note}</p> : <p>{t("v1.deploy.foot", { compiler: allocatorV1Artifact.compiler.split("+")[0], hash: allocatorV1Artifact.sourceSha256.slice(0, 12) })}</p>}
              {deployedAddress ? (
                <p>
                  <a href={explorerAddress(deployedAddress)} target="_blank" rel="noopener noreferrer">
                    {deployedAddress} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                </p>
              ) : null}
            </div>
            {!wallet ? (
              <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
                {available ? t("foot.connect") : t("foot.noWallet")}
              </button>
            ) : (
              <button type="button" className="hex hex-green" onClick={deploy} disabled={busy || !rows || eligibleForLaunch.length === 0}>
                {busy ? <span className="managed-progress-spinner" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />} {t("v1.deploy.cta")}
              </button>
            )}
          </div>
          <p className="basket-muted basket-small">
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              {t("v1.source")} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </p>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ deployed
  const total = state?.totalAssets ?? null;
  return (
    <div className="basket allocator">
      <section className="basket-panel" aria-labelledby="v1-state-heading">
        <div className="basket-panel-head">
          <div>
            <p className="eyebrow">{t("v1.state.eyebrow")}</p>
            <h2 id="v1-state-heading">{t("v1.state.title")}</h2>
          </div>
          {state ? (
            <span className={`strategy-status${state.paused ? "" : " strategy-status-live"}`}>
              <i aria-hidden="true" /> {state.paused ? t("v1.state.paused") : depositsPaused ? t("v1.state.waiting") : t("v1.state.live")}
            </span>
          ) : null}
        </div>
        {stateError && !state ? <p className="basket-error">{stateError}</p> : null}
        {state ? (
          <>
            <dl className="v1-stats">
              <div>
                <dt>{t("v1.state.tvl")}</dt>
                <dd className="mono">{total === null ? "–" : `${fmtUsdg6(total)} USDG`}</dd>
              </div>
              <div>
                <dt>{t("v1.state.cap")}</dt>
                <dd className="mono">{fmtUsdg6(state.depositCap)} USDG</dd>
              </div>
              <div>
                <dt>{t("v1.state.price")}</dt>
                <dd className="mono">{state.pricePerShare === null ? "–" : fmtUsdg6(state.pricePerShare)}</dd>
              </div>
              <div>
                <dt>{t("v1.state.fee")}</dt>
                <dd className="mono">{(state.depositFeeBps / 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt>{t("v1.state.idle")}</dt>
                <dd className="mono">{fmtUsdg6(state.idle)} USDG</dd>
              </div>
              <div>
                <dt>{t("v1.state.supply")}</dt>
                <dd className="mono">{fmtShares12(state.totalSupply)} vaUSDG</dd>
              </div>
            </dl>
            <ol className="basket-legs" aria-label={t("v1.targets.aria")}>
              {state.targets.map((x, i) => {
                const weight = total && total > 0n && x.value !== null ? Number((x.value * 10_000n) / total) / 100 : null;
                return (
                  <li key={x.vault} className={`basket-leg alloc-leg${x.enabled ? "" : " is-off"}`}>
                    <span className="basket-rank">{String(i + 1).padStart(2, "0")}</span>
                    {x.kind === "vault" ? <StockLogo symbol={x.symbol} size={36} /> : <span className="alloc-module-icon" aria-hidden="true"><Layers size={18} strokeWidth={1.5} /></span>}
                    <div className="basket-leg-main">
                      <b>{x.kind === "vault" ? t("legs.vault", { symbol: x.symbol }) : t("v1.targets.module", { symbol: x.symbol })}</b>
                      <span>{x.writtenOff ? t("v1.targets.writtenOff") : x.enabled ? t("v1.targets.max", { pct: x.maxWeightBps / 100 }) : t("v1.targets.disabled")}</span>
                    </div>
                    <div className="basket-leg-amount">
                      <b className="mono">{x.value === null ? "–" : `${fmtUsdg6(x.value)} USDG`}</b>
                      <span className="mono">{weight === null ? (x.shares > 0n ? t("v1.targets.unpriced") : "0%") : `${weight.toFixed(1)}%`}</span>
                    </div>
                    <span className="basket-leg-status plan">
                      {isKeeper && x.shares > 0n ? (
                        <button type="button" className="basket-link" disabled={busy} onClick={() => runDeallocate(x.vault)}>
                          {t("v1.keeper.exit")}
                        </button>
                      ) : x.entry ? (
                        <Link href={`/vaults/${x.entry.id}`}>
                          {t("legs.vaultLink")} <ArrowUpRight size={12} aria-hidden="true" />
                        </Link>
                      ) : (
                        <Link href="/governance">
                          {t("v1.targets.moduleLink")} <ArrowUpRight size={12} aria-hidden="true" />
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="basket-muted basket-small">
              <a href={explorerAddress(state.address)} target="_blank" rel="noopener noreferrer">
                {short(state.address)} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
                {t("v1.source")} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <span>{state.codeMatches ? <><Check size={12} aria-hidden="true" /> {t("v1.state.codeMatches")}</> : <><CircleAlert size={12} aria-hidden="true" /> {t("v1.state.codeDiffers")}</>}</span>
              <span>{t("v1.state.roles", { owner: short(state.owner), keeper: short(state.keeper), treasury: short(state.treasury) })}</span>
            </p>
          </>
        ) : (
          <p className="basket-muted">{t("v1.state.reading")}</p>
        )}
      </section>

      <div className="alloc-grid">
        <section className="basket-panel" aria-labelledby="v1-act-heading">
          <div className="basket-panel-head">
            <div>
              <p className="eyebrow">{t("v1.act.eyebrow")}</p>
              <h2 id="v1-act-heading">{tab === "deposit" ? t("v1.act.depositTitle") : t("v1.act.withdrawTitle")}</h2>
            </div>
          </div>
          <div className="alloc-risk v1-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "deposit"} className={tab === "deposit" ? "active" : ""} disabled={busy} onClick={() => { setTab("deposit"); setAmount(""); }}>
              <b>{t("v1.act.deposit")}</b>
              <span>{t("v1.act.depositSub")}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "withdraw"} className={tab === "withdraw" ? "active" : ""} disabled={busy} onClick={() => { setTab("withdraw"); setAmount(""); }}>
              <b>{t("v1.act.withdraw")}</b>
              <span>{t("v1.act.withdrawSub")}</span>
            </button>
          </div>
          <label className="amount-box amount-box-input" htmlFor="v1-amount">
            <div className="amount-box-top">
              <span>{t("plan.amount")}</span>
              <span>
                {t("plan.balance")} <b className="mono">{tab === "deposit" ? (usdgBalance === null ? "–" : fmtUsdg6(usdgBalance)) : shareBalance === null ? "–" : fmtShares12(shareBalance)}</b>
                {(tab === "deposit" ? usdgBalance : shareBalance) !== null ? (
                  <>
                    {" "}
                    ·{" "}
                    <button type="button" className="max-link" disabled={busy} onClick={() => setAmount(tab === "deposit" ? formatUnits(usdgBalance!, 6) : formatUnits(shareBalance!, 12))}>
                      {t("plan.max")}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <div className="wallet-amount-main">
              <input id="v1-amount" inputMode="decimal" placeholder="0.00" disabled={busy} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>{tab === "deposit" ? "USDG" : "vaUSDG"}</span>
            </div>
          </label>
          <div className="basket-foot">
            <div className="basket-foot-copy" aria-live="polite">
              {error ? (
                <p className="basket-error">{error}</p>
              ) : note ? (
                <p>
                  {note}
                  {lastHash ? (
                    <>
                      {" "}
                      <a href={explorerTx(lastHash)} target="_blank" rel="noopener noreferrer">
                        {t("v1.act.tx")} <ArrowUpRight size={12} aria-hidden="true" />
                      </a>
                    </>
                  ) : null}
                </p>
              ) : tab === "deposit" ? (
                <p>{depositsPaused ? (state?.paused ? t("v1.act.pausedNote") : t("v1.act.waitingNote")) : overCap ? t("v1.act.overCap", { left: capLeft === null ? "–" : fmtUsdg6(capLeft) }) : overBalance ? t("foot.overBalance") : raw !== null && state ? t("v1.act.depositNote", { fee: fmtUsdg6((raw * BigInt(state.depositFeeBps)) / 10_000n), net: fmtUsdg6(raw - (raw * BigInt(state.depositFeeBps)) / 10_000n) }) : t("v1.act.depositIdle", { left: capLeft === null ? "–" : fmtUsdg6(capLeft) })}</p>
              ) : (
                <p>{overBalance ? t("v1.act.overShares") : t("v1.act.withdrawNote", { pct: (ALLOCATOR_V1_LAUNCH.exitFeeBps / 100).toFixed(2) })}</p>
              )}
            </div>
            {!wallet ? (
              <button type="button" className="hex hex-green" onClick={() => void connect()} disabled={!available}>
                {available ? t("foot.connect") : t("foot.noWallet")}
              </button>
            ) : tab === "deposit" ? (
              <button type="button" className="hex hex-green" onClick={deposit} disabled={busy || raw === null || overCap || overBalance || depositsPaused}>
                {busy ? <span className="managed-progress-spinner" aria-hidden="true" /> : null} {t("v1.act.depositCta")} <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="hex hex-green" onClick={withdraw} disabled={busy || raw === null || overBalance}>
                {busy ? <span className="managed-progress-spinner" aria-hidden="true" /> : null} {t("v1.act.withdrawCta")} <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        <section className="basket-panel" aria-labelledby="v1-limits-heading">
          <div className="basket-panel-head">
            <div>
              <p className="eyebrow">{t("v1.limits.eyebrow")}</p>
              <h2 id="v1-limits-heading">{t("v1.limits.title")}</h2>
            </div>
          </div>
          <ul className="alloc-limits">
            <li>{t("v1.limits.whitelist")}</li>
            <li>{t("v1.limits.weight")}</li>
            <li>{t("v1.limits.reference")}</li>
            <li>{t("v1.limits.minSize", { floor: state ? usd(Number(formatUnits(state.minTargetAssets, 6))) : "–" })}</li>
            <li>{t("v1.limits.exitLoss", { pct: state ? state.maxLossBps / 100 : "–" })}</li>
            <li>{t("v1.limits.cooldown")}</li>
            <li>{t("v1.limits.daily", { pct: state ? state.maxDailyLossBps / 100 : "–", used: state ? fmtUsdg6(state.dailyLoss) : "–" })}</li>
            <li>{t("v1.limits.resume")}</li>
            <li>{t("v1.limits.cap")}</li>
            <li>{t("v1.limits.inKind")}</li>
            <li>{t("v1.limits.delay")}</li>
          </ul>
          {isKeeper ? (
            <div className="v1-keeper">
              <h3>{t("v1.keeper.title")}</h3>
              {plan && plan.length ? (
                <>
                  <ul className="alloc-hints-list">
                    {(steps ?? plan.map((p): Step => ({ label: t("v1.keeper.step", { symbol: p.pin.symbol, amount: fmtUsdg6(p.budget) }), status: "pending" }))).map((s, i) => (
                      <li key={i} className={`v1-step is-${s.status}`}>
                        {s.status === "done" ? <Check size={13} aria-hidden="true" /> : s.status === "failed" ? <CircleAlert size={13} aria-hidden="true" /> : s.status === "running" ? <RefreshCw size={13} aria-hidden="true" /> : <i aria-hidden="true" />}
                        <span>{s.label}</span>
                        {s.hash ? (
                          <a href={explorerTx(s.hash)} target="_blank" rel="noopener noreferrer">
                            {t("v1.act.tx")} <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                        ) : s.error ? (
                          <em>{s.error}</em>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="hex hex-green" onClick={runAllocation} disabled={busy || depositsPaused}>
                    {t("v1.keeper.run", { n: plan.length })} <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <p className="basket-muted">{state && state.idle < 10_000_000n ? t("v1.keeper.nothingIdle") : t("v1.keeper.noCandidates")}</p>
              )}
              {moduleTargets.length ? (
                <div className="v1-module">
                  <h3>{t("v1.keeper.moduleTitle")}</h3>
                  <div className="amount-box amount-box-input">
                    <div className="amount-box-top">
                      <label htmlFor="v1-module-amount">{t("v1.keeper.moduleAmount")}</label>
                      {state ? (
                        <button type="button" className="max-link" disabled={busy} onClick={() => setModuleAmount(formatUnits(state.idle, 6))}>
                          {t("v1.act.max", { amount: fmtUsdg6(state.idle) })}
                        </button>
                      ) : null}
                    </div>
                    <input id="v1-module-amount" className="wallet-amount-main" inputMode="decimal" placeholder="0" value={moduleAmount} disabled={busy} onChange={(e) => setModuleAmount(e.target.value.replace(/,/g, "."))} />
                  </div>
                  <div className="gov-actions">
                    {moduleTargets.map((m) => (
                      <button key={m.vault} type="button" className="hex hex-green" onClick={() => runModuleAllocation(m)} disabled={busy || !moduleRaw || !state || moduleRaw > state.idle}>
                        {t("v1.keeper.moduleCta", { symbol: m.symbol })} <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      {ALLOCATOR_V1.address === null && address ? <p className="basket-muted basket-small">{t("v1.state.preview", { address })}</p> : null}
    </div>
  );
}
