"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLocaleCookie, useLocale, useT } from "@/i18n/client";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

/**
 * Visible language menu. Writes the cookie and refreshes the route so server
 * components re-render in the new language without a full reload.
 */
export function LanguageSwitcher({ variant = "menu" }: { variant?: "menu" | "list" }) {
  const locale = useLocale();
  const t = useT("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
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

  const choose = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    setLocaleCookie(next);
    document.documentElement.lang = next;
    startTransition(() => router.refresh());
  };

  if (variant === "list") {
    return (
      <div className="lang-list" role="group" aria-label={t("language")}>
        {LOCALES.map((code) => (
          <button key={code} type="button" className="lang-list-item" aria-pressed={code === locale} onClick={() => choose(code)} lang={code}>
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="gh-menu lang-menu" data-open={open} ref={ref}>
      <button
        className="gh-menu-btn lang-btn"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("language.current", { name: LOCALE_LABELS[locale] })}
        title={t("language.change")}
        data-pending={pending || undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe size={15} strokeWidth={1.6} aria-hidden="true" className="lang-globe" />
        <span className="lang-code">{locale.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="gh-dropdown lang-dropdown" role="menu" aria-label={t("language")}>
          {LOCALES.map((code) => (
            <button key={code} type="button" role="menuitemradio" aria-checked={code === locale} className="lang-option" onClick={() => choose(code)} lang={code}>
              <span className="lang-option-code">{code.toUpperCase()}</span>
              <span className="lang-option-name">{LOCALE_LABELS[code]}</span>
              {code === locale ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
