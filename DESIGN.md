---
name: Vertex
description: Workshop-blueprint precision with rounded, tactile parts, for tokenized-stock vaults on Robinhood Chain.
colors:
  slate: "#3D3B4F"
  onyx: "#2A2A2A"
  fog: "#EEEEEE"
  paper-grey: "#E9E9E9"
  silver: "#D6D6D6"
  spring-green: "#28E99F"
  seafoam: "#C5FFD6"
  pool-green: "#1c9a69"
  lavender: "#FFCFFE"
  magenta: "#FFACFE"
  neon: "#DAFF01"
  lime: "#ECFFA3"
  violet: "#756CF5"
  blueprint-blue: "#5882FF"
  ice: "#D1E5FF"
  sky: "#71ADFF"
  ember: "#b5633a"
  rule: "rgba(85,83,104,0.3)"
typography:
  display:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(56px, 8.5vw, 116px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(30px, 4vw, 48px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.04em"
  code:
    fontFamily: "IBM Plex Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  annotation:
    fontFamily: "Nanum Pen Script, cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "10px"
  md: "16px"
  pill: "999px"
  round: "50%"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.spring-green}"
    textColor: "#000000"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
  button-primary-hover:
    backgroundColor: "{colors.spring-green}"
    textColor: "#000000"
  button-secondary:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.fog}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.slate}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
  button-outline-hover:
    backgroundColor: "{colors.seafoam}"
    textColor: "{colors.slate}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.slate}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  nav-link-active:
    backgroundColor: "{colors.spring-green}"
    textColor: "#000000"
  chip-status:
    backgroundColor: "{colors.seafoam}"
    textColor: "{colors.slate}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.fog}"
    textColor: "{colors.slate}"
    rounded: "{rounded.md}"
    padding: "24px"
  card-dark:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.lavender}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.fog}"
    textColor: "{colors.slate}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "40px"
---

# Design System: Vertex

## Overview

**Creative North Star: "The Workshop Blueprint"**

Vertex looks like a precision instrument drawn on a workshop blueprint, then handed to a person. The page is a sheet of pale grey paper with a faint dotted grid; sections are separated by rulers with millimetre ticks, diagonal hatching bands and dashed rails with small corner marks, the way a technical drawing frames its views. On that sheet, everything the visitor touches is rounded and warm: pill buttons, soft-cornered cards, a humanist grotesk for headings and ordinary text figures in tables. The tension between the exact, ruled background and the friendly, tactile foreground is the identity. Precision earns trust; roundness makes it approachable.

Density is moderate. Marketing surfaces breathe with big display type and one animated wire orb; operating surfaces (vault tables, deposit tickets, lending workspaces) tighten to scannable rows and 40px controls. Dark slate blocks with lavender text carry the dramatic passages (the "how vaults earn" chapter, the closing call to action, page mastheads), and lime is the headline colour on dark. One green does the work of "act here"; the pastel accents (lavender, magenta, seafoam, neon, ice) are annotation colours, used the way a draughtsman uses coloured pencils on a plan.

The owner has rejected, explicitly, anything that reads as a template or machine output: wall-to-wall monospace, hard square corners, shouting uppercase headlines, overloaded explainer diagrams and em dashes. Those are anti-references, not options.

**Key Characteristics:**
- Blueprint chrome (dotted grid, tick rulers, hatching, dashed rails) around rounded, tactile parts.
- One action colour, Spring Green, on ≤10% of any screen; pastels annotate, never call to action.
- Slate-on-grey by default; slate blocks with lavender and lime for emphasis chapters.
- Instrument Sans headings, DM Sans everything else, IBM Plex Mono only for addresses and code.
- Lightly lifted surfaces: cards rest on a soft offset shadow and rise 2px on hover; buttons lift 1px and press to 98%.
- Real numbers, tabular, refreshed from the chain, with the freshness stated beside them.

## Colors

A cool grey sheet with one saturated green and a box of pastel pencils.

