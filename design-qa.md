# CCTP One logo replacement QA

## Evidence

- Source visual truth: `/Users/hypered/.codex/generated_images/019fa770-813e-76b1-9dc1-37a071035ca5/call_urQKTXfoFEXkWL6ybycUWQ7i.png`
- Source pixels: 1254 × 1254 PNG on white, density-independent concept preview.
- Production asset: `/Users/hypered/Documents/CCTP/public/cctp-one-logo.png`
- Production asset pixels: 256 × 256 PNG, center-cropped from the selected source and rendered at 32 × 32 CSS pixels.
- Browser-rendered implementation: `/Users/hypered/Documents/CCTP/.tmp/design-qa/cctp-one-implementation.png`
- Implementation pixels and CSS viewport: 1440 × 1000 at density 1.
- Focused source/implementation comparison: `/Users/hypered/Documents/CCTP/.tmp/design-qa/cctp-one-comparison.png`
- Dark-theme header evidence: `/Users/hypered/Documents/CCTP/.tmp/design-qa/cctp-one-header-dark.png`
- State: CCTP One home, Base → Solana, no connected wallet; verified in light and dark themes.

## Findings

No actionable P0, P1, or P2 mismatch remains.

- Fonts and typography: the existing `CCTP One` wordmark and `Native USDC` descriptor remain unchanged. The new mark aligns to the lockup at 32px without altering header height or text rhythm.
- Spacing and layout rhythm: the mark keeps the existing 32 × 32 slot, 10px lockup gap, and 64px topbar. The full page has no horizontal overflow at 1440 × 1000.
- Colors and visual tokens: the selected blue C, cold navy 1, and white field match the approved white-background concept. The white field remains intentional and readable in dark mode.
- Image quality and asset fidelity: the production asset uses the selected generated artwork rather than a CSS or handcrafted SVG approximation. It is cropped from 1254px to a 256px square source and remains crisp at 32px.
- Copy and content: the visible brand remains `CCTP One` with the `Native USDC` descriptor. The favicon now uses the same production asset.
- Accessibility: the image is decorative inside the `CCTP One home` link, so it keeps an empty alt attribute while the link retains an explicit accessible label.

## Focused comparison

The focused comparison places the 80px normalized source mark beside the rendered header. Both preserve the same C/1 geometry, blue/navy relationship, white field, and rounded silhouette. A separate focused region is sufficient because the requested change affects only the brand mark and favicon; the rest of the accepted interface was intentionally preserved.

## Interaction and technical verification

- Light theme: logo loaded at natural size 256 × 256 and rendered at 32 × 32.
- Dark theme: logo retains its white field and remains clearly separated from the near-black header.
- Theme toggle remains functional.
- Browser console: 0 errors.
- `pnpm test`: 45 tests passed.
- `pnpm build`: passed.

## Comparison history

### Pass 1

- The selected source was center-cropped and resized for the 32px production slot.
- The first browser-rendered comparison showed no actionable P0/P1/P2 geometry, color, crop, sharpness, alignment, or contrast mismatch.
- No visual correction pass was required.

## Follow-up polish

- P3: create a true vector master if a designer supplies an approved production SVG; the current generated PNG is intentionally used to preserve fidelity to the selected visual.

final result: passed
