---
version: "alpha"
name: "Fealty"
description: "Mint-fresh consumer fintech landing system: oversized geometric-sans headlines, soft mint canvas, black-and-mint brand pair, floating white cards with hand-drawn line accents."

colors:
  primary: "#6BE683"
  on-primary: "#003503"
  primary-hover: "#55D86C"
  accent: "#1CBB6C"
  surface: "#FFFFFF"
  surface-muted: "#F6FEF6"
  surface-tint: "#E3F8E6"
  ink: "#262828"
  on-ink: "#FFFFFF"
  backdrop: "#D7DBDE"
  border: "#DDEBDF"
  text: "#0F1A12"
  text-muted: "#4E544F"
  text-subtle: "#5F655F"
  success: "#1A7F55"
  warning: "#9A6A00"
  danger: "#C42A36"
  on-danger: "#FFFFFF"

typography:
  display-lg:
    fontFamily: "Gilroy"
    fontSize: "4.75rem"
    fontWeight: 600
    lineHeight: 1.105
    letterSpacing: "-0.02em"
  heading-lg:
    fontFamily: "Gilroy"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.167
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: "Gilroy"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.273
  title:
    fontFamily: "Gilroy"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body-md:
    fontFamily: "Gilroy"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Gilroy"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Gilroy"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.429
  caption:
    fontFamily: "Gilroy"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
    letterSpacing: "0.02em"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
  5xl: "120px"

rounded:
  sm: "8px"
  md: "12px"
  lg: "24px"
  xl: "40px"
  full: "9999px"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 28px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 28px"
  page-shell:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
  nav-link:
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
  nav-link-active:
    textColor: "{colors.text}"
    typography: "{typography.title}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  stat-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  transaction-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  payment-card-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    width: "300px"
    height: "420px"
  progress-fill:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.full}"
    height: "6px"
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.label}"
  status-warning:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.label}"
  status-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
  panel-muted:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  meta-text:
    textColor: "{colors.text-subtle}"
    typography: "{typography.caption}"
---

## Overview

A friendly neighbourhood bank branch reimagined as a sunlit glasshouse: for individuals and small-business owners deciding whether to trust a new money app, scanning a landing page on desktop before signing up. It should feel **fresh, confident and approachable**, achieved through (1) a towering geometric-sans headline in near-black on a pale mint canvas, (2) one saturated mint used for the CTA, logo and hand-drawn line doodles, and (3) white cards that float on soft, green-tinted shadows. It is not a dark, gold-trimmed private-wealth site, and not a neon crypto exchange. Primary archetype: **Hero** (bold type, high contrast, upward arrow); secondary: **Caregiver** (soft mint, rounded shapes, gentle depth).

Source: one desktop marketing mockup (Fealty landing page, 1600×1200, scaled ×0.9 to a 1440 frame). Authority: design mockup. Observed: nav, hero, stat chips, card stack, feature section header and top of two feature cards. Assumed: product is a consumer/SMB money-management app; content below the fold, mobile layout, dark mode and all interaction states are derived.

## Colors

Proportion: **≈ 60% mint canvas** (`{colors.surface-muted}`, `{colors.surface-tint}`), **≈ 30% white + ink** (cards, text, dark payment card), **≈ 10% mint accent** (CTA, logo, doodles, progress).

