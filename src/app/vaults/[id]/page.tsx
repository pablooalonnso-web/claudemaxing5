import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ManagedVaultWorkspace } from "@/components/vaults/ManagedVaultWorkspace";
import { BRAND } from "@/lib/brand";
import { findVaultById, VAULT_PINS } from "@/lib/registry";
import "@/styles/vault-detail.css";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const pin = findVaultById(id);
  return { title: pin ? `${pin.symbol} vault · ${BRAND.name}` : BRAND.name };
}

export function generateStaticParams() {
  return VAULT_PINS.map((p) => ({ id: p.id }));
}

export default async function VaultPage({ params }: Params) {
  const { id } = await params;
  const pin = findVaultById(id);
  if (!pin) notFound();
  return (
    <div className="app-page">
      <SiteHeader />
      <ManagedVaultWorkspace pin={pin} />
      <SiteFooter />
    </div>
  );
}
