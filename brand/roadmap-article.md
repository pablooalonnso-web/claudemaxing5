# The Vertex roadmap: from vaults to the capital allocation layer

Vertex launched with one job: run managed liquidity vaults for tokenized stocks on Robinhood Chain, split every fee onchain, and let anyone check the numbers. In the first day we shipped 18 vaults, lending, swap, zap, a basket strategy, an intelligence desk, a public verification page with 126 automated checks, the full source code under an MIT license, five languages, and the first buyback and burn.

This is where it goes next. No dates. Each item ships when it is ready and verifiable, and we will say so here and on the verification page when it does.

## The idea

A vault protocol holds capital in one place at a time. A user picks a vault, deposits, and waits. The next step is to sit one layer above that: a capital allocation layer for tokenized assets on Robinhood Chain that routes USDG between vaults, lending and strategies based on yield, risk and liquidity, and rebalances when the numbers change.

Vertex already reads all of those numbers. The basket ranks vaults by fee flow and depth. Intelligence turns chain reads into signals. Verification checks the fee split, the deposit paths and the exits on every vault, every run. The allocator is what you get when those pieces start making decisions instead of only reporting.

## Building

### Phase 1 · Allocator v0, no custody

A guided allocation flow: enter an amount of USDG and a risk setting, and Vertex proposes a split across vaults and lending with a score for each position and the reasons behind it. You execute from your own wallet, the same way the basket works today. Rebalance suggestions appear when the ranking moves.

No new contracts, no custody, nothing to audit. The scoring model is published in the repository so anyone can read it, run it and argue with it.

### Phase 2 · Allocator v1, onchain

A single Vertex vault that accepts USDG and allocates it across the underlying vaults through the existing router, within hard limits: maximum weight per vault, minimum liquidity, a fresh Chainlink reference before any move. A keeper rebalances inside those limits and can never step outside them.

This phase involves real smart contracts, so it ships under strict conditions. Deposit caps start small and grow only as the contracts prove themselves. Every parameter change goes through a review window. An independent audit is the goal, and we will fund it from allocator revenue and ecosystem grants rather than promise a date we cannot pay for. Until it is audited, the caps stay low and the page says so.

### Phase 3 · Modules and governance

Lending and strategies become modules the allocator can route into, and the door opens to third-party strategies that pass the same checks. VERTEX holders decide the parameters: which vaults are eligible, the weight limits, and how the allocator fee is split.

## Token utility

Today the vault fee split (70% compounds, 20% buyback, 10% treasury) is enforced by the underlying protocol contracts. The allocator adds a fee layer that Vertex itself controls, which changes what the token can do.

- **Buybacks with their own revenue.** A share of the allocator fee buys VERTEX on the open market and sends it to the burn address, on a public schedule, with every transaction posted.
- **Fee discount for stakers.** Staking VERTEX lowers the allocator fee on your own deposits.
- **Governance.** VERTEX votes on the vault whitelist, the weight limits and the fee split of the allocator.

None of this is live yet. It arrives with the phases above, and each piece will be verifiable on chain when it does.

## Alongside the build

- **Daily reports.** A "by the numbers" report every day, generated from chain reads and the verification run, not typed by hand.
- **CoinGecko listing** and complete profiles on DexScreener and GeckoTerminal.
- **Mobile app.** Vertex as an installable progressive web app, so the vaults, the portfolio and the switcher work from the home screen.
- **Verification on every release.** The public check suite runs against production each time something ships. Green, or it does not go out.

## How to hold us to it

Everything above is either on chain or in the open repository. The verification page shows the block and the commit for every run. The token contract is `0x730ee7a12397C8De8CF86Ad70B918626654882c8`. The burn address is `0x000000000000000000000000000000000000dEaD`. If we say something shipped, you can check it.

usevertex.xyz
