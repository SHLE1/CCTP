# Relay design QA

## Evidence

- Source visual truth: `/Users/hypered/.codex/generated_images/019fa770-813e-76b1-9dc1-37a071035ca5/call_s08BAr1c6OPkx8ugvPuGS1ds.png`
- Source pixels: 1487 × 1058 RGB PNG.
- Normalized source: scaled to 1440 × 1024 for the full-view comparison. The source and implementation have the same aspect ratio to rounding, so no crop was required.
- Browser-rendered implementation: `/Users/hypered/.codex/visualizations/2026/07/28/019fa770-813e-76b1-9dc1-37a071035ca5/relay-implementation-desktop-clean-1440.png`
- Implementation pixels and CSS viewport: 1440 × 1024 at density 1.
- Mobile implementation: `/Users/hypered/.codex/visualizations/2026/07/28/019fa770-813e-76b1-9dc1-37a071035ca5/relay-implementation-mobile-final.png`
- Mobile pixels and CSS viewport: 390 × 844 at density 1.
- Full-view comparison: `/Users/hypered/.codex/visualizations/2026/07/28/019fa770-813e-76b1-9dc1-37a071035ca5/relay-design-comparison-clean.png`
- Focused card comparison: `/Users/hypered/.codex/visualizations/2026/07/28/019fa770-813e-76b1-9dc1-37a071035ca5/relay-design-comparison-card-clean.png`
- State: light theme, Base → Solana, Self-claim, Fast transfer on, no connected wallet, empty amount and recipient.
- Browser: Chrome against `http://127.0.0.1:4173/`.

## Final findings

No actionable P0, P1, or P2 mismatch remains.

- Fonts and typography: the implementation uses Relay's system UI stack, matches the mock's hierarchy, 32px display title, readable 13–16px product text, and monospaced recipient input. No clipping or accidental wrapping remains.
- Spacing and layout: the bridge card is 720px wide at x=360 and y=102 in the 1440px viewport. The source normalizes to approximately the same card width and position. Chain, amount, recipient, completion, delivery, CTA, and recent-transfer preview align within a few pixels of the target rhythm.
- Colors and tokens: cool paper, lavender surface, white fields, violet action, USDC blue, border mist, radius, and quiet elevation all map to existing Relay tokens. Dark theme remains functional and does not use the light background asset.
- Image quality: the generated relay-path background is a project-local 1536 × 1024 PNG with no text or UI baked into it. It remains crisp, low contrast, and does not obscure the form.
- Copy and content: the above-the-fold implementation matches the accepted copy. The only intentional visual deviation is removal of the USDC asset dropdown because the user explicitly confirmed that Relay supports USDC only. `Max` remains visible but disabled until a wallet balance is available.
- Icons: existing Relay and chain assets remain intact; Lucide icons are used consistently for swap, completion, disclosure, speed, and utility controls.
- Responsiveness: at 390 × 844 there is no horizontal overflow, chain selectors remain usable side by side, labels do not clip, and the 56px primary CTA is visible at the bottom of the first viewport.
- Accessibility: labels and semantic controls remain present, focus-visible rules remain active, completion uses native `details`/`summary`, transfer modes retain radio semantics, speed retains switch semantics, and reduced-motion handling is unchanged.

## Interaction verification

- Opened and closed the source-chain selector.
- Expanded Completion method and selected Orbit automatic; summary and explanatory copy updated correctly.
- Restored Self-claim and collapsed the method.
- Entered `1.2345678`; the input correctly sanitized to `1.234567`.
- Switched to dark theme and back to light.
- Checked a fresh Chrome load: no console warnings or errors.
- No wallet was connected and no mainnet transaction was initiated during visual QA.

## Comparison history

### Pass 1

- [P1] The first implementation card was 640px wide versus the accepted design's roughly 720–740px visual width.
  - Fix: increased the card to 720px and rebalanced field width.
- [P2] Vertical rhythm was compressed, placing the amount and downstream controls about 20–25px above the target.
  - Fix: increased header and chain spacing, amount separation, and bottom padding.
- [P2] Mobile displayed a clipped `Change` label.
  - Fix: mobile shows only the disclosure chevron.
- [P2] Mobile stacked chain controls pushed the primary CTA below the 844px first viewport.
  - Fix: introduced a compact three-column mobile chain row; the CTA now ends at y=841.35 with no horizontal overflow.

### Pass 2

- Post-fix full-view and focused comparisons show the source and implementation matching in container position, hierarchy, vertical rhythm, palette, form anatomy, CTA, background treatment, and recent-transfer preview.
- No further P0/P1/P2 changes were required.

## Follow-up polish

- P3: after a real wallet is connected, capture the balance-loaded, quote-ready, validation-error, and review-modal states for a future state-by-state visual pass.

final result: passed
