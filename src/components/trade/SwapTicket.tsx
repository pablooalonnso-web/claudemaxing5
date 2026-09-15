"use client";

import Link from "next/link";
import { ArrowLeftRight, Check, Crosshair, RefreshCw, Timer, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
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
  if (raw === null || raw === undefined) return "—";
  const n = Number(formatUnits(BigInt(raw), decimals));
  return n.toLocaleString(undefined, { maximumSignificantDigits: 7 });
};

function TokenMark({ asset }: { asset: TradeToken }) {
  const src = asset.logoUrl || (asset.native ? "/brands/eth.svg" : "");
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={styles.tokenMark}>{src ? <img src={src} alt="" /> : asset.symbol.slice(0, 2)}</span>;
}

function TokenButton({ asset, onClick }: { asset: TradeToken; onClick: () => void }) {
  return (
    <button className={styles.tokenButton} type="button" onClick={onClick}>
      <TokenMark asset={asset} />
      <span>
        <b>{asset.symbol}</b>
        <small>{asset.name}</small>
      </span>
      <i aria-hidden="true">⌄</i>
    </button>
  );
}

function TokenPicker({ title, tokens, excluded, onSelect, onClose, onImport }: { title: string; tokens: TradeToken[]; excluded?: string; onSelect: (t: TradeToken) => void; onClose: () => void; onImport: (t: TradeToken) => void }) {
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
      setError("The token could not be imported.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.pickerBackdrop} role="presentation" onClick={onClose}>
      <section className={styles.picker} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span>ROBINHOOD CHAIN</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input autoFocus placeholder="Search name, symbol or paste an address" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tokens" />
        </label>
        <div className={styles.filters}>
          {(["all", "core", "stock"] as const).map((c) => (
            <button key={c} type="button" className={category === c ? styles.activeFilter : ""} onClick={() => setCategory(c)}>
              {c === "all" ? "All" : c === "core" ? "CRYPTO" : "Stock Tokens"}
            </button>
          ))}
        </div>
        <div className={styles.tokenList}>
          {list
            .filter((t) => t.address.toLowerCase() !== excluded?.toLowerCase())
            .map((t) => (
              <button key={t.address} type="button" onClick={() => onSelect(t)}>
                <TokenMark asset={t} />
                <span>
                  <b>{t.symbol}</b>
                  <small>{t.name}</small>
                </span>
                <em>{t.category === "stock" ? "Stock Token" : t.category === "imported" ? "Imported" : "Crypto"}</em>
              </button>
            ))}
          {importable ? (
            <button type="button" className={styles.importToken} disabled={busy} onClick={() => void importToken()}>
              <span>＋</span>
              <span>
                <b>{busy ? "Importing…" : "Import token"}</b>
                <small>{importable}</small>
              </span>
            </button>
          ) : null}
          {!list.length && !importable ? <p>No matching token. Paste its Robinhood Chain contract address to import it.</p> : null}
        </div>
        {error ? <p className={styles.pickerError}>{error}</p> : null}
        <footer>
          <small>Imported tokens are read from the chain and are not reviewed. Check the contract before trading.</small>
        </footer>
      </section>
    </div>
  );
}

const MIN_GAS_RESERVE = 100_000_000_000_000n; // 0.0001 ETH

