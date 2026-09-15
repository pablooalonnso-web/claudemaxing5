import { BRAND } from "@/lib/brand";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Skeleton shown while a route's data-dependent server component streams in. */
export function RouteLoading() {
  return (
    <main className="app-page" aria-busy="true" aria-live="polite">
      <SiteHeader />
      <div className="wrap-app route-loading">
        <span className="sr-only">Loading live {BRAND.name} data</span>
        <section className="route-loading-head" aria-hidden="true">
          <i className="loading-line loading-line-short" />
          <i className="loading-line loading-line-title" />
          <i className="loading-line loading-line-copy" />
        </section>
        <section className="route-loading-metrics" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <article key={i}>
              <i className="loading-line loading-line-short" />
              <i className="loading-line loading-line-value" />
              <i className="loading-line loading-line-copy" />
            </article>
          ))}
        </section>
        <section className="route-loading-panel" aria-hidden="true">
          <i className="loading-line loading-line-short" />
          <i className="loading-line loading-line-title" />
          <i className="loading-block" />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
