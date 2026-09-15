"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, BookOpen, ChevronDown, Layers, LifeBuoy, Menu, Radar, Repeat, Vault, WalletCards, X, Activity, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { TokenContractAddress } from "./TokenContractAddress";
import { WalletConnectButton } from "./wallet/WalletConnectButton";

type Item = { href: string; label: string; blurb: string; icon: ReactNode; badge?: string };

const PRODUCTS: Item[] = [
  { href: "/vaults", label: "Vaults", blurb: "Managed liquidity for one Stock Token each.", icon: <Vault size={18} strokeWidth={1.5} /> },
  { href: "/lending", label: "Lending", blurb: "Supply USDG or borrow against vault shares.", icon: <Layers size={18} strokeWidth={1.5} /> },
  { href: "/strategies", label: "Strategies", blurb: "Baskets and delta-neutral positions.", icon: <Repeat size={18} strokeWidth={1.5} />, badge: "Soon" },
  { href: "/trade/swap", label: "Trade", blurb: "Best route across four aggregators.", icon: <ArrowLeftRight size={18} strokeWidth={1.5} /> },
  { href: "/intelligence", label: "Intelligence", blurb: "Launch countdown and market signals.", icon: <Radar size={18} strokeWidth={1.5} />, badge: "Beta" },
  { href: "/portfolio", label: "Portfolio", blurb: "Balances, positions and transfers.", icon: <WalletCards size={18} strokeWidth={1.5} /> },
];

const RESOURCES: Item[] = [
  { href: "/docs", label: "Docs", blurb: "How vaults, fees and safeguards work.", icon: <BookOpen size={18} strokeWidth={1.5} /> },
  { href: "/help", label: "Help center", blurb: "Answers, searchable.", icon: <LifeBuoy size={18} strokeWidth={1.5} /> },
  { href: "/status", label: "System status", blurb: "API, oracle, vault and keeper health.", icon: <Activity size={18} strokeWidth={1.5} /> },
  { href: "/docs#flywheel", label: `${BRAND.token} flywheel`, blurb: "Where every fee goes.", icon: <Sparkles size={18} strokeWidth={1.5} /> },
  { href: "/help/contact", label: "Contact", blurb: "Talk to the team.", icon: <BarChart3 size={18} strokeWidth={1.5} /> },
];

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
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <nav className="gh-nav" aria-label="Primary navigation">
        <Link className="gh-link" href="/vaults" aria-current={isCurrent(pathname, "/vaults") ? "page" : undefined}>
          Vaults
        </Link>
        <Link className="gh-link" href="/lending" aria-current={isCurrent(pathname, "/lending") ? "page" : undefined}>
          Lending
        </Link>
        <Dropdown label="Products" items={PRODUCTS} pathname={pathname} />
        <Link className="gh-link" href="/trade/swap" aria-current={isCurrent(pathname, "/trade/swap") ? "page" : undefined}>
          Trade
        </Link>
        <Link className="gh-link" href="/docs" aria-current={isCurrent(pathname, "/docs") ? "page" : undefined}>
          Docs
        </Link>
        <Dropdown label="Resources" items={RESOURCES} pathname={pathname} />
      </nav>
      <div className="gh-actions">
        <div className="hex-group">
          <TokenContractAddress />
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
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
        </button>
      </div>
      {open ? (
        <nav id="mobile-primary-navigation" className="gh-mobile" aria-label="Primary navigation">
          <span className="gh-mobile-group">Products</span>
          {PRODUCTS.map((it) => (
            <Link key={it.href} href={it.href} aria-current={isCurrent(pathname, it.href) ? "page" : undefined}>
              {it.label}
            </Link>
          ))}
          <span className="gh-mobile-group">Resources</span>
          {RESOURCES.map((it) => (
            <Link key={it.href} href={it.href}>
              {it.label}
            </Link>
          ))}
          <div className="gh-mobile-actions">
            <TokenContractAddress />
          </div>
        </nav>
      ) : null}
    </>
  );
}
