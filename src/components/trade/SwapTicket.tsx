"use client";

import Link from "next/link";
import { ArrowLeftRight, Check, Crosshair, RefreshCw, Timer, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { erc20Abi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { explorerTx, publicClient, robinhoodChain } from "@/lib/chain";
import { describeTxError } from "@/lib/managed-vault";
import { TRADE_TOKENS, type QuotesResponse, type TradeQuote, type TradeToken } from "@/lib/trade-tokens";
import styles from "@/styles/trade.module.css";

const PROVIDERS = [
  { id: "kyber", name: "KyberSwap", logo: "/brands/kyberswap.svg" },
  { id: "zero-x", name: "0x", logo: "/brands/zero-x.svg" },
  { id: "nordstern", name: "Nordstern", logo: "/brands/nordstern.svg" },
  { id: "enso", name: "Enso", logo: "/brands/enso.png" },
];

const fmtAmount = (raw: bigint | string | null | undefined, decimals: number) => {
  if (raw === null || raw === undefined) return "–";
  const n = Number(formatUnits(BigInt(raw), decimals));
  return n.toLocaleString(undefined, { maximumSignificantDigits: 7 });
};

/** Translated display name; imported tokens keep the on-chain name. */
const tokenName = (t: TFunction, asset: TradeToken) => (asset.nameKey ? t(asset.nameKey, { name: asset.baseName ?? asset.symbol, brand: BRAND.name }) : asset.name);

function TokenMark({ asset }: { asset: TradeToken }) {
  const src = asset.logoUrl || (asset.native ? "/brands/eth.svg" : "");
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={styles.tokenMark}>{src ? <img src={src} alt="" /> : asset.symbol.slice(0, 2)}</span>;
}

function TokenButton({ asset, onClick }: { asset: TradeToken; onClick: () => void }) {
  const t = useT("trade");
  return (
    <button className={styles.tokenButton} type="button" onClick={onClick}>
      <TokenMark asset={asset} />
      <span>
        <b>{asset.symbol}</b>
        <small>{tokenName(t, asset)}</small>
      </span>
      <i aria-hidden="true">⌄</i>
    </button>
  );
}

function TokenPicker({ title, tokens, excluded, onSelect, onClose, onImport }: { title: string; tokens: TradeToken[]; excluded?: string; onSelect: (t: TradeToken) => void; onClose: () => void; onImport: (t: TradeToken) => void }) {
  const t = useT("trade");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "core" | "stock">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const list = tokens.filter((t) => (category === "all" || t.category === category) && (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)));
  const importable = isAddress(query.trim()) && !tokens.some((t) => t.address.toLowerCase() === query.trim().toLowerCase()) ? query.trim() : null;
  async function importToken() {
    if (!importable) return;
    setBusy(true);
    setError("");
    try {
      const client = publicClient();
      const address = importable as Address;
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address, abi: erc20Abi, functionName: "name" }),
        client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      const token: TradeToken = { address, symbol, name, decimals, category: "imported" };
      onImport(token);
      onSelect(token);
      onClose();
    } catch {
      setError(t("picker.importError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.pickerBackdrop} role="presentation" onClick={onClose}>
      <section className={styles.picker} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span>{t("picker.chain")}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("picker.close")}>
            ×
          </button>
        </header>
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input autoFocus placeholder={t("picker.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("picker.searchAria")} />
        </label>
        <div className={styles.filters}>
          {(["all", "core", "stock"] as const).map((c) => (
            <button key={c} type="button" className={category === c ? styles.activeFilter : ""} onClick={() => setCategory(c)}>
              {c === "all" ? t("picker.filter.all") : c === "core" ? t("picker.filter.core") : t("picker.filter.stock")}
            </button>
          ))}
        </div>
        <div className={styles.tokenList}>
          {list
            .filter((tok) => tok.address.toLowerCase() !== excluded?.toLowerCase())
            .map((tok) => (
              <button key={tok.address} type="button" onClick={() => onSelect(tok)}>
                <TokenMark asset={tok} />
                <span>
                  <b>{tok.symbol}</b>
                  <small>{tokenName(t, tok)}</small>
                </span>
                <em>{tok.category === "stock" ? t("picker.cat.stock") : tok.category === "imported" ? t("picker.cat.imported") : t("picker.cat.crypto")}</em>
              </button>
            ))}
          {importable ? (
            <button type="button" className={styles.importToken} disabled={busy} onClick={() => void importToken()}>
              <span>＋</span>
              <span>
                <b>{busy ? t("picker.importing") : t("picker.import")}</b>
                <small>{importable}</small>
              </span>
            </button>
          ) : null}
          {!list.length && !importable ? <p>{t("picker.noMatch")}</p> : null}
        </div>
        {error ? <p className={styles.pickerError}>{error}</p> : null}
        <footer>
          <small>{t("picker.footer")}</small>
        </footer>
      </section>
    </div>
  );
}

const MIN_GAS_RESERVE = 100_000_000_000_000n; // 0.0001 ETH

export function SwapTicket() {
  const t = useT("trade");
  const { address: owner, ready, connect, walletClient, chainId, switchChain } = useWallet();
  const [tokens, setTokens] = useState<TradeToken[]>(TRADE_TOKENS);
  const [tokenIn, setTokenIn] = useState<TradeToken>(TRADE_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<TradeToken>(TRADE_TOKENS[1]);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [picker, setPicker] = useState<"in" | "out" | null>(null);
  const [balance, setBalance] = useState<{ key: string; value: bigint; reserve: bigint } | null>(null);
  const [quotes, setQuotes] = useState<QuotesResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex | null>(null);
  const busyRef = useRef(false);

  const amountRaw = useMemo(() => {
    try {
      return /^\d*(\.\d*)?$/.test(amount) && amount && amount !== "." ? parseUnits(amount, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, tokenIn.decimals]);
  const tooPrecise = (amount.split(".")[1]?.length ?? 0) > tokenIn.decimals;
  const balanceKey = `${owner ?? ""}:${tokenIn.address}`;

  const readBalance = useCallback(async () => {
    if (!owner) return setBalance(null);
    const client = publicClient();
    try {
      const value = tokenIn.native ? await client.getBalance({ address: owner }) : await client.readContract({ address: tokenIn.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
      const reserve = tokenIn.native ? (await client.getGasPrice()) * 1_000_000n * 2n : 0n;
      setBalance({ key: balanceKey, value, reserve: reserve > MIN_GAS_RESERVE ? reserve : tokenIn.native ? MIN_GAS_RESERVE : 0n });
    } catch {
      setBalance(null);
    }
  }, [owner, tokenIn, balanceKey]);

  useEffect(() => {
    void readBalance();
    const timer = setInterval(readBalance, 15_000);
    window.addEventListener("focus", readBalance);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", readBalance);
    };
  }, [readBalance]);

  const bal = balance?.key === balanceKey ? balance : null;
  const spendable = bal ? (bal.value > bal.reserve ? bal.value - bal.reserve : 0n) : null;
  const exceedsBalance = bal !== null && amountRaw > bal.value;
  const needsGas = bal !== null && !exceedsBalance && spendable !== null && amountRaw > spendable;

  // Quotes
  useEffect(() => {
    if (busy) return;
    if (tokenIn.address === tokenOut.address || amountRaw <= 0n) {
      setQuotes(null);
      setQuoteError("");
      setCountdown(10);
      return;
    }
    const ctrl = new AbortController();
    setQuoting(true);
    setQuoteError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountRaw.toString() });
        const res = await fetch(`/api/trade/quotes?${params}`, { cache: "no-store", signal: ctrl.signal });
        const json = (await res.json()) as { data?: QuotesResponse; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || t("quote.unavailable"));
        if (ctrl.signal.aborted) return;
        setQuotes(json.data);
        setCountdown(10);
        setSelected((s) => (s && json.data!.quotes.some((q) => q.providerId === s) ? s : json.data!.quotes[0]?.providerId ?? null));
        if (!json.data.quotes.length) setQuoteError(t("quote.noRoute"));
      } catch {
        if (!ctrl.signal.aborted) {
          setQuotes(null);
          setQuoteError(t("quote.retry"));
        }
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [amountRaw, tokenIn.address, tokenOut.address, refreshTick, busy, t]);

  useEffect(() => {
    if (!quotes || busy) return;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [quotes, busy]);
  useEffect(() => {
    if (countdown === 0 && quotes && !busy) {
      setCountdown(10);
      setRefreshTick((t) => t + 1);
    }
  }, [countdown, quotes, busy]);

  const quote: TradeQuote | null = quotes?.quotes.find((q) => q.providerId === selected) ?? quotes?.quotes[0] ?? null;
  const slippageBps = Math.min(5000, Math.max(1, Math.round((Number(slippage) || 0.5) * 100)));
  const minReceived = quote ? (BigInt(quote.netAmountOutRaw) * BigInt(10_000 - slippageBps)) / 10_000n : 0n;
  const rate = quote && Number(amount) > 0 ? Number(formatUnits(BigInt(quote.netAmountOutRaw), tokenOut.decimals)) / Number(amount) : null;
  const canSwap = !!owner && !!quote?.executable && amountRaw > 0n && !exceedsBalance && !needsGas && !tooPrecise && !quoting;

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuotes(null);
    setAmount("");
  }

  async function swap() {
    if (!owner || !walletClient || !quote?.routeSummary || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setHash(null);
    setMessage(t("swap.preparing"));
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const res = await fetch("/api/trade/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: quote.routeSummary, sender: owner, recipient: owner, slippageBps }) });
      const json = (await res.json()) as { data?: { data: Hex; routerAddress: Address; amountOut: string }; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || t("swap.buildFailed"));
      const client = publicClient();
      const router = json.data.routerAddress;
      if (!tokenIn.native) {
        const allowance = await client.readContract({ address: tokenIn.address as Address, abi: erc20Abi, functionName: "allowance", args: [owner, router] });
        if (allowance < amountRaw) {
          setMessage(t("swap.approve"));
          const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, amountRaw] });
          const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to: tokenIn.address as Address, data });
          await client.waitForTransactionReceipt({ hash: tx });
        }
      }
      const value = tokenIn.native ? amountRaw : 0n;
      const gas = await client.estimateGas({ account: owner, to: router, data: json.data.data, value });
      setMessage(t("swap.confirm"));
      const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to: router, data: json.data.data, value, gas: (gas * 125n + 99n) / 100n });
      setHash(tx);
      setMessage(t("swap.waiting"));
      const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error(t("swap.reverted"));
      setMessage(t("swap.confirmed", { amount: fmtAmount(json.data.amountOut, tokenOut.decimals), symbol: tokenOut.symbol }));
      setAmount("");
      await readBalance();
    } catch (e) {
      setMessage("");
      setError(describeTxError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const providerState = (id: string): { label: string; state?: string } => {
    if (quoting) return { label: t("provider.comparing"), state: "pending" };
    if (!quotes) return { label: t("provider.ready") };
    if (id === "kyber") return quotes.quotes.some((q) => q.providerId === id) ? { label: t("provider.quoteReady"), state: "available" } : { label: t("provider.noRoute"), state: "no-route" };
    return { label: t("provider.unavailable"), state: "not-configured" };
  };

  return (
    <div className={`${styles.workspace} ${styles.swapWorkspace}`}>
      <section className={styles.ticket}>
        <header className={styles.ticketHead}>
          <div>
            <h2>{t("ticket.title")}</h2>
            <p>{t("ticket.subtitle")}</p>
          </div>
          <span className={`${styles.status} ${quoting ? styles.pending : ""}`}>{quoting ? t("ticket.quoting") : t("ticket.ready")}</span>
        </header>
        <fieldset className={styles.tradeFields} disabled={busy}>
          <div className={styles.pairFields}>
            <div className={styles.field}>
              <span>{t("ticket.youPay")}</span>
              <div className={styles.assetField}>
                <input inputMode="decimal" placeholder="0.00" aria-label={t("ticket.inputAria")} aria-invalid={exceedsBalance || tooPrecise} aria-describedby="balance-feedback" value={amount} onChange={(e) => /^\d*(\.\d*)?$/.test(e.target.value) && setAmount(e.target.value)} />
                <TokenButton asset={tokenIn} onClick={() => setPicker("in")} />
              </div>
              <div className={styles.balanceRow}>
                {owner ? (
                  <>
                    <span>
                      <Wallet size={14} strokeWidth={1.5} aria-hidden="true" />
                      {t("ticket.balance")} {bal ? fmtAmount(bal.value, tokenIn.decimals) : "…"} {tokenIn.symbol}
                    </span>
                    <span className={styles.amountShortcuts}>
                      {[25, 50, 100].map((p) => (
                        <button key={p} type="button" disabled={spendable === null} onClick={() => spendable !== null && setAmount(formatUnits((spendable * BigInt(p)) / 100n, tokenIn.decimals))}>
                          {p === 100 ? t("ticket.max") : `${p}%`}
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  <span>
                    <Wallet size={14} strokeWidth={1.5} aria-hidden="true" />
                    {t("ticket.connectToSee")}
                  </span>
                )}
              </div>
              <div id="balance-feedback" className={styles.balanceFeedback} aria-live="polite">
                {tooPrecise ? <span className={styles.balanceError}>{t("ticket.tooPrecise", { symbol: tokenIn.symbol })}</span> : exceedsBalance ? <span className={styles.balanceError}>{t("ticket.exceeds")}</span> : needsGas ? <span className={styles.balanceError}>{t("ticket.needsGas")}</span> : null}
              </div>
            </div>
            <button className={styles.flip} type="button" aria-label={t("ticket.flipAria")} onClick={flip}>
              ↓
            </button>
            <div className={styles.field}>
              <span>{t("ticket.youReceive")}</span>
              <div className={styles.assetField}>
                <strong className={styles.output}>{quote ? fmtAmount(quote.netAmountOutRaw, tokenOut.decimals) : "–"}</strong> <TokenButton asset={tokenOut} onClick={() => setPicker("out")} />
              </div>
            </div>
          </div>
          <div className={styles.slippage}>
            <span>{t("ticket.slippage")}</span>
            {["0.1", "0.5", "1.0"].map((s) => (
              <button key={s} type="button" className={slippage === s ? styles.activeFilter : ""} onClick={() => setSlippage(s)}>
                {s}%
              </button>
            ))}
            <label>
              <input inputMode="decimal" aria-label={t("ticket.customSlippage")} value={slippage} onChange={(e) => /^\d*(\.\d*)?$/.test(e.target.value) && setSlippage(e.target.value)} />
              <b>%</b>
            </label>
          </div>
          <dl className={styles.executionDetails}>
            <div>
              <dt>{t("ticket.minReceived")}</dt>
              <dd>{quote ? `${fmtAmount(minReceived, tokenOut.decimals)} ${tokenOut.symbol}` : "–"}</dd>
            </div>
            <div>
              <dt>{t("ticket.rate")}</dt>
              <dd>{rate !== null ? `1 ${tokenIn.symbol} ≈ ${rate.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${tokenOut.symbol}` : "–"}</dd>
            </div>
            <div>
              <dt>{t("ticket.selectedRoute")}</dt>
              <dd>{quote ? `${quote.providerName}${quotes ? ` · ${t("ticket.refreshIn", { seconds: countdown })}` : ""}` : t("ticket.comparing")}</dd>
            </div>
          </dl>
        </fieldset>
        {quoteError ? <p className={`${styles.message} ${styles.error}`}>{quoteError}</p> : null}
        {owner ? (
          <button className={`btn btn-primary ${styles.submit}`} type="button" disabled={!canSwap || busy} onClick={() => void swap()}>
            {busy ? t("ticket.working") : quote && !quote.executable ? t("ticket.notExecutable") : t("ticket.swap")}
          </button>
        ) : (
          <button className="wallet-button wallet-button-large" type="button" disabled={!ready} onClick={() => void connect()}>
            <Wallet size={18} strokeWidth={1.5} aria-hidden="true" />
            {t("ticket.connect")}
          </button>
        )}
        {message ? (
          <p className={styles.message}>
            {message}{" "}
            {hash ? (
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                {t("ticket.viewTx")}
              </a>
            ) : null}
          </p>
        ) : null}
        {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}
      </section>
      <aside className={styles.providers} aria-labelledby="provider-title">
        <header>
          <div>
            <p className="eyebrow">{t("providers.eyebrow")}</p>
            <h3 id="provider-title">{t("providers.title")}</h3>
          </div>
          <div className={styles.quoteFreshness}>
            <span>{t("providers.count", { count: PROVIDERS.length })}</span>
            <button type="button" disabled={!quotes || quoting} aria-label={t("providers.refreshNow")} title={t("providers.refreshNow")} onClick={() => setRefreshTick((n) => n + 1)}>
              <RefreshCw size={14} aria-hidden="true" />
              {t("providers.refresh")}
            </button>
          </div>
        </header>
        {!quotes || quotes.quotes.length === 0 ? (
          <div className={styles.providerEmpty}>
            <div className={styles.providerLogoStrip}>
              {PROVIDERS.map((p) => (
                <span key={p.id} className={styles.providerMark} data-provider={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.logo} width={28} height={28} alt="" />
                </span>
              ))}
            </div>
            <b>{quoting ? t("providers.finding") : t("providers.fourOne")}</b>
            <p>{quoting ? t("providers.comparingLive") : t("providers.enterAmount")}</p>
          </div>
        ) : null}
        <div className={styles.quoteList}>
          {(quotes?.quotes ?? []).map((q, i) => {
            const p = PROVIDERS.find((x) => x.id === q.providerId);
            const isSelected = selected === q.providerId;
            return (
              <button key={q.providerId} type="button" disabled={quoting || !q.executable} aria-pressed={isSelected} className={isSelected ? styles.selectedQuote : ""} onClick={() => setSelected(q.providerId)}>
                <span className={styles.providerMark} data-provider={q.providerId}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p?.logo ?? "/brands/uniswap.svg"} width={28} height={28} alt="" />
                </span>
                <span className={styles.quoteIdentity}>
                  <b>{q.providerName}</b>
                  <small>{q.note ?? t("providers.aggregated")}</small>
                </span>
                <span className={styles.quoteValue}>
                  {i === 0 ? <strong>{t("providers.best")}</strong> : null}
                  <b>
                    {fmtAmount(q.netAmountOutRaw, tokenOut.decimals)} <small>{tokenOut.symbol}</small>
                  </b>
                  <small>{q.executable ? (isSelected ? t("providers.selected") : t("providers.select")) : t("providers.quoteOnly")}</small>
                </span>
                <span className={styles.quoteCheck} aria-hidden="true">
                  {isSelected ? <Check size={12} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.providerStates}>
          {PROVIDERS.map((p) => {
            const st = providerState(p.id);
            return (
              <div key={p.id} data-state={st.state}>
                <span className={styles.providerMark} data-provider={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.logo} width={28} height={28} alt="" />
                </span>
                <span>
                  <b>{p.name}</b>
                  <small>
                    <i />
                    {st.label}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
        <p className={styles.providerFootnote}>{t("providers.footnote")}</p>
      </aside>
      {picker ? (
        <TokenPicker
          title={picker === "in" ? t("ticket.youPay") : t("ticket.youReceive")}
          tokens={tokens}
          excluded={picker === "in" ? tokenOut.address : tokenIn.address}
          onImport={(t) => setTokens((list) => (list.some((x) => x.address.toLowerCase() === t.address.toLowerCase()) ? list : [...list, t]))}
          onSelect={(t) => {
            if (picker === "in") {
              if (t.address === tokenOut.address) setTokenOut(tokenIn);
              setTokenIn(t);
            } else {
              if (t.address === tokenIn.address) setTokenIn(tokenOut);
              setTokenOut(t);
            }
            setQuotes(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

export function TradeShell({ children }: { children: React.ReactNode }) {
  const t = useT("trade");
  return (
    <div className={`wrap ${styles.shell}`}>
      <section className={`masthead masthead-bleed ${styles.tradeMast}`}>
        <div className={`masthead-inner ${styles.tradeHead}`}>
          <div className={styles.tradeIntro}>
            <p className="eyebrow">{t("shell.eyebrow", { brand: BRAND.name })}</p>
            <h1>
              {t("shell.title.before")}<em className="serif">{t("shell.title.em")}</em>{t("shell.title.after")}
            </h1>
            <p>{t("shell.intro")}</p>
          </div>
          <nav className={styles.nav} aria-label={t("shell.nav.aria")}>
            <Link aria-current="page" href="/trade/swap">
              <span className={styles.navNumber}>01</span>
              <ArrowLeftRight size={18} aria-hidden="true" />
              <span>
                <strong>{t("shell.nav.swap")}</strong>
                <small>{t("shell.nav.swapDesc")}</small>
              </span>
            </Link>
            <button type="button" disabled>
              <span className={styles.navNumber}>02</span>
              <Crosshair size={18} aria-hidden="true" />
              <span>
                <strong>{t("shell.nav.limit")}</strong>
                <small>{t("shell.nav.comingSoon")}</small>
              </span>
            </button>
            <button type="button" disabled>
              <span className={styles.navNumber}>03</span>
              <Timer size={18} aria-hidden="true" />
              <span>
                <strong>{t("shell.nav.twap")}</strong>
                <small>{t("shell.nav.comingSoon")}</small>
              </span>
            </button>
          </nav>
        </div>
      </section>
      {children}
    </div>
  );
}
