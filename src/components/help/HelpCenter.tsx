"use client";

import Link from "next/link";
import { Activity, ArrowRight, BookOpen, LifeBuoy, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/help.module.css";

type Topic = "Getting started" | "Deposits" | "Withdrawals" | "Transactions" | "Safety";
type Answer = { id: string; topic: Topic; question: string; summary: string; body: string[]; cta: { label: string; href: string } };

const TOPICS: Topic[] = ["Getting started", "Deposits", "Withdrawals", "Transactions", "Safety"];

export const ANSWERS: Answer[] = [
  {
    id: "first-deposit",
    topic: "Getting started",
    question: "What do I need for my first deposit?",
    summary: "Your wallet, USDG, and gas on Robinhood Chain.",
    body: [
      "Choose a vault and read its strategy, fees, availability, and risks before connecting your wallet. A vault provides liquidity to a Stock Token market; its value can fall even while it earns trading fees.",
      "You need USDG and enough ETH for network gas in the same wallet on Robinhood Chain. Tokens on another network are not automatically available here. Check that any funding service supports the exact network and token before making a transfer.",
      "Use the vault’s Deposit tab and review the quote and wallet requests. A token approval and a deposit can be separate steps. Never send tokens directly to a vault contract as a substitute for using the deposit flow.",
    ],
    cta: { label: "Browse vaults", href: "/vaults" },
  },
  {
    id: "connect-wallet",
    topic: "Getting started",
    question: "My wallet is connected, but my balance is missing.",
    summary: "Check the account, network, and confirmation status.",
    body: [
      "Check that the wallet address shown in the app matches the account holding your funds. Select Robinhood Chain in your wallet when prompted. A balance on a different chain will not appear as spendable here.",
      "If you recently transferred funds, check the transaction on the correct network’s explorer and wait for confirmation. Then refresh your balances. Never enter your recovery phrase into a website to fix a connection or balance issue.",
    ],
    cta: { label: "Open portfolio", href: "/portfolio" },
  },
  {
    id: "deposit-amount",
    topic: "Deposits",
    question: "Why is my invested amount different from my deposit?",
    summary: "Understand invested funds, returned tokens, and execution costs.",
    body: [
      "Only the amount needed for the liquidity position is invested. Unused USDG and leftover Stock Tokens can return to your wallet in the same transaction, so your vault position can be smaller than the amount you entered.",
      "Swap fees, price impact, and price changes also affect value. Compare the vault position with returned wallet balances and the transaction receipt rather than treating the difference as a single fee.",
    ],
    cta: { label: "Check wallet and positions", href: "/portfolio" },
  },
  {
    id: "deposit-paused",
    topic: "Deposits",
    question: "Why are deposits temporarily unavailable?",
    summary: "Availability depends on live price checks and vault limits.",
    body: [
      "Deposits depend on the vault’s current limits, oracle checks, network conditions, and pause state. The app checks availability again before wallet approval; an earlier status is not a guarantee that a deposit can proceed.",
      "Stock reference feeds can stop updating outside market hours. Price-dependent actions can pause until fresh pricing returns. Read the message on your vault and check system status before trying again.",
    ],
    cta: { label: "Check system status", href: "/status" },
  },
  {
    id: "withdraw-position",
    topic: "Withdrawals",
    question: "How do I withdraw from a vault?",
    summary: "Start from your position and review what you will receive.",
    body: [
      "Open Portfolio, select your vault position, and use the Withdraw tab on that vault’s page. Review the available withdrawal route, amount, and expected assets before confirming in your wallet.",
      "Some routes return a proportional amount of the underlying tokens rather than only USDG. Converting a Stock Token into USDG depends on pricing and execution conditions. Keep enough ETH available for gas and follow any remaining claim steps shown by the app.",
      "If a withdrawal is unavailable, include the vault name and the exact message in a support request. Support should never ask you to transfer funds to a separate wallet to unlock a withdrawal.",
    ],
    cta: { label: "Find your position", href: "/portfolio" },
  },
  {
    id: "weekend-withdrawal",
    topic: "Withdrawals",
    question: "Can I withdraw when the stock market is closed?",
    summary: "Token withdrawals and USDG conversion have different requirements.",
    body: [
      "The docs describe proportional withdrawals of underlying tokens without waiting for a stock sale. A protected conversion into USDG requires live pricing and may be unavailable when reference feeds are stale.",
      "Use the routes actually offered by your vault. Review the assets you will receive and any recovery or claim steps before signing. See the docs for how price checks and exits work.",
    ],
    cta: { label: "Read about market hours and exits", href: "/docs#oracles" },
  },
  {
    id: "pending-transaction",
    topic: "Transactions",
    question: "My transaction is pending. Should I try again?",
    summary: "Check the existing transaction before submitting another.",
    body: [
      "Open the transaction link from your wallet or the app and check whether it is pending, confirmed, or failed. A wallet approval may complete before the deposit or withdrawal itself.",
      "Avoid repeating the action while its status is uncertain. If it confirmed but the app has not updated, refresh and allow time for balances to catch up. For help, provide the public transaction hash, the vault name, and when the issue started.",
    ],
    cta: { label: "Check for service issues", href: "/status" },
  },
  {
    id: "failed-transaction",
    topic: "Transactions",
    question: "A transaction failed or I rejected the wallet request.",
    summary: "Understand the result before retrying.",
    body: [
      "Rejecting a wallet request before it is submitted cancels that step. If a transaction was submitted and reverted onchain, its intended changes do not take effect, but the network can still charge gas. An earlier token approval may remain in place.",
      "Check the error, your ETH balance for gas, and the vault’s availability. Request a fresh quote before retrying because prices and limits may have changed. Never follow an unsolicited message offering to repair your wallet.",
    ],
    cta: { label: "Review your balances", href: "/portfolio" },
  },
  {
    id: "fees-and-return",
    topic: "Deposits",
    question: "Is fee APR the same as my total return?",
    summary: "Trading fees and changes in position value are different.",
    body: [
      "No. Estimated fee APR annualizes observed trading fees over the stated measurement window. It is not a forecast or a guarantee of your total return.",
      "Your result also depends on Stock Token prices, liquidity-position performance, execution costs, and other changes in value. Vault shares are not principal-protected. Read the fee allocation and strategy explanation before depositing.",
    ],
    cta: { label: "Read the vault and fee guide", href: "/docs" },
  },
  {
    id: "safe-support",
    topic: "Safety",
    question: "How do I recognize a legitimate support request?",
    summary: "Protect your recovery phrase, keys, and wallet approvals.",
    body: [
      `Start from this help center to find the official support destination. Do not trust a direct message just because it uses the ${BRAND.name} name or logo.`,
      "Never share a recovery phrase, private key, password, or login code. Do not sign a wallet transaction or send money to prove ownership, validate your wallet, or unlock support. A transaction hash is public, but it can still reveal your financial activity; only share what is needed.",
      "Keep private account details out of public social posts. If you suspect a security problem, describe its impact privately through the official support channel without including secrets.",
    ],
    cta: { label: "Find support", href: "/help/contact" },
  },
];

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANSWERS.filter((a) => (topic === "all" || a.topic === topic) && (!q || `${a.question} ${a.summary} ${a.body.join(" ")}`.toLowerCase().includes(q)));
  }, [query, topic]);
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{BRAND.nameUpper} / HELP CENTER</p>
          <h1>
            Here to help.
            <br />
            <em>Every step of the way.</em>
          </h1>
          <p className={styles.intro}>From your first deposit to your next withdrawal. Find an answer, understand a transaction, or get in touch.</p>
          <a href="#answers-heading" className={styles.heroLink}>
            Find your answer <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div />
          <LifeBuoy size={24} strokeWidth={0.8} />
          <span>CLARITY. CONFIDENCE. SUPPORT.</span>
        </div>
      </section>
      <nav className={styles.quickLinks} aria-label="Help resources">
        <Link href="/docs">
          <BookOpen size={23} aria-hidden="true" />
          <span>
            <strong>Understand the basics</strong>
            <small>Vaults, fees, and how it works</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link href="/status">
          <Activity size={23} aria-hidden="true" />
          <span>
            <strong>Check system status</strong>
            <small>Current service observations</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link href="/help/contact">
          <LifeBuoy size={23} aria-hidden="true" />
          <span>
            <strong>Get in touch</strong>
            <small>Find the right support channel</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </nav>
      <section className={styles.library} aria-labelledby="answers-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>THE ESSENTIALS</p>
            <h2 id="answers-heading">A little clarity goes a long way.</h2>
          </div>
          <span className={styles.resultCount} role="status">
            {results.length} {results.length === 1 ? "answer" : "answers"}
          </span>
        </div>
        <label className={styles.search}>
          <Search size={21} aria-hidden="true" />
          <span className={styles.srOnly}>Search help articles</span>
          <input type="search" maxLength={200} placeholder="Try “withdraw”, “gas”, or “pending transaction”" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className={styles.filters} role="group" aria-label="Filter help topics">
          <button type="button" aria-pressed={topic === "all"} onClick={() => setTopic("all")}>
            All topics
          </button>
          {TOPICS.map((t) => (
            <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className={styles.answers}>
          {results.length === 0 ? (
            <div className={styles.empty}>
              <h3>No answers match.</h3>
              <p>Try another word, or contact support.</p>
            </div>
          ) : (
            results.map((a) => (
              <details key={a.id} id={a.id} className={styles.answer}>
                <summary>
                  <span>
                    <small>{a.topic}</small>
                    <strong>{a.question}</strong>
                    <span>{a.summary}</span>
                  </span>
                  <Plus size={20} aria-hidden="true" />
                </summary>
                <div className={styles.answerBody}>
                  {a.body.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                  <Link href={a.cta.href}>
                    {a.cta.label}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </details>
            ))
          )}
        </div>
      </section>
      <section className={styles.supportBand}>
        <div>
          <p className={styles.eyebrow}>STILL NEED A HAND?</p>
          <h2>Let’s find the next step.</h2>
          <p>Have the vault name, transaction hash, and the message you saw ready. Never include passwords or wallet recovery information.</p>
        </div>
        <Link className={styles.primaryLink} href="/help/contact">
          Contact support <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
      <aside className={styles.safety}>
        <ShieldCheck size={23} aria-hidden="true" />
        <p>
          <strong>Your keys stay yours.</strong> Never share your recovery phrase or private key. You do not need to sign a transaction or transfer funds to ask for help.
        </p>
      </aside>
    </div>
  );
}
