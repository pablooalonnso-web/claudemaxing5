# Stockwell

USDG vaults, lending and strategies for tokenized stocks on Robinhood Chain. The product and data layer come from the
TickerSpring protocol front end; the visual system (blueprint grid, hexagon buttons, rulers and hatching, Anybody /
DM Sans / Space Mono type) follows greptile.com. Every figure is read straight from the chain, and every action executes
from the visitor's wallet.

### Design system

* Tokens live in `src/app/globals.css` (`:root`) and the shared utilities in `src/styles/greptile.css`: `.hex` buttons
  (`.hex-notch`, `.hex-outline`, size and colour modifiers), `.div-ruler` / `.div-hatch` / `.div-double-dashed` dividers,
  `.g-frame` hatched picture frames, `.g-rails` dashed section rails, `.g-pill-row` labels and the inner-page masthead.
* Fonts are self-hosted in `src/fonts` and loaded through `next/font/local` (`src/lib/fonts.ts`).
* Decorative assets (halftone hero, footer cube field, sphere, wave) are in `public/design` and `src/components/home/Art.tsx`.

## What is in the box

| Route | What it does |
| --- | --- |
| `/` | Marketing home with a live "top vaults" board, protocol totals, token burn figures and the lending teaser. |
| `/vaults`, `/vaults/[id]` | Directory of the 18 reviewed V7 vaults and a per-vault workspace with price/LP-range chart, contracts, deposit and withdraw flows. |
| `/lending`, `/lending/[market]` | USDG lending markets with live utilisation and rates, plus lend / withdraw / lock / borrow / repay flows. |
| `/trade/swap` | Token swap with live KyberSwap routes (Robinhood Chain) and on-chain execution. |
| `/portfolio` | Wallet balances, vault positions and an ETH / token transfer form. |
| `/strategies`, `/intelligence`, `/docs`, `/help`, `/help/contact`, `/status` | Informational pages; `/status` reports live chain, oracle, vault and keeper health. |

### Data layer

* `GET /api/public/vaults` – snapshot of every vault (TVL, fees, LP range, deposit state, 24h fee APR). Read from the chain
  with viem and cached for 12 s. Set `UPSTREAM_API_URL` to proxy an existing snapshot API instead.
* `GET /api/lending/v2/markets[/:market[/positions/:owner]]` – lending market accounting, rates and per-wallet positions.
* `GET /api/status` – component health used by the status page.
* `GET /api/trade/quotes`, `POST /api/trade/build` – aggregator quotes and calldata (KyberSwap).

Fee APR is estimated from a rolling 24-hour window of on-chain fee observations. Samples are kept in memory and mirrored
to `.data/fee-samples.json`, so the window keeps building across restarts; the estimate appears after the first minute
of observations.

### Wallet

Connection uses the browser's injected EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet, …). The app prompts to add or
switch to Robinhood Chain (chain id 4663). No third-party auth service or API key is required.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Checks:

```bash
npm run lint
npm run typecheck
```

## Configuration

See `.env.example`. Everything works with defaults; the variables let you point at another RPC, an upstream snapshot API,
a Uniswap QuoterV2 (for reference pool quotes on the trade page) or a different protocol token.

Brand names, the token ticker and social links live in `src/lib/brand.ts`.

## Disclaimer

Stock Tokens are tokenised debt securities issued by Robinhood Assets (Jersey) Limited. Vault shares are not stable, not
principal-protected and not a deposit. Fee APR figures are estimates from observed pool fees, not forecasts. This
software is provided under the MIT License without warranty of any kind.
