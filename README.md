# CCTP One — native USDC across chains

An independent interface for moving native USDC between Solana and EVM chains with Circle CCTP V2. Users can self-claim with a destination wallet to avoid the Orbit fee, or choose Circle Orbit for automatic destination minting. The app runs on CCTP mainnet only.

## Run locally

```bash
pnpm install
pnpm dev
```

Build the production bundle with `pnpm build`. Run pure unit tests with `pnpm test`.

## Included

- All 24 USDC mainnets currently exported by Circle Bridge Kit: Arbitrum,
  Avalanche, Base, Codex, Cronos, EDGE, Ethereum, HyperEVM, Injective, Ink,
  Linea, Monad, Morph, OP Mainnet, Pharos, Plume, Polygon PoS, Sei, Solana,
  Sonic, Unichain, World Chain, XDC, and X Layer
- Wallet Standard auto-discovery for Solana wallets such as Backpack, Phantom and Solflare
- EIP-6963 EVM wallet discovery for explicit MetaMask, Rabby, and Coinbase Wallet selection (with legacy fallback and account/chain change disconnect)
- Self-claim mode with destination-wallet mint signing, no Orbit fee, destination gas preflight, and automatic Solana ATA creation
- Optional Orbit automatic-mint mode with protocol vs Forwarding Service fee breakdown and an execution-bound `maxFee`
- 60-second quote expiry plus immediate pre-signing USDC and buffered native-gas balance rechecks
- Canonical source-account USDC balance preflight and 6-decimal amount validation
- Solana destination ATA preflight (Self-claim can create a missing ATA; Orbit requires an existing ATA)
- Real CCTP V2 mainnet burn → attest → mint execution
- Fast and Standard transfer modes, enabled per source chain from Circle's
  capability matrix and validated against Bridge Kit definitions
- Per-destination Forwarding Service capability checks; unsupported Orbit
  destinations automatically remain in Self-claim mode
- Step-by-step `BridgeResult` persistence for in-browser resume + `kit.retry` (forwarder-safe)
- Transaction explorer links and beforeunload protection while a transfer is in flight
- Solana Lookup Table authority scanning, exact cooldown tracking, two-stage deactivate/close signing, and rent recovery

## Networks

Routes use Circle Bridge Kit mainnet chain definitions. For Solana, set a dedicated
RPC endpoint before use. Mainnet routes involving Solana are disabled when
`VITE_SOLANA_MAINNET_RPC` is not configured:

```bash
cp .env.example .env
# edit:
VITE_SOLANA_MAINNET_RPC=https://your-solana-mainnet-rpc.example
```

Never place private keys or RPC secrets in `VITE_*` variables. Browser-visible variables are public.

Local integration harness files under `.tmp/` (wallets, keypairs) are gitignored. Do not commit them.

## Transfer recovery

Before signing, and after every Bridge Kit step, the app stores a **versioned full
BridgeResult** in `localStorage` (`relay:last-transfer:<env>`). Incomplete transfers
can be resumed with **Resume transfer** when:

1. The same browser profile still has the snapshot
2. The source wallet is reconnected
3. The snapshot includes provider + chain + step data (v2 format)
4. The connected wallet address and source chain exactly match the saved transfer

Legacy summary-only snapshots remain inspectable (explorer links) but are not auto-retryable.

Forwarder retries call `kit.retry(result, { from: sourceAdapter, to: undefined })`.
Self-claim retries require both the original source adapter and the original destination
claim adapter.

### External manual claim

**Manual claim** can finish a CCTP V2 burn started in another app or browser.
Select the burn's source chain and paste its source transaction hash/signature.
The app reads Circle's attested message, derives the destination chain and fixed
mint recipient, then asks a destination-chain wallet to submit only the mint.

Burns with an active Circle Orbit forward, or a `destinationCaller` restricted
to another relayer, cannot be manually claimed here. Fast Transfer attestations
are re-attested after expiry. Solana destinations additionally require
`VITE_SOLANA_MAINNET_RPC` and the recipient wallet whose USDC ATA is encoded in
the burn; the connected claim wallet pays SOL and can create that ATA.

## Production warning

This app can move **real USDC** and spend real gas. Before relying on this as a public fallback service, add durable off-device transaction storage, multi-RPC failover, analytics/monitoring, compliance controls, broader end-to-end tests, and an independent smart-contract/frontend security review.

For a first mainnet smoke test: use a dedicated source wallet and RPC, request a
fresh quote, and choose an amount whose displayed **Receive** value is greater than
zero. In Self-claim mode, fund the destination claim wallet with its native gas token.
In Orbit mode, use the live quoted Forwarding Service fee rather than a hard-coded
test amount. Keep the tab open through mint and verify the source burn, destination
mint, recipient address, and destination balance.
