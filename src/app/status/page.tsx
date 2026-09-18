import type { Metadata } from "next";
import { Activity, Database, Radio, Server, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/brand";
import { formatUtc } from "@/lib/format";
import { getStatus, type StatusReport } from "@/server/status";

export const metadata: Metadata = { title: `System status · ${BRAND.name}` };
export const dynamic = "force-dynamic";

const toneClass = (t: string) => `status-${t}`;

export default async function StatusPage() {
  const status: StatusReport | null = await getStatus().catch(() => null);
  const c = status?.components;
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="subhero status-hero">
        <p className="eyebrow">System status</p>
        <h1>Transparent by design.</h1>
        <p className="hero-copy">
          Live, privacy-safe health for the {BRAND.name} API, oracle circuit breaker, indexers, vault, and keeper. No wallet data, keys, RPC endpoints, or
          internal worker identifiers are exposed here.
        </p>
        <div className={`system-banner ${status ? toneClass(status.overall.tone) : "status-danger"}`}>
          <span className="system-banner-dot" aria-hidden="true" />
          <strong>{status ? status.overall.label : "Status is temporarily unavailable"}</strong>
          <span>Checked {status ? formatUtc(status.checkedAt) : formatUtc(new Date())}</span>
        </div>
      </section>
      <section className="status-grid" aria-label="System components">
        <article className="status-card">
          <Server size={20} aria-hidden="true" />
          <div>
            <span>API &amp; database</span>
            <strong>{c?.api.state ?? "Unavailable"}</strong>
          </div>
          <span className={`tag ${toneClass(c?.api.tone ?? "danger")}`}>{c?.api.tag ?? "Offline"}</span>
          <p>{c?.api.detail ?? "The status service could not be reached."}</p>
        </article>
        <article className="status-card">
          <Radio size={20} aria-hidden="true" />
          <div>
            <span>Oracle &amp; network guard</span>
            <strong>{c?.oracle.state ?? "unknown"}</strong>
          </div>
          <span className={`tag ${toneClass(c?.oracle.tone ?? "neutral")}`}>{c?.oracle.tag ?? "–"}</span>
          <p>{c?.oracle.detail ?? "Awaiting the first verified on-chain heartbeat."}</p>
        </article>
        <article className="status-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <span>Vault</span>
            <strong>{c?.vault.state ?? "unknown"}</strong>
          </div>
          <span className={`tag ${toneClass(c?.vault.tone ?? "neutral")}`}>{c?.vault.tag ?? "–"}</span>
          <p>{c?.vault.detail ?? "The vault fails closed when price or network safety cannot be confirmed."}</p>
        </article>
        <article className="status-card">
          <Activity size={20} aria-hidden="true" />
          <div>
            <span>Keeper</span>
            <strong>{c?.keeper.state ?? "unknown"}</strong>
          </div>
          <span className={`tag ${toneClass(c?.keeper.tone ?? "neutral")}`}>{c?.keeper.tag ?? "–"}</span>
          <p>{c?.keeper.detail ?? "Every capital-moving plan requires matching on-chain approval."}</p>
        </article>
      </section>
      <section className="panel status-jobs-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Background services</p>
            <h2>Indexer and monitoring cadence</h2>
          </div>
          <p>Only sanitized success and failure timing is published.</p>
        </div>
        <div className="status-job-list">
          {(status?.jobs ?? []).map((job) => (
            <article key={job.name}>
              <Database size={17} aria-hidden="true" />
              <div>
                <strong>{job.name}</strong>
                <span>{job.lastSuccess ? `Last successful run ${formatUtc(job.lastSuccess)}` : "No successful run recorded yet"}</span>
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
