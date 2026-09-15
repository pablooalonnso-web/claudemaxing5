import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { explorerAddress, TOKEN_ADDRESS } from "@/lib/chain";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="site-footer" id="site-footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand-block">
            <Link className="brand footer-brand" href="/" aria-label={`${BRAND.name} home`}>
              <BrandMark circle={false} accent="#41a575" />
              <span>{BRAND.name}</span>
            </Link>
            <p className="footer-description">{BRAND.tagline}</p>
            <Link className="footer-cta" href="/vaults">
              Explore vaults <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            <div className="footer-link-group">
              <h2>Products</h2>
              <Link href="/vaults">Vaults</Link>
              <Link href="/lending">Lending</Link>
              <Link href="/strategies">Strategies</Link>
            </div>
            <div className="footer-link-group">
              <h2>Platform</h2>
              <Link href="/trade/swap">Trade</Link>
              <Link href="/intelligence">Intelligence</Link>
              <Link href="/portfolio">Portfolio</Link>
            </div>
            <div className="footer-link-group">
              <h2>Resources</h2>
              <Link href="/docs">Docs</Link>
              <Link href="/help">Help center</Link>
              <Link href="/status">System status</Link>
              <a href={explorerAddress(TOKEN_ADDRESS)} target="_blank" rel="noopener noreferrer">
                {BRAND.token} contract <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <a href={BRAND.xUrl} target="_blank" rel="noopener noreferrer">
                Follow on X <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">
          <div className="footer-row">
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
            <span className="footer-network">Built on {CHAIN_NAME}</span>
          </div>
          <p className="footer-legal">
            Stock Tokens are tokenised debt securities issued by Robinhood Assets (Jersey) Limited. They are not
            ownership interests in the referenced shares, are unavailable to U.S. persons, and are restricted in other
            jurisdictions. Vault shares are not stable, not principal-protected, and not a deposit. Fee APR figures are
            estimates from observed pool fees, not forecasts.
          </p>
        </div>
      </div>
    </footer>
  );
}
