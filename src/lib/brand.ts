/**
 * Single source of truth for product naming. Everything that used to say
 * "TickerSpring" / "SPRING" is derived from this object so the brand can be
 * changed in one place.
 */
export const BRAND = {
  name: "Vertex",
  nameUpper: "VERTEX",
  tagline: "Put your USDG to work.",
  ogDescription: "Your USDG. Put to work.",
  description:
    "Managed liquidity vaults for tokenized stocks on Robinhood Chain. One vault per stock, fees split onchain: 70% compounds, 20% buys back and burns the protocol token, 10% funds the protocol treasury.",
  /** Short label for the protocol token in asset lists. No ticker is shown on the site. */
  token: "Vertex",
  /** X / Twitter handle without the @. */
  xHandle: "useevertex",
  xUrl: "https://x.com/useevertex",
  /** Telegram discussion group. Override with NEXT_PUBLIC_TELEGRAM_URL if the invite is rotated. */
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "https://t.me/+qUeVjZqryk4yOThk",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/pablooalonnso-web/claudemaxing5",
  /** Branch the deployed site is built from; file links in the docs point at it. */
  repoBranch: process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://usevertex.xyz",
  /** Custom DOM event name fired after a wallet transaction changes a vault. */
  vaultUpdatedEvent: "vertex:vault-updated",
} as const;

export const CHAIN_NAME = "Robinhood Chain";
