import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { TokenContractAddress } from "./TokenContractAddress";
import { WalletConnectButton } from "./wallet/WalletConnectButton";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label={`${BRAND.name} home`}>
          <BrandMark />
          <span>{BRAND.name}</span>
        </Link>
        <PrimaryNavigation />
        <div className="header-actions">
          <TokenContractAddress />
          <div className="header-controls">
            <a
              className="header-social"
              href={BRAND.xUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${BRAND.name} on X (opens in a new tab)`}
              title={`@${BRAND.xHandle} on X`}
            >
              <Image src="/brands/x.svg" alt="" width={16} height={16} />
            </a>
            <WalletConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
