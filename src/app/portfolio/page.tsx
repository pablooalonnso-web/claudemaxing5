import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WalletPortfolio } from "@/components/portfolio/WalletPortfolio";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/portfolio.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("portfolio");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}

export default async function PortfolioPage() {
  const t = await getT("portfolio");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead masthead-1360">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">{t("page.eyebrow")}</p>
              <h1>
                {t("page.title.before")}<em className="serif">{t("page.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("page.intro")}</p>
          </div>
        </div>
      </section>
      <WalletPortfolio />
      <SiteFooter />
    </main>
  );
}
