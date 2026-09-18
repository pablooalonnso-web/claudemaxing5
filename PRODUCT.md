# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Retail DeFi users who hold USDG or ETH in their own wallet (MetaMask, Rabby or another injected EIP-1193 wallet) and want yield on tokenized stocks without running a liquidity position by hand. They arrive from Robinhood Chain, X or a referral, connect a wallet, pick a vault and deposit. They read on desktop and phone; wallet actions mostly happen on desktop.

## Product Purpose

Vertex is the yield layer for tokenized stocks on Robinhood Chain. It offers managed liquidity vaults (one per Stock Token / USDG pool), a USDG lending market backed by vault shares, a token swap that compares aggregators, a wallet portfolio, docs, a help center and a public status page. Success is a visitor who understands the mechanism, verifies the contracts and deposits with confidence; 20% of claimed fees buys back and burns the token and 10% funds the protocol treasury, as enforced by the vault contracts.

## Positioning

One managed vault per tokenized stock. Each vault holds a single concentrated Uniswap position that a keeper keeps centred on the Chainlink price, and every claimed fee is split onchain: 70% compounds back into the position, 20% is reserved to buy back and burn the protocol token and 10% goes to the protocol treasury. There are no deposit, withdrawal or management fees. Every figure on the site is read from the chain, not from a marketing sheet.

## Operating Context

- Chain: Robinhood Chain (chain id 4663), explorer at robinhoodchain.blockscout.com. Stock Tokens are canonical tokens issued by Robinhood Assets (Jersey) Limited; USDG (Global Dollar) is the unit of account.
- Vault flow: deposit USDG through the entry router, which swaps half into the Stock Token within a TWAP slippage bound and joins the pool; leftovers return to the wallet; redeem to both tokens or to USDG.
- Lending flow: supply USDG, pledge vault shares as collateral, borrow and repay; rates follow utilisation.
- Keeper and oracle: Chainlink price and sequencer feeds must be fresh before any rebalance, deposit or borrow. Out-of-range positions are re-centred by the keeper.
- Data: `/api/public/vaults`, `/api/lending/v2/markets`, `/api/status`, `/api/trade/quotes` and `/api/trade/build`, all served by the Next.js app from live chain reads (12 s cache). Fee APR is a rolling 24 h estimate that starts as a dash until samples exist.
- Deployment: Railway from the `claude/awesome-hawking-qqw4s9` branch; Next.js 15, React 19, viem.

## Capabilities and Constraints

