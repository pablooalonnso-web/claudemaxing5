import Image from "next/image";
import Link from "next/link";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { explorerAddress, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { BrandMark } from "./BrandMark";
import { BrandWireframe } from "./BrandWireframe";
import { FooterCubes } from "./FooterCubes";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getT } from "@/i18n/server";

type Column = { key: string; links: { href: string; key: string; external?: boolean }[] };

/** Column and link labels resolve through `t("col.<key>")` and `t("link.<key>")` at render time. */
const COLUMNS: Column[] = [
  {
    key: "products",
    links: [
      { href: "/vaults", key: "vaults" },
      { href: "/lending", key: "lending" },
      { href: "/strategies", key: "strategies" },
      { href: "/allocator", key: "allocator" },
      { href: "/trade/swap", key: "trade" },
      { href: "/zap", key: "zap" },
    ],
  },
  {
    key: "platform",
    links: [
      { href: "/intelligence", key: "intelligence" },
      { href: "/portfolio", key: "portfolio" },
      { href: "/docs", key: "docs" },
      { href: "/help", key: "help" },
      { href: "/status", key: "status" },
      { href: "/verify", key: "verification" },
    ],
  },
  {
    key: "resources",
    links: [
      { href: "/docs#vaults", key: "howVaultsWork" },
      { href: "/calculator", key: "calculator" },
      { href: "/docs#safeguards", key: "safeguards" },
      { href: "/docs#flywheel", key: "flywheel" },
      { href: "/docs#oracles", key: "chainlink" },
      { href: "/docs#contracts", key: "contracts" },
      { href: "/docs#roadmap", key: "roadmap" },
      { href: BRAND.repoUrl, key: "source", external: true },
      { href: explorerAddress(TOKEN_ADDRESS), key: "tokenContract", external: true },
      { href: explorerAddress(USDG_ADDRESS), key: "usdgContract", external: true },
    ],
  },
  {
    key: "support",
    links: [
      { href: BRAND.telegramUrl, key: "telegram", external: true },
      { href: "/help/contact", key: "contact" },
      { href: "/docs#faq", key: "faq" },
      { href: "/verify", key: "security" },
      { href: "/status", key: "report" },
    ],
  },
];

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label} ↗
    </a>
  ) : (
    <Link href={href}>{label}</Link>
  );
}

export async function SiteFooter() {
  const t = await getT("footer");
  const year = new Date().getFullYear();
  return (
    <footer className="gf bg-paper-dot" id="site-footer">
      <div className="div-double-dashed gf-top" aria-hidden="true" />
      <div className="gf-cols">
        <div className="div-double-solid-v" aria-hidden="true" />
        <div className="gf-logo-col">
          <BrandWireframe />
        </div>
        <div className="div-double-solid-v" aria-hidden="true" />
        {COLUMNS.map((col, i) => (
          <div key={col.key} className="gf-col-wrap" style={{ display: "contents" }}>
            <nav className="gf-col" aria-label={t(`col.${col.key}`)}>
              <h2>{t(`col.${col.key}`)}</h2>
              {col.links.map((l) => (
                <FooterLink key={l.href + l.key} href={l.href} label={t(`link.${l.key}`)} external={l.external} />
              ))}
              {i === 0 ? (
                <div className="gf-status">
                  <i aria-hidden="true" />
                  <Link href="/status">{t("link.viewStatus")}</Link>
                </div>
              ) : null}
              {i === COLUMNS.length - 1 ? (
                <>
                  <h2 style={{ marginTop: 12 }}>{t("col.socials")}</h2>
                  <div className="gf-socials">
                    <a href={BRAND.xUrl} target="_blank" rel="noopener noreferrer" aria-label={t("aria.onX", { name: BRAND.name })}>
                      <Image src="/brands/x.svg" alt="" width={14} height={14} />
                    </a>
                    <a href={BRAND.telegramUrl} target="_blank" rel="noopener noreferrer" aria-label={t("aria.onTelegram", { name: BRAND.name })}>
                      <Image src="/brands/telegram.svg" alt="" width={14} height={14} />
                    </a>
                    <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener noreferrer" aria-label={t("aria.explorer", { chain: CHAIN_NAME })}>
                      <Image src="/brands/robinhood-mark.svg" alt="" width={14} height={14} />
                    </a>
                  </div>
                </>
              ) : null}
            </nav>
            <div className="div-double-solid-v" aria-hidden="true" />
          </div>
        ))}
      </div>

      <div className="gf-mobile">
        <div className="gf-mobile-band">
          <Image src="/design/scales-footer.png" alt="" width={1080} height={1080} sizes="100vw" />
          <Link className="gf-mobile-brand" href="/" aria-label={t("aria.home", { name: BRAND.name })}>
            <BrandMark color="#3D3B4F" />
            <span className="gh-wordmark">{BRAND.name}</span>
          </Link>
        </div>
        <div className="div-double-dashed gf-top" aria-hidden="true" />
        <div className="gf-mobile-grid">
          {COLUMNS.map((col, i) => (
            <div key={col.key}>
              <span className="gf-h">{t(`col.${col.key}`)}</span>
              {col.links.map((l) => (
                <FooterLink key={l.href + l.key} href={l.href} label={t(`link.${l.key}`)} external={l.external} />
              ))}
              {i === 0 ? (
                <div className="gf-status">
                  <i aria-hidden="true" />
                  <Link className="gf-link" href="/status">
                    {t("link.viewStatus")}
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="div-double-dashed gf-top" aria-hidden="true" />
      <div className="gf-cubes-wrap">
        <FooterCubes />
      </div>
      <div className="gf-bottom g-shell">
        <span className="gf-copy">{t("copyright", { year, name: BRAND.name, chain: CHAIN_NAME })}</span>
        <LanguageSwitcher variant="list" />
      </div>
    </footer>
  );
}
