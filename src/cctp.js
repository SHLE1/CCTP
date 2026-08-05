import { BridgeKit } from '@circle-fin/bridge-kit'
import {
  Arbitrum,
  ArbitrumSepolia,
  Avalanche,
  AvalancheFuji,
  Base,
  BaseSepolia,
  Codex,
  CodexTestnet,
  Cronos,
  CronosTestnet,
  Edge,
  EdgeTestnet,
  Ethereum,
  EthereumSepolia,
  HyperEVM,
  HyperEVMTestnet,
  Injective,
  InjectiveTestnet,
  Ink,
  InkTestnet,
  Linea,
  LineaSepolia,
  Monad,
  MonadTestnet,
  Morph,
  MorphTestnet,
  Optimism,
  OptimismSepolia,
  Pharos,
  PharosTestnet,
  Plume,
  PlumeTestnet,
  Polygon,
  PolygonAmoy,
  Sei,
  SeiTestnet,
  Solana,
  SolanaDevnet,
  Sonic,
  SonicTestnet,
  Unichain,
  UnichainSepolia,
  WorldChain,
  WorldChainSepolia,
  XDC,
  XDCApothem,
} from '@circle-fin/bridge-kit/chains'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { createSolanaAdapterFromProvider } from '@circle-fin/adapter-solana'
import { Connection, PublicKey } from '@solana/web3.js'
import { encodeFunctionData, formatUnits, isAddress, parseUnits } from 'viem'
import {
  TRANSFER_STORAGE_VERSION,
  createBridgeResultDraft,
  formatUsdcFromMicro,
  isDestinationWalletCompatibleWithResult,
  isRetryableBridgeResult,
  isWalletCompatibleWithResult,
  safeExplorerUrl,
  serializeBridgeResult,
} from './cctp-utils.js'

export {
  QUOTE_TTL_MS,
  TRANSFER_STORAGE_VERSION,
  USDC_DECIMALS,
  addUsdcAmounts,
  beginQuoteRefresh,
  canStartTransferFromQuote,
  createBridgeResultDraft,
  failQuoteRefresh,
  formatUsdcFromMicro,
  isAmountGreaterThanFee,
  isDestinationWalletCompatibleWithResult,
  isRetryableBridgeResult,
  isQuoteFresh,
  isWalletCompatibleWithResult,
  mergeBridgeEventIntoResult,
  parseUsdcToMicro,
  quoteInputKey,
  quoteFeeBreakdown,
  quoteFees,
  resolveAmountFieldError,
  safeExplorerUrl,
  sanitizeAmountInput,
  serializeBridgeResult,
  shouldAutoQuote,
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
    codex: Codex,
    cronos: Cronos,
    edge: Edge,
    hyperevm: HyperEVM,
    injective: Injective,
    ink: Ink,
    linea: Linea,
    monad: Monad,
    morph: Morph,
    pharos: Pharos,
    plume: Plume,
    sei: Sei,
    worldchain: WorldChain,
    xdc: XDC,
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
    codex: CodexTestnet,
    cronos: CronosTestnet,
    edge: EdgeTestnet,
    hyperevm: HyperEVMTestnet,
    injective: InjectiveTestnet,
    ink: InkTestnet,
    linea: LineaSepolia,
    monad: MonadTestnet,
    morph: MorphTestnet,
    pharos: PharosTestnet,
    plume: PlumeTestnet,
    sei: SeiTestnet,
    worldchain: WorldChainSepolia,
    xdc: XDCApothem,
  },
}

const EVM_DEFINITIONS = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([environment, definitions]) => [
    environment,
    Object.values(definitions).filter((chain) => chain.type === 'evm'),
  ]),
)
const kit = new BridgeKit({ disableErrorReporting: true })
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const IRIS_API = {
  mainnet: 'https://iris-api.circle.com',
  testnet: 'https://iris-api-sandbox.circle.com',
}
const MANUAL_CLAIM_REATTEST_ATTEMPTS = 30
const MANUAL_CLAIM_REATTEST_DELAY_MS = 2_000
const L1_EXPIRATION_DESTINATIONS = new Set(['arbitrum', 'edge', 'plume'])
// Circle marks Fast Transfer available only where it materially improves
// attestation time. Polygon is one example where Bridge Kit exposes a lower
// fastConfirmations value but the public capability matrix still marks Fast N/A.
const FAST_TRANSFER_CHAIN_IDS = new Set([
  'arbitrum',
  'base',
  'codex',
  'edge',
  'ethereum',
  'ink',
  'linea',
  'morph',
  'optimism',
  'plume',
  'solana',
  'unichain',
  'worldchain',
])

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

export function findChainIdForDefinition(environment, chain) {
  assertEnvironment(environment)
  if (!chain || typeof chain !== 'object') return null
  const match = Object.entries(DEFINITIONS[environment]).find(([, definition]) => {
    if (chain.chainId != null && definition.chainId != null) {
      return Number(chain.chainId) === Number(definition.chainId)
    }
    return chain.chain === definition.chain
  })
  return match?.[0] || null
}

export function findChainIdForDomain(environment, domain) {
  assertEnvironment(environment)
  const numericDomain = Number(domain)
  if (!Number.isInteger(numericDomain) || numericDomain < 0) return null
  const match = Object.entries(DEFINITIONS[environment]).find(
    ([, definition]) => Number(definition.cctp?.domain) === numericDomain,
  )
  return match?.[0] || null
}

/**
 * Bridge Kit exposes technical fastConfirmations values for every v2 chain,
 * including chains Circle marks Fast Transfer N/A. Keep the product capability
 * aligned with Circle's public matrix and verify the SDK definition still
 * contains a fast threshold.
 */
export function supportsFastTransfer(environment, chainId) {
  const definition = getDefinition(environment, chainId)
  return FAST_TRANSFER_CHAIN_IDS.has(chainId)
    && Number.isFinite(definition?.cctp?.contracts?.v2?.fastConfirmations)
}

export function supportsForwarderDestination(environment, chainId) {
  const definition = getDefinition(environment, chainId)
  return definition?.cctp?.forwarderSupported?.destination === true
}

export function getSolanaRpcEndpoint(environment) {
  const definition = getDefinition(environment, 'solana')
  const configured = environment === 'mainnet'
    ? import.meta.env?.VITE_SOLANA_MAINNET_RPC
    : import.meta.env?.VITE_SOLANA_DEVNET_RPC
  return (typeof configured === 'string' && configured.trim()) || definition.rpcEndpoints[0]
}