| Token | Role | Where it may appear |
|---|---|---|
| `primary` #6BE683 | Brand mint (sampled #6BE683–#74E384) | Primary button, logo dot, active indicators, decorative strokes. Never as text on white. |
| `on-primary` #003503 | Deep forest text on mint (sampled) | Button labels only |
| `primary-hover` #55D86C | Derived, one step darker | Button hover/pressed |
| `accent` #1CBB6C | Saturated green | Progress fill, chart lines, check icons ≥ 16px. Decorative only (2.5:1 on white). |
| `surface` #FFFFFF | Cards, chips, rows | Any raised element |
| `surface-muted` #F6FEF6 | Page canvas inside the shell (sampled, 58% of image) | Body background |
| `surface-tint` #E3F8E6 | Mint glow band | Section backgrounds, radial glows behind hero and feature heading |
| `ink` #262828 | Dark payment card, brand black | Card art, logo second dot, corner blob |
| `backdrop` #D7DBDE | Cool grey outside the rounded shell | Only behind `page-shell` on ≥ 1440 screens |
| `border` #DDEBDF | Hairlines, outline arcs | Decorative 1px lines, card dividers |
| `text` #0F1A12 | Headlines, card titles (sampled #10110E) | All primary text |
| `text-muted` #4E544F | Body paragraphs, inactive nav | Long-form copy |
| `text-subtle` #5F655F | Timestamps, "Incoming/Outgoing" | Metadata ≥ 12px |
| `success` #1A7F55 | Incoming amounts | On white only |
| `danger` #C42A36 | Outgoing amounts, errors | On white; white text on it for buttons |
| `warning` #9A6A00 | Derived | Pending states |

Contrast (WCAG 2.2 AA, computed):

| Text / Background | Ratio | Result |
|---|---|---|
| text / surface-muted | 17.4 | Pass |
| text / surface-tint | 16.0 | Pass |
| on-primary / primary | 8.8 | Pass |
| text-muted / surface-muted | 7.6 | Pass |
| text-subtle / surface | 6.0 | Pass |
| success / surface | 5.0 | Pass |
| danger / surface | 5.6 | Pass |
| warning / surface | 4.7 | Pass |
| on-ink / ink | 14.8 | Pass |

Adjusted for contrast: incoming-amount green sampled #28A677 (3.1:1) → darkened to `{colors.success}`; metadata grey sampled #7B7B7B → `{colors.text-subtle}`; outgoing red sampled #B21C28 normalised to `{colors.danger}`. Prohibited: `success` on `surface-tint` (4.5 borderline), any text in `primary` or `accent` on light surfaces, mint on mint.

## Typography

Family: **Gilroy** `[CONFIRM]` (geometric sans by Radomir Tinkov; double-storey *a*, single-storey *g*, straight-tailed *y*). Open-licence fallback: **Outfit** (Google Fonts). Stack: `"Gilroy", "Outfit", ui-sans-serif, system-ui, sans-serif`. One family carries everything; hierarchy comes from size and weight, not a second face.

Scale: perfect fourth (1.333) fitted to measured levels, body 16px.

| Token | Desktop px | Mobile px | Line height | Tracking | Use |
|---|---|---|---|---|---|
| display-lg | 76 (measured ±4) | 44 | 84 / 48 | −0.02em | Hero headline, max 2 lines |
| heading-lg | 48 (measured ±2) | 32 | 56 / 40 | −0.02em | Section titles ("Our awesome feature") |
| heading-md | 22 (measured) | 20 | 28 | 0 | Stat figures (75K+), card headings |
| title | 16 | 16 | 24 | 0 | Merchant names, card titles, active nav |
| body-md | 16 (shot shows ~14) | 16 | 24 | 0 | Hero and section paragraphs |
| body-sm | 14 | 14 | 20 | 0 | Nav, secondary copy, amounts |
| label | 14 / 500 | 14 | 20 | 0 | Buttons, chip labels |
| caption | 12 | 12 | 16 | +0.02em | Timestamps, "Exp" labels |

Rules: headings SemiBold 600, body Regular 400, labels Medium 500; no italics. Stat chips pair a `heading-md` figure with a `body-sm` lowercase label on one baseline. Body measure 60–70ch; the hero paragraph wraps at ~480px. Feature intros are centred and capped at 640px, two lines max. Money values use `font-variant-numeric: tabular-nums`, right-aligned. Logo wordmark ≈ 36px SemiBold.

## Layout

Base unit **8pt** (sparse marketing page); 4px allowed inside chips, rows and icon gaps. Grid: **12-column**, with a hierarchical hero (headline dominates) and a centred modular feature row.

| Breakpoint | Columns | Gutter | Margin | Max content |
|---|---|---|---|---|
| Mobile < 640 | 4 | 16 | 16 | fluid (358 @ 390) |
| Tablet 640–1023 | 8 | 24 | 32 | fluid |
| Desktop 1024–1439 | 12 | 24 | 48 | 928 |
| Wide ≥ 1440 | 12 | 24 | 120 | 1200 |

