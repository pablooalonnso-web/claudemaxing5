"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./config";
import { makeT, type Namespace, type TFunction } from "./index";
import type { Table } from "./types";

type Ctx = { locale: Locale; messages: Partial<Record<Namespace, Table>> };
const I18nContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, messages: {} });

/** Mounted once in the root layout with the locale's resolved messages. */
export function I18nProvider({ locale, messages, children }: Ctx & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** `const t = useT("vaults"); t("table.tvl")` in client components. */
export function useT(ns: Namespace): TFunction {
  const { messages } = useContext(I18nContext);
  const table = messages[ns];
  return useMemo(() => makeT(table ?? {}), [table]);
}

/** Persists the choice for a year; the caller refreshes the route so server components re-render. */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
