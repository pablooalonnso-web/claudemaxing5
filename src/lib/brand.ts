/**
 * Single source of truth for product naming. Everything that used to say
 * "TickerSpring" / "SPRING" is derived from this object so the brand can be
 * changed in one place.
 */
export const BRAND = {
  name: "Stockwell",
  nameUpper: "STOCKWELL",
  tagline: "Put your USDG to work.",
  ogDescription: "Your USDG. Put to work.",
  description:
    "A USDG vault for Stock Token liquidity strategies on Robinhood Chain with transparent 10% protocol, 20% WELL buyback reserve, and 70% compounding fee allocation.",
  /** Protocol token ticker (no $ prefix). */
  token: "WELL",
  /** X / Twitter handle without the @. */
  xHandle: "stockwellfi",
  xUrl: "https://x.com/stockwellfi",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://stockwell.finance",
  /** Custom DOM event name fired after a wallet transaction changes a vault. */
  vaultUpdatedEvent: "stockwell:vault-updated",
} as const;

export const CHAIN_NAME = "Robinhood Chain";
