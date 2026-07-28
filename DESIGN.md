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
  muted-light: "#7a6e6d"
  faint-light: "#a39a99"
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
  green-light: "#059669"
  green-dark: "#34d399"
  warn-light: "#92400e"
  warn-dark: "#fbbf24"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
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
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  4xl: "2rem"
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
    height: "56px"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-bg}"
    rounded: "{rounded.2xl}"
    height: "56px"
  button-ghost:
    backgroundColor: "{colors.field-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  card-bridge:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.4xl}"
    padding: "32px 32px 38px"
  field-input:
    backgroundColor: "{colors.field-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.2xl}"
    height: "52px"
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

CCTP One’s UI is a task-first bridge console: a single high-radius card centered on cool paper, with system sans type, monospaced addresses, and chain marks. Light mode is lavender-tinted paper and violet ink with a quiet transfer-path background asset; dark mode is near-black with a warm amber accent for primary actions and borders. Expression lives in status clarity, honest mainnet warnings, and progressive disclosure—not in marketing illustration.

Depth is light and structural: one soft card shadow, tonal fields inside the card, and modal sheets. Motion is short (scale on press, spin on load, toggle knob travel) and respects `prefers-reduced-motion`.

**Key Characteristics:**
- Dual theme: cool paper + violet (light) / near-black + amber (dark)
- Rounded blue C + navy 1 brand mark on a deliberate white field
- High-radius surfaces (`--radius-4xl` / 2rem) for the bridge card and sheets
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
- **Warm Charcoal body** (`#664e4d` text-body, `#7a6e6d` muted, `#a39a99` faint): Secondary copy on light.
- **Border Mist** (`#dbdeec`, strong `#c8ccd9`): Light control borders.
- **Near Black** (`#0d0200` bg, `#110807` surface): Dark page and panels.
- **Ash body** (`#c8c0bf` body, `#9a8f8e` muted): Dark secondary text.

### Semantic
- **Danger** light `#c2410c` / dark `#f87171` with danger-bg panels
- **Warn** light `#92400e` / dark `#fbbf24` for mainnet and quote warnings
- **Success green** light `#059669` / dark `#34d399`

**The Token Surface Rule.** Prefer semantic vars (`--btn`, `--text`, `--border`, `--danger`) over raw hex in components so light/dark stay coherent.

**The One Accent Rule.** In light mode the action accent is violet/blue; in dark mode amber carries primary CTA and strong borders. Do not introduce a third accent family without updating tokens.

## Typography

**Display / UI Font:** System UI sans (`--font-sans`)
**Mono Font:** UI monospace (`--font-mono`) for addresses, codes, and compact counts

**Character:** Dense operator UI: tight letter-spacing on titles, medium weight on amounts, no display serif or custom webfonts.

### Hierarchy
- **Display** (700, 1.75rem, lh 1.15, tracking -0.03em): Bridge card `h1`
- **Headline** (700, ~1.35rem): History section titles
- **Title** (700, 17px): Sheet/modal headings
- **Body** (400, ~0.9rem, lh 1.45): Subtitles and helper copy
- **Label** (600, 13px): Field labels, pill text scale
- **Amount** (500, ~1.85rem, tracking -0.03em): Amount input
- **Mono** (13px+): Recipient fields, connected address, `code` in banners

**The System Stack Rule.** Stay on platform fonts; do not add marketing webfonts that change layout shift or CSP font sources without intent.

## Layout

- App column: topbar (64px) → main (flex start) → footer
- Primary surface: `.bridge-card` at `min(720px, 100%)` with `32px 32px 38px` padding
- Chain row: 3-column grid `1fr 44px 1fr` (source | swap | destination)
- Secondary width for history: `min(900px, 100%)`
- Main padding: 38px 16px 64px; gaps 16px
- Breakpoints observed: `900px`, `560px` (stack/tighten); min body width 320px

**The Single Card Rule.** The transfer task lives in one elevated card; supporting tools (history and LUT) sit below without competing for the same visual weight.

## Elevation & Depth

Hybrid: flat page background + one ambient card/sheet shadow + tonal field nesting.

### Shadow Vocabulary
- **Light ambient** (`0 16px 48px rgba(41, 35, 59, 0.08)`): Bridge card and sheets
- **Dark ambient** (`0 8px 24px rgba(0, 0, 0, 0.45)`): Same roles in dark theme
- **Modal backdrop**: light `rgba(25, 16, 15, 0.35)` / dark `rgba(0, 0, 0, 0.65)`

**The Quiet Lift Rule.** No multi-layer glass stacks; elevation is reserved for the card and modal sheet.

## Shapes

- Large soft geometry: card/sheet `2rem` (`--radius-4xl`)
- Controls and fields: `1rem` (`--radius-2xl`)
- Pills/toggles/theme control: full pill (`999px`)
- Chain/USDC marks: circular; wallet marks ~10px radius squares
- Borders: 1px semantic `--border`, strong on hover/focus

## Components

### Buttons
- **Primary:** full-width 56px, radius 2xl, `--btn` / `--btn-text`, weight 700; disabled opacity 0.4
- **Ghost / secondary:** 34px height, pill, secondary border/bg tokens
- **Icon button:** 34×34, radius 10px, field background
- **Topbar tool:** min-height 34px, pill border

### Cards / Containers
- **Bridge card:** surface + border + 4xl radius + shadow + 28px padding
- **Sheets:** max ~400px (progress sheet may differ), same surface language

### Inputs / Fields
- Chain triggers and recipient: 56px height, field bg, 2xl radius
- Amount panel: min-height 94px with fixed USDC identity; CCTP One does not expose an asset selector
- Completion method: collapsed summary by default, with Self-claim and Orbit controls disclosed on demand
- Focus: stronger border (`--border-strong` or pill-fg on filters); limited `:focus-visible` usage today

### Pills / Chips
- Info pills: soft blue/amber pill tokens, 28px height, 10px radius
- History quick filters: segmented control on surface

### Navigation
- Minimal topbar: 32px white-field C1 mark + CCTP One wordmark + optional tool links + theme toggle
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
