import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BasketExit } from "@/components/strategies/BasketExit";
import { BasketStrategy } from "@/components/strategies/BasketStrategy";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("strategies");
  return {
    title: `${t("page.metaTitle")} · ${BRAND.name}`,
    description: t("page.metaDescription"),
  };
}

export default async function BasketPage() {
  const t = await getT("strategies");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">
                <Link href="/strategies" className="masthead-back">
                  <ArrowLeft size={13} aria-hidden="true" /> {t("page.back")}
                </Link>
              </p>
              <h1>
                {t("page.title.before")}
                <em className="serif">{t("page.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("page.intro")}</p>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <BasketStrategy />
        <BasketExit />
        <section className="strategy-notes" aria-label={t("page.notesAria")}>
          <div>
            <h3>{t("page.doesTitle")}</h3>
            <p>{t("page.doesBody")}</p>
          </div>
          <div>
            <h3>{t("page.notTitle")}</h3>
            <p>{t("page.notBody")}</p>
          </div>
          <div>
            <h3>{t("page.costsTitle")}</h3>
            <p>{t("page.costsBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
