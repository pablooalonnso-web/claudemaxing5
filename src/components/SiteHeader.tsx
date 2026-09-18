import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { getT } from "@/i18n/server";

export async function SiteHeader() {
  const t = await getT("nav");
  return (
    <header className="gh">
      <div className="gh-inner">
        <Link className="gh-logo" href="/" aria-label={t("aria.home", { name: BRAND.name })}>
          <BrandMark />
          <span className="gh-wordmark">{BRAND.name}</span>
        </Link>
        <PrimaryNavigation />
      </div>
    </header>
  );
}