export function usesPublicSolanaRpc(environment) {
  const configured = environment === 'mainnet'
    ? import.meta.env?.VITE_SOLANA_MAINNET_RPC
    : import.meta.env?.VITE_SOLANA_DEVNET_RPC
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
    const explorer = definition.explorerUrl
      ?.replace(/\/(?:tx|transaction)\/\{hash\}.*$/i, '')
      ?.replace(/\/+$/, '')
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

export async function switchConnectedEvmWallet(environment, chainId, wallet) {
  const definition = getDefinition(environment, chainId)
  if (definition.type !== 'evm' || wallet?.family !== 'evm' || !wallet?.address) {
    throw new Error('The connected wallet cannot be reused for the selected EVM chain.')
  }
  const provider = wallet.provider
  if (typeof provider?.request !== 'function') {
    throw new Error('The EVM wallet provider is no longer available.')
  }

  const currentChainId = await provider.request({ method: 'eth_chainId' })
  let numericChainId
  try {
    numericChainId = Number(BigInt(currentChainId))
  } catch {
    throw new Error('The EVM wallet returned an invalid network identifier.')
  }
  if (numericChainId !== Number(definition.chainId)) {
    await switchEvmChain(definition, provider)
  }

  const accounts = await provider.request({ method: 'eth_accounts' })
  const currentAddress = accounts?.[0]
  if (!currentAddress || currentAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('The active EVM account changed. Reconnect the wallet before continuing.')
  }
  return { ...wallet, chainId: definition.chainId }
}

export async function connectSourceWallet(environment, chainId, walletProvider) {
  const definition = getDefinition(environment, chainId)
  if (definition.type === 'evm') {
    const provider = walletProvider || window.ethereum
    await switchEvmChain(definition, provider)
    const accounts = await provider.request({ method: 'eth_requestAccounts' })
    if (!accounts?.[0] || !isAddress(accounts[0]) || accounts[0].toLowerCase() === EVM_ZERO_ADDRESS) {
      throw new Error('The EVM wallet did not return a valid active account.')
    }
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

  if (!walletProvider) throw new Error('请选择一个支持 Wallet Standard 的 Solana 钱包。')
  const provider = providerFromWalletAdapter(walletProvider)
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

/** EIP-6963 icons are data URIs (or occasionally https). Reject anything else. */
function sanitizeWalletIcon(icon) {
  if (typeof icon !== 'string') return ''
  const value = icon.trim()
  if (!value || value.length > 150_000) return ''
  if (value.startsWith('data:image/')) return value
  if (/^https:\/\//i.test(value)) return value
  return ''
}

export function subscribeEvmProviders(onProvider) {
  if (typeof window === 'undefined' || typeof onProvider !== 'function') return () => {}
  const seenProviders = new WeakSet()
  // When any wallet announces via EIP-6963, skip window.ethereum legacy fallback.
  // MetaMask (and others) inject both; the legacy object is a different reference, so
  // WeakSet alone cannot dedupe and the list would show MetaMask twice.
  let eip6963Count = 0
  const publish = (info, provider, { viaEip6963 = false } = {}) => {
    if (!provider || typeof provider.request !== 'function' || seenProviders.has(provider)) return
    seenProviders.add(provider)
    if (viaEip6963) eip6963Count += 1
    onProvider({
      info: {
        uuid: String(info?.uuid || `legacy-${Date.now()}`).slice(0, 128),
        name: String(info?.name || 'Browser wallet').slice(0, 80),
        rdns: String(info?.rdns || '').slice(0, 120),
        icon: sanitizeWalletIcon(info?.icon),
      },
      provider,
    })
  }
  const handleAnnouncement = (event) => {
    publish(event?.detail?.info, event?.detail?.provider, { viaEip6963: true })
  }
  window.addEventListener('eip6963:announceProvider', handleAnnouncement)
  window.dispatchEvent(new window.Event('eip6963:requestProvider'))
  const fallbackTimer = window.setTimeout(() => {
    // Prefer discovery via EIP-6963. Only fall back when nothing announced
    // (old extensions that never implemented multi-wallet discovery).
    if (eip6963Count > 0) return
    const legacyProviders = Array.isArray(window.ethereum?.providers)
      ? window.ethereum.providers
      : [window.ethereum]
    legacyProviders.forEach((provider, index) => publish({
      uuid: `legacy-${index}`,
      name: provider?.isMetaMask ? 'MetaMask' : 'Browser wallet',
      icon: '',
    }, provider))
  }, 100)
  return () => {
    window.clearTimeout(fallbackTimer)
    window.removeEventListener('eip6963:announceProvider', handleAnnouncement)
  }
}

/**
 * Listen for EVM wallet account/chain changes. Returns an unsubscribe function.
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

export async function assertSourceWalletReady(environment, chainId, wallet, role = 'source') {
  const definition = getDefinition(environment, chainId)
  const expectedFamily = definition.type === 'evm' ? 'evm' : 'solana'
  const walletLabel = role === 'destination' ? 'destination claim wallet' : 'source wallet'
  if (!wallet?.address || wallet.family !== expectedFamily) {
    throw new Error(`The connected ${walletLabel} does not match the selected ${role} chain.`)
  }

  if (expectedFamily === 'evm') {
    if (typeof wallet.provider?.request !== 'function') {
      throw new Error('The EVM wallet provider is no longer available.')
    }
    const [accounts, currentChainId] = await Promise.all([
      wallet.provider.request({ method: 'eth_accounts' }),
      wallet.provider.request({ method: 'eth_chainId' }),
    ])
    const currentAddress = accounts?.[0]
    if (!currentAddress || currentAddress.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(`The active EVM account changed. Reconnect the ${walletLabel} and request a fresh quote.`)
    }
    let numericChainId
    try {
      numericChainId = Number(BigInt(currentChainId))
    } catch {
      throw new Error('The EVM wallet returned an invalid network identifier.')
    }
    if (numericChainId !== Number(definition.chainId)) {
      throw new Error(`The EVM wallet is on chain ${numericChainId}, but ${definition.name} (${definition.chainId}) is required.`)
    }
    return true
  }

  const currentAddress = wallet.provider?.publicKey?.toString?.()
  if (!wallet.provider?.isConnected || currentAddress !== wallet.address) {
    throw new Error(`The active Solana ${walletLabel} changed or disconnected. Reconnect it before transferring.`)
  }
  return true
}

export function validateRecipient(environment, chainId, address) {
  if (!address?.trim()) return '请输入目标链收款地址'
  const definition = getDefinition(environment, chainId)
  if (definition.type === 'evm') {
    const recipient = address.trim()
    if (!isAddress(recipient)) return 'EVM 地址格式不正确'
    if (recipient.toLowerCase() === EVM_ZERO_ADDRESS) return '不能使用 EVM 零地址作为收款地址'
    return ''
  }
  try {
    // Parsing is sufficient for client-side format validation. The bridge SDK
    // performs the authoritative route and recipient validation before signing.
    const recipient = new PublicKey(address.trim())
    if (recipient.equals(PublicKey.default)) return '不能使用 Solana 默认地址作为收款地址'
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

const CCTP_RECEIVE_MESSAGE_SELECTOR = '0x57ecfd28'
const CCTP_RECEIVE_MESSAGE_ABI = [{
  type: 'function',
  name: 'receiveMessage',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'message', type: 'bytes' },
    { name: 'attestation', type: 'bytes' },
  ],
  outputs: [],
}]

function markClaimAlreadyCompleted(result, stepIndex = -1) {
  const steps = [...(result.steps || [])]
  const completedStep = {
    ...(stepIndex >= 0 ? steps[stepIndex] : { name: 'mint' }),
    state: 'noop',
    errorMessage: 'Claim was already completed on-chain.',
    errorCategory: undefined,
  }
  if (stepIndex >= 0) steps[stepIndex] = completedStep
  else steps.push(completedStep)
  return { ...result, state: 'success', steps }
}

async function isConsumedCctpClaim(definition, txHash) {
  const messageTransmitter = definition.cctp?.contracts?.v2?.messageTransmitter
  if (
    definition.type !== 'evm'
    || !messageTransmitter
    || !/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))
  ) {
    return false
  }

  try {
    const [receipt, transaction] = await Promise.all([
      evmJsonRpc(definition, 'eth_getTransactionReceipt', [txHash]),
      evmJsonRpc(definition, 'eth_getTransactionByHash', [txHash]),
    ])
    if (
      !receipt
      || !transaction
      || BigInt(receipt.status) !== 0n
      || String(transaction.to || '').toLowerCase() !== messageTransmitter.toLowerCase()
      || !String(transaction.input || '').toLowerCase().startsWith(CCTP_RECEIVE_MESSAGE_SELECTOR)
    ) {
      return false
    }

    try {
      await evmJsonRpc(definition, 'eth_call', [{
        from: transaction.from,
        to: transaction.to,
        data: transaction.input,
        value: transaction.value || '0x0',
      }, 'latest'])
    } catch (error) {
      return /nonce already used/i.test(String(error?.message || error))
    }
  } catch {
    // Reconciliation is best-effort; an unavailable RPC must not invent success.
  }
  return false
}

async function isConsumedCctpMessage(definition, caller, message, attestation) {
  if (
    definition.type !== 'evm'
    || !definition.cctp?.contracts?.v2?.messageTransmitter
    || !isAddress(caller || '')
  ) {
    return false
  }

  try {
    const data = encodeFunctionData({
      abi: CCTP_RECEIVE_MESSAGE_ABI,
      functionName: 'receiveMessage',
      args: [message, attestation],
    })
    await evmJsonRpc(definition, 'eth_call', [{
      from: caller,
      to: definition.cctp.contracts.v2.messageTransmitter,
      data,
    }, 'latest'])
  } catch (error) {
    return /nonce already used/i.test(String(error?.message || error))
  }
  return false
}

async function isClaimCompletedFromBurn(result, environment) {
  try {
    const sourceId = findChainIdForDefinition(environment, result.source?.chain)
    const destinationId = findChainIdForDefinition(environment, result.destination?.chain)
    if (!sourceId || !destinationId || sourceId === destinationId) return false

    const burnStep = result.steps?.find(
      (step) => /burn/i.test(String(step?.name || '')) && step?.state === 'success',
    )
    if (!burnStep?.txHash || validateManualClaimBurnHash(environment, sourceId, burnStep.txHash)) {
      return false
    }

    const source = getDefinition(environment, sourceId)
    const message = await fetchManualClaimResponse(
      environment,
      source.cctp.domain,
      burnStep.txHash,
    )
    if (
      Number(message.cctpVersion) !== 2
      || String(message.status || '').toLowerCase() !== 'complete'
      || !/^0x(?:[0-9a-fA-F]{2})+$/.test(String(message.message || ''))
      || !/^0x(?:[0-9a-fA-F]{2})+$/.test(String(message.attestation || ''))
    ) {
      return false
    }

    const decoded = decodeCctpV2Message(message.message)
    const destination = getDefinition(environment, destinationId)
    const expectedRecipient = String(result.destination?.recipientAddress || '').trim()
    const decodedRecipient = normalizeDecodedAddress(decoded.mintRecipient, destination)
    const recipientMatches = destination.type === 'evm'
      ? isAddress(expectedRecipient)
        && decodedRecipient.toLowerCase() === expectedRecipient.toLowerCase()
      : decodedRecipient === expectedRecipient
    if (
      decoded.sourceDomain !== Number(source.cctp.domain)
      || decoded.destinationDomain !== Number(destination.cctp.domain)
      || decoded.amount !== parseUnits(String(result.amount), 6).toString()
      || !recipientMatches
      || (message.eventNonce
        && decoded.eventNonce.toLowerCase() !== String(message.eventNonce).toLowerCase())
    ) {
      return false
    }

    if (destination.type === 'solana') {
      const status = await getSolanaManualClaimStatus(
        environment,
        destination,
        decoded.eventNonce,
      )
      return status.state === 'claimed'
    }
    return isConsumedCctpMessage(
      destination,
      result.destination?.address || expectedRecipient,
      message.message,
      message.attestation,
    )
  } catch {
    // Reconciliation is best-effort; unavailable attestation/RPC data must not invent success.
    return false
  }
}

/**
 * A relayer and a self-claim can race for the same CCTP message. If the later
 * receiveMessage transaction reverts because its nonce was already consumed,
 * the transfer is complete rather than failed.
 */
export async function reconcileAlreadyCompletedClaim(result, environment) {
  if (
    (result?.state !== 'error' && result?.state !== 'pending')
    || !Array.isArray(result.steps)
  ) {
    return result
  }

  let stepIndex = -1
  for (let index = result.steps.length - 1; index >= 0; index -= 1) {
    if (result.steps[index]?.state !== 'error') continue
    if (/(?:mint|claim|forward)/i.test(String(result.steps[index]?.name || ''))) {
      stepIndex = index
      break
    }
  }
  const step = result.steps[stepIndex]
  if (/^0x[0-9a-f]{64}$/i.test(String(step?.txHash || ''))) {
    const destinationId = findChainIdForDefinition(environment, result.destination?.chain)
    if (destinationId) {
      const definition = getDefinition(environment, destinationId)
      if (await isConsumedCctpClaim(definition, step.txHash)) {
        return markClaimAlreadyCompleted(result, stepIndex)
      }
    }
  }

  return await isClaimCompletedFromBurn(result, environment)
    ? markClaimAlreadyCompleted(result, stepIndex)
    : result
}
 

export async function fetchUsdcBalance(environment, chainId, address, provider) {
  if (!address) return null
  const definition = getDefinition(environment, chainId)
  if (!definition.usdcAddress) return null

  if (definition.type === 'evm') {
    if (!isAddress(address)) return null
    const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`
    const params = [{ to: definition.usdcAddress, data }, 'latest']
    const result = typeof provider?.request === 'function'
      ? await provider.request({ method: 'eth_call', params })
      : await evmJsonRpc(definition, 'eth_call', params)
    return formatUsdcFromMicro(BigInt(result))
  }

  const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
  const owner = new PublicKey(address)
  const mint = new PublicKey(definition.usdcAddress)
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  try {
    const balance = await connection.getTokenAccountBalance(ata, 'confirmed')
    return formatUsdcFromMicro(BigInt(balance.value.amount))
  } catch (error) {
    if (/could not find account|invalid param|not found/i.test(String(error?.message || error))) {
      return '0'
    }
    throw error
  }
}

export async function checkSourceGasReadiness(environment, chainId, wallet, estimate) {
  const definition = getDefinition(environment, chainId)
  const sourceFees = (estimate?.gasFees || []).filter(
    (item) => item?.blockchain === definition.chain,
  )
  if (!sourceFees.length) {
    return {
      ready: false,
      error: `Could not verify the source-chain gas estimate for ${definition.name}. Request a fresh quote before transferring.`,
    }
  }

  let estimatedGas = 0n
  try {
    for (const item of sourceFees) {
      if (item.error || item.fees?.fee == null) throw new Error('gas estimate unavailable')
      estimatedGas += parseUnits(String(item.fees.fee), definition.nativeCurrency.decimals)
    }
  } catch {
    return {
      ready: false,
      error: `Could not estimate all source-chain transactions on ${definition.name}. Check the wallet balance and RPC, then request a fresh quote.`,
    }
  }
  if (estimatedGas <= 0n) {
    return {
      ready: false,
      error: `The source-chain gas estimate for ${definition.name} was zero or invalid. Request a fresh quote before transferring.`,
    }
  }

  let gasBalance
  try {
    if (definition.type === 'evm') {
      if (typeof wallet?.provider?.request !== 'function') throw new Error('wallet unavailable')
      gasBalance = BigInt(await wallet.provider.request({
        method: 'eth_getBalance',
        params: [wallet.address, 'latest'],
      }))
    } else {
      const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
      gasBalance = BigInt(await connection.getBalance(new PublicKey(wallet.address), 'confirmed'))
    }
  } catch {
    return {
      ready: false,
      error: `Could not verify the ${definition.nativeCurrency.symbol} gas balance on ${definition.name}. Check the wallet and RPC, then request a fresh quote.`,
    }
  }

  // Leave a 50% buffer for gas-price movement between estimation and signing.
  const requiredGas = (estimatedGas * 150n + 99n) / 100n
  if (gasBalance < requiredGas) {
    return {
      ready: false,
      estimatedGas,
      requiredGas,
      gasBalance,
      error: `Insufficient ${definition.nativeCurrency.symbol} for gas on ${definition.name}. Keep at least about ${formatUnits(requiredGas, definition.nativeCurrency.decimals)} ${definition.nativeCurrency.symbol} available.`,
    }
  }

  return { ready: true, estimatedGas, requiredGas, gasBalance }
}

export async function checkDestinationGasReadiness(environment, chainId, wallet, estimate) {
  const definition = getDefinition(environment, chainId)
  const destinationFees = (estimate?.gasFees || []).filter(
    (item) => item?.blockchain === definition.chain,
  )
  if (!destinationFees.length) {
    return {
      ready: false,
      error: `Could not verify the destination-chain gas estimate for ${definition.name}. Request a fresh quote before transferring.`,
    }
  }

  let estimatedGas = 0n
  try {
    for (const item of destinationFees) {
      if (item.error || item.fees?.fee == null) throw new Error('gas estimate unavailable')
      estimatedGas += parseUnits(String(item.fees.fee), definition.nativeCurrency.decimals)
    }
  } catch {
    return {
      ready: false,
      error: `Could not estimate the destination mint transaction on ${definition.name}. Check the claim wallet balance and RPC, then request a fresh quote.`,
    }
  }
  if (estimatedGas <= 0n) {
    return {
      ready: false,
      error: `The destination mint gas estimate for ${definition.name} was zero or invalid. Request a fresh quote before transferring.`,
    }
  }

  let gasBalance
  try {
    if (definition.type === 'evm') {
      if (!isAddress(wallet?.address || '')) throw new Error('wallet unavailable')
      gasBalance = BigInt(await evmJsonRpc(definition, 'eth_getBalance', [wallet.address, 'latest']))
    } else {
      const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
      gasBalance = BigInt(await connection.getBalance(new PublicKey(wallet.address), 'confirmed'))
    }
  } catch {
    return {
      ready: false,
      error: `Could not verify the claim wallet's ${definition.nativeCurrency.symbol} balance on ${definition.name}. Check the wallet and RPC, then request a fresh quote.`,
    }
  }

  const requiredGas = (estimatedGas * 150n + 99n) / 100n
  if (gasBalance < requiredGas) {
    return {
      ready: false,
      estimatedGas,
      requiredGas,
      gasBalance,
      error: `Insufficient ${definition.nativeCurrency.symbol} in the claim wallet on ${definition.name}. Keep at least about ${formatUnits(requiredGas, definition.nativeCurrency.decimals)} ${definition.nativeCurrency.symbol} available.`,
    }
  }

  return { ready: true, estimatedGas, requiredGas, gasBalance }
}

export async function checkDestinationReadiness(environment, chainId, address, useForwarder = true) {
  const definition = getDefinition(environment, chainId)
  if (definition.type !== 'solana') return { ready: true }

  const owner = new PublicKey(address.trim())
  const mint = new PublicKey(definition.usdcAddress)
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
  const account = await connection.getAccountInfo(ata, 'confirmed')
  if (!account && !useForwarder) {
    return { ready: true, ata: ata.toString(), needsAtaCreation: true }
  }
  if (!account || !account.owner.equals(SOLANA_TOKEN_PROGRAM_ID)) {
    return {
      ready: false,
      ata: ata.toString(),
      error: `The recipient does not have a USDC Associated Token Account (${ata.toString()}). Use Self-claim so the destination wallet can create it, or create/fund that ATA before using Orbit.`,
    }
  }
  return { ready: true, ata: ata.toString() }
}

function deriveSolanaUsdcAta(definition, ownerAddress) {
  const owner = new PublicKey(ownerAddress.trim())
  const mint = new PublicKey(definition.usdcAddress)
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  return ata.toString()
}

function normalizeDecodedAddress(value, definition) {
  const address = String(value || '').trim()
  if (definition.type === 'evm') {
    const match = address.match(/^0x(?:0{24})?([0-9a-fA-F]{40})$/)
    return match ? `0x${match[1]}` : address
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(address)) {
    return new PublicKey(Uint8Array.from(
      address.slice(2).match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)),
    )).toString()
  }
  return address
}

function isZeroDestinationCaller(value) {
  return /^0x0+$/i.test(String(value || '').trim())
}

function destinationCallerMatches(value, walletAddress, definition) {
  const caller = String(value || '').trim()
  if (isZeroDestinationCaller(caller)) return true
  if (definition.type === 'evm') {
    if (!isAddress(walletAddress || '')) return false
    const callerHex = caller.replace(/^0x/i, '').toLowerCase()
    return /^[0-9a-f]{40,64}$/.test(callerHex)
      && callerHex.slice(-40) === walletAddress.slice(2).toLowerCase()
  }
  if (caller === walletAddress) return true
  if (!/^0x[0-9a-fA-F]{64}$/.test(caller)) return false
  try {
    const walletHex = Array.from(new PublicKey(walletAddress).toBytes())
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    return caller.slice(2).toLowerCase() === walletHex
  } catch {
    return false
  }
}

function decodeCctpV2Message(value) {
  const hex = String(value || '').replace(/^0x/i, '')
  const minimumBytes = 376
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < minimumBytes * 2 || hex.length % 2 !== 0) {
    throw new Error('invalid CCTP v2 message bytes')
  }
  const bytes = (offset, length) => `0x${hex.slice(offset * 2, (offset + length) * 2)}`
  const uint = (offset, length) => BigInt(bytes(offset, length))
  if (uint(0, 4) !== 1n || uint(148, 4) !== 1n) {
    throw new Error('unsupported CCTP v2 message version')
  }
  return {
    sourceDomain: Number(uint(4, 4)),
    destinationDomain: Number(uint(8, 4)),
    eventNonce: bytes(12, 32),
    destinationCaller: bytes(108, 32),
    mintRecipient: bytes(184, 32),
    amount: uint(216, 32).toString(),
    expirationBlock: uint(344, 32).toString(),
  }
}