The whole page sits in a **rounded shell** (`page-shell`, radius 40px) floating on `{colors.backdrop}` at ≥ 1440; below that, the shell goes full-bleed with no radius.

Section anatomy (desktop, derived from measurement):
- **Nav** 88px tall: logo cols 1–3; links centred (gap 32px, active link bold); utilities right (language, bell, 40px avatar + chevron, gap 24px).
- **Hero** ≈ 600px: text cols 1–7 (stat chips top-centre of this area, headline, paragraph, CTA, stacked with 24 / 24 / 40px gaps); card stack cols 8–12, overlapping the gutter by up to 40px.
- **Section gap** 96–120px (`{spacing.4xl}`–`{spacing.5xl}`).
- **Feature section**: centred heading + intro, 56px to cards; cards 4 columns each, centred, 80px gap (exception to 24px gutter, intentional breathing room).

Reading pattern: Z (logo → nav → headline → card stack → CTA). Reflow: on tablet the card stack moves below the CTA and shrinks to 70%; on mobile, stat chips become a horizontal scroll row above the headline, cards stack single-column, nav collapses to logo + menu button.

## Elevation & Depth

Depth comes from **soft, green-tinted shadows**, never hard borders.

| Level | Shadow | Use |
|---|---|---|
| e0 | none | Canvas, section bands |
| e1 | `0 4px 16px rgba(16,40,20,0.06)` | Stat chips, transaction rows |
| e2 | `0 12px 32px rgba(16,40,20,0.08)` | Feature cards, nav dropdown |
| e3 | `0 24px 60px rgba(16,40,20,0.14)` | Payment card stack, modals |

Layers (back → front): backdrop → shell → radial mint glows (`surface-tint`, 40–60% opacity, 400–600px blur) → outline arcs and doodles → cards → chips. The front payment card is **frosted glass**: white at 70% opacity + `backdrop-filter: blur(16px)`. Modal scrim: `rgba(15,26,18,0.4)`.

## Shapes

- Radii: buttons `{rounded.sm}`; chips, rows, payment cards `{rounded.md}`; feature cards `{rounded.lg}`; shell `{rounded.xl}`; avatar and status dots `{rounded.full}`.
- **Brand mark**: two overlapping circles, mint left, ink right. Reuse as the motif for oversized corner blobs (mint + black quarter-circles bleeding off the top-right of the viewport).
- **Hand-drawn strokes**: loose mint lines (2–3px, round caps) — a looping arrow pointing at the stat chips, a squiggle under the CTA. Max two per viewport, never crossing text.
- **Outline arcs**: 1px `{colors.border}`-to-mint strokes, large partial circles at section edges.
- Icons: outline, 1.5px stroke, 20–24px, rounded joins (globe, bell, chevron).
- **Card-stack illustration**: three payment cards fanned at roughly −30°, 0°, +30°; front card frosted with mint fingerprint line art, back cards dark ink and light. Chip, contactless and network marks as small details. No words beyond holder name and expiry.
- Stat chips sit at a slight −4° tilt, overlapping 8px vertically, like stacked stickers.

## Components

- **Button primary**: mint fill, forest label, 44px tall (shot ≈ 40px; raised for touch). Hover darkens to `primary-hover`; pressed scale 0.98; focus 2px `text` ring with 2px offset; disabled 40% opacity; loading replaces label with a 16px spinner, width fixed.
- **Nav link**: muted at rest, `text` + SemiBold when active (no underline); hover → `text`.
- **Stat chip**: figure + label, white, e1, tilted. Max three, stacked.
- **Feature card**: white, radius 24, padding 32, e2. Header row = `title` left + "See all" link right.
- **Transaction row**: 32px brand icon circle, merchant `title`, date `caption` in `text-subtle`, amount right in `status-success` or `status-danger` with direction word beneath. Rows stack with 8px gap, slight e1.
- **Saving tile**: check icon + label, line-art illustration top-right, progress bar (6px, `accent` fill on `surface-tint` track), two metric pairs below.
- **Payment card**: 300×420 at desktop, ink or frosted variants.
- States for cards/rows: hover lifts 2px + e2; selected adds 2px `primary` outline; empty shows a single line of `text-subtle` copy and an outline icon; error uses `danger` text, never a red fill.
- Data visuals: one series per chart in `accent`; thin 2px lines; labels in `caption`.

