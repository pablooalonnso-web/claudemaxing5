---
target: home page
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/claudemaxing5/src/app/page.tsx"
target_fingerprint: "sha256:cff4f19f29a1bcf142e661c5f61b63bedd1f144c3f7c531c63ad77d030bdc203"
target_path: /home/user/claudemaxing5/src/app/page.tsx
timestamp: 2026-09-17T23-45-28Z
slug: src-app-page-tsx
---
Method: dual-agent (A: a65c59d235c8bb4b4 · B: a868f10eb37906632)
Target: home page, src/app/page.tsx at http://localhost:3000 (commit 9ca0ffb). Second run, after the clarify / colorize / harden / quieter / polish pass.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live cards state time and cadence; figures grid has no clock; lending frame states no freshness; aria-live on the read line re-announces every 15s. |
| 2 | Match System / Real World | 2 | Diff notation 01 − / 01 + / 02 +, LP position, Uniswap V3, 0x…dEaD balance, reserve factor, max LTV 40% assume git and DeFi literacy. |
| 3 | User Control and Freedom | 3 | Menus close on Esc and outside click; all 16 wall cells go to /vaults instead of the named vault. |
| 4 | Consistency and Standards | 2 | Three "Learn more" to three destinations; hero "How it works" goes to /docs while an on-page pill row says the same; "WELL flywheel" vs "$WELL flywheel"; British/American spelling drift. |
| 5 | Error Prevention | 3 | Risk line at all three CTAs, FAQ #2 answers "No."; but 49.3% fee APR on a $3,590 pool is still a headline stat (floor is $1K). |
| 6 | Recognition Rather Than Recall | 2 | Phone wall is 16 unlabeled grey circles (alt="", name hidden); diff codes never explained; $WELL button gives no clue it copies an address. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface, no repeated task. |
| 8 | Aesthetic and Minimalist Design | 2 | 13 pill CTAs, 10 chapters, a full chapter for strategies with no deposits, two identical hatch bands, "See all 18 vaults" 60px above "See all vaults"; 9,321px desktop / 13,672px mobile. |
| 9 | Error Recovery | 3 | Fallback copy in voice; no visual state change beyond text. |
| 10 | Help and Documentation | 3 | Seven-item FAQ with the right questions, help-center link; 7,200px down. |
| **Total** | | **23/36** | **Acceptable (64%)** |

Same total as run 1; error prevention rose 2→3 (risk line), control and recognition each fell by one (wall without destination or accessible name).

## Design Specificity Verdict

LLM assessment: authored in the middle, template at the edges, ~40% Stockwell. Own: live diff cards with real prices, keeper comment and "Read from Robinhood Chain at hh:mm"; fee policy quote in the product's voice; RiskNote as a first-class component at all three CTAs; honest small figures. Template: the hero (generic yield headline, orb unrelated to stocks or ranges, wordmark hidden ≥1024px so "Stockwell" first appears 1,280px down), 16-logo wall, four partner frames, three "Learn more", two hatch bands, a 48px "FAQ", a CTA repeating the hero. The orb is an owner-pinned direction; the actionable fold items are the wordmark and a headline naming the mechanism. Rules: One Green holds; Pencil holds except StackArt pastel rectangles; Slate Chapter holds; No-Shouting fails on .g-label 18px/16px; Figures-Are-Text holds; Slate Shadow holds where shadows exist, guard cards darker than page; Press holds on buttons, vault cards dim instead of lifting.

Deterministic scan: source scan 0 findings. Rendered desktop 43 (34 failures, 9 advisory), mobile 36 (27 failures, 9 advisory); down from 64/58, with undersized-ui-text, tiny-text, tight-leading and marquee gone. Per rule: ai-color-palette 15, line-length 8 (desktop only), low-contrast 6, all-caps-body 4, wide-tracking 1, clipped-overflow-container 1 (mobile only), advisory 9.
Agreement: .g-pill uppercase at 11–12px with 31–40 chars (real); footer legal 10px at 122 chars/line (detector: length; review: 2.43:1 contrast); 01/02/03 on guard cards. Review caught, detector missed: dark-chapter pill labels inherit rgba(255,207,254,.35) from the section's inline colour and measure 1.62:1; green focus ring on the green button; wall links with no accessible name. False positives verified by computed colour: ai-color-palette ×15 is brand lavender on slate at 8.06:1; low-contrast ×4 caused by 1px stripe background-image (real 5.4–9.3:1) and ×2–3 by sampling during the g-reveal blur (real 6.9–8.9:1); wide-tracking is the footer wireframe caption; the mobile clip is the decorative wave SVG; 5 of 7 FAQ line-length hits measure 74–80 real chars (two at 82 and 87 are real).
Visual overlays: browser overlay skipped: no user-visible browser in this session.

## Overall Impression
The previous pass fixed what it had to: risk before deposit, one green, credible cards, calm band. What remains is structural: the product's proof still sits at 2,800px behind a grey logo wall and two chapters of furniture, and the page spends ten chapters and thirteen buttons on what six could say. Biggest opportunity: shorten and raise the proof.

