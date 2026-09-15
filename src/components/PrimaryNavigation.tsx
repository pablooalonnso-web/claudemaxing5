"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/vaults", label: "Vaults" },
  { href: "/lending", label: "Lending" },
  { href: "/strategies", label: "Strategies" },
  { href: "/trade/swap", label: "Trade" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs", label: "Docs" },
];

function isCurrent(pathname: string, href: string) {
  const [path, hash] = href.split("#");
  if (hash) return pathname === (path || "/");
  if (path === "/trade/swap") return pathname.startsWith("/trade/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return LINKS.map(({ href, label }) => (
    <Link key={href} href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined} onClick={onNavigate}>
      {label}
    </Link>
  ));
}

export function PrimaryNavigation() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <nav className="site-nav" aria-label="Primary navigation">
        <NavLinks pathname={pathname} />
      </nav>
      <div className="mobile-nav">
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-primary-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        {open ? (
          <nav id="mobile-primary-navigation" className="mobile-nav-panel" aria-label="Primary navigation">
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        ) : null}
      </div>
    </>
  );
}
