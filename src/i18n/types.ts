import type { Locale } from "./config";

/** Flat key → string table for one language. Placeholders use {name}. */
export type Table = Record<string, string>;
/** One namespace: a table per locale. English is the source of truth; other locales fall back to it key by key. */
export type NamespaceMessages = Record<Locale, Table>;
export type Vars = Record<string, string | number>;
