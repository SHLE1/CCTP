# Relay — CCTP USDC bridge

An independent interface for moving native USDC between Solana and EVM chains with Circle CCTP V2 and the Circle Orbit forwarder. The app includes an explicit Mainnet/Testnet switch and starts in Testnet mode on first visit.

## Run locally

```bash
pnpm install
pnpm dev
```

Build the production bundle with `pnpm build`.

## Included

- Mainnet/Testnet environment switching with isolated wallet and quote state
- Solana and EVM route selection, including Sonic
- Wallet Standard auto-discovery for Solana wallets such as Backpack, Phantom and Solflare
- Injected EVM wallet support for MetaMask, Rabby and Coinbase Wallet
- Live Bridge Kit fee/gas preflight
- Real CCTP V2 Testnet burn → attest → forwarded mint execution
- Fast and Standard transfer modes
- Transaction explorer links and in-session retry for incomplete transfers
- A locally persisted, serializable summary of the latest transfer

## Networks

The environment selector maps every UI route to the corresponding Circle Bridge Kit mainnet or testnet chain definition. Switching environments disconnects the active wallet and clears the recipient, quote, and unsubmitted transfer state.

For Solana, set optional production-quality RPC endpoints:

```bash
VITE_SOLANA_MAINNET_RPC=https://your-solana-mainnet-rpc.example
VITE_SOLANA_DEVNET_RPC=https://your-solana-devnet-rpc.example
```

Never place private keys or RPC secrets in `VITE_*` variables. Browser-visible variables are public.

## Production warning

Mainnet mode can move **real USDC** and spend real gas. This interface is not yet production-ready. Before relying on it as a public fallback service, add durable transaction storage, RPC failover, direct CCTP manual claiming, analytics/monitoring, compliance controls, end-to-end tests, and an independent smart-contract/frontend security review.