export function SwapTicket() {
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
    const t = setInterval(readBalance, 15_000);
    window.addEventListener("focus", readBalance);
    return () => {
      clearInterval(t);
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
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountRaw.toString() });
        const res = await fetch(`/api/trade/quotes?${params}`, { cache: "no-store", signal: ctrl.signal });
        const json = (await res.json()) as { data?: QuotesResponse; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || "Quotes are temporarily unavailable.");
        if (ctrl.signal.aborted) return;
        setQuotes(json.data);
        setCountdown(10);
        setSelected((s) => (s && json.data!.quotes.some((q) => q.providerId === s) ? s : json.data!.quotes[0]?.providerId ?? null));
        if (!json.data.quotes.length) setQuoteError("No route is available for this amount. Try another token pair or amount.");
      } catch {
        if (!ctrl.signal.aborted) {
          setQuotes(null);
          setQuoteError("Quotes are temporarily unavailable. Please try again.");
        }
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [amountRaw, tokenIn.address, tokenOut.address, refreshTick, busy]);

  useEffect(() => {
    if (!quotes || busy) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
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
    setMessage("Preparing your swap…");
    try {
      if (chainId !== robinhoodChain.id) await switchChain();
      const res = await fetch("/api/trade/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: quote.routeSummary, sender: owner, recipient: owner, slippageBps }) });
      const json = (await res.json()) as { data?: { data: Hex; routerAddress: Address; amountOut: string }; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "The swap could not be prepared.");
      const client = publicClient();
      const router = json.data.routerAddress;
      if (!tokenIn.native) {
        const allowance = await client.readContract({ address: tokenIn.address as Address, abi: erc20Abi, functionName: "allowance", args: [owner, router] });
        if (allowance < amountRaw) {
          setMessage("Approve the token in your wallet.");
          const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, amountRaw] });
          const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to: tokenIn.address as Address, data });
          await client.waitForTransactionReceipt({ hash: tx });
        }
      }
      const value = tokenIn.native ? amountRaw : 0n;
      const gas = await client.estimateGas({ account: owner, to: router, data: json.data.data, value });
      setMessage("Confirm the swap in your wallet.");
      const tx = await walletClient.sendTransaction({ account: owner, chain: robinhoodChain, to: router, data: json.data.data, value, gas: (gas * 125n + 99n) / 100n });
      setHash(tx);
      setMessage("Waiting for confirmation…");
      const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("Swap reverted; no tokens moved.");
      setMessage(`Swap confirmed. You received about ${fmtAmount(json.data.amountOut, tokenOut.decimals)} ${tokenOut.symbol}.`);
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
    if (quoting) return { label: "Comparing", state: "pending" };
    if (!quotes) return { label: "Ready to compare" };
    if (id === "kyber") return quotes.quotes.some((q) => q.providerId === id) ? { label: "Quote ready", state: "available" } : { label: "No route", state: "no-route" };
    return { label: "Unavailable", state: "not-configured" };
  };

  return (
    <div className={`${styles.workspace} ${styles.swapWorkspace}`}>
      <section className={styles.ticket}>
        <header className={styles.ticketHead}>
          <div>
            <h2>Swap</h2>
            <p>Best price across four Robinhood Chain aggregators.</p>
          </div>
          <span className={`${styles.status} ${quoting ? styles.pending : ""}`}>{quoting ? "Quoting" : "Ready"}</span>
        </header>
        <fieldset className={styles.tradeFields} disabled={busy}>
          <div className={styles.pairFields}>
            <div className={styles.field}>
              <span>You pay</span>
              <div className={styles.assetField}>
                <input inputMode="decimal" placeholder="0.00" aria-label="Input amount" aria-invalid={exceedsBalance || tooPrecise} aria-describedby="balance-feedback" value={amount} onChange={(e) => /^\d*(\.\d*)?$/.test(e.target.value) && setAmount(e.target.value)} />
                <TokenButton asset={tokenIn} onClick={() => setPicker("in")} />
              </div>
              <div className={styles.balanceRow}>
                {owner ? (
                  <>
                    <span>
                      <Wallet size={14} strokeWidth={1.5} aria-hidden="true" />
                      Balance {bal ? fmtAmount(bal.value, tokenIn.decimals) : "…"} {tokenIn.symbol}
                    </span>
                    <span className={styles.amountShortcuts}>
                      {[25, 50, 100].map((p) => (
                        <button key={p} type="button" disabled={spendable === null} onClick={() => spendable !== null && setAmount(formatUnits((spendable * BigInt(p)) / 100n, tokenIn.decimals))}>
                          {p === 100 ? "Max" : `${p}%`}
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  <span>
                    <Wallet size={14} strokeWidth={1.5} aria-hidden="true" />
                    Connect to see balance
                  </span>
                )}
              </div>
              <div id="balance-feedback" className={styles.balanceFeedback} aria-live="polite">
                {tooPrecise ? <span className={styles.balanceError}>Too many decimals for {tokenIn.symbol}.</span> : exceedsBalance ? <span className={styles.balanceError}>Amount exceeds your balance.</span> : needsGas ? <span className={styles.balanceError}>Leave some ETH for the network fee. Use Max to adjust.</span> : null}
              </div>
            </div>
            <button className={styles.flip} type="button" aria-label="Flip token pair" onClick={flip}>
              ↓
            </button>
            <div className={styles.field}>
              <span>You receive</span>
              <div className={styles.assetField}>
                <strong className={styles.output}>{quote ? fmtAmount(quote.netAmountOutRaw, tokenOut.decimals) : "—"}</strong> <TokenButton asset={tokenOut} onClick={() => setPicker("out")} />
              </div>
            </div>
          </div>
          <div className={styles.slippage}>
            <span>Slippage tolerance</span>
            {["0.1", "0.5", "1.0"].map((s) => (
              <button key={s} type="button" className={slippage === s ? styles.activeFilter : ""} onClick={() => setSlippage(s)}>
                {s}%
              </button>
            ))}
            <label>
              <input inputMode="decimal" aria-label="Custom slippage" value={slippage} onChange={(e) => /^\d*(\.\d*)?$/.test(e.target.value) && setSlippage(e.target.value)} />
              <b>%</b>
            </label>
          </div>
          <dl className={styles.executionDetails}>
            <div>
              <dt>Minimum received</dt>
              <dd>{quote ? `${fmtAmount(minReceived, tokenOut.decimals)} ${tokenOut.symbol}` : "—"}</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>{rate !== null ? `1 ${tokenIn.symbol} ≈ ${rate.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${tokenOut.symbol}` : "—"}</dd>
            </div>
            <div>
              <dt>Selected route</dt>
              <dd>{quote ? `${quote.providerName}${quotes ? ` · refresh in ${countdown}s` : ""}` : quoting ? "Comparing aggregators" : "Comparing aggregators"}</dd>
            </div>
          </dl>
        </fieldset>
        {quoteError ? <p className={`${styles.message} ${styles.error}`}>{quoteError}</p> : null}
        {owner ? (
          <button className={`btn btn-primary ${styles.submit}`} type="button" disabled={!canSwap || busy} onClick={() => void swap()}>
            {busy ? "Working…" : quote && !quote.executable ? "Route not executable" : "Swap"}
          </button>
        ) : (
          <button className="wallet-button wallet-button-large" type="button" disabled={!ready} onClick={() => void connect()}>
            <Wallet size={18} strokeWidth={1.5} aria-hidden="true" />
            Connect wallet
          </button>
        )}
        {message ? (
          <p className={styles.message}>
            {message}{" "}
            {hash ? (
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            ) : null}
          </p>
        ) : null}
        {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}
      </section>
      <aside className={styles.providers} aria-labelledby="provider-title">
        <header>
          <div>
            <p className="eyebrow">Route competition</p>
            <h3 id="provider-title">Compare every quote</h3>
          </div>
          <div className={styles.quoteFreshness}>
            <span>{PROVIDERS.length} providers</span>
            <button type="button" disabled={!quotes || quoting} aria-label="Refresh quotes now" title="Refresh quotes now" onClick={() => setRefreshTick((t) => t + 1)}>
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
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
            <b>{quoting ? "Finding your best route" : "Four providers. One best price."}</b>
            <p>{quoting ? "Comparing live prices for your trade." : "Enter an amount to compare what you’ll receive."}</p>
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
                  <small>{q.note ?? "Aggregated liquidity"}</small>
                </span>
                <span className={styles.quoteValue}>
                  {i === 0 ? <strong>BEST RETURN</strong> : null}
                  <b>
                    {fmtAmount(q.netAmountOutRaw, tokenOut.decimals)} <small>{tokenOut.symbol}</small>
                  </b>
                  <small>{q.executable ? (isSelected ? "Selected route" : "Select route") : "Quote only"}</small>
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
        <p className={styles.providerFootnote}>Quotes include the protocol fee. Network fees are separate.</p>
      </aside>
      {picker ? (
        <TokenPicker
          title={picker === "in" ? "You pay" : "You receive"}
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
  return (
    <div className={`wrap ${styles.shell}`}>
      <section className={`masthead masthead-bleed ${styles.tradeMast}`}>
        <div className={`masthead-inner ${styles.tradeHead}`}>
          <div className={styles.tradeIntro}>
            <p className="eyebrow">{BRAND.name} Trade · Robinhood Chain</p>
            <h1>
              Trade any token, <em className="serif">your way</em>.
            </h1>
            <p>Compare live aggregators, wait for a target price, or spread execution across a schedule.</p>
          </div>
          <nav className={styles.nav} aria-label="Trading tools">
            <Link aria-current="page" href="/trade/swap">
              <span className={styles.navNumber}>01</span>
              <ArrowLeftRight size={18} aria-hidden="true" />
              <span>
                <strong>Swap</strong>
                <small>Best of four routes</small>
              </span>
            </Link>
            <button type="button" disabled>
              <span className={styles.navNumber}>02</span>
              <Crosshair size={18} aria-hidden="true" />
              <span>
                <strong>Limit</strong>
                <small>Coming Soon</small>
              </span>
            </button>
            <button type="button" disabled>
              <span className={styles.navNumber}>03</span>
              <Timer size={18} aria-hidden="true" />
              <span>
                <strong>TWAP</strong>
                <small>Coming Soon</small>
              </span>
            </button>
          </nav>
        </div>
      </section>
      {children}
    </div>
  );
}
