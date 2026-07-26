import { BridgeKit } from '@circle-fin/bridge-kit'
import {
  Arbitrum,
  ArbitrumSepolia,
  Avalanche,
  AvalancheFuji,
  Base,
  BaseSepolia,
  Ethereum,
  EthereumSepolia,
  Optimism,
  OptimismSepolia,
  Polygon,
  PolygonAmoy,
  Solana,
  SolanaDevnet,
  Sonic,
  SonicTestnet,
  Unichain,
  UnichainSepolia,
} from '@circle-fin/bridge-kit/chains'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { createSolanaAdapterFromProvider } from '@circle-fin/adapter-solana'
import { Connection, PublicKey } from '@solana/web3.js'
import { isAddress } from 'viem'

const DEFINITIONS = {
  mainnet: {
    ethereum: Ethereum,
    base: Base,
    arbitrum: Arbitrum,
    optimism: Optimism,
    avalanche: Avalanche,
    polygon: Polygon,
    unichain: Unichain,
    sonic: Sonic,
    solana: Solana,
  },
  testnet: {
    ethereum: EthereumSepolia,
    base: BaseSepolia,
    arbitrum: ArbitrumSepolia,
    optimism: OptimismSepolia,
    avalanche: AvalancheFuji,
    polygon: PolygonAmoy,
    unichain: UnichainSepolia,
    sonic: SonicTestnet,
    solana: SolanaDevnet,
  },
}

const EVM_DEFINITIONS = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([environment, definitions]) => [
    environment,
    Object.values(definitions).filter((chain) => chain.type === 'evm'),
  ]),
)
const kit = new BridgeKit({ disableErrorReporting: true })

function assertEnvironment(environment) {
  if (!DEFINITIONS[environment]) throw new Error(`Unsupported environment: ${environment}`)
}

export function getDefinition(environment, chainId) {
  assertEnvironment(environment)
  const definition = DEFINITIONS[environment][chainId]
  if (!definition) throw new Error(`Unsupported chain: ${chainId}`)
  return definition
}

export function getSolanaRpcEndpoint(environment) {
  const definition = getDefinition(environment, 'solana')
  return (environment === 'mainnet'
    ? import.meta.env.VITE_SOLANA_MAINNET_RPC
    : import.meta.env.VITE_SOLANA_DEVNET_RPC) || definition.rpcEndpoints[0]
}

function providerFromWalletAdapter(walletAdapter) {
  return {
    get isConnected() {
      return walletAdapter.connected
    },
    get publicKey() {
      return walletAdapter.publicKey || undefined
    },
    async connect() {
      if (!walletAdapter.connected) await walletAdapter.connect()
      if (!walletAdapter.publicKey) throw new Error('钱包已连接，但没有返回 Solana 公钥。')
      return { publicKey: walletAdapter.publicKey }
    },
    async disconnect() {
      await walletAdapter.disconnect()
    },
    async signTransaction(transaction) {
      if (!walletAdapter.signTransaction) throw new Error('该钱包不支持 Solana 交易签名。')
      return walletAdapter.signTransaction(transaction)
    },
    async signAllTransactions(transactions) {
      if (!walletAdapter.signAllTransactions) {
        return Promise.all(transactions.map((transaction) => walletAdapter.signTransaction(transaction)))
      }
      return walletAdapter.signAllTransactions(transactions)
    },
    async signMessage(message) {
      if (!walletAdapter.signMessage) throw new Error('该钱包不支持消息签名。')
      return { signature: await walletAdapter.signMessage(message) }
    },
  }
}

