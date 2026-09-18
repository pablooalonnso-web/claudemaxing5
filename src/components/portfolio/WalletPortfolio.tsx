"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Copy, LogOut, RefreshCw, Send, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";
import { StockLogo } from "@/components/StockLogo";
import { PortfolioActivity } from "./PortfolioActivity";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
import { erc20Abi, managedVaultAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerAddress, explorerTx, publicClient, robinhoodChain, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { describeTxError } from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";

const money = (raw: bigint) => Number(formatUnits(raw, 6)).toLocaleString(undefined, { style: "currency", currency: "USD" });
const amount = (raw: bigint | null, decimals: number) => (raw === null ? "–" : Number(formatUnits(raw, decimals)).toLocaleString(undefined, { maximumFractionDigits: decimals > 6 ? 6 : decimals }));

function TokenIcon({ token }: { token: "USDG" | "TOKEN" | "ETH" }) {
  if (token === "USDG") {
    return (
      <span className="wallet-token-icon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brands/usdg.png" alt="" />
      </span>
    );
  }
  if (token === "TOKEN") return <span className="wallet-token-icon wallet-token-mark wallet-token-spring wallet-token-letter">{BRAND.token.slice(0, 1)}</span>;
  return <span className="wallet-token-icon wallet-token-mark wallet-token-eth wallet-token-letter">Ξ</span>;
}

type PositionRow = { pin: VaultPin; shares: bigint | null; assets: bigint | null; observedAt: string | null };

function VaultPositions({ owner }: { owner: Address }) {
  const t = useT("portfolio");
  const { singles, rows: snapshots, error } = useProtocolVaults();
  const [rows, setRows] = useState<PositionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const client = publicClient();
      const list = await Promise.all(
        singles.map(async (pin) => {
          try {
            const shares = await client.readContract({ address: pin.vault as Address, abi: managedVaultAbi, functionName: "balanceOf", args: [owner] });
            const snap = snapshots?.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase())?.snapshot;
            const supply = snap?.extras?.totalSupply ? BigInt(snap.extras.totalSupply) : null;
            const total = snap?.assets ? BigInt(snap.assets) : null;
            const assets = supply && total && supply > 0n ? (shares * total) / supply : shares === 0n ? 0n : null;
            return { pin, shares, assets, observedAt: snap?.observedAt ?? null };
          } catch {
            return { pin, shares: null, assets: null, observedAt: null };
          }
        }),
      );
      if (alive) setRows(list);
    };
    void load();
    const timer = setInterval(load, 15_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(BRAND.vaultUpdatedEvent, load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, snapshots]);
  const held = rows?.filter((r) => r.shares !== null && r.shares > 0n) ?? [];
  const pending = !rows || rows.some((r) => r.shares === null || r.assets === null);
  const total = pending ? null : held.reduce((a, r) => a + (r.assets ?? 0n), 0n);
  return (
    <section className="wallet-vault-position managed-portfolio-positions">
      <div className="wallet-section-heading">
        <div>
          <p className="eyebrow">{t("positions.eyebrow")}</p>
          <h2>{t("positions.title")}</h2>
        </div>
        <Link href="/vaults">{t("positions.browse")}</Link>
      </div>
      <div className="wallet-position-value">
        <span>{t("positions.total")}</span>
        <strong className="mono">{total === null ? "–" : money(total)}</strong>
        <small>{t("positions.totalHint")}</small>
      </div>
      {held.map((r) => (
        <Link className="managed-portfolio-row" href={r.pin.href} key={r.pin.vault}>
          <StockLogo symbol={r.pin.symbol} size={36} />
          <span>
            <b>{r.pin.symbol}</b>
            <small>{t("positions.shares", { count: formatUnits(r.shares ?? 0n, 18) })}</small>
          </span>
          <span>
            <b className="mono">{r.assets === null ? "–" : money(r.assets)}</b>
            <small>{r.observedAt ? t("positions.price", { date: new Date(r.observedAt).toLocaleString() }) : t("positions.manage")}</small>
          </span>
        </Link>
      ))}
      {held.length === 0 ? <p role="status">{pending ? t("positions.checking") : t("positions.none")}</p> : null}
      {error ? (
        <p className="fine-print" role="status">
          {t("positions.delayed")}
        </p>
      ) : null}
      <p className="fine-print">{t("positions.note")}</p>
    </section>
  );
}

