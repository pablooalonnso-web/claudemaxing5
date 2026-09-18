import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./config";
import { translator, type Namespace, type TFunction } from "./index";

/** Cookie first, then the browser's Accept-Language, then English. */
export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale((await headers()).get("accept-language"));
}

/** `const t = await getT("home"); t("hero.title")` in server components and generateMetadata. */
export async function getT(ns: Namespace): Promise<TFunction> {
  return translator(await getLocale(), ns);
}