export function validateManualClaimBurnHash(environment, sourceId, value) {
  const definition = getDefinition(environment, sourceId)
  const hash = String(value || '').trim()
  if (!hash) return 'Enter the source burn transaction hash.'
  if (definition.type === 'evm') {
    return /^0x[0-9a-fA-F]{64}$/.test(hash)
      ? ''
      : 'Enter a 32-byte EVM transaction hash beginning with 0x.'
  }
  return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(hash)
    ? ''
    : 'Enter a valid Solana transaction signature.'
}

function manualClaimUrl(environment, sourceDomain, transactionHash) {
  const url = new URL(`${IRIS_API[environment]}/v2/messages/${sourceDomain}`)
  url.searchParams.set('transactionHash', transactionHash)
  return url.toString()
}

async function fetchManualClaimResponse(environment, sourceDomain, transactionHash) {
  const response = await fetch(manualClaimUrl(environment, sourceDomain, transactionHash), {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Circle did not find a CCTP v2 burn for this transaction on the selected source chain.'
        : `Circle attestation service returned HTTP ${response.status}. Try again.`,
    )
  }
  const payload = await response.json()
  const message = payload?.messages?.[0]
  if (!message) {
    throw new Error('Circle did not find a CCTP v2 message in this source transaction.')
  }
  if (payload.messages.length !== 1) {
    throw new Error(
      'This transaction contains multiple CCTP messages. Manual claim currently requires a single-message burn.',
    )
  }
  return message
}

