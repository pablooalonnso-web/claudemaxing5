import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { PrimaryNavigation } from "./PrimaryNavigation";

export function SiteHeader() {
  return (
    <header className="gh">
      <div className="gh-inner">
        <Link className="gh-logo" href="/" aria-label={`${BRAND.name} home`}>
          <BrandMark />
          <span className="gh-wordmark">{BRAND.name}</span>
        </Link>
        <PrimaryNavigation />
      </div>
    </header>
  );
}
