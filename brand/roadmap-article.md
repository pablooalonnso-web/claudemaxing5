# The Vertex roadmap: one layer above the vaults

Vertex launched with one job: run managed liquidity vaults for tokenized stocks on Robinhood Chain, split every fee onchain, and let anyone check the numbers. In the first day we shipped 18 vaults, lending, swap, zap, a basket strategy, an intelligence desk, a public verification page with 126 automated checks, the full source code under an MIT license, five languages, and the first buyback and burn.

The product is live. Now the question is where it goes, and in what order. This roadmap has no dates. It has a sequence, and every step will be verifiable on chain or in the repository when it lands.

## Where we are going

One of our holders sent us this, and it is the clearest way to say it:

> "I think dev should eventually move one layer above individual stock vaults. Instead of just being another vault protocol, it could become the capital allocation layer for tokenized assets on Robinhood Chain — automatically routing capital between vaults, lending and strategies based on yield, risk and liquidity."

That is the plan. Vertex moves one layer above individual stock vaults. A vault holds capital in one place. The allocator decides where capital should be, across vaults, lending and strategies, using the same chain reads that already power the basket, Intelligence and the verification page.

Getting there takes two things in order: an audience that can see the work, and then the work itself.

## Step 1 · Marketing: get the audience

Building in silence does not help anyone, and the holders we have are loyal but few. So the first step is a short, deliberate push to put Vertex in front of more people, and then we go back to building.

**30x DexScreener boost, live with this article.** The moment this roadmap is published, we pay for a 30x boost on DexScreener. Anyone who lands on the token page that day finds a working product, a public verification page, open source code and this plan, not a promise.

**CoinGecko listing.** We submit the listing and complete the token profiles on DexScreener and GeckoTerminal: logo, site, X, Telegram, contract. The basics that make a token look like someone is behind it.

**Daily reports.** A "by the numbers" report every day, generated from chain reads and the verification run, not typed by hand. Deposits, fees, the fee split, burned supply, checks passed. Posted on X and Telegram.

**Telegram.** The discussion group is open. Questions, bug reports and the team answering.

That is the whole marketing plan. No paid influencers, no price talk. Visibility for a product that already works, then heads down.

## Step 2 · Building: the allocator

With the audience in place, the focus moves to building, in three phases. Each one is a product on its own and each one ships when it is ready.

### Phase 1 · Allocator v0, no custody

A guided allocation flow: enter an amount of USDG and a risk setting, and Vertex proposes a split across vaults and lending, with a score for each position and the reasons behind it. You execute from your own wallet, the same way the basket works today. Rebalance suggestions appear when the ranking moves.

No new contracts, no custody, nothing to audit. The scoring model is published in the repository so anyone can read it, run it and argue with it.

### Phase 2 · Allocator v1, onchain

A single Vertex vault that accepts USDG and allocates it across the underlying vaults through the existing router, within hard limits: maximum weight per vault, minimum liquidity, a fresh Chainlink reference before any move. A keeper rebalances inside those limits and can never step outside them.

This phase involves real smart contracts, so it ships under strict conditions. Deposit caps start small and grow only as the contracts prove themselves. Every parameter change goes through a review window. An independent audit is the goal. We will fund it from allocator revenue and ecosystem grants rather than promise a date we cannot pay for, and until it is audited the caps stay low and the page says so.

### Phase 3 · Modules and governance

Lending and strategies become modules the allocator can route into, and the door opens to third-party strategies that pass the same checks. VERTEX holders decide the parameters: which vaults are eligible, the weight limits, and how the allocator fee is split.

## What VERTEX does

Today the vault fee split (70% compounds, 20% buyback, 10% treasury) is enforced by the underlying protocol contracts. The allocator adds a fee layer that Vertex itself controls, and that is what gives the token a job.

- **Buybacks with their own revenue.** A share of the allocator fee buys VERTEX on the open market and sends it to the burn address, on a public schedule, with every transaction posted.
- **Fee discount for stakers.** Staking VERTEX lowers the allocator fee on your own deposits.
- **Governance.** VERTEX votes on the vault whitelist, the weight limits and the fee split of the allocator.

None of this is live yet. It arrives with the phases above, and each piece will be verifiable on chain when it does.

## Alongside everything

- **Mobile app.** Vertex as an installable progressive web app, so the vaults, the portfolio and the language switcher work from the home screen.
- **Verification on every release.** The public check suite runs against production each time something ships. Green, or it does not go out.

## How to hold us to it

Everything above is either on chain or in the open repository. The verification page shows the block and the commit for every run. The token contract is `0x730ee7a12397C8De8CF86Ad70B918626654882c8`. The burn address is `0x000000000000000000000000000000000000dEaD`. If we say something shipped, you can check it.

usevertex.xyz
