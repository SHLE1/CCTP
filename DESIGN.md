---
name: CCTP One
description: Mainnet CCTP USDC bridge — cool paper surfaces, violet ink, amber dark accent
colors:
  primary: "#29233b"
  primary-light: "#2775ca"
  dark-primary: "#ff9401"
  dark-primary-soft: "#fbc67e80"
  bg-light: "#f8f9ff"
  surface-light: "#eeeff7"
  field-light: "#ffffff"
  field-soft-light: "#f3f4fb"
  text-body-light: "#664e4d"
  muted-light: "#6e6362"
  faint-light: "#736a69"
  border-light: "#dbdeec"
  border-strong-light: "#c8ccd9"
  pill-bg-light: "#dce6f8"
  pill-fg-light: "#2a4f8a"
  dark-bg: "#0d0200"
  dark-surface: "#110807"
  dark-field: "#0d0200"
  dark-text: "#f8f9ff"
  dark-text-body: "#c8c0bf"
  danger-light: "#c2410c"
  danger-dark: "#f87171"
  green-light: "#05684f"
  green-dark: "#34d399"
  warn-light: "#92400e"
  warn-dark: "#fbbf24"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  card-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
rounded:
  mark: "6px"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "0.625rem"
  4xl: "0.75rem"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  2xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.2xl}"
    padding: "0 16px"
    height: "48px"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-bg}"
    rounded: "{rounded.2xl}"
    height: "48px"
  button-ghost:
    backgroundColor: "{colors.field-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.2xl}"
    padding: "0 14px"
    height: "34px"
  card-bridge:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.4xl}"
    padding: "22px 22px 20px"
  field-input:
    backgroundColor: "{colors.field-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.2xl}"
    height: "48px"
  pill-info:
    backgroundColor: "{colors.pill-bg-light}"
    textColor: "{colors.pill-fg-light}"
    rounded: "10px"
    padding: "0 11px"
    height: "28px"
---

# Design System: CCTP One

## Overview

**Creative North Star: "The Mainnet Console"**

CCTP One’s UI is a task-first bridge console: a single card centered on cool paper, with system sans type, monospaced addresses, and chain marks. Light mode is lavender-tinted paper and violet ink; dark mode is near-black with a warm amber accent for primary actions and borders. Expression lives in status clarity, honest mainnet warnings, and progressive disclosure—not in marketing illustration.

Depth is light and structural: one soft card shadow, tonal fields inside the card, and modal sheets. Motion is short (scale on press, spin on load, toggle knob travel) and respects `prefers-reduced-motion`.

**Key Characteristics:**
- Dual theme: cool paper + violet (light) / near-black + amber (dark)
- Rounded blue C + navy 1 brand mark on a deliberate white field
- Two-tier radii: 0.75rem (`--radius-4xl`) for the bridge card and sheets, 0.625rem (`--radius-2xl`) for controls; full-pill radius is reserved for true circles and status badges
- Centered operate layout: primary task is the bridge card; transfer history follows
- Token-driven CSS variables in `src/styles.css` (`--bg`, `--surface`, `--btn`, semantic danger/warn/green)
- System UI font stack; mono for addresses and amounts context

## Colors

Dual-theme palette driven by CSS custom properties on `:root`, `[data-theme='light']`, and `[data-theme='dark']`.

### Primary
- **Violet Ink** (`#29233b` / `--color-primary`): Light-mode primary text and primary button fill.
- **USDC Blue** (`#2775ca` / `--color-primary-light`): Light-mode toggle-on, brand mark fallback, accent links (e.g. MAX).
- **Mainnet Amber** (`#ff9401` / `--color-dark-primary`): Dark-mode primary button, secondary borders, active emphasis.