async function fetchSolanaRpc(environment, method, params) {
  const response = await fetch(getSolanaRpcEndpoint(environment), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC error')
  return payload.result
}

async function getSolanaManualClaimStatus(environment, destination, eventNonce) {
  try {
    const messageTransmitter = new PublicKey(
      destination.cctp.contracts.v2.messageTransmitter,
    )
    const nonceHex = String(eventNonce).replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]{64}$/.test(nonceHex)) throw new Error('invalid event nonce')
    const nonce = Uint8Array.from(
      nonceHex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)),
    )
    const [usedNonce] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('used_nonce'), nonce],
      messageTransmitter,
    )
    const account = await fetchSolanaRpc(environment, 'getAccountInfo', [
      usedNonce.toString(),
      { encoding: 'base64', commitment: 'confirmed' },
    ])
    if (!account?.value) return { state: 'ready' }
    if (account.value.owner !== messageTransmitter.toString()) {
      throw new Error('invalid used nonce account owner')
    }

    let txHash = ''
    try {
      const signatures = await fetchSolanaRpc(environment, 'getSignaturesForAddress', [
        usedNonce.toString(),
        { limit: 1, commitment: 'confirmed' },
      ])
      txHash = signatures?.[0]?.err == null ? String(signatures[0].signature || '') : ''
    } catch {
      // The used-nonce account is authoritative; an explorer link is optional.
    }
    return {
      state: 'claimed',
      txHash,
      explorerUrl: txHash
        ? safeExplorerUrl(String(destination.explorerUrl || '').replace('{hash}', txHash))
        : null,
    }
  } catch (error) {
    console.warn('Could not verify Solana CCTP claim status.', error)
    return { state: 'unknown' }
  }
}

