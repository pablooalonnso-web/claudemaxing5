import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { EarningsCalculator } from "@/components/calculator/EarningsCalculator";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("calculator");
  return { title: `${t("meta.title")} · ${BRAND.name}`, description: t("meta.description") };
}

export default async function CalculatorPage() {
  const t = await getT("calculator");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">{t("page.eyebrow")}</p>
              <h1>
                {t("page.title.before")}
                <em className="serif">{t("page.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("page.intro")}</p>
          </div>
        </div>
      </section>
      <EarningsCalculator />
      <SiteFooter />
    </main>
  );
}