## Interaction & Motion

Personality: Hero — quick and decisive, softened by Caregiver easing.

| Token | Value | Use |
|---|---|---|
| instant | 100ms | Hover, press |
| fast | 180ms | Nav, chip, tooltip |
| base | 280ms | Card lift, dropdown |
| medium | 450ms | Section reveals |
| slow | 700ms | Hero card-stack fan-out |
| ease-out | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances |
| ease-in | `cubic-bezier(0.64, 0, 0.78, 0)` | Exits |
| ease-in-out | `cubic-bezier(0.65, 0, 0.35, 1)` | Position changes |

Hero cascade (once): headline fades + rises 24px → paragraph and CTA (+80ms) → stat chips drop in one by one (60ms stagger) → card stack fans from a closed pile to its angles (700ms) → doodle strokes draw on (450ms). Scroll reveals once per element, 280–450ms, 60ms stagger. Dropdowns open downward from the nav; drawers enter from the right. Forbidden: infinite floating cards, parallax on text, auto carousels. `prefers-reduced-motion`: everything appears in final position, strokes pre-drawn.

## Accessibility

AA contrast on every pair above; 44px primary targets, 24px minimum for icon buttons with padded hit areas; visible focus ring on all interactive elements; text never below 12px; incoming/outgoing amounts carry a `+`/`−` sign and a word, not colour alone; tab order nav → CTA → cards; decorative doodles, arcs and blobs are `aria-hidden`; card-stack figure gets one concise alt text.

## Do's and Don'ts

- Do keep exactly one mint CTA per viewport.
- Do let the headline be the largest thing on screen; the card stack supports it.
- Do tint every shadow and glow green; never use neutral black shadows.
- Don't set text in `primary` or `accent` on white or mint — use `success` for green text.
- Don't add a second typeface; vary size and weight instead.
- Don't use pill buttons — the CTA radius is a soft 8px rectangle (mock ≈ 6px, rounded to the 4px grid).
- Don't put more than two hand-drawn doodles in one viewport or let them touch copy.
- Don't fill whole sections with saturated mint; mint at full strength stays under 10% of the surface.
- Don't drop body copy to 14px in production; the mock's ~14px hero text becomes 16px.
- Don't place `success` text on `surface-tint` bands.

## References

Source image: Fealty landing page mockup (IMG_6366, single desktop frame).

Similar references (opened this session):
- Wise style reference — https://styles.refero.design/style/367c0c6e-73a7-441c-a8ff-91d139ac60dc — borrow: lime accent with dark-green button text, near-black ink. Not: pill buttons, ultra-heavy 900 display weight.
- Wise system summary — https://open-design.ai/systems/wise/ — borrow: off-white canvas, accent reserved for CTAs, large card radii. Not: ring borders instead of shadows (Fealty uses soft shadows).
- Monzo design.md — https://www.webdesignhot.com/design.md/monzo/ — borrow: tinted shadows, white cards with 16–24px radii, dark anchor colour. Not: coral palette (axis-differing reference, kept for structure only).
- Gilroy family — https://www.fontshop.com/families/gilroy — typeface identification.
- Outfit review — https://pimpmytype.com/outfit/ — open-licence fallback; note it sets wide, so tighten tracking on display sizes.

Guidelines: WCAG 2.2 AA; skill references for grid, type and motion.

Open decisions:
1. Confirm typeface (Gilroy, licensed) vs Outfit (free).
2. Confirm body size 16px (recommended) vs 14px (as mocked).
3. Content below the fold (third feature card, footer) is not visible; layout rules above are extrapolated.
4. Dark mode is undefined; `ink` would become the canvas if needed.