export async function fetchManualClaim(environment, sourceId, transactionHash) {
  const validationError = validateManualClaimBurnHash(environment, sourceId, transactionHash)
  if (validationError) throw new Error(validationError)
  const normalizedTransactionHash = String(transactionHash || '').trim()
  const source = getDefinition(environment, sourceId)
  const message = await fetchManualClaimResponse(
    environment,
    source.cctp.domain,
    normalizedTransactionHash,
  )
  if (Number(message.cctpVersion) !== 2) {
    throw new Error('This transaction is not a CCTP v2 burn on the selected source chain.')
  }
  if (String(message.status || '').toLowerCase() !== 'complete') {
    const reason = String(message.delayReason || '').trim()
    throw new Error(
      `Circle attestation is not ready yet${reason ? `: ${reason}` : '.'} Try again after source finality.`,
    )
  }
  if (
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(String(message.message || ''))
    || !/^0x(?:[0-9a-fA-F]{2})+$/.test(String(message.attestation || ''))
    || !/^0x[0-9a-fA-F]{64}$/.test(String(message.eventNonce || ''))
  ) {
    throw new Error('Circle returned an invalid message or attestation for this transaction.')
  }
  let decoded
  try {
    decoded = decodeCctpV2Message(message.message)
  } catch {
    throw new Error('Circle returned invalid CCTP v2 message bytes.')
  }
  const destinationId = findChainIdForDomain(environment, decoded.destinationDomain)
  if (
    decoded.sourceDomain !== Number(source.cctp.domain)
    || !destinationId
    || destinationId === sourceId
  ) {
    throw new Error('The attested message has an invalid source or destination chain.')
  }
  if (decoded.eventNonce.toLowerCase() !== String(message.eventNonce).toLowerCase()) {
    throw new Error('Circle returned a nonce that does not match the attested message.')
  }
  const destination = getDefinition(environment, destinationId)
  let mintRecipient
  try {
    mintRecipient = normalizeDecodedAddress(decoded.mintRecipient, destination)
    if (destination.type === 'evm') {
      if (!isAddress(mintRecipient)) throw new Error('invalid EVM recipient')
    } else {
      new PublicKey(mintRecipient)
    }
  } catch {
    throw new Error('Circle returned invalid transfer recipient details.')
  }
  const destinationCaller = decoded.destinationCaller
  let destinationStatus = null
  if (destination.type === 'solana') {
    destinationStatus = await getSolanaManualClaimStatus(
      environment,
      destination,
      message.eventNonce,
    )
  } else {
    const claimCaller = isZeroDestinationCaller(destinationCaller)
      ? mintRecipient
      : normalizeDecodedAddress(destinationCaller, destination)
    if (await isConsumedCctpMessage(
      destination,
      claimCaller,
      message.message,
      message.attestation,
    )) {
      destinationStatus = { state: 'claimed' }
    }
  }
  return {
    environment,
    sourceId,
    destinationId,
    transactionHash: normalizedTransactionHash,
    message: message.message,
    attestation: message.attestation,
    eventNonce: message.eventNonce,
    cctpVersion: 2,
    forwardState: message.forwardState
      ? String(message.forwardState).toUpperCase()
      : null,
    forwardTxHash: message.forwardTxHash || null,
    destinationStatus,
    destinationCaller,
    mintRecipient,
    amountMicro: decoded.amount,
    expirationBlock: decoded.expirationBlock,
  }
}

