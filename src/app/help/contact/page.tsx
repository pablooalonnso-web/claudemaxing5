import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ClipboardList, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/help.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("help");
  return { title: `${t("contact.meta.title")} · ${BRAND.name}` };
}

const PORTAL = process.env.NEXT_PUBLIC_SUPPORT_URL;
const SUPPORT_URL = PORTAL ?? BRAND.xUrl;

export default async function HelpContactPage() {
  const t = await getT("help");
  const host = new URL(SUPPORT_URL).host;
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.contactPage}>
        <Link className={styles.back} href="/help">
          <ArrowLeft size={16} aria-hidden="true" /> {t("contact.back")}
        </Link>
        <header className={styles.contactHeading}>
          <p className={styles.eyebrow}>{t("contact.eyebrow")}</p>
          <h1>
            {t("contact.title.before")}
            <br />
            <em>{t("contact.title.em")}</em>
          </h1>
          <p>{t("contact.intro")}</p>
        </header>
        <div className={styles.contactGrid}>
          <section className={styles.contactCard} aria-labelledby="ticket-heading">
            <ClipboardList size={28} aria-hidden="true" />
            <h2 id="ticket-heading">{PORTAL ? t("contact.ticket.title.portal") : t("contact.ticket.title.x")}</h2>
            <p>{PORTAL ? t("contact.ticket.body.portal") : t("contact.ticket.body.x", { handle: BRAND.xHandle })}</p>
            <a href={SUPPORT_URL} className={styles.primaryLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              {PORTAL ? t("contact.ticket.cta.portal") : t("contact.ticket.cta.x", { handle: BRAND.xHandle })} <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <small className={styles.destination}>{t("contact.ticket.destination", { host })}</small>
          </section>
          <section className={styles.prepare} aria-labelledby="prepare-heading">
            <p className={styles.eyebrow}>{t("contact.prepare.eyebrow")}</p>
            <h2 id="prepare-heading">{t("contact.prepare.title")}</h2>
            <ol>
              <li>
                <strong>{t("contact.prepare.1.title")}</strong>
                <p>{t("contact.prepare.1.body")}</p>
              </li>
              <li>
                <strong>{t("contact.prepare.2.title")}</strong>
                <p>{t("contact.prepare.2.body")}</p>
              </li>
              <li>
                <strong>{t("contact.prepare.3.title")}</strong>
                <p>{t("contact.prepare.3.body")}</p>
              </li>
            </ol>
            <Link href="/help">{t("contact.prepare.link")}</Link>
          </section>
        </div>
        <aside className={styles.safety}>
          <ShieldCheck size={23} aria-hidden="true" />
          <p>
            <strong>{t("contact.safety.strong")}</strong>
            {t("contact.safety.body")}
          </p>
        </aside>
      </div>
      <SiteFooter />
    </main>
  );
}