async function switchEvmChain(definition) {
  const provider = window.ethereum
  if (!provider?.request) throw new Error('未检测到 EVM 钱包，请安装 MetaMask、Rabby 或 Coinbase Wallet。')
  const chainId = `0x${definition.chainId.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (error) {
    if (error?.code !== 4902 && !String(error?.message).includes('Unrecognized chain')) throw error
    const explorer = definition.explorerUrl?.split('/tx/')[0]
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: definition.title,
        nativeCurrency: definition.nativeCurrency,
        rpcUrls: definition.rpcEndpoints,
        blockExplorerUrls: explorer ? [explorer] : [],
      }],
    })
  }
}

export async function connectSourceWallet(environment, chainId, solanaWalletAdapter) {
  const definition = getDefinition(environment, chainId)
  if (definition.type === 'evm') {
    await switchEvmChain(definition)
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    const adapter = await createViemAdapterFromProvider({
      provider: window.ethereum,
      capabilities: { addressContext: 'user-controlled', supportedChains: EVM_DEFINITIONS[environment] },
    })
    return { adapter, address: accounts[0], provider: window.ethereum }
  }

  if (!solanaWalletAdapter) throw new Error('请选择一个支持 Wallet Standard 的 Solana 钱包。')
  const provider = providerFromWalletAdapter(solanaWalletAdapter)
  const response = await provider.connect()
  const connection = new Connection(
    getSolanaRpcEndpoint(environment),
    'confirmed',
  )
  const adapter = await createSolanaAdapterFromProvider({
    provider,
    connection,
    capabilities: { addressContext: 'user-controlled', supportedChains: [definition] },
  })
  return { adapter, address: response.publicKey.toString(), provider }
}

export function validateRecipient(environment, chainId, address) {
  if (!address?.trim()) return '请输入目标链收款地址'
  const definition = getDefinition(environment, chainId)
  if (definition.type === 'evm') return isAddress(address.trim()) ? '' : 'EVM 地址格式不正确'
  try {
    // Parsing is sufficient for client-side format validation. The bridge SDK
    // performs the authoritative route and recipient validation before signing.
    new PublicKey(address.trim())
    return ''
  } catch {
    return 'Solana 地址格式不正确'
  }
}

function paramsFor({ environment, sourceId, destinationId, adapter, recipient, amount, speed }) {
  return {
    from: { adapter, chain: getDefinition(environment, sourceId).chain },
    to: {
      chain: getDefinition(environment, destinationId).chain,
      recipientAddress: recipient.trim(),
      useForwarder: true,
    },
    amount,
    token: 'USDC',
    config: {
      transferSpeed: speed === 'fast' ? 'FAST' : 'SLOW',
      batchTransactions: false,
    },
  }
}

export async function estimateTransfer(input) {
  return kit.estimate(paramsFor(input))
}

export async function executeTransfer(input, onEvent) {
  const handler = (payload) => onEvent?.(payload)
  kit.on('*', handler)
  try {
    return await kit.bridge(paramsFor(input))
  } finally {
    kit.off('*', handler)
  }
}

export async function retryTransfer(result, adapter, onEvent) {
  const handler = (payload) => onEvent?.(payload)
  kit.on('*', handler)
  try {
    // Forwarder-only destinations do not need a destination signer. Bridge Kit's
    // retry context is structurally shared with two-adapter flows, so the source
    // adapter is supplied for both fields and ignored for the forwarded mint step.
    return await kit.retry(result, { from: adapter, to: adapter })
  } finally {
    kit.off('*', handler)
  }
}

export function quoteFees(estimate) {
  return (estimate?.fees || []).reduce((total, fee) => total + (Number(fee.amount) || 0), 0)
}

export function friendlyError(error) {
  const message = error?.shortMessage || error?.details || error?.message || String(error)
  if (/user rejected|denied|4001/i.test(message)) return '你在钱包中取消了请求。'
  if (/insufficient/i.test(message)) return '余额不足：请确认 USDC 和 Gas 代币都充足。'
  if (/network mismatch/i.test(message)) return '钱包网络不匹配，请切换到所选网络后重试。'
  return message.length > 260 ? `${message.slice(0, 257)}…` : message
}

export function persistTransfer(result, environment) {
  if (!result) return
  const summary = {
    environment,
    state: result.state,
    amount: result.amount,
    source: result.source?.chain?.name,
    destination: result.destination?.chain?.name,
    recipient: result.destination?.recipientAddress || result.destination?.address,
    updatedAt: new Date().toISOString(),
    steps: (result.steps || []).map(({ name, state, txHash, explorerUrl, errorMessage }) => ({
      name, state, txHash, explorerUrl, errorMessage,
    })),
  }
  localStorage.setItem(`relay:last-transfer:${environment}`, JSON.stringify(summary))
}
