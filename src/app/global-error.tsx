"use client";

import { useEffect, useMemo, useState } from "react";
import { makeT } from "@/i18n/format";
import { errors } from "@/i18n/messages/errors";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALE_TAGS, type Locale } from "@/i18n/config";
import "./globals.css";

/** Reads the language cookie directly: this boundary renders outside the root layout, so no I18nProvider is mounted. */
function cookieLocale(): Locale {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : undefined;
    if (isLocale(value)) return value;
  } catch {}
  return DEFAULT_LOCALE;
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(cookieLocale()), []);
  const t = useMemo(() => makeT({ ...errors.en, ...errors[locale] }), [locale]);
  return (
    <html lang={LOCALE_TAGS[locale]}>
      <body>
        <main className="error-page">
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <h1>{t("app.title")}</h1>
          <p>{t("app.body")}</p>
          <button type="button" onClick={() => reset()}>
            {t("app.retry")}
          </button>
        </main>
      </body>
    </html>
  );
}
