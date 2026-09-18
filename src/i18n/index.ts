import { DEFAULT_LOCALE, type Locale } from "./config";
import { makeT, type TFunction } from "./format";
import { MESSAGES, type Namespace } from "./messages";
import type { Table } from "./types";

export type { Locale } from "./config";
export type { Namespace } from "./messages";
export { interpolate, makeT, type TFunction } from "./format";

/** Resolves one namespace for one locale, with English filled in for every missing key. */
export function resolveTable(locale: Locale, ns: Namespace): Table {
  const messages = MESSAGES[ns];
  return locale === DEFAULT_LOCALE ? messages[DEFAULT_LOCALE] : { ...messages[DEFAULT_LOCALE], ...messages[locale] };
}

/** Every namespace resolved for one locale. This is what the client receives through the provider. */
export function resolveAll(locale: Locale): Record<Namespace, Table> {
  const out = {} as Record<Namespace, Table>;
  for (const ns of Object.keys(MESSAGES) as Namespace[]) out[ns] = resolveTable(locale, ns);
  return out;
}

/** Server-side translator for one namespace. */
export function translator(locale: Locale, ns: Namespace): TFunction {
  return makeT(resolveTable(locale, ns));
}