### Neutral
- **Cool Paper** (`#f8f9ff` bg, `#eeeff7` surface, `#ffffff` fields): Light page and card stack.
- **Warm Charcoal body** (`#664e4d` text-body, `#6e6362` muted, `#736a69` faint; ≥4.5:1 on all light surfaces): Secondary copy on light. Muted carries real guidance text; faint is reserved for placeholders, decorative icons, and disabled text.
- **Border Mist** (`#dbdeec`, strong `#c8ccd9`): Light control borders.
- **Near Black** (`#0d0200` bg, `#110807` surface): Dark page and panels.
- **Ash body** (`#c8c0bf` body, `#9a8f8e` muted): Dark secondary text.

### Semantic
- **Danger** light `#c2410c` / dark `#f87171` with danger-bg panels
- **Warn** light `#92400e` / dark `#fbbf24` for mainnet and quote warnings
- **Success green** light `#05684f` / dark `#34d399`

**The Token Surface Rule.** Prefer semantic vars (`--btn`, `--text`, `--border`, `--danger`) over raw hex in components so light/dark stay coherent.

**The One Accent Rule.** In light mode the action accent is violet/blue; in dark mode amber carries primary CTA and strong borders. Do not introduce a third accent family without updating tokens.

**The Chain Brand Exception.** The `color` entries in `src/main.jsx`'s `CHAIN_META` (e.g. Ethereum `#627EEA`, OP `#FF0420`, Solana `#9945FF`) are third-party chain brand marks, registered here as deliberate exceptions to the token palette. They exist to identify chains—paired with text labels, never as theme accents—and do not need token promotion.

## Typography

**Display / UI Font:** System UI sans (`--font-sans`)
**Mono Font:** UI monospace (`--font-mono`) for addresses, codes, and compact counts

**Character:** Dense operator UI: tight letter-spacing on titles, medium weight on amounts, no display serif or custom webfonts.

### Hierarchy
- **Display** (600, 2.75rem, tracking -0.03em, tabular-nums): Amount input hero — money is the loudest object
- **Headline** (700, ~1.35rem): History section titles
- **Title** (700, 17px): Sheet/modal headings
- **Body** (400, ~0.9rem, lh 1.45): Subtitles and helper copy
- **Label** (600, 13px): Field labels, pill text scale
- **Card title** (600, 1.25rem, tracking -0.02em): Bridge card `h1`, demoted below the amount
- **Mono** (13px+): Recipient fields, connected address, `code` in banners

**The System Stack Rule.** Stay on platform fonts; do not add marketing webfonts that change layout shift or CSP font sources without intent.

## Layout

- App column: topbar (64px) → main (flex start) → footer
- Primary surface: `.bridge-card` at `min(640px, 100%)` with `22px 22px 20px` padding (`20px 16px` below 560px); the full card (through the trust line) fits a 1280×800 viewport without scrolling
- Chain row: 3-column grid `1fr 40px 1fr` with 10px gaps (source | swap | destination)
- Secondary width for history: `min(900px, 100%)`; recovery utilities (Manual claim, Recover rent) live in the history heading, co-located with the records they act on — the bridge card topline stays title-only
- Main padding: 24px 16px 56px; gaps 16px
- Breakpoints observed: `900px`, `560px` (stack/tighten); min body width 320px

**The Single Card Rule.** The transfer task lives in one elevated card; supporting tools (history and LUT) sit below without competing for the same visual weight.

## Elevation & Depth

Hybrid: flat page background + one ambient card/sheet shadow + tonal field nesting.

### Shadow Vocabulary
- **Light ambient** (`0 1px 2px rgba(41, 35, 59, 0.06), 0 12px 32px rgba(41, 35, 59, 0.05)`): Bridge card and sheets
- **Dark ambient** (`0 1px 2px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.35)`): Same roles in dark theme
- **Modal backdrop**: light `rgba(25, 16, 15, 0.35)` / dark `rgba(0, 0, 0, 0.65)`

**The Quiet Lift Rule.** No multi-layer glass stacks; elevation is reserved for the card and modal sheet.

## Shapes

