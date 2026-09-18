import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { VaultTable } from "@/components/vaults/VaultTable";
import { BRAND } from "@/lib/brand";
import "@/styles/vaults.css";

export const metadata: Metadata = { title: `Vaults · ${BRAND.name}` };

export default function VaultsPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <div className="vaults-page vaults-directory masthead-page">
        <VaultTable />
      </div>
      <SiteFooter />
    </main>
  );
}
