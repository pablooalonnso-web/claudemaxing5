export function LendingTip({ term, title, children }: { term: string; title?: string; children: React.ReactNode }) {
  return (
    <span className="ln-tip">
      <button type="button" aria-label={`What is ${title ?? term}?`}>
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

export const TIPS = {
  lent: "USDG that lenders have put into this market. Borrowers draw from it and pay interest on what they use.",
  utilised: "The share of lent USDG that borrowers are using right now. When most of it is borrowed, withdrawals for lenders can be limited.",
  borrowed: "USDG that all borrowers in this market currently owe, including interest. Not just yours.",
  available: "USDG in this market that nobody has borrowed yet. New loans and lender withdrawals are limited to this amount, and both also need a current share price and an open market.",
  borrowersPay: "The current interest rate on loans. It changes with how much of the market is borrowed. Interest is added to what you owe; nothing is taken from your shares automatically.",
  lendersEarn: "The current rate paid to lenders, after the market’s reserve. It is variable and not a forecast.",
  variable: "Annual rate at today’s conditions. It moves as borrowing in the market rises or falls, so the rate you see now is not a promise for the year.",
  reserve: "A slice of the interest borrowers pay that the market keeps back to absorb losses before lenders are affected.",
  loanPrice: "The market values vault shares slightly below the current market price on purpose, so a small dip does not immediately put loans at risk.",
  healthFactor: "How far your loan is from liquidation. Above 1 is safe; at or below 1 the market can sell your locked shares to repay the loan.",
  ltv: "The largest loan the market allows against your locked shares, as a share of their value.",
};
