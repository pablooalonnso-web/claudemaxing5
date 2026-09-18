import { useT } from "@/i18n/client";

export function LendingTip({ term, title, children }: { term: string; title?: string; children: React.ReactNode }) {
  const t = useT("lending");
  return (
    <span className="ln-tip">
      <button type="button" aria-label={t("tip.whatIs", { term: title ?? term })}>
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <line x1="5" y1="4.4" x2="5" y2="7.6" />
          <circle cx="5" cy="2.4" r="0.55" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span role="tooltip">
        <b>{title ?? term}</b>
        {children}
      </span>
    </span>
  );
}

export function Term({ label, tip, title }: { label: string; tip: React.ReactNode; title?: string }) {
  return (
    <span className="ln-label">
      {label}{" "}
      <LendingTip term={label} title={title}>
        {tip}
      </LendingTip>
    </span>
  );
}

/** Message keys (namespace `lending`) for the shared tooltip copy. Resolve with `t(TIPS.lent)` in the component. */
export const TIPS = {
  lent: "tips.lent",
  utilised: "tips.utilised",
  borrowed: "tips.borrowed",
  available: "tips.available",
  borrowersPay: "tips.borrowersPay",
  lendersEarn: "tips.lendersEarn",
  variable: "tips.variable",
  reserve: "tips.reserve",
  loanPrice: "tips.loanPrice",
  healthFactor: "tips.healthFactor",
  ltv: "tips.ltv",
} as const;