export function manualClaimBlockReason(claim, wallet, solanaRecipientOwner = '') {
  if (!claim) return 'Load a CCTP v2 burn before claiming.'
  const destination = getDefinition(claim.environment, claim.destinationId)
  if (claim.destinationStatus?.state === 'claimed') {
    return `This transfer was already claimed on ${destination.name}.`
  }
  if (claim.destinationStatus?.state === 'unknown') {
    return `Could not verify the claim status on ${destination.name}. Check the destination RPC and try again.`
  }
  if (claim.forwardState === 'COMPLETE') {
    return 'Circle Orbit already completed this transfer on the destination chain.'
  }
  if (claim.forwardState === 'PENDING' || claim.forwardState === 'CONFIRMED') {
    return 'Circle Orbit is already completing this transfer. Wait for the relayer instead of submitting a duplicate mint.'
  }
  if (!wallet?.address) return ''
  if (wallet.family !== (destination.type === 'evm' ? 'evm' : 'solana')) {
    return `Connect a ${destination.name} wallet to pay destination gas.`
  }
  if (!destinationCallerMatches(claim.destinationCaller, wallet.address, destination)) {
    return 'This burn restricts minting to another destination caller. Continue in the app that created the transfer.'
  }
  if (destination.type === 'solana') {
    try {
      const owner = solanaRecipientOwner.trim()
      if (!owner || deriveSolanaUsdcAta(destination, owner) !== claim.mintRecipient) {
        return 'Enter the Solana recipient wallet whose USDC token account is encoded in this burn.'
      }
    } catch {
      return 'Enter a valid Solana recipient wallet address.'
    }
  }
  return ''
}

async function currentDestinationBlock(environment, destinationId, wallet) {
  const destination = getDefinition(environment, destinationId)
  if (L1_EXPIRATION_DESTINATIONS.has(destinationId)) {
    return BigInt(await evmJsonRpc(
      getDefinition(environment, 'ethereum'),
      'eth_blockNumber',
      [],
    ))
  }
  if (destination.type === 'evm') {
    return BigInt(await wallet.provider.request({ method: 'eth_blockNumber' }))
  }
  const connection = new Connection(getSolanaRpcEndpoint(environment), 'confirmed')
  return BigInt(await connection.getSlot('confirmed'))
}

async function refreshExpiredManualClaim(claim) {
  const response = await fetch(
    `${IRIS_API[claim.environment]}/v2/reattest/${encodeURIComponent(claim.eventNonce)}`,
    { method: 'POST', headers: { accept: 'application/json' } },
  )
  if (!response.ok) {
    throw new Error(`Circle could not refresh the expired attestation (HTTP ${response.status}).`)
  }
  let lastError
  for (let attempt = 0; attempt < MANUAL_CLAIM_REATTEST_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, MANUAL_CLAIM_REATTEST_DELAY_MS))
    }
    try {
      const refreshed = await fetchManualClaim(
        claim.environment,
        claim.sourceId,
        claim.transactionHash,
      )
      if (refreshed.expirationBlock === '0') return refreshed
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    lastError?.message || 'Circle accepted re-attestation, but the refreshed attestation is not ready yet.',
  )
}

export async function executeManualClaim(claim, destinationWallet, solanaRecipientOwner = '') {
  const refreshedClaim = await fetchManualClaim(
    claim.environment,
    claim.sourceId,
    claim.transactionHash,
  )
  const destination = getDefinition(refreshedClaim.environment, refreshedClaim.destinationId)
  const blockReason = manualClaimBlockReason(
    refreshedClaim,
    destinationWallet,
    solanaRecipientOwner,
  )
  if (blockReason) throw new Error(blockReason)
  await assertSourceWalletReady(
    refreshedClaim.environment,
    refreshedClaim.destinationId,
    destinationWallet,
    'destination',
  )
  const currentBlock = await currentDestinationBlock(
    refreshedClaim.environment,
    refreshedClaim.destinationId,
    destinationWallet,
  )
  const activeClaim = BigInt(refreshedClaim.expirationBlock) > 0n
    && currentBlock >= BigInt(refreshedClaim.expirationBlock)
    ? await refreshExpiredManualClaim(refreshedClaim)
    : refreshedClaim
  const prepared = await destinationWallet.adapter.prepareAction(
    'cctp.v2.receiveMessage',
    {
      fromChain: getDefinition(refreshedClaim.environment, refreshedClaim.sourceId),
      toChain: destination,
      message: activeClaim.message,
      attestation: activeClaim.attestation,
      eventNonce: activeClaim.eventNonce,
      destinationAddress: destination.type === 'solana'
        ? solanaRecipientOwner.trim()
        : activeClaim.mintRecipient,
    },
    { chain: destination, address: destinationWallet.address },
  )
  const txHash = await prepared.execute()
  await destinationWallet.adapter.waitForTransaction(txHash, undefined, destination)
  const explorerUrl = safeExplorerUrl(
    String(destination.explorerUrl || '').replace('{hash}', txHash),
  )
  return { txHash, explorerUrl }
}

function addressesMatch(left, right, family) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return family === 'evm'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