## What's Working
- Live diff cards: the one object a competitor cannot copy without copying the product.
- Fee policy as the first argument after the hero, restated in step 03 and the figures tile without fatigue.
- RiskNote as a component at hero, dark chapter and CTA (6.9:1 light, 8:1 on slate); FAQ #2 opens with "No."

## Priority Issues

[P1] Page is 10–16 viewports and buries its proof. Retail readers stop at the logo wall; sceptics smell vapour at "Two managed strategies, opening after review"; live cards arrive at 2,800px (3,600 mobile). Fix: cut to hero, fee policy, how it earns, live cards, lending, guarded (absorbing "Your stack"), figures, FAQ, CTA; strategies to one pill row with a link; drop one hatch band and the "See all vaults" button; turn the three "Learn more" into named links. Command: /impeccable distill

[P1] Small text that cannot be read, in three places. Dark-chapter pill labels at 1.62:1 (inherited rgba(255,207,254,.35)); footer legal 10px at 2.43:1 and copyright 1.86:1; focus ring green on green; aria-live announces every 15s. Fix: .t-slate .g-pill { color: var(--lavender) } keeping 35% on ::before only; legal/copyright 12px rgba(42,42,42,.85); .hex-green:focus-visible { outline-color: var(--slate) }; aria-live only on the error state. Command: /impeccable polish

[P1] On phones the wall is 16 unnamed links. Below 640px the name is display:none and the logo has alt="", so 16 links with no accessible name, all to /vaults, grayscale at 70%. Fix: link each cell to VAULT_PINS[i].href with aria-label, drop grayscale, single row of six with names on phones. Command: /impeccable adapt

[P2] The first viewport does not say Stockwell. .gh-wordmark hidden ≥1024px; generic headline. Fix: show the wordmark at all widths; headline naming the mechanism ("One vault per stock. Fees split onchain."); orb stays unless the owner decides otherwise. Command: /impeccable bolder

[P2] The first number is still a small-pool APR, and "Verified onchain" links nowhere. 49.3% on $3,590 Palantir; $1K floor too low; guard card names Blockscout with no link; "Verify the contracts" goes to docs, not the explorer. Fix: APR_TVL_FLOOR $10K or sample gate, label "24h fee APR, observed", "n/a on pools under $10K"; link the guard card to the explorer. Command: /impeccable harden

## Persona Red Flags

First-time retail DeFi user with a wallet: $WELL copy button unexplained until a 10px tooltip; hero "How it works" leaves to /docs while the on-page row exists under an unreadable pill; diff notation without legend; nothing before "Start now" says what is needed (USDG on Robinhood Chain, injected wallet), "Which wallets work?" is 7,300px down; "Supply USDG" looks as primary as "Start now".

Sceptical power user: "Verify the contracts" goes to /docs#contracts not Blockscout, "Verified onchain" links nowhere; 49.3% APR beside $155.27 lifetime fees contradict; "Protocol figures, read onchain." includes constants (Chain, Fee split); Products menu "Best route across four aggregators" while three never quote; "opening after review" with no reviewer or date, "reviewed deployment" implies an audit; CTA art omits the 10%; testimonial frame around the fee policy reads as manufactured endorsement.

Phone visitor from X: OG description gives no category; 16 grey unlabeled circles then a 3,430px dark chapter with 11px monospace art labels unreadable at 342px; dark pill labels invisible (1.62:1); figures column 1,561px, FAQ at 11,385px, total 13,672px; mobile menu 13 flat options with 10px group labels at 60%; footer legal 10px at 2.43:1.

## Minor Observations
- .g-label 18px uppercase (16px mobile) breaks No-Shouting; label token is 12px.
- .home-vault-card:hover dims to .9; system says lift 2px; reduced-motion block references a lift that no longer exists.
- .home-wall-cell radius 0 on a link; grayscale + .7 opacity reads as disabled.
- Guard cards silver on paper grey, no border or shadow; seafoam dot texture invisible; "01" at 3.45:1.
- "Your stack" frames triple-label each item (chip, caption, number).
- "Preview strategies" lime text on slate in a light section; DESIGN reserves lime for dark chapters.
- Figures grid has no clock; "Vaults with a live APR: 17" is an odd headline metric.
- Footer cubes: cursor pointer and green hover with no action.
- One pill label ends with a full stop, three do not; British/American spelling drift.
- Resources "Contact" uses a bar-chart icon; meta description is a run-on; title is just "Stockwell".
- "Connecting…" will jitter the wallet button width.
- g-reveal uses blur and scale where DESIGN asks for a plain fade; reduced-motion honoured.
- Detector advisories matching the spec: hatching, faint grid, --shadow-card over 1px border.

## Questions to Consider
- If the diff card is the only thing nobody else can draw, why is it the eighth thing a visitor sees, and what if it were the hero?
- The page states the fee policy and the risk sentence three times each but shows 49% APR on a $3.6K pool. Which number does a screenshot on X carry, and does the page deserve that screenshot?
- Would a page half this long, putting the small true numbers next to the mechanism and stopping, persuade more people to deposit?
