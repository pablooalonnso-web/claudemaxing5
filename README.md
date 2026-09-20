# Vertex

USDG vaults, lending and strategies for tokenized stocks on Robinhood Chain. The product and data layer come from the
TickerSpring protocol front end; the visual system (blueprint grid, rulers and hatching, pill buttons and rounded cards,
Instrument Sans / DM Sans / IBM Plex Mono type) follows greptile.com. Every figure is read straight from the chain, and every action executes
from the visitor's wallet.

### Design system

* Tokens live in `src/app/globals.css` (`:root`) and the shared utilities in `src/styles/greptile.css`: `.hex` pill buttons
  (`.hex-outline`, size and colour modifiers), `.div-ruler` / `.div-hatch` / `.div-double-dashed` dividers,
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
* `POST /api/rpc` – read-only JSON-RPC relay the browser falls back to when the public RPC answers without CORS headers.
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

## Verification

`npm run verify` exercises the live contracts and the production site the way the app does, without sending a
transaction: chain and contract wiring, the live state of all 18 vaults, the fee counters, a simulated deposit and two
withdrawal paths per vault (eth_call state overrides give a throwaway account the balance and allowance it needs), the
lending market, swap routing, and every page and API. It writes `public/verification/latest.json`, rendered at `/verify`,
and a Markdown copy under `verification/`. `--no-site` skips the site checks, `--site <url>` targets another deployment,
`--build` adds typecheck and lint. This is a functional check, not a third-party security audit.

## Languages

The interface ships in English, Spanish, Simplified Chinese, French and German. The switcher sits in the header (and in the mobile menu and footer); the choice is stored in a `vertex-lang` cookie, and first-time visitors get the language their browser asks for. Messages live in `src/i18n/messages/<namespace>.ts`, one table per language, with English as the fallback for any missing key. Chain data, the intelligence brief and the verification report stay in English because they are generated, not written.

## Install as an app

Vertex is a progressive web app. Open usevertex.xyz on a phone and use "Add to home screen"; on desktop Chrome an install button appears in the address bar. It runs standalone, with shortcuts to Vaults, Portfolio and Verification.

The service worker caches the app shell and build assets only. API responses, the RPC relay and the verification report always go to the network, so a figure is either live or absent, never stale. With no connection the app shows an honest offline screen rather than old balances.

## Allocator

`/allocator` is the first step of the roadmap: enter a USDG amount and a risk setting, and the site proposes a split across
the open vaults and the lending market with a score and the reasons for each position. Execution runs from the user's own
wallet through the same router and market contracts as the product pages, one leg after another; nothing is pooled and no
new contract is involved. The scoring model is `src/lib/allocator.ts`: four component scores per candidate (yield, depth,
health, stability) from the same chain reads the vault pages use, weighted by profile, capped per position, with a lending
floor for the conservative and balanced profiles. `GET /api/allocator?amount=1000&risk=balanced` returns the proposal as
JSON, and `npm run allocator -- --amount 1000 --risk balanced` runs the same model from the command line against the public
data. It ranks, it does not forecast.

## Allocator v1 (onchain)

`contracts/VertexAllocatorV1.sol` is one vault that accepts USDG and allocates it across the whitelisted stock vaults
through their existing routers, inside limits the contract enforces itself: only whitelisted targets, a maximum weight
per vault, a minimum target size, a fresh Chainlink reference before any move (the target's valuation reverts when the
feed is stale), a bounded loss on every move in or out, one allocation per vault per hour, and a deposit cap that starts small. Withdrawals are in kind: a
holder always receives the pro rata slice of idle USDG, of every vault position and of any stock dust, so exits never
need a price, a swap or the keeper, and a holder can forfeit the slice of a vault that blocks transfers instead of being
stuck. Every parameter change waits a 24 hour review window; pausing, disabling a target and lowering the
cap apply at once. The deposit fee goes to the treasury the deployer sets.

`npm run compile:allocator` compiles it with solc 0.8.24 into `src/data/allocator-v1.artifact.json` (ABI, creation and
runtime bytecode, source hash). `npm run simulate:allocator -- --block <n> --vault PLTR --amount 1000` runs the
end-to-end scenario in `contracts/test/AllocatorScenario.sol` inside a single `eth_call` at that block, with the
scenario's code and a USDG balance injected through state overrides: deploy, deposit, the limits rejecting a bad move,
an allocation through the real router, an in-kind withdrawal and an exit back to USDG. Nothing is signed or sent. The
page `/allocator/v1` deploys the contract from the connected wallet (which becomes owner, keeper, guardian and treasury)
and, once `src/data/allocator-v1.json` carries the address, shows deposits, withdrawals and the keeper console.

## Badges

Live SVG badges, generated per request from chain reads and the latest verification run. Drop one anywhere an image works:

```
![burned](https://usevertex.xyz/api/badge/burned.svg)
![circulating](https://usevertex.xyz/api/badge/circulating.svg)
![verified](https://usevertex.xyz/api/badge/checks.svg)
```

Available metrics: `burned`, `circulating`, `supply`, `vaults`, `checks`, `split`.

## Configuration

See `.env.example`. Everything works with defaults; the variables let you point at another RPC, an upstream snapshot API,
a Uniswap QuoterV2 (for reference pool quotes on the trade page) or a different protocol token.

Brand names, the token ticker and social links live in `src/lib/brand.ts`.

## License

MIT. The site, its data layer, the verification script and the Intelligence rules are open; the vault, router and
lending contracts belong to the protocol and are verified on Sourcify.

## Disclaimer

Stock Tokens are tokenised debt securities issued by Robinhood Assets (Jersey) Limited. Vault shares are not stable, not
principal-protected and not a deposit. Fee APR figures are estimates from observed pool fees, not forecasts. This
software is provided under the MIT License without warranty of any kind.
