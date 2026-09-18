import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT("errors");
  return (
    <main className="error-page">
      <p className="eyebrow">{t("notFound.eyebrow")}</p>
      <h1>{t("notFound.title")}</h1>
      <Link href="/">{t("notFound.back", { name: BRAND.name })}</Link>
    </main>
  );
}
