import type { Metadata } from "next";
import { Activity, Database, Radio, Server, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import { formatUtc } from "@/lib/format";
import { getStatus, type StatusReport } from "@/server/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("status");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}
export const dynamic = "force-dynamic";

const toneClass = (t: string) => `status-${t}`;

export default async function StatusPage() {
  const t = await getT("status");
  const status: StatusReport | null = await getStatus().catch(() => null);
  const c = status?.components;
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="subhero status-hero">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{t("hero.title")}</h1>
        <p className="hero-copy">{t("hero.intro", { brand: BRAND.name })}</p>
        <div className={`system-banner ${status ? toneClass(status.overall.tone) : "status-danger"}`}>
          <span className="system-banner-dot" aria-hidden="true" />
          <strong>{status ? status.overall.label : t("banner.unavailable")}</strong>
          <span>{t("banner.checked", { time: status ? formatUtc(status.checkedAt) : formatUtc(new Date()) })}</span>
        </div>
      </section>
      <section className="status-grid" aria-label={t("grid.aria")}>
        <article className="status-card">
          <Server size={20} aria-hidden="true" />
          <div>
            <span>{t("card.api")}</span>
            <strong>{c?.api.state ?? t("card.api.unavailable")}</strong>
          </div>
          <span className={`tag ${toneClass(c?.api.tone ?? "danger")}`}>{c?.api.tag ?? t("card.api.offline")}</span>
          <p>{c?.api.detail ?? t("card.api.detail")}</p>
        </article>
        <article className="status-card">
          <Radio size={20} aria-hidden="true" />
          <div>
            <span>{t("card.oracle")}</span>
            <strong>{c?.oracle.state ?? t("card.unknown")}</strong>
          </div>
          <span className={`tag ${toneClass(c?.oracle.tone ?? "neutral")}`}>{c?.oracle.tag ?? "–"}</span>
          <p>{c?.oracle.detail ?? t("card.oracle.detail")}</p>
        </article>
        <article className="status-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <span>{t("card.vault")}</span>
            <strong>{c?.vault.state ?? t("card.unknown")}</strong>
          </div>
          <span className={`tag ${toneClass(c?.vault.tone ?? "neutral")}`}>{c?.vault.tag ?? "–"}</span>
          <p>{c?.vault.detail ?? t("card.vault.detail")}</p>
        </article>
        <article className="status-card">
          <Activity size={20} aria-hidden="true" />
          <div>
            <span>{t("card.keeper")}</span>
            <strong>{c?.keeper.state ?? t("card.unknown")}</strong>
          </div>
          <span className={`tag ${toneClass(c?.keeper.tone ?? "neutral")}`}>{c?.keeper.tag ?? "–"}</span>
          <p>{c?.keeper.detail ?? t("card.keeper.detail")}</p>
        </article>
      </section>
      <section className="panel status-jobs-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("jobs.eyebrow")}</p>
            <h2>{t("jobs.title")}</h2>
          </div>
          <p>{t("jobs.sub")}</p>
        </div>
        <div className="status-job-list">
          {(status?.jobs ?? []).map((job) => (
            <article key={job.name}>
              <Database size={17} aria-hidden="true" />
              <div>
                <strong>{job.name}</strong>
                <span>{job.lastSuccess ? t("jobs.lastSuccess", { time: formatUtc(job.lastSuccess) }) : t("jobs.none")}</span>
              </div>
              <span className={`tag ${toneClass(job.tone)}`}>{job.label}</span>
            </article>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