- Compact geometry: card/sheet `0.75rem` (`--radius-4xl`, 12px); page-level panels, dropdowns, and standalone banners share it
- Controls and fields: `0.625rem` (`--radius-2xl`, 10px); notice boxes nested inside a card or sheet step down to this tier
- Nested sub-controls (menu items, in-field actions): `0.5rem` (`--radius-lg`, 8px)
- Square brand/chain marks: 6px micro radius; circles use `50%`, status badges and pills use `999px`
- Pills/toggles: full pill (`999px`)
- Chain/USDC marks: circular; wallet marks ~10px radius squares
- Borders: 1px semantic `--border`, strong on hover/focus

## Components

### Buttons
- **Primary:** full-width 48px, radius 2xl, `--btn` / `--btn-text`, weight 700; disabled keeps full opacity with a muted fill (`--btn` 12% on `--field`) + `--muted` text + 1px border
- **Ghost / secondary:** 34px height, padding 0 14px, radius 2xl, secondary border/bg tokens. Every framed secondary action shares this spec (Recover rent, Resume, Manual claim, sheet close, menu triggers); pill radius is reserved for toggles and status badges, never for action buttons
- **Icon button:** 34×34, radius 2xl, secondary border/bg tokens
- **Borderless micro-actions** (MAX, quote refresh, use-wallet, Change ›): no frame, 12px/600, 28px min target, radius lg; they act on the adjacent value, not on the flow
- **Topbar nav item:** 36px hit height, radius 2xl, borderless, `--muted` text → hover/open `--field-soft` + `--text`; Recover rent, Docs, and the Explore trigger share it
- **Theme toggle:** 40×40 icon-only, radius 2xl, `--theme-btn-*` bg/border — the sole framed control in the topbar

### Cards / Containers
- **Bridge card:** surface + border + 4xl radius + shadow + 22px padding
- **Sheets:** Manual claim and Recover rent use the same centered 520px recovery sheet (shared backdrop, header type, 34px close control, padding, radius, shadow, and scroll contract); progress/confirmation sheets may differ only when their content requires it

### Inputs / Fields
- Chain triggers, recipient field, and primary CTA share one 48px control height. Field bg, 2xl radius
- Amount panel: min-height 96px with fixed USDC identity; the amount input is the display hero (2.75rem/600); CCTP One does not expose an asset selector
- Completion method: collapsed 66px summary by default, with Self-claim and Orbit controls disclosed on demand
- Focus: stronger border (`--border-strong` or pill-fg on filters); limited `:focus-visible` usage today

### Pills / Chips
- Info pills: soft blue/amber pill tokens, 28px height, 10px radius
- History quick filters: segmented control on surface

### Navigation
- Minimal topbar: 32px white-field C1 mark + CCTP One wordmark + optional tool links + theme toggle
- External destinations live behind the single **Explore** disclosure trigger (3-group links panel, sheet tokens, `--radius-4xl` surface); never expand into inline link strips in the topbar
- No multi-route app shell; primary IA is scroll sections

### Signature: Transfer progress sheet
- Step list with rail, status badges (Now/Done), progressbar role, route summary, mainnet warning, primary action

## Do's and Don'ts

### Do:
- **Do** use CSS variables (`--btn`, `--surface`, `--danger`) for any new control so both themes inherit.
- **Do** keep the bridge card as the single primary focus above the fold on desktop.
- **Do** show mainnet risk, fee breakdown, and progress persistence messaging near high-stakes actions.
- **Do** pair chain icons with text labels; never rely on color alone for chain identity.

### Don't:
- **Don't** introduce indigo–violet marketing gradients, glassmorphism stacks, or decorative hero illustration that fights the console model.
- **Don't** hard-code light-only hex in new components (breaks dark amber system).
- **Don't** add interface fee claims or “official Circle” branding not present in product truth.
- **Don't** remove resume/progress affordances for visual minimalism—recoverability is part of the design.