type AssetInfo = { address: Address | null; decimals: number; symbol: string; balance: bigint };

function TransferForm({ owner, onTransferred }: { owner: Address; onTransferred: () => void }) {
  const t = useT("portfolio");
  const { walletClient, chainId, switchChain } = useWallet();
  const [assetKey, setAssetKey] = useState<"ETH" | "USDG" | "TOKEN" | "custom">("ETH");
  const [custom, setCustom] = useState("");
  const [recipient, setRecipient] = useState("");
  const [value, setValue] = useState("");
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<{ recipient: Address; amount: bigint } | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const busyRef = useRef(false);
  const tokenAddress: Address | null = assetKey === "USDG" ? USDG_ADDRESS : assetKey === "TOKEN" ? TOKEN_ADDRESS : assetKey === "custom" && isAddress(custom) ? getAddress(custom) : null;

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setReview(null);
    setError("");
    if (assetKey !== "ETH" && !tokenAddress) return void setLoading(false);
    setLoading(true);
    (async () => {
      try {
        const client = publicClient();
        const info: AssetInfo = tokenAddress
          ? await Promise.all([
              client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
              client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
              client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
            ]).then(([decimals, balance, symbol]) => ({ address: tokenAddress, decimals, balance, symbol: symbol.slice(0, 20) }))
          : { address: null, decimals: 18, symbol: "ETH", balance: await client.getBalance({ address: owner }) };
        if (!cancelled) setAsset(info);
      } catch {
        if (!cancelled) setError(t("transfer.readError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, assetKey, tokenAddress, tick, t]);

  function prepare() {
    if (!asset) return;
    try {
      if (!isAddress(recipient)) throw new Error(t("transfer.err.invalidRecipient"));
      if (getAddress(recipient) === owner) throw new Error(t("transfer.err.sameAddress"));
      if (!/^\d*(\.\d*)?$/.test(value) || !value || value === ".") throw new Error(t("transfer.err.enterAmount"));
      const raw = parseUnits(value, asset.decimals);
      if (raw <= 0n) throw new Error(t("transfer.err.aboveZero"));
      if (raw > asset.balance) throw new Error(t("transfer.err.exceeds"));
      setReview({ recipient: getAddress(recipient), amount: raw });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("transfer.err.check"));
    }
  }

  async function send() {
    if (!asset || !review || !walletClient || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus(t("transfer.status.confirm"));
    let tx: Hex | null = null;
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const client = publicClient();
      const to = asset.address ?? review.recipient;
      const data = asset.address ? encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [review.recipient, review.amount] }) : undefined;
      const val = asset.address ? 0n : review.amount;
      const gas = await client.estimateGas({ account: owner, to, data, value: val });
      const fees = await client.estimateFeesPerGas();
      const eth = await client.getBalance({ address: owner });
      if (eth < val + gas * fees.maxFeePerGas) throw new Error(t("transfer.err.gas"));
      tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to, data, value: val, gas: (gas * 125n + 99n) / 100n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
      setHash(tx);
      setStatus(t("transfer.status.submitted"));
      const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
      if (receipt.status !== "success") setStatus(t("transfer.status.reverted"));
      else {
        setStatus(t("transfer.status.confirmed"));
        setValue("");
        setReview(null);
        setTick((t) => t + 1);
        onTransferred();
        window.dispatchEvent(new Event(BRAND.vaultUpdatedEvent));
      }
    } catch (e) {
      if (tx) setStatus(t("transfer.status.pending"));
      else {
        setStatus("");
        setError(describeTxError(e));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="wallet-vault-actions wallet-transfer">
      <div className="wallet-section-heading">
        <div>
          <p className="eyebrow">{t("transfer.eyebrow")}</p>
          <h2>{t("transfer.title")}</h2>
        </div>
        <Send size={22} strokeWidth={1.4} aria-hidden="true" />
      </div>
      <p className="wallet-transfer-intro">{t("transfer.intro")}</p>
      <fieldset disabled={busy}>
        <label className="wallet-transfer-label">
          {t("transfer.asset")}
          <select
            value={assetKey}
            onChange={(e) => {
              setAssetKey(e.target.value as typeof assetKey);
              setValue("");
              setReview(null);
            }}
          >
            <option value="ETH">{t("transfer.opt.eth")}</option>
            <option value="USDG">{t("transfer.opt.usdg")}</option>
            <option value="TOKEN">{t("transfer.opt.brand", { brand: BRAND.name })}</option>
            <option value="custom">{t("transfer.opt.custom")}</option>
          </select>
        </label>
        {assetKey === "custom" ? (
          <label className="wallet-transfer-label">
            {t("transfer.contract")}
            <input value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off" />
            {custom && !isAddress(custom) ? <small>{t("transfer.invalidContract")}</small> : null}
          </label>
        ) : null}
        <label className="wallet-transfer-label">
          {t("transfer.recipient")}
          <input
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setReview(null);
            }}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="amount-box amount-box-input">
          <span className="amount-box-top">
            <span>{t("transfer.amount")}</span>
            <span>
              {t("transfer.balance")} {loading ? t("transfer.loading") : asset ? formatUnits(asset.balance, asset.decimals) : "–"} {asset?.symbol}
            </span>
          </span>
          <span className="wallet-amount-main">
            <input
              aria-label={t("transfer.amountAria")}
              inputMode="decimal"
              placeholder="0.00"
              value={value}
              onChange={(e) => {
                if (/^\d*(\.\d*)?$/.test(e.target.value)) {
                  setValue(e.target.value);
                  setReview(null);
                }
              }}
            />
            <span>{asset?.symbol ?? "–"}</span>
          </span>
        </label>
        {asset?.address ? (
          <button
            type="button"
            className="max-link"
            onClick={() => {
              setValue(formatUnits(asset.balance, asset.decimals));
              setReview(null);
            }}
          >
            {t("transfer.useFull")}
          </button>
        ) : null}
      </fieldset>
      <p className="fine-print">{t("transfer.fee")}</p>
      {error ? (
        <p className="wallet-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {review ? (
        <div className="wallet-transfer-review" aria-label={t("transfer.reviewAria")}>
          <span>{t("transfer.youSend")}</span>
          <strong>
            {formatUnits(review.amount, asset?.decimals ?? 18)} {asset?.symbol}
          </strong>
          <span>{t("transfer.to")}</span>
          <code>{review.recipient}</code>
          <small>{t("transfer.feeHint")}</small>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void send()}>
            {busy ? t("transfer.waiting") : t("transfer.confirmCta")}
          </button>
          {!busy ? (
            <button className="wallet-refresh" onClick={() => setReview(null)}>
              {t("transfer.edit")}
            </button>
          ) : null}
        </div>
      ) : (
        <button className="btn btn-primary btn-block" disabled={!asset || loading || !value || !recipient || busy} onClick={prepare}>
          {t("transfer.review")}
        </button>
      )}
      {status ? (
        <div className="wallet-transaction-status" role="status">
          <span>{status}</span>
          {hash ? (
            <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
              {t("transfer.viewTx")} <ArrowUpRight size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function WalletPortfolio() {
  const t = useT("portfolio");
  const { ready, address, connect, disconnect, available, error: walletError } = useWallet();
  const [balances, setBalances] = useState<{ usdg: bigint | null; token: bigint | null; native: bigint | null; tokenDecimals: number }>({ usdg: null, token: null, native: null, tokenDecimals: 18 });
  const [refreshing, setRefreshing] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setRefreshing(true);
    try {
      const client = publicClient();
      const [usdg, token, native, tokenDecimals] = await Promise.all([
        client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }).catch(() => null),
        client.getBalance({ address }),
        client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
      ]);
      setBalances({ usdg, token, native, tokenDecimals });
      setBalanceError("");
    } catch {
      setBalanceError(t("wallet.balanceError"));
    } finally {
      setRefreshing(false);
    }
  }, [address, t]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 30_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(BRAND.vaultUpdatedEvent, refresh);
    };
  }, [refresh]);

  if (!ready) {
    return (
      <section className="wallet-empty-state">
        <span className="wallet-empty-icon wallet-loading">
          <RefreshCw size={25} />
        </span>
        <div>
          <p className="eyebrow">{t("wallet.loadingEyebrow")}</p>
          <h2>{t("wallet.loading")}</h2>
        </div>
      </section>
    );
  }
  if (!address) {
    return (
      <section className="wallet-empty-state">
        <span className="wallet-empty-icon">
          <Wallet size={26} strokeWidth={1.5} />
        </span>
        <div>
          <p className="eyebrow">{t("wallet.eyebrow")}</p>
          <h2>{t("wallet.connectTitle")}</h2>
          <p>{available ? t("wallet.available") : t("wallet.notDetected")}</p>
          {walletError ? <p className="wallet-inline-error">{walletError}</p> : null}
          <button className="btn btn-primary" type="button" onClick={() => void connect()} disabled={!available}>
            {t("wallet.connect")}
          </button>
        </div>
      </section>
    );
  }
  return (
    <div className="wallet-portfolio">
      <section className="wallet-account-card">
        <div className="wallet-account-main">
          <span className="wallet-account-symbol" aria-hidden="true">
            <Wallet size={25} strokeWidth={1.4} />
          </span>
          <div>
            <span className="stat-label">{t("wallet.label")}</span>
            <h2>{t("wallet.connected")}</h2>
            <span className="wallet-address mono">{address}</span>
          </div>
        </div>
        <div className="wallet-account-actions">
          <button
            type="button"
            className="wallet-icon-button"
            onClick={async () => {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? t("wallet.copied") : t("wallet.copy")}
          </button>
          <a className="wallet-icon-button" href={explorerAddress(address)} target="_blank" rel="noreferrer">
            <ArrowUpRight size={15} /> {t("wallet.explorer")}
          </a>
          <button type="button" className="wallet-icon-button wallet-disconnect" onClick={disconnect}>
            <LogOut size={15} /> {t("wallet.disconnect")}
          </button>
        </div>
      </section>
      <section className="wallet-balance-section">
        <div className="wallet-section-heading">
          <div>
            <p className="eyebrow">{t("wallet.balancesEyebrow")}</p>
            <h2>{t("wallet.balancesTitle")}</h2>
          </div>
          <button className="wallet-refresh" type="button" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "wallet-spin" : ""} />
            {t("wallet.refresh")}
          </button>
        </div>
        {balanceError ? <p className="wallet-inline-error">{balanceError}</p> : null}
        <div className="wallet-balance-grid">
          <article>
            <TokenIcon token="USDG" />
            <div>
              <span>USDG</span>
              <strong className="mono">{amount(balances.usdg, 6)}</strong>
              <small>{t("wallet.walletBalance")}</small>
            </div>
          </article>
          <article>
            <TokenIcon token="TOKEN" />
            <div>
              <span>{t("wallet.brandToken", { brand: BRAND.name })}</span>
              <strong className="mono">{amount(balances.token, balances.tokenDecimals)}</strong>
              <small>{t("wallet.protocolToken")}</small>
            </div>
          </article>
          <article>
            <TokenIcon token="ETH" />
            <div>
              <span>ETH</span>
              <strong className="mono">{amount(balances.native, 18)}</strong>
              <small>{t("wallet.gas")}</small>
            </div>
          </article>
        </div>
      </section>
      <div className="wallet-workspace">
        <VaultPositions owner={address} />
        <TransferForm owner={address} onTransferred={refresh} />
      </div>
      <PortfolioActivity owner={address} />
    </div>
  );
}
