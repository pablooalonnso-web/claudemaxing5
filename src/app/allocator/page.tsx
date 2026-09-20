import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Allocator } from "@/components/allocator/Allocator";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";
import "@/styles/allocator.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("allocator");
  return {
    title: `${t("meta.title")} · ${BRAND.name}`,
    description: t("meta.description"),
  };
}

export default async function AllocatorPage() {
  const t = await getT("allocator");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">{t("hero.eyebrow")}</p>
              <h1>
                {t("hero.title.before")}
                <em className="serif">{t("hero.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("hero.intro")}</p>
            <div className="masthead-aside">
              <Link href="/allocator/v1" className="strategy-status strategy-status-live">
                <i aria-hidden="true" /> {t("hero.v1")} <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <Allocator />
        <section className="strategy-notes" aria-label={t("notes.aria")}>
          <div>
            <h3>{t("notes.doesTitle")}</h3>
            <p>{t("notes.doesBody")}</p>
          </div>
          <div>
            <h3>{t("notes.notTitle")}</h3>
            <p>{t("notes.notBody")}</p>
          </div>
          <div>
            <h3>{t("notes.costsTitle")}</h3>
            <p>{t("notes.costsBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
