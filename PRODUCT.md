# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**[Inferred from README + UI copy]** Primary users are people who already hold native USDC on Solana or major EVM mainnets and need to move it to another supported chain without wrapped tokens or liquidity-pool bridges.

Typical situations:
- Moving USDC between Solana and EVM (or EVM↔EVM) for DeFi, treasury ops, or personal wallet management
- Preferring **Self-claim** (destination wallet signs mint; no Orbit fee) or **Orbit** (automatic destination mint for a quoted Forwarding Service fee)
- Operators who need transfer resume after a failed mid-flight step, and occasional Solana Lookup Table rent recovery

**[Undecided]** Whether the product is intended only for the author/operators, a public fallback interface, or a branded product with support/compliance ownership.

## Product Purpose

**CCTP One** is an independent browser interface for **native USDC** transfers via **Circle CCTP V2** on **mainnet only**.

It exists so users can:
1. Choose source/destination chains, amount, recipient, transfer speed (Fast vs Standard), and mint completion mode (Self-claim vs Orbit)
2. Connect Solana (Wallet Standard) and EVM (EIP-6963) wallets, run balance/gas/ATA preflights, request a time-limited quote, then execute burn → attest → mint
3. Persist step progress for in-browser resume, inspect history/explorer links, and manage Solana Lookup Tables for rent recovery

**Success** means: a correct mainnet transfer completes (or cleanly resumes) with clear fees, recipient, and explorer links—without the interface inventing extra protocol fees or parking funds in third-party bridge pools.

## Positioning

**[Inferred]** Differentiator vs generic bridge UIs: first-class **Self-claim vs Orbit** choice with destination gas/ATA preflight, **60s quote expiry** plus pre-signing balance rechecks, **versioned BridgeResult persistence** for resume/`kit.retry`, and **Lookup Table** tooling—built on Circle Bridge Kit rather than wrapped-asset liquidity bridges.

## Operating Context

- Browser SPA (Vite + React), mainnet only (`ENVIRONMENT = 'mainnet'`)
- Requires wallets: Solana (e.g. Backpack, Phantom, Solflare) and/or EVM (MetaMask, Rabby, Coinbase Wallet via EIP-6963)
- Solana routes need `VITE_SOLANA_MAINNET_RPC`; without it, Solana-involving mainnet routes are disabled
- Real USDC and real gas; production warning in README about missing durable off-device storage, multi-RPC failover, monitoring, compliance, and security review for public service use
- Transfer state stored in `localStorage` (`relay:last-transfer:<env>`); incomplete transfers resume only with matching browser profile, wallet, and snapshot format

## Capabilities and Constraints

### Capabilities (confirmed by README / code)
- Solana + EVM mainnet route selection (including Sonic, Unichain, etc. as listed in app)
- Self-claim with destination-wallet mint signing; Orbit automatic mint with protocol vs Forwarding Service fee breakdown and execution-bound `maxFee`
- Fast and Standard transfer modes (Bridge Kit `fastConfirmations`)
- Quote TTL (60s), USDC balance preflight, 6-decimal amount validation, destination gas/ATA preflights
- Step-by-step BridgeResult persistence and resume; explorer links; beforeunload while transfer in flight
- Transfer history UI; FAQ; light/dark theme
- Solana Lookup Table authority scanning, cooldown tracking, deactivate/close, rent recovery

### Constraints
- **Mainnet only** — no testnet product path in current app
- **No app-level fee** claimed by interface; protocol/Orbit fees still apply as quoted
- Browser-visible env vars only (`VITE_*`); never put private keys or RPC secrets in them
- Local integration harness under `.tmp/` is gitignored
- **[Inferred / undecided]** Public multi-tenant production readiness (durable storage, compliance) is explicitly *not* claimed as complete

### Terminology
- **CCTP**: Circle Cross-Chain Transfer Protocol (burn-and-mint native USDC)
- **Self-claim**: user destination wallet submits mint
- **Orbit**: Circle Forwarding Service automatic mint
- **Fast / Standard**: attestation path speed tradeoff
- **BridgeResult / kit.retry**: Bridge Kit transfer state and recovery

## Brand Commitments

- Product name in UI/README: **CCTP One** (package name `cctp-one`)
- Approved brand mark: rounded blue **C** fused with a cold-navy **1** on white (`public/cctp-one-logo.png`)
- Brand usage must make its independent status explicit and must not imply that CCTP One is an official Circle product
- Positioning copy: independent CCTP USDC bridge interface; USDC/chain icons from Trust Wallet / DefiLlama / Circle asset paths as documented in code comments
- **[Inferred]** Visual identity exists in `src/styles.css` (lavender-cool light + near-black dark with amber accent) but was not user-interviewed as a binding brand system; treat code as incumbent until redesign is requested

## Evidence on Hand

- `README.md` — run instructions, feature list, recovery rules, production warning
- `src/main.jsx`, `src/cctp.js`, `src/cctp-utils.js` — bridge UI and protocol orchestration
- `src/LookupTableManager.jsx`, `src/lookup-tables.js` — LUT tooling
- `src/styles.css`, `public/icons/*`, `public/theme-init.js` — visual system and theme bootstrap
- `src/*.pure.test.mjs` — pure unit tests (`pnpm test`)
- **Must not fabricate**: testimonials, customer logos, TVL/volume claims, security audit badges, third-party endorsements, or “official Circle app” status

## Product Principles

1. **Native USDC, real mainnet** — never imply wrapped assets or simulated balances as product truth.
2. **Fee honesty** — surface protocol vs Orbit fees from quotes; do not invent interface fees.
3. **Recoverability over cheerfulness** — transfers can fail mid-flight; persistence, resume, and plain-language errors beat decorative confidence.
4. **Wallet-local trust** — user retains signing control; Self-claim remains a first-class path.
5. **Operator clarity** — mainnet warnings, RPC requirements, and beforeunload protection stay visible when stakes are real.

## Accessibility & Inclusion

**[Inferred / not formally committed]** No WCAG target or assistive-tech certification recorded. UI already uses some dialog roles, aria labels, progressbar semantics, and `prefers-reduced-motion`. Future work should preserve keyboard reachability for primary transfer and modal flows until a formal standard is chosen.