export function validateTransferEstimate(estimate, input, sourceAddress) {
  if (!estimate || estimate.token !== 'USDC') {
    return 'Bridge Kit did not return a valid USDC quote.'
  }
  const source = getDefinition(input.environment, input.sourceId)
  const destination = getDefinition(input.environment, input.destinationId)
  try {
    if (parseUnits(String(estimate.amount), 6) !== parseUnits(String(input.amount), 6)) {
      return 'The quoted amount does not match the requested transfer amount.'
    }
  } catch {
    return 'Bridge Kit returned an invalid quoted amount.'
  }
  if (
    estimate.source?.chain !== source.chain
    || !addressesMatch(estimate.source?.address, sourceAddress, source.type)
  ) {
    return 'The quote does not match the selected source chain or wallet.'
  }
  const quotedRecipient = estimate.destination?.recipientAddress || estimate.destination?.address
  if (
    estimate.destination?.chain !== destination.chain
    || !addressesMatch(quotedRecipient, input.recipient.trim(), destination.type)
  ) {
    return 'The quote does not match the selected destination chain or recipient.'
  }
  if (
    !input.useForwarder
    && (
      !input.destinationWalletAddress
      || !addressesMatch(
        estimate.destination?.address,
        input.destinationWalletAddress,
        destination.type,
      )
    )
  ) {
    return 'The quote does not match the connected destination claim wallet.'
  }

  const fees = estimate.fees || []
  if (fees.some((fee) => fee?.error || fee?.amount == null)) {
    return 'Bridge Kit could not verify all quoted USDC fees. Request a fresh quote.'
  }
  const forwarderFee = fees.find((fee) => fee?.type === 'forwarder')
  if (!input.useForwarder) {
    if (!forwarderFee) return ''
    try {
      return parseUnits(String(forwarderFee.amount), 6) === 0n
        ? ''
        : 'A Forwarding Service fee appeared in a Self-claim quote. The transfer was blocked before signing.'
    } catch {
      return 'Bridge Kit returned an invalid Forwarding Service fee.'
    }
  }
  try {
    if (!forwarderFee || parseUnits(String(forwarderFee.amount), 6) <= 0n) {
      return 'The Forwarding Service fee is missing from the quote. The transfer was blocked before signing.'
    }
  } catch {
    return 'Bridge Kit returned an invalid Forwarding Service fee.'
  }
  return ''
}