### Primary
- **Spring Green** (#28E99F): the only "act here" colour. Primary buttons, the active nav pill, the live status dot, the highlighted band on charts. Black text on it, never white.
- **Pool Green** (#1c9a69): the same hue at reading contrast. Positive figures (fee APR, supply rate), links on hover, the caret, focus tints. Use it wherever green must be text on pale grey.
- **Seafoam** (#C5FFD6): green's whisper. Hover fill for outline buttons and nav links, "open" and "in range" chips, table-row hover, the dotted texture inside stat cards.

### Secondary
- **Lavender** (#FFCFFE): body text and rules on slate blocks; the step labels on the dark chapter. Never on light backgrounds as text.
- **Lime** (#ECFFA3): headline colour on slate (mastheads, the closing CTA) and the buy-back tile. Only on dark.
- **Magenta** (#FFACFE): the "removed / lower bound" line in diff-style cards, the price marker, the swap tile. A pencil, not a warning colour.

### Tertiary
- **Neon** (#DAFF01): the LP-range frame and fee chips inside illustrations; the "beta" badge. Tiny areas only.
- **Blueprint Blue** (#5882FF), **Ice** (#D1E5FF), **Sky** (#71ADFF): wireframe strokes, the strategies wave field, the Chainlink hexagon. Illustration and rails, never UI chrome.
- **Violet** (#756CF5): handwritten annotations and the utilisation bar.
- **Ember** (#b5633a): the one warm colour, reserved for danger states and failed transactions.

### Neutral
- **Slate** (#3D3B4F): all body text, headings, primary dark surfaces, icon strokes. Warm-cool purple-grey rather than black.
- **Onyx** (#2A2A2A): footer link text only, where the dotted paper needs a touch more weight.
- **Fog** (#EEEEEE): card, header, footer and input surfaces; text on slate.
- **Paper Grey** (#E9E9E9): the page ground. Cards are lighter than the page, so depth reads even without shadow.
- **Silver** (#D6D6D6): hairline borders, dividers, disabled fills, table rules.
- **Rule** (rgba(85,83,104,.3)): the colour of rulers, dashed rails and hatching; always translucent slate so it sits into any ground.

### Named Rules
**The One Green Rule.** Spring Green marks the action a visitor is meant to take. If two green solids are visible in one viewport, one of them is wrong.
**The Pencil Rule.** Pastels annotate: labels, chips, strokes, tiles inside drawings. They never fill a button, never carry a warning and never appear as large surfaces on light ground.
**The Slate Chapter Rule.** Dark passages use slate with lavender body text and lime headings, never white text on black. The dotted grid continues through them at 5% lavender.

## Typography

**Display Font:** Instrument Sans (with Helvetica Neue, Arial)
**Body Font:** DM Sans (with Helvetica Neue, Arial)
**Label/Mono Font:** DM Sans for labels and figures; IBM Plex Mono strictly for addresses, hashes and code
**Annotation Font:** Nanum Pen Script, for handwritten notes inside blueprint illustrations only

**Character:** A humanist grotesk with quiet personality over a neutral, rounded workhorse. Headlines are tight and heavy but never uppercase; figures are ordinary text set with tabular numerals so a table reads like a document, not a terminal.

### Hierarchy
- **Display** (700, clamp(56px, 8.5vw, 116px), 0.95): the hero statement only. Sentence case with a full stop; two lines maximum.
- **Headline** (700, 30 to 48px by breakpoint, 1.05, -0.03em): section heads and page mastheads; italic Instrument Sans for the emphasised phrase inside a headline.
- **Title** (500, 18 to 24px, 1.35, -0.02em): card and frame captions, vault names, dialog headings.
- **Body** (400, 15 to 18px, 1.5): running copy at 65 to 76ch. Ledes go to 18px on desktop.
- **Label** (500, 11 to 14px, 0.04 to 0.06em tracking, uppercase): section tags in square brackets, chips, table headers, footer links. This is the only place uppercase is allowed.
- **Code** (400, 12px, IBM Plex Mono): contract addresses, transaction hashes, pool ids, code samples.

### Named Rules
**The No-Shouting Rule.** Uppercase lives in labels 14px and under. Headlines, buttons and body are sentence case.
**The Figures-Are-Text Rule.** Numbers use the body face with `font-variant-numeric: tabular-nums`. Monospace is for identifiers, not for looking technical.
**The Bracket Rule.** A section tag reads `[ VAULTS ]`, in label style, above its headline; it is the blueprint's view title, not a marketing eyebrow, and it appears only at chapter starts.

## Layout

The sheet is 1600px wide at most, centred, with 24px gutters on phones, 48px from 768px and 64px from 1024px. A 12-column grid with 16, 24 and 32px gaps carries the marketing chapters; operating pages use a 1120 to 1360px content column with tables that scroll horizontally inside a rounded container rather than shrinking.

Chapters are separated by drawing furniture instead of white space: a 16px tick ruler, a 32px double-dashed line, a 48 or 120px diagonal hatching band, or a one-line pill row (a label between two plus-rulers). Dashed vertical rails sit 32px inside the page edge with 7px square marks at their corners; they hide below 768px. The dotted paper grid (24px) and the faint blueprint grid (48px on slate) run under everything.

Breakpoints: 640px (wall labels appear), 768px (grids go to two or three columns, rails and desktop art appear), 1024px (full grids, desktop navigation), 1920px (label sizes step up). Vertical rhythm is 40 / 56 / 64px section padding by breakpoint.

## Elevation & Depth

Lightly lifted, with tonal layering doing the first job. Cards are Fog on a Paper Grey ground, so they already read a step up; a soft offset shadow (`0 6px 22px -14px rgba(61,59,79,.35)`) then lifts them off the sheet, and slate blocks sit below the sheet as cut-outs. Hover raises a card 2px and deepens the shadow; menus float on a longer shadow. Shadows are always slate-tinted and blurred, never grey, never hard-edged.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 6px 22px -14px rgba(61,59,79,.35)`): every card, stat tile, table container and diff card at rest.
- **Card lift** (`box-shadow: 0 14px 32px -18px rgba(61,59,79,.45)` with `translateY(-2px)`): hover on interactive cards.
- **Button** (`0 1px 0 rgba(61,59,79,.08)` at rest, card-rest on hover, none when pressed).
- **Menu** (`box-shadow: 0 16px 40px -24px rgba(61,59,79,.4)`): dropdowns and popovers.

### Named Rules
**The Slate Shadow Rule.** Every shadow is tinted from Slate and has an offset and blur. A colourless grey shadow or a zero-blur block is a costume.
**The Press Rule.** Pressing scales a control to 98% and drops its shadow, in 80ms; releasing returns it in 180ms on the standard ease-out.

## Shapes

Rounded, in three sizes: 10px for controls and small tiles, 16px for cards, frames and dropdowns, and a full pill for buttons, chips, the nav pills and range bars. Logos and avatars are circles. Borders are 1px Silver hairlines; dashed 1px lines mark the header rule, dropdown edges and the blueprint rails. There are no clipped polygons, no chamfers and no square corners on interactive parts; the only straight-edged shapes are the drawing furniture (rulers, hatching, ticks) and the isometric cube field that closes every page.

## Components

### Buttons
- **Shape:** full pill (999px), 1.5px border in the fill colour so outline and solid variants share a silhouette.
- **Primary:** Spring Green fill, black text, Instrument Sans 600 at 15px, 12px by 28px padding. Used once per view for the main action.
- **Secondary:** Slate fill with Fog text, same geometry; the default for everything that is not the main action.
- **Outline:** transparent with a Slate border and text; hover fills Seafoam at 45%.
- **Hover / Focus:** lift 1px with the card-rest shadow and a 4% brightness bump over 180ms; focus shows a 2px Spring Green outline with 2px offset.
- **Sizes:** sm 12px type / 6px vertical, md 15px / 12px, lg 18px / 14px. The header wallet button is fixed at 36px tall.

### Chips
- **Style:** pill, 10px label type, uppercase with 0.06em tracking, 4px by 10px padding, a 6px dot before the word when it states a live condition.
- **State:** Seafoam with Slate text for open, in range, active and good; Silver with Slate for muted or coming soon; ember tint with Ember text for danger. On slate, chips use 8 to 16% white fills with lavender or seafoam text.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Fog on the Paper Grey page; Slate with Lavender text for dark cards; stat tiles add a 24px dotted Seafoam texture.
- **Shadow Strategy:** card-rest at rest, card-lift on hover for cards that link somewhere (see Elevation).
- **Border:** 1px Silver hairline.
- **Internal Padding:** 24px, 32px from 768px.

### Inputs / Fields
- **Style:** Fog fill, 1px Silver border, 10px radius, 40px tall, DM Sans 14px; amount fields use 28px tabular figures in the body face.
- **Hover / Focus:** hover darkens the border to Slate; focus swaps it to Pool Green with a 4px green tint ring and no outline. The caret is Pool Green.
- **Error / Disabled:** ember border and ember text below the field; disabled fields keep Silver text at 45% opacity.

### Navigation
- **Style:** Fog bar with a dashed bottom rule, four-petal mark on the left, Instrument Sans 500 links at 14px in transparent pills.
- **States:** hover fills Seafoam; the current section fills Spring Green with black text; dropdown items slide 2px right on hover and open under a 300px rounded panel with hairline border and the menu shadow.
- **Mobile:** below 1024px the links collapse behind a hamburger into a full-width sheet with 15px links and dashed row rules; the wallet button stays visible in the bar.

### Blueprint Furniture (signature)
Tick ruler (`.div-ruler`, 16px, masked tick pattern, coloured by `currentColor`), diagonal hatching (`.div-hatch`, -55° hairlines every 4px), double-dashed dividers, plus-rulers, dashed rails with corner marks and the hatched picture frame (`.g-frame`) that surrounds every illustration. They take the section's text colour at 20 to 35% opacity and are the only straight-edged elements on the page.

### Wire Orb (signature)
The hero's canvas drawing: sixty latitude rings whose radii breathe under three travelling waves, in a 0.7px Slate stroke, turning slowly. It is the only ambient motion on the site and it pauses under reduced-motion.

### Diff Card (signature)
The live vault card on the dark chapter: a slate panel with a dashed pastel border, a file-name header, three "diff" lines (magenta minus for the lower bound, green plus for current and upper) whose bar widths come from the real range, a comment row signed by the four-petal mark and a footer link. It is how Vertex draws a position.

## Do's and Don'ts

### Do:
- **Do** keep Spring Green to one solid per view and let Pool Green carry green text and figures.
- **Do** set every number in DM Sans with tabular numerals, and state its freshness ("Updated 9:50 PM", "rolling 24h") next to it.
- **Do** separate chapters with rulers, hatching or a pill row before reaching for empty space.
- **Do** round everything interactive: 10px controls, 16px cards, pill buttons and chips.
- **Do** give hover a lift (1px on buttons, 2px on cards) and press a 98% scale, both on the 180ms ease-out, and honour reduced-motion.
- **Do** write sentence-case headlines that end in a full stop and keep uppercase inside bracketed labels.
- **Do** use the four-petal mark as the author avatar wherever the protocol "speaks" (comments, quotes, footer).

### Don't:
- **Don't** set tables, stats or labels in monospace; IBM Plex Mono is for addresses, hashes and code only.
- **Don't** use square corners, clipped hexagons or chamfered buttons anywhere; the only straight edges are drawing furniture.
- **Don't** shout: no uppercase headlines, no display type above 116px, no em dashes in copy.
- **Don't** fill a button or a large surface with a pastel, and never use pastels as warning colours.
- **Don't** ship grey or hard-edged shadows, gradient text, glass blur or a coloured left border on cards.
- **Don't** add more ambient motion than the orb; entrances are a single 700ms fade from a visible state.
- **Don't** invent numbers, testimonials or partner logos; every figure comes from a contract read.
