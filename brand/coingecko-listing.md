# CoinGecko listing kit

Submit at coingecko.com: log in, scroll to the footer, "Request Form", then "New Coin/Token Listing". Review usually takes 2 to 6 weeks. Do not ask the community to message CoinGecko about it; that can disqualify the listing.

## Fields

| Field | Value |
|---|---|
| Project name | Vertex |
| Ticker | VERTEX |
| Blockchain | Robinhood Chain (chain id 4663) |
| Contract address | 0x730ee7a12397C8De8CF86Ad70B918626654882c8 |
| Decimals | 18 |
| Total supply | 1,000,000,000 |
| Circulating supply | 989,251,120 (total minus 10,748,880 burned at 0x000000000000000000000000000000000000dEaD) |
| Max supply | 1,000,000,000 (no mint function used after launch; the full supply was minted once at deployment) |
| Website | https://usevertex.xyz |
| Block explorer | https://robinhoodchain.blockscout.com/token/0x730ee7a12397C8De8CF86Ad70B918626654882c8 |
| Source code | https://github.com/pablooalonnso-web/claudemaxing5 |
| X | https://x.com/useevertex |
| Telegram | (paste the discussion group link) |
| Documentation / whitepaper | https://usevertex.xyz/docs |
| Verification / audit page | https://usevertex.xyz/verify |
| Where it trades | Uniswap on Robinhood Chain, VERTEX / WETH pool, tracked on GeckoTerminal: https://www.geckoterminal.com/robinhood/pools/0xef16255b5963007f02de99e2fd23c72edb20d26df57adeaa7f7eed17cac6fb51 |
| DexScreener | https://dexscreener.com/robinhood/0xef16255b5963007f02de99e2fd23c72edb20d26df57adeaa7f7eed17cac6fb51 |
| Launch date | 18 September 2026 |
| Logo | brand/social/vertex-logo-200.png (200×200 PNG, transparent corners) |
| Category / tags | DeFi, Yield, Tokenized assets, Robinhood Chain ecosystem |

## Short description (about 250 characters)

Vertex runs managed liquidity vaults for tokenized stocks on Robinhood Chain. Deposit USDG, the vault provides liquidity for one stock token, and fees are split onchain: 70% compounds, 20% buyback, 10% treasury. Open source, publicly verified.

## Long description

Vertex is a DeFi protocol on Robinhood Chain built around tokenized stocks. Each of its 18 vaults provides managed liquidity for one stock token against USDG. Trading fees are split by the contracts: 70% compounds back into the vault, 20% goes to a buyback reserve and 10% to the protocol treasury. Chainlink reference prices gate every price-dependent action, and deposits pause when the feed is stale instead of guessing.

Around the vaults, Vertex ships lending, a swap aggregator, a zap into any vault from any token, a basket strategy, a portfolio view, an onchain intelligence brief and a fee calculator. The interface runs in English, Spanish, Chinese, French and German.

Everything is verifiable. The site is open source under an MIT license, and a public verification page runs 126 automated checks against the live contracts and the live site (contract wiring, fee split, deposit and withdrawal simulations, swap routing) and publishes the result with the block number.

VERTEX is the protocol token. 1,000,000,000 were minted once at deployment; 10,748,880 have been burned so far, including the first team-funded buyback. The roadmap moves Vertex one layer above individual vaults, into a capital allocation layer that routes USDG across vaults, lending and strategies, with an allocator fee that funds buybacks, gives stakers a fee discount and puts parameters under VERTEX governance.

## Tokenomics summary

- Supply: 1,000,000,000 VERTEX, minted once at deployment to the launch contract (0xc90640704bda73422469420dfc2ad0ed7ae90310, balance 0 today).
- Burned: 10,748,880 VERTEX at 0x000000000000000000000000000000000000dEaD (10,000,000 at launch, 748,879.69 on 18 September 2026, tx 0x0e7f9f7b07f2a3f4dd3b1251ef9bcb7110a1a6bca42d747f26c23527014cc66c).
- No team allocation held in a team wallet. No vesting schedule.
- Vault fee split (70 / 20 / 10) is enforced by the vault contracts and verifiable at usevertex.xyz/verify.

## Before submitting

1. Paste the Telegram group link into the table above, and add it to the DexScreener and GeckoTerminal profiles too (both currently list only the website and X).
2. Confirm the token contract shows as verified source on Blockscout. CoinGecko asks for a verified contract. If it is not verified, verify it through Blockscout or Sourcify first.
3. Use the same wording for the description on every platform so the profiles match.
