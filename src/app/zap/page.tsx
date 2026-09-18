import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ZapFlow } from "@/components/zap/ZapFlow";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("zap");
  return {
    title: `${t("meta.title")} · ${BRAND.name}`,
    description: t("meta.description"),
  };
}

export default async function ZapPage() {
  const t = await getT("zap");
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
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <ZapFlow />
        <section className="strategy-notes" aria-label={t("notes.aria")}>
          <div>
            <h3>{t("notes.doesTitle")}</h3>
            <p>{t("notes.doesBody")}</p>
          </div>
          <div>
            <h3>{t("notes.expectTitle")}</h3>
            <p>{t("notes.expectBody")}</p>
          </div>
          <div>
            <h3>{t("notes.notTitle")}</h3>
            <p>{t("notes.notBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
