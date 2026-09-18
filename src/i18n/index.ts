import { DEFAULT_LOCALE, type Locale } from "./config";
import { MESSAGES, type Namespace } from "./messages";
import type { Table, Vars } from "./types";

export type { Locale } from "./config";
export type { Namespace } from "./messages";
export type TFunction = (key: string, vars?: Vars) => string;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Resolves one namespace for one locale, with English filled in for every missing key. */
export function resolveTable(locale: Locale, ns: Namespace): Table {
  const messages = MESSAGES[ns];
  return locale === DEFAULT_LOCALE ? messages[DEFAULT_LOCALE] : { ...messages[DEFAULT_LOCALE], ...messages[locale] };
}

/** Every namespace resolved for one locale. This is what the client receives. */
export function resolveAll(locale: Locale): Record<Namespace, Table> {
  const out = {} as Record<Namespace, Table>;
  for (const ns of Object.keys(MESSAGES) as Namespace[]) out[ns] = resolveTable(locale, ns);
  return out;
}

export function makeT(table: Table): TFunction {
  return (key, vars) => interpolate(table[key] ?? key, vars);
}

/** Server-side translator for one namespace. */
export function translator(locale: Locale, ns: Namespace): TFunction {
  return makeT(resolveTable(locale, ns));
}
