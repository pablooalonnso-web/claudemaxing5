import type { Table, Vars } from "./types";

export type TFunction = (key: string, vars?: Vars) => string;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Builds a translator over one resolved table. Unknown keys return the key itself. */
export function makeT(table: Table): TFunction {
  return (key, vars) => interpolate(table[key] ?? key, vars);
}
