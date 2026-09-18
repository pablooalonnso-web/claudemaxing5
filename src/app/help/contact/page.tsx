import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ClipboardList, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/help.module.css";

export const metadata: Metadata = { title: `Contact support · ${BRAND.name}` };

const PORTAL = process.env.NEXT_PUBLIC_SUPPORT_URL;
const SUPPORT_URL = PORTAL ?? BRAND.xUrl;

export default function HelpContactPage() {
  const host = new URL(SUPPORT_URL).host;
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.contactPage}>
        <Link className={styles.back} href="/help">
          <ArrowLeft size={16} aria-hidden="true" /> Help center
        </Link>
        <header className={styles.contactHeading}>
          <p className={styles.eyebrow}>A LITTLE CONTEXT HELPS</p>
          <h1>
            Tell us what
            <br />
            <em>happened.</em>
          </h1>
          <p>Find the next step for a deposit, withdrawal, or wallet issue. Keep sensitive account details out of public posts.</p>
        </header>
        <div className={styles.contactGrid}>
          <section className={styles.contactCard} aria-labelledby="ticket-heading">
            <ClipboardList size={28} aria-hidden="true" />
            <h2 id="ticket-heading">{PORTAL ? "Open a support ticket" : "Message us on X"}</h2>
            <p>
              {PORTAL
                ? "Continue to our support portal to submit a request or access an existing ticket."
                : `Direct messages to @${BRAND.xHandle} are open. Send the details on the right and we reply from the same account.`}
            </p>
            <a href={SUPPORT_URL} className={styles.primaryLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              {PORTAL ? "Continue to support" : `Open @${BRAND.xHandle} on X`} <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <small className={styles.destination}>Opens {host} in a new tab. We never ask for a recovery phrase, private key or password.</small>
          </section>
          <section className={styles.prepare} aria-labelledby="prepare-heading">
            <p className={styles.eyebrow}>BEFORE YOU GET IN TOUCH</p>
            <h2 id="prepare-heading">The details that help.</h2>
            <ol>
              <li>
                <strong>What you were trying to do</strong>
                <p>A deposit, withdrawal, connection, or something else.</p>
              </li>
              <li>
                <strong>Where it happened</strong>
                <p>The vault name and page, approximate time, and your browser or device.</p>
              </li>
              <li>
                <strong>What you saw</strong>
                <p>The exact message and public transaction hash, if available. Share only what is needed.</p>
              </li>
            </ol>
            <Link href="/help">Find an answer in the help center →</Link>
          </section>
        </div>
        <aside className={styles.safety}>
          <ShieldCheck size={23} aria-hidden="true" />
          <p>
            <strong>Support never needs your wallet secrets.</strong> Do not share recovery phrases, private keys, passwords, or verification codes. Do not send funds or sign wallet transactions to receive support.
          </p>
        </aside>
      </div>
      <SiteFooter />
    </main>
  );
}