- 18 reviewed V7 managed vaults (AAPL, AMZN, AMD, CRCL, GME, GOOGL, INTC, META, MSFT, MSTR, MU, NVDA, PLTR, QQQ, SNDK, SPCX, SPY, TSLA). One lending market (META vault shares → USDG). Strategies (basket and delta-neutral) are announced as coming soon and take no deposits.
- Swap quotes come from KyberSwap plus a direct pool price; 0x, Nordstern and Enso have no public route on Robinhood Chain, so they never return a quote. Undecided: whether to keep their marks in the Trade UI.
- Transactions are built and simulated against the real contracts but the site never custodies funds; everything executes from the visitor's wallet.
- Terminology: vault, vault shares, LP range (lower / current / upper), fee APR, keeper, entry router, USDG, Stock Token, protocol token.
- Fee APR is an observation, never a forecast; copy must say so.
- Support runs through direct messages to @useevertex on X; a support portal is undecided (NEXT_PUBLIC_SUPPORT_URL switches the contact page to it).
- Open source: MIT; `/docs#source` maps the repository (chain reads, deposit and withdrawal builders, verify script, Intelligence rules) with file links on the deployed branch and run instructions. The repository must be public on GitHub for those links to work.
- Zap (`/zap`, Products menu): deposit into any vault starting from ETH, USDG or a Stock Token. Quotes the KyberSwap route to USDG and the router deposit (balance state override) before signing, then runs approve, swap, approve, deposit in order with retry from a failed step; the USDG that actually arrives from the swap is what gets deposited.
- Basket exit: the basket page also lists the wallet's positions and exits the selected ones (25/50/100%, to USDG through the router or to tokens) in one sequential signing flow with retry; preview quotes simulate the router redemption with an allowance state override so the amount shows before signing.
- Portfolio history: `/portfolio` reads the wallet's vault share mints and burns from Transfer logs (through the same-origin relay, official RPC first), then the USDG and Stock Token legs in those receipts, and shows deposited, withdrawn, held-now value and change per vault with every transaction linked. Nothing stored; change includes the stock price move and says so.
- Intelligence (reveals 18 Sep 2026 09:00 UTC, `?preview=1` before): `/intelligence` computes per-vault signals on the server every minute (range position, edge proximity, oracle age, pool vs oracle deviation, deposit status, lifetime fees), lending totals and alerts. A rules engine writes the brief and answers seven guided questions from those signals at zero cost; the page labels it "computed, rules, not a model". If ANTHROPIC_API_KEY is set, a language model adds a 15-minute brief and free-text answers grounded only in the signals (20 per IP per hour, 600 per day). Nothing there advises or moves funds.
- Strategies: the volatile basket is live at `/strategies/basket` as a non-custodial guided flow (rank open vaults by realized APR with a $1,000 TVL floor, split USDG evenly, one router approval and deposit per vault signed by the user, rotation suggested from the wallet's positions, never automatic). The delta-neutral strategy stays in design until a short venue for Stock Tokens exists on Robinhood Chain.
- `/verify` publishes the latest automated verification run (`npm run verify`, script in `scripts/verify.ts`): contract wiring, vault state, fee counters, simulated deposits and withdrawals, lending, swap routing and site checks. It is a functional check and says so; no third-party audit has been commissioned.

## Brand Commitments

- Name: Vertex (renamed from Stockwell in September 2026; trademark and domain checks pending, and "Vertex Protocol" exists elsewhere in DeFi). The protocol token is referred to as "the Vertex token"; no ticker is shown anywhere on the site. Production domain: usevertex.xyz. X handle: @useevertex.
- Mark: the four-petal mark (`src/components/BrandMark.tsx`), also used as favicon and on the footer cube field. Keep it.
- Voice: plain, factual, first person plural sparingly; no hype, no promises of return. The footer legal paragraph was removed at the owner's request in September 2026; the risk line under each call to action stays.
- The owner rejects anything that reads as a template or AI output: no wall-to-wall monospaced type, no hard square corners, no shouting uppercase, no overloaded explainer diagrams, no em dashes. Rounded corners, pill buttons and ordinary text figures are the confirmed direction.

## Evidence on Hand

- Live onchain figures for every vault, market and the burn address; no invented numbers anywhere.
- Contract addresses for vaults, routers, positions, pools and the lending market in `src/data/managed-vaults.json` and `src/lib/registry.ts`, all verifiable on Blockscout.
- Stock Token logos in `public/stock-tokens/`, partner marks (Robinhood, Uniswap, Chainlink, USDG, KyberSwap, 0x, Nordstern, Enso) in `public/brands/`.
- Absent, and not to be fabricated: customer testimonials, named customers or partners beyond the technical stack, audit reports, TVL history charts, press.

## Product Principles

1. Show the chain, not a brochure: every number on the page comes from a contract read and says how fresh it is.
2. Earn only when the vault earns: the fee policy is the product's spine and should stay legible on every surface.
3. Verify, don't trust: contracts, ranges and safeguards are one click from wherever a figure appears.
4. Never oversell risk-bearing products: vault shares are not principal-protected and the copy says so before the button.
5. Design that reads as made by people: warm, rounded, restrained, with real content and no template tells.

## Accessibility & Inclusion

Wallet flows must work with keyboard only and announce state changes; animations honor reduced-motion; figures use tabular numerals; every icon-only control carries a label.
