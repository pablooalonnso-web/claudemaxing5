"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, BookOpen, ChevronDown, Landmark, Layers, LifeBuoy, Menu, Radar, Repeat, Route, Vault, WalletCards, X, Activity, Sparkles, Zap } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WalletConnectButton } from "./wallet/WalletConnectButton";
import { ContractAddress } from "./ContractAddress";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";

type Item = { href: string; label: string; blurb: string; icon: ReactNode; badge?: string };
/** Static shape of a menu entry; labels, blurbs and badges resolve through `t` at render time. */
type ItemDef = { href: string; key: string; icon: ReactNode; badge?: "new" | "beta" };

const PRODUCT_DEFS: ItemDef[] = [
  { href: "/vaults", key: "vaults", icon: <Vault size={18} strokeWidth={1.5} /> },
  { href: "/lending", key: "lending", icon: <Layers size={18} strokeWidth={1.5} /> },
  { href: "/strategies", key: "strategies", icon: <Repeat size={18} strokeWidth={1.5} /> },
  { href: "/allocator", key: "allocator", icon: <Route size={18} strokeWidth={1.5} /> },
  { href: "/governance", key: "governance", icon: <Landmark size={18} strokeWidth={1.5} />, badge: "new" },
  { href: "/trade/swap", key: "trade", icon: <ArrowLeftRight size={18} strokeWidth={1.5} /> },
  { href: "/zap", key: "zap", icon: <Zap size={18} strokeWidth={1.5} /> },
  { href: "/intelligence", key: "intelligence", icon: <Radar size={18} strokeWidth={1.5} />, badge: "beta" },
  { href: "/portfolio", key: "portfolio", icon: <WalletCards size={18} strokeWidth={1.5} /> },
];

const RESOURCE_DEFS: ItemDef[] = [
  { href: "/docs", key: "docs", icon: <BookOpen size={18} strokeWidth={1.5} /> },
  { href: "/help", key: "help", icon: <LifeBuoy size={18} strokeWidth={1.5} /> },
  { href: "/status", key: "status", icon: <Activity size={18} strokeWidth={1.5} /> },
  { href: "/docs#flywheel", key: "flywheel", icon: <Sparkles size={18} strokeWidth={1.5} /> },
  { href: "/help/contact", key: "contact", icon: <BarChart3 size={18} strokeWidth={1.5} /> },
];

function resolveItems(t: TFunction, group: "products" | "resources", defs: ItemDef[]): Item[] {
  return defs.map((d) => ({
    href: d.href,
    icon: d.icon,
    label: t(`${group}.${d.key}.label`),
    blurb: t(`${group}.${d.key}.blurb`),
    badge: d.badge ? t(`badge.${d.badge}`) : undefined,
  }));
}

function isCurrent(pathname: string, href: string) {
  const [path] = href.split("#");
  if (path === "/trade/swap") return pathname.startsWith("/trade");
  return pathname === path || pathname.startsWith(`${path}/`);
}

function Dropdown({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="gh-menu" data-open={open} ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="gh-menu-btn" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        {label}
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="gh-dropdown" role="menu">
          {items.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" aria-current={isCurrent(pathname, it.href) ? "page" : undefined}>
              <span aria-hidden="true">{it.icon}</span>
              <span>
                <b>
                  {it.label}
                  {it.badge ? <span className="gh-badge">{it.badge}</span> : null}
                </b>
                <small>{it.blurb}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PrimaryNavigation() {
  const t = useT("nav");
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const PRODUCTS = resolveItems(t, "products", PRODUCT_DEFS);
  const RESOURCES = resolveItems(t, "resources", RESOURCE_DEFS);
  return (
    <>
      <nav className="gh-nav" aria-label={t("aria.primary")}>
        <Link className="gh-link" href="/vaults" aria-current={isCurrent(pathname, "/vaults") ? "page" : undefined}>
          {t("products.vaults.label")}
        </Link>
        <Link className="gh-link" href="/lending" aria-current={isCurrent(pathname, "/lending") ? "page" : undefined}>
          {t("products.lending.label")}
        </Link>
        <Dropdown label={t("group.products")} items={PRODUCTS} pathname={pathname} />
        <Link className="gh-link" href="/trade/swap" aria-current={isCurrent(pathname, "/trade/swap") ? "page" : undefined}>
          {t("products.trade.label")}
        </Link>
        <Link className="gh-link" href="/docs" aria-current={isCurrent(pathname, "/docs") ? "page" : undefined}>
          {t("resources.docs.label")}
        </Link>
        <Dropdown label={t("group.resources")} items={RESOURCES} pathname={pathname} />
      </nav>
      <div className="gh-actions">
        <LanguageSwitcher />
        <div className="hex-group">
          <ContractAddress compact />
          <WalletConnectButton />
        </div>
        <span className="gh-mobile-only">
          <WalletConnectButton />
        </span>
        <button
          className="gh-burger"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-primary-navigation"
          aria-label={open ? t("aria.closeMenu") : t("aria.openMenu")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
        </button>
      </div>
      {open ? (
        <nav id="mobile-primary-navigation" className="gh-mobile" aria-label={t("aria.primary")}>
          <span className="gh-mobile-group">{t("group.products")}</span>
          {PRODUCTS.map((it) => (
            <Link key={it.href} href={it.href} aria-current={isCurrent(pathname, it.href) ? "page" : undefined}>
              {it.label}
            </Link>
          ))}
          <span className="gh-mobile-group">{t("group.resources")}</span>
          {RESOURCES.map((it) => (
            <Link key={it.href} href={it.href}>
              {it.label}
            </Link>
          ))}
          <div className="gh-mobile-actions">
            <ContractAddress />
          </div>
          <div className="gh-mobile-actions">
            <LanguageSwitcher variant="list" />
          </div>
        </nav>
      ) : null}
    </>
  );
}
