"use client";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-page">
      <p className="eyebrow">Application error</p>
      <h1>The experience could not load.</h1>
      <p>Your wallet, assets, and contract state have not been changed.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
