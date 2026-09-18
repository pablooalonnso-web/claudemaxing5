"use client";

import { useT } from "@/i18n/client";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT("errors");
  return (
    <main className="error-page">
      <p className="eyebrow">{t("app.eyebrow")}</p>
      <h1>{t("app.title")}</h1>
      <p>{t("app.body")}</p>
      <button type="button" onClick={() => reset()}>
        {t("app.retry")}
      </button>
    </main>
  );
}
