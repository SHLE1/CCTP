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
import {
  TRANSFER_STORAGE_VERSION,
  formatUsdcFromMicro,
  isRetryableBridgeResult,
  serializeBridgeResult,
} from './cctp-utils.js'

export {
  TRANSFER_STORAGE_VERSION,
  USDC_DECIMALS,
  addUsdcAmounts,
  formatUsdcFromMicro,
  isRetryableBridgeResult,
  parseUsdcToMicro,
  quoteFeeBreakdown,
  quoteFees,
  sanitizeAmountInput,
  serializeBridgeResult,
  subtractUsdcAmounts,
  validateAmount,
} from './cctp-utils.js'

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

export function listChainIds(environment) {
  assertEnvironment(environment)
  return Object.keys(DEFINITIONS[environment])
}

/** CCTP v2 Fast Transfer is available when the chain exposes fastConfirmations. */
export function supportsFastTransfer(environment, chainId) {
  const definition = getDefinition(environment, chainId)
  return definition?.cctp?.contracts?.v2?.fastConfirmations != null
}

export function getSolanaRpcEndpoint(environment) {
  const definition = getDefinition(environment, 'solana')
  const configured = environment === 'mainnet'
    ? import.meta.env.VITE_SOLANA_MAINNET_RPC
    : import.meta.env.VITE_SOLANA_DEVNET_RPC
  return (typeof configured === 'string' && configured.trim()) || definition.rpcEndpoints[0]
}

export function usesPublicSolanaRpc(environment) {
  const configured = environment === 'mainnet'
    ? import.meta.env.VITE_SOLANA_MAINNET_RPC
    : import.meta.env.VITE_SOLANA_DEVNET_RPC
  return !(typeof configured === 'string' && configured.trim())
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

async function switchEvmChain(definition, provider = window.ethereum) {
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
        chainName: definition.title || definition.name,
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
    const provider = window.ethereum
    await switchEvmChain(definition, provider)
    const accounts = await provider.request({ method: 'eth_requestAccounts' })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: 'user-controlled', supportedChains: EVM_DEFINITIONS[environment] },
    })
    return {
      adapter,
      address: accounts[0],
      provider,
      chainId: definition.chainId,
      family: 'evm',
    }
  }

  if (!solanaWalletAdapter) throw new Error('请选择一个支持 Wallet Standard 的 Solana 钱包。')
  const provider = providerFromWalletAdapter(solanaWalletAdapter)
  const response = await provider.connect()
  const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
  const adapter = await createSolanaAdapterFromProvider({
    provider,
    connection,
    capabilities: { addressContext: 'user-controlled', supportedChains: [definition] },
  })
  return {
    adapter,
    address: response.publicKey.toString(),
    provider,
    family: 'solana',
  }
}

/**
 * Listen for EVM wallet account/chain changes. Returns an unsubscribe function.
 * On any meaningful change the app should disconnect rather than silently continue.
 */
export function attachEvmWalletListeners(provider, { onAccountsChanged, onChainChanged } = {}) {
  if (!provider) return () => {}
  const handleAccounts = (accounts) => onAccountsChanged?.(accounts)
  const handleChain = (chainId) => onChainChanged?.(chainId)
  if (typeof provider.on === 'function') {
    provider.on('accountsChanged', handleAccounts)
    provider.on('chainChanged', handleChain)
    return () => {
      provider.removeListener?.('accountsChanged', handleAccounts)
      provider.removeListener?.('chainChanged', handleChain)
      provider.off?.('accountsChanged', handleAccounts)
      provider.off?.('chainChanged', handleChain)
    }
  }
  return () => {}
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

async function evmJsonRpc(definition, method, params) {
  const endpoints = definition.rpcEndpoints || []
  let lastError
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error.message || 'RPC error')
      return payload.result
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('No EVM RPC endpoints available')
}

