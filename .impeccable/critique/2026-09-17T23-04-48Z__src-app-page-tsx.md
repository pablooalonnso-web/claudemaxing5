---
target: home page
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/claudemaxing5/src/app/page.tsx"
target_fingerprint: "sha256:3e0d83e210bbe9d0db06f8f66ca9d1d5a729d03e66e9a4862e861b667e0eba10"
target_path: /home/user/claudemaxing5/src/app/page.tsx
timestamp: 2026-09-17T23-04-48Z
slug: src-app-page-tsx
---
Method: dual-agent (A: a8117e8c134dd85ca · B: a4cf1c90fd7734e6c)
Target: home page, src/app/page.tsx (http://localhost:3000). Detector rendered scans ran through a --no-sandbox Chromium shim in the session scratchpad; project untouched.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live vault cards carry no timestamp and no "observation, not forecast" note next to a 680.3% APR. |
| 2 | Match System / Real World | 2 | Hero lede "provide liquidity"; cards speak in LP position / In range / Uniswap V3 / 01 − 01 + 02 +; USDG unexplained until "Your stack". |
| 3 | User Control and Freedom | 3 | No modals or traps; only the 30s marquee cannot be stopped (reduced-motion only). |
| 4 | Consistency and Standards | 2 | Two Spring Green solids in first viewport; pastel-filled buttons vs Pencil Rule; $WELL vs WELL; guard cards darker than page. |
| 5 | Error Prevention | 2 | "not principal-protected" only in collapsed FAQ and 11px footer legal; hero promises fees and hands "Start now". |
| 6 | Recognition Rather Than Recall | 3 | "combine both" has no antecedent; three "Learn more" buttons. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface, no repeated tasks. |
| 8 | Aesthetic and Minimalist Design | 2 | Ten chapters, 9,102px desktop / 13,252px mobile, 17 buttons, 16-logo wall, 47 footer links, marquee, half-empty lending frame. |
| 9 | Error Recovery | 3 | Good degraded states (figures unavailable, retrying automatically, waiting for next observation). |
| 10 | Help and Documentation | 3 | Seven relevant FAQ items, docs anchors, help center. |
| **Total** | | **23/36** | **Acceptable (64%)** |

## Design Specificity Verdict

LLM assessment: authored content on a borrowed skeleton, ~70% Stockwell / 30% dev-tools template. Stockwell: live diff cards, lending screen with honest small numbers, fee policy spine (hero, quote, step 03, 70/10/20 tile, CTA art, FAQ). Interchangeable: SaaS chapter order, self-quote in testimonial frame, marquee "LONG · SHORT · HEDGE" (not product terminology), three "Learn more", eyebrow "[ INTRODUCING STRATEGIES ]".

Deterministic scan: source scan (page.tsx, components/home, SiteHeader, SiteFooter, PrimaryNavigation; 1,562 lines) 0 findings (regex mode does not read CSS). Rendered scans: desktop 1440x900 64 findings (55 failures, 9 advisory); mobile 390x844 58 findings (49 failures, 9 advisory). Rules: ai-color-palette 15, low-contrast 11/12, undersized-ui-text 10, line-length 8 (desktop only), all-caps-body 4, tight-leading 3, tiny-text 2, wide-tracking 1, marquee 1, clipped-overflow-container 1 (mobile only); advisory: gpt-thin-border-wide-shadow 4, numbered-section-labels 3, repeating-stripes-gradient 1, codex-grid-background 1.
Detector caught, review missed: 9px labels in .home-vault-stats small (contrast 3.1–3.7:1) and 10px .home-lend-comment; range prices in .home-vault-line em at 10px/opacity .7 (median contrast 1.6–1.9:1, live data); .home-vault-comment p line-height 1.2; .g-lede 76ch ≈ 91 chars/line in seven paragraphs plus a ~144-char block (FAQ answers); main{overflow-x:clip} wraps the positioned header/mobile menu; 01/02/03 numbers on guard cards.
False positives: low-contrast on hero h1/p (blur reveal sampling; medians 8.9:1 / 5.4:1); ai-color-palette x15 on brand lavender/magenta (~8:1 on slate); tiny-text, wide-tracking and at least one all-caps-body resolve to the aria-hidden marquee. Four all-caps-body hits could not be pinned to a selector.
Visual overlays: browser overlay skipped: no user-visible browser in this session.

## Overall Impression
Serious instrument with a calm, confident first viewport that then stretches into ten chapters of generic landing page. The parts only Stockwell could have made (diff cards, lending frame, fee policy) are the best on the site. Biggest opportunity: put risk and data freshness before the button and remove everything competing with the one green.

## What's Working
- The diff card is a real invention: a Uniswap V3 range as a three-line document, pastels used as pencils, signed plain-English comment.
- The fee policy is genuinely the spine: quote, step 03, figures tile, CTA art, FAQ.
- Honest live numbers and degraded states; focus ring, hover and reduced-motion coverage complete.

## Priority Issues

[P0] Risk is stated after the button, not before it. Only readable "not principal-protected" is collapsed FAQ item 2 and 11px footer legal; hero says "share in the trading fees" and hands "Start now". Fix: replace the 12px "verify the contracts" link with a one-line row under the buttons (13px slate 72%): "Vault shares move with the Stock Token price and are not principal-protected. Fee APR is a 24h observation, not a forecast." Keep "verify the contracts" as second item; repeat under live cards and closing CTA. Command: /impeccable clarify

[P1] One Green Rule broken in first viewport; primary changes colour at the end. Header .wallet-button (36px #28E99F) + hero .hex-green "Start now" (45px); "Learn more"/"See all vaults" filled lavender on dark chapter, closing "Start now" filled lime. Fix: wallet button Secondary (slate fill, fog text) until connected, green as connected state; on slate use Spring Green + black text for closing "Start now", Outline (lavender border) for the other two. Command: /impeccable colorize

[P1] Live cards lead with the least credible number and their labels are unreadable. LiveVaultCards sorts by APR desc: Intel 680.3% on $1,418 TVL, Palantir $3,590, GameStop $400.96; no timestamp, no sample caveat. Detector: 9px labels at 3.1–3.7:1, range prices at 10px/.7 opacity at 1.6–1.9:1. Fix: rank by TVL with APR tie-break; add "Updated 21:50 · 24h fee observation, not a forecast"; show "–" / "warming up" under a TVL floor; labels and prices to 12px, opacity 1, solid colour. Command: /impeccable harden

[P2] Extra ambient motion and borrowed vocabulary in the strategies band. 30s marquee top and bottom (detector marquee rule) plus floating sphere; "LONG · SHORT · HEDGE" at 10px / .3em over "Deposits open only after review". Fix: remove marquee (keep hatching and dashed rails), stop the sphere, still wave field; label "[ STRATEGIES ]", headline "Two managed strategies, opening after review." Command: /impeccable quieter

[P2] Cards and buttons miss the component contract; small type piles up in the dark chapter. .home-vault-card radius 0, no shadow, hover opacity .9 (DESIGN: 2px lift + lift shadow); "OPEN VAULT" 11px / "SEE ALL VAULTS" 12px uppercase; .g-label 18px uppercase ≥768 (ceiling 14px); card comment line-height 1.2; ledes at ~91 chars/line; 01/02/03 on guard cards. Fix: 16px radius + lift; sentence-case buttons at 14/15px Instrument Sans 600; .g-label 14px; line-height 1.4; .g-lede 62ch; drop the numbers. Command: /impeccable polish

## Persona Red Flags

First-time retail DeFi user with a wallet: "provide liquidity" and "USDG" undefined; "Start now" → /vaults with no bridge sentence; card jargon (LP position, In range, Uniswap V3, 01 − / 01 + / 02 +) without lower/current/upper; principal-protection answer hidden in accordion; lending frame "reserve factor", "onchain adapter", "max LTV 40%" unglossed; two green buttons, will click "Connect wallet" first.

Sceptical power user who reads contracts: 680.3% APR on $1,418 TVL ranked first, no timestamp; figures grid arithmetic (lifetime fees $152.62 vs 554,185,714 WELL burned, 55.41% of supply) does not reconcile on the page; FAQ "an audited executor" while PRODUCT.md says audits are absent and not to be fabricated; "reviewed deployment" reviewed by whom, no link; cards never show or link the vault address; self-quote in testimonial frame reads as theatre.

Phone visitor from X: 360px orb between h1 and lede pushes CTAs to y=697 of 844; logo wall is 16 unlabelled grey circles (names display:none <640px, alt=""), fails "every icon-only control carries a label"; "verify the contracts" 16px-tall tap target; dark chapter 3,220px, figures grid 1,558px single column, ~16 screens total; "SEE ALL VAULTS"/"OPEN VAULT" uppercase 11–12px hardest text to read in the darkest section.

## Minor Observations
- Ten chapters is two too many for Persuade: fold "Your stack" into "Guarded by default", collapse the wall to one pill row + "See all 18 vaults", cut figures to three (candidate for /impeccable distill).
- Desktop header hides the wordmark ≥1024px; footer wireframe spells "stockwell" lowercase.
- "$WELL" (header) vs "WELL" (FAQ, figures, footer); PRODUCT.md fixes $WELL.
- Footer status indicator is a 10px square; chip spec asks for a 6px dot.
- Guard cards on bg-silver, darker than the page, no rest shadow.
- Lending screen (aspect-ratio 3/2) ~60% empty at 1440; shrink or add cap and collateral factor.
- main{overflow-x:clip} wraps the header and its positioned mobile menu.
- Stale font variable names (--font-anybody loads Instrument Sans, spaceMono loads IBM Plex Mono).
- CTA art is the one hexagonal network on a site whose rules ban hexagons.
- Step 02 and CTA art render 8px labels on mobile ("FEES", "LTV · ORACLE · CAP").
- "Managed positions that combine both." needs its antecedent.
- FAQ "What happens when the stock market is closed?" deserves to be visible, not fourth from last.
- Detector advisories matching the spec, no action: hatch dividers, faint grid background, 22px shadow over 1px border (--shadow-card token).

## Questions to Consider
- If every number comes from the chain and today it says $20.1K TVL and $152.62 lifetime fees, is 40px display type the honest size, or is a ledger row that lets small figures be small the honest treatment?
- The protocol only earns when the vault earns. Why ask "Start now" twice rather than "Pick a vault" or "Read the range first"? What does "now" add on a surface that wants verification before deposit?
- Why does Stockwell quote itself in a testimonial frame when it has a burn address and a last claim transaction it could quote instead? What would the section look like if the chain, not the brand, were the only voice?