function paramsFor({
  environment,
  sourceId,
  destinationId,
  adapter,
  destinationAdapter,
  destinationWalletAddress,
  recipient,
  amount,
  speed,
  maxFee,
  useForwarder = true,
}) {
  if (!useForwarder && !destinationAdapter) {
    throw new Error('Connect a destination claim wallet before requesting a Self-claim quote.')
  }
  return {
    from: { adapter, chain: getDefinition(environment, sourceId).chain },
    to: useForwarder
      ? {
          chain: getDefinition(environment, destinationId).chain,
          recipientAddress: recipient.trim(),
          useForwarder: true,
        }
      : {
          adapter: destinationAdapter,
          chain: getDefinition(environment, destinationId).chain,
          recipientAddress: recipient.trim(),
        },
    amount: String(amount).trim(),
    token: 'USDC',
    config: {
      transferSpeed: speed === 'fast' ? 'FAST' : 'SLOW',
      batchTransactions: false,
      ...(maxFee ? { maxFee: String(maxFee).trim() } : {}),
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

export function normalizeRetryResult(result, environment) {
  if (!isRetryableBridgeResult(result)) {
    throw new Error('The saved transfer is incomplete or does not satisfy the current retry safety rules.')
  }
  const sourceId = findChainIdForDefinition(environment, result.source.chain)
  const destinationId = findChainIdForDefinition(environment, result.destination.chain)
  if (!sourceId || !destinationId || sourceId === destinationId) {
    throw new Error('The saved transfer route is invalid for the selected environment.')
  }
  const sourceChain = getDefinition(environment, sourceId)
  const destinationChain = getDefinition(environment, destinationId)
  const sourceAddressError = validateRecipient(environment, sourceId, result.source.address)
  const recipient = result.destination.recipientAddress
  const recipientError = validateRecipient(environment, destinationId, recipient)
  if (sourceAddressError || recipientError) {
    throw new Error('The saved source or destination address failed validation.')
  }

  const sanitized = serializeBridgeResult(result)
  const useForwarder = result.destination.useForwarder === true
  return {
    ...sanitized,
    config: {
      transferSpeed: result.config.transferSpeed,
      batchTransactions: false,
      ...(result.config.maxFee != null ? { maxFee: String(result.config.maxFee) } : {}),
    },
    source: {
      address: result.source.address,
      chain: sourceChain,
    },
    destination: {
      address: useForwarder ? recipient : result.destination.address,
      recipientAddress: recipient,
      ...(useForwarder ? { useForwarder: true } : {}),
      chain: destinationChain,
    },
  }
}

export async function retryTransfer(result, wallet, destinationWallet, environment, onEvent) {
  const normalizedResult = normalizeRetryResult(result, environment)
  const sourceId = findChainIdForDefinition(environment, normalizedResult.source.chain)
  const expectedSource = sourceId ? getDefinition(environment, sourceId) : null
  if (!expectedSource || !isWalletCompatibleWithResult(normalizedResult, wallet, expectedSource)) {
    throw new Error('请连接原转账使用的来源链钱包和账户后再重试。当前钱包与保存的来源地址或网络不匹配。')
  }
  const destinationId = findChainIdForDefinition(environment, normalizedResult.destination.chain)
  const expectedDestination = destinationId ? getDefinition(environment, destinationId) : null
  const useForwarder = normalizedResult.destination.useForwarder === true
  if (
    !useForwarder
    && (
      !expectedDestination
      || !isDestinationWalletCompatibleWithResult(
        normalizedResult,
        destinationWallet,
        expectedDestination,
      )
    )
  ) {
    throw new Error('请连接原转账使用的目的链 Claim 钱包和账户后再重试。')
  }
  const handler = (payload) => onEvent?.(payload)
  kit.on('*', handler)
  try {
    return await kit.retry(normalizedResult, {
      from: wallet.adapter,
      to: useForwarder ? undefined : destinationWallet.adapter,
    })
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

const TRANSFER_HISTORY_LIMIT = 20

function transferHistoryStorageKey(environment) {
  return `relay:transfer-history:${environment}`
}

function historyFingerprint(result, environment) {
  const sourceId = findChainIdForDefinition(environment, result?.source?.chain)
  const destinationId = findChainIdForDefinition(environment, result?.destination?.chain)
  return [
    sourceId,
    destinationId,
    String(result?.source?.address || '').toLowerCase(),
    String(result?.destination?.recipientAddress || result?.destination?.address || '').toLowerCase(),
    String(result?.amount || ''),
  ].join(':')
}

function historyExplorerLinks(result) {
  const seen = new Set()
  return (result?.steps || []).flatMap((step, index) => {
    const url = safeExplorerUrl(step?.explorerUrl)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{
      label: String(step?.name || `Transaction ${index + 1}`).slice(0, 80),
      url,
    }]
  })
}

function historyRecordFromResult(result, environment, existing = null, updatedAt = new Date().toISOString()) {
  if (!result || typeof result !== 'object') return null
  const sourceId = findChainIdForDefinition(environment, result.source?.chain)
  const destinationId = findChainIdForDefinition(environment, result.destination?.chain)
  if (!sourceId || !destinationId) return null
  const txHashes = (result.steps || [])
    .map((step) => String(step?.txHash || '').trim())
    .filter(Boolean)
    .slice(0, 8)
  const explorerLinks = historyExplorerLinks(result)
  const retryable = isRetryableBridgeResult(result)
  const hasChainEvidence = txHashes.length > 0 || explorerLinks.length > 0
  if (result.state !== 'success' && !retryable && !hasChainEvidence) return null
  return {
    id: existing?.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    environment,
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
    fingerprint: historyFingerprint(result, environment),
    state: ['success', 'pending', 'error'].includes(result.state) ? result.state : 'pending',
    amount: String(result.amount || '').slice(0, 80),
    sourceId,
    destinationId,
    retryable,
    explorerLinks,
    txHashes,
  }
}

function readTransferHistory(environment) {
  try {
    const parsed = JSON.parse(localStorage.getItem(transferHistoryStorageKey(environment)) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => (
      item
      && typeof item === 'object'
      && item.environment === environment
      && typeof item.id === 'string'
      && typeof item.createdAt === 'string'
      && typeof item.updatedAt === 'string'
      && typeof item.amount === 'string'
      && typeof item.sourceId === 'string'
      && typeof item.destinationId === 'string'
      && ['success', 'pending', 'error'].includes(item.state)
      && (
        item.state === 'success'
        || item.retryable === true
        || (Array.isArray(item.txHashes) && item.txHashes.length > 0)
        || (
          Array.isArray(item.explorerLinks)
          && item.explorerLinks.some((link) => safeExplorerUrl(link?.url))
        )
      )
    )).slice(0, TRANSFER_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function persistTransferHistory(result, environment, updatedAt) {
  try {
    const history = readTransferHistory(environment)
    const incomingHashes = new Set(
      (result?.steps || []).map((step) => String(step?.txHash || '').trim()).filter(Boolean),
    )
    const fingerprint = historyFingerprint(result, environment)
    const existingIndex = history.findIndex((item) => {
      const sharesTransaction = (item.txHashes || []).some((hash) => incomingHashes.has(hash))
      if (sharesTransaction) return true
      return item.state === 'pending' && item.fingerprint === fingerprint
    })
    const existing = existingIndex >= 0 ? history[existingIndex] : null
    const record = historyRecordFromResult(result, environment, existing, updatedAt)
    if (!record) return
    const next = existingIndex >= 0
      ? [record, ...history.filter((_, index) => index !== existingIndex)]
      : [record, ...history]
    localStorage.setItem(
      transferHistoryStorageKey(environment),
      JSON.stringify(next.slice(0, TRANSFER_HISTORY_LIMIT)),
    )
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('relay:transfer-history-updated', {
        detail: { environment },
      }))
    }
  } catch {
    // Recovery storage remains the source of truth when history storage is unavailable.
  }
}

export function loadTransferHistory(environment) {
  const history = readTransferHistory(environment)
  if (history.length) return history

  const saved = loadPersistedTransfer(environment)
  const fallback = historyRecordFromResult(
    saved?.result,
    environment,
    null,
    saved?.updatedAt || new Date().toISOString(),
  )
  return fallback ? [fallback] : []
}

export async function repairTransferHistoryRecord(record, environment) {
  if (
    !record
    || record.environment !== environment
    || record.state !== 'error'
    || !Array.isArray(record.txHashes)
  ) {
    return false
  }

  let definition
  try {
    definition = getDefinition(environment, record.destinationId)
  } catch {
    return false
  }
  let completed = false
  for (const txHash of [...record.txHashes].reverse()) {
    if (await isConsumedCctpClaim(definition, txHash)) {
      completed = true
      break
    }
  }
  if (!completed) return false

  try {
    const history = readTransferHistory(environment)
    const recordIndex = history.findIndex((item) => item.id === record.id)
    if (recordIndex < 0 || history[recordIndex].state !== 'error') return false
    history[recordIndex] = {
      ...history[recordIndex],
      state: 'success',
      retryable: false,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(
      transferHistoryStorageKey(environment),
      JSON.stringify(history.slice(0, TRANSFER_HISTORY_LIMIT)),
    )
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('relay:transfer-history-updated', {
        detail: { environment },
      }))
    }
    return true
  } catch {
    return false
  }
}

export function isTransferStorageAvailable(environment) {
  try {
    const key = `${transferStorageKey(environment)}:probe`
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function createTransferDraft(input, sourceAddress) {
  return createBridgeResultDraft({
    amount: input.amount,
    sourceAddress,
    sourceChain: getDefinition(input.environment, input.sourceId),
    destinationAddress: input.recipient.trim(),
    destinationSignerAddress: input.destinationWalletAddress,
    destinationChain: getDefinition(input.environment, input.destinationId),
    speed: input.speed,
    maxFee: input.maxFee,
    useForwarder: input.useForwarder,
  })
}

export function persistTransfer(result, environment) {
  if (!result) return false
  const updatedAt = new Date().toISOString()
  const payload = {
    version: TRANSFER_STORAGE_VERSION,
    environment,
    updatedAt,
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
    persistTransferHistory(result, environment, updatedAt)
    return true
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
      persistTransferHistory(result, environment, updatedAt)
      return true
    } catch {
      try {
        localStorage.setItem(transferStorageKey(environment), JSON.stringify({
          version: 1,
          environment,
          updatedAt: payload.updatedAt,
          ...payload.summary,
        }))
        persistTransferHistory(result, environment, updatedAt)
        // Explorer links were preserved, but this summary is not sufficient for
        // kit.retry. Report failure so the UI warns that automatic recovery is off.
        return false
      } catch {
        return false
      }
    }
  }
}

/**
 * Load the last transfer for an environment.
 * @returns {{ result: object|null, retryable: boolean, summary: object|null, updatedAt?: string, environment?: string, legacy?: boolean } | null}
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
      let result = parsed.result
      let retryable = false
      if (isRetryableBridgeResult(parsed.result)) {
        try {
          result = normalizeRetryResult(parsed.result, environment)
          retryable = true
        } catch {
          retryable = false
        }
      }
      return {
        result,
        retryable,
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