export async function fetchUsdcBalance(environment, chainId, address) {
  if (!address) return null
  const definition = getDefinition(environment, chainId)
  if (!definition.usdcAddress) return null

  if (definition.type === 'evm') {
    if (!isAddress(address)) return null
    const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`
    const result = await evmJsonRpc(definition, 'eth_call', [
      { to: definition.usdcAddress, data },
      'latest',
    ])
    return formatUsdcFromMicro(BigInt(result))
  }

  const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
  const owner = new PublicKey(address)
  const mint = new PublicKey(definition.usdcAddress)
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint })
  const total = accounts.value.reduce((sum, item) => {
    const amount = item.account.data.parsed?.info?.tokenAmount?.amount
    return sum + BigInt(amount || '0')
  }, 0n)
  return formatUsdcFromMicro(total)
}

function paramsFor({ environment, sourceId, destinationId, adapter, recipient, amount, speed }) {
  return {
    from: { adapter, chain: getDefinition(environment, sourceId).chain },
    to: {
      chain: getDefinition(environment, destinationId).chain,
      recipientAddress: recipient.trim(),
      useForwarder: true,
    },
    amount: String(amount).trim(),
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
  if (!isRetryableBridgeResult(result)) {
    throw new Error('当前保存的转账记录不完整，无法自动重试。请用浏览器中的交易链接在区块浏览器核对，或重新发起转账。')
  }
  const handler = (payload) => onEvent?.(payload)
  kit.on('*', handler)
  try {
    // Forwarder-only destinations: official RetryContext leaves `to` undefined so
    // mint confirmation uses IRIS forwardState instead of a destination adapter.
    return await kit.retry(result, { from: adapter, to: undefined })
  } finally {
    kit.off('*', handler)
  }
}

export function friendlyError(error) {
  const message = error?.shortMessage || error?.details || error?.message || String(error)
  if (/user rejected|denied|4001/i.test(message)) return '你在钱包中取消了请求。'
  if (/insufficient/i.test(message)) return '余额不足：请确认 USDC 和 Gas 代币都充足。'
  if (/network mismatch/i.test(message)) return '钱包网络不匹配，请切换到所选网络后重试。'
  return message.length > 260 ? `${message.slice(0, 257)}…` : message
}

function transferStorageKey(environment) {
  return `relay:last-transfer:${environment}`
}

export function persistTransfer(result, environment) {
  if (!result) return
  const payload = {
    version: TRANSFER_STORAGE_VERSION,
    environment,
    updatedAt: new Date().toISOString(),
    result: serializeBridgeResult(result),
    summary: {
      state: result.state,
      amount: result.amount,
      source: result.source?.chain?.name || result.source?.chain,
      destination: result.destination?.chain?.name || result.destination?.chain,
      recipient: result.destination?.recipientAddress || result.destination?.address,
      steps: (result.steps || []).map(({ name, state, txHash, explorerUrl, errorMessage }) => ({
        name, state, txHash, explorerUrl, errorMessage,
      })),
    },
  }
  try {
    localStorage.setItem(transferStorageKey(environment), JSON.stringify(payload))
  } catch {
    try {
      const slim = {
        ...payload,
        result: {
          ...payload.result,
          steps: payload.result.steps.map(({ data, ...rest }) => rest),
        },
      }
      localStorage.setItem(transferStorageKey(environment), JSON.stringify(slim))
    } catch {
      localStorage.setItem(transferStorageKey(environment), JSON.stringify({
        version: 1,
        environment,
        updatedAt: payload.updatedAt,
        ...payload.summary,
      }))
    }
  }
}

/**
 * Load the last transfer for an environment.
 * @returns {{ result: object|null, retryable: boolean, summary: object|null, updatedAt?: string, legacy?: boolean } | null}
 */
export function loadPersistedTransfer(environment) {
  let raw
  try {
    raw = localStorage.getItem(transferStorageKey(environment))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version === TRANSFER_STORAGE_VERSION && parsed.result) {
      return {
        result: parsed.result,
        retryable: isRetryableBridgeResult(parsed.result),
        summary: parsed.summary || null,
        updatedAt: parsed.updatedAt,
        environment: parsed.environment || environment,
      }
    }
    const summary = parsed.summary || parsed
    return {
      result: summary,
      retryable: isRetryableBridgeResult(summary),
      summary,
      updatedAt: parsed.updatedAt,
      environment: parsed.environment || environment,
      legacy: true,
    }
  } catch {
    return null
  }
}
