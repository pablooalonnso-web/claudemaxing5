import type { Metadata } from "next";
import { Governance } from "@/components/governance/Governance";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";
import "@/styles/allocator.css";
import "@/styles/governance.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("governance");
  return {
    title: `${t("meta.title")} · ${BRAND.name}`,
    description: t("meta.description"),
  };
}

export default async function GovernancePage() {
  const t = await getT("governance");
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
        <Governance />
        <section className="strategy-notes" aria-label={t("notes.aria")}>
          <div>
            <h3>{t("notes.votesTitle")}</h3>
            <p>{t("notes.votesBody")}</p>
          </div>
          <div>
            <h3>{t("notes.feeTitle")}</h3>
            <p>{t("notes.feeBody")}</p>
          </div>
          <div>
            <h3>{t("notes.moduleTitle")}</h3>
            <p>{t("notes.moduleBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
