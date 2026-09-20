import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AllocatorV1 } from "@/components/allocator/AllocatorV1";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";
import "@/styles/allocator.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("allocator");
  return {
    title: `${t("v1.meta.title")} · ${BRAND.name}`,
    description: t("v1.meta.description"),
  };
}

export default async function AllocatorV1Page() {
  const t = await getT("allocator");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">
                <Link href="/allocator" className="masthead-back">
                  <ArrowLeft size={13} aria-hidden="true" /> {t("v1.hero.back")}
                </Link>
              </p>
              <h1>
                {t("v1.hero.title.before")}
                <em className="serif">{t("v1.hero.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("v1.hero.intro")}</p>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <AllocatorV1 />
        <section className="strategy-notes" aria-label={t("v1.notes.aria")}>
          <div>
            <h3>{t("v1.notes.doesTitle")}</h3>
            <p>{t("v1.notes.doesBody")}</p>
          </div>
          <div>
            <h3>{t("v1.notes.riskTitle")}</h3>
            <p>{t("v1.notes.riskBody")}</p>
          </div>
          <div>
            <h3>{t("v1.notes.costsTitle")}</h3>
            <p>{t("v1.notes.costsBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
