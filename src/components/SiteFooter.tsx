import Image from "next/image";
import Link from "next/link";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { explorerAddress, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { BrandMark } from "./BrandMark";
import { BrandWireframe } from "./BrandWireframe";
import { FooterCubes } from "./FooterCubes";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Products",
    links: [
      { href: "/vaults", label: "Vaults" },
      { href: "/lending", label: "Lending" },
      { href: "/strategies", label: "Strategies" },
      { href: "/trade/swap", label: "Trade" },
      { href: "/zap", label: "Zap" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/intelligence", label: "Intelligence" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/docs", label: "Docs" },
      { href: "/help", label: "Help center" },
      { href: "/status", label: "System status" },
      { href: "/verify", label: "Verification" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs#vaults", label: "How vaults work" },
      { href: "/calculator", label: "Fee calculator" },
      { href: "/docs#safeguards", label: "Safeguards" },
      { href: "/docs#flywheel", label: "Token flywheel" },
      { href: "/docs#oracles", label: "Chainlink safety" },
      { href: "/docs#contracts", label: "Contracts" },
      { href: "/docs#roadmap", label: "Roadmap" },
      { href: BRAND.repoUrl, label: "Source code", external: true },
      { href: explorerAddress(TOKEN_ADDRESS), label: "Token contract", external: true },
      { href: explorerAddress(USDG_ADDRESS), label: "USDG contract", external: true },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/help/contact", label: "Contact us" },
      { href: "/docs#faq", label: "FAQ" },
      { href: "/verify", label: "Security" },
      { href: "/status", label: "Report an issue" },
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

export function SiteFooter() {
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
          <div key={col.title} className="gf-col-wrap" style={{ display: "contents" }}>
            <nav className="gf-col" aria-label={col.title}>
              <h2>{col.title}</h2>
              {col.links.map((l) => (
                <FooterLink key={l.href + l.label} {...l} />
              ))}
              {i === 0 ? (
                <div className="gf-status">
                  <i aria-hidden="true" />
                  <Link href="/status">View status</Link>
                </div>
              ) : null}
              {i === COLUMNS.length - 1 ? (
                <>
                  <h2 style={{ marginTop: 12 }}>Socials</h2>
                  <div className="gf-socials">
                    <a href={BRAND.xUrl} target="_blank" rel="noopener noreferrer" aria-label={`${BRAND.name} on X`}>
                      <Image src="/brands/x.svg" alt="" width={14} height={14} />
                    </a>
                    <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener noreferrer" aria-label="Robinhood Chain explorer">
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
          <Link className="gf-mobile-brand" href="/" aria-label={`${BRAND.name} home`}>
            <BrandMark color="#3D3B4F" />
            <span className="gh-wordmark">{BRAND.name}</span>
          </Link>
        </div>
        <div className="div-double-dashed gf-top" aria-hidden="true" />
        <div className="gf-mobile-grid">
          {COLUMNS.map((col, i) => (
            <div key={col.title}>
              <span className="gf-h">{col.title}</span>
              {col.links.map((l) => (
                <FooterLink key={l.href + l.label} {...l} />
              ))}
              {i === 0 ? (
                <div className="gf-status">
                  <i aria-hidden="true" />
                  <Link className="gf-link" href="/status">
                    View status
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
        <span className="gf-copy">
          © {year} {BRAND.name} · Built on {CHAIN_NAME}
        </span>
      </div>
    </footer>
  );
}
