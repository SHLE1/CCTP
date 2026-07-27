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
import { formatUnits, isAddress, parseUnits } from 'viem'
import {
  TRANSFER_STORAGE_VERSION,
  createBridgeResultDraft,
  formatUsdcFromMicro,
  isRetryableBridgeResult,
  isWalletCompatibleWithResult,
  serializeBridgeResult,
} from './cctp-utils.js'

export {
  QUOTE_TTL_MS,
  TRANSFER_STORAGE_VERSION,
  USDC_DECIMALS,
  addUsdcAmounts,
  createBridgeResultDraft,
  formatUsdcFromMicro,
  isAmountGreaterThanFee,
  isRetryableBridgeResult,
  isQuoteFresh,
  isWalletCompatibleWithResult,
  mergeBridgeEventIntoResult,
  parseUsdcToMicro,
  quoteInputKey,
  quoteFeeBreakdown,
  quoteFees,
  safeExplorerUrl,
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
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

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
  const publish = (info, provider) => {
    if (!provider || typeof provider.request !== 'function' || seenProviders.has(provider)) return
    seenProviders.add(provider)
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
    publish(event?.detail?.info, event?.detail?.provider)
  }
  window.addEventListener('eip6963:announceProvider', handleAnnouncement)
  window.dispatchEvent(new window.Event('eip6963:requestProvider'))
  const fallbackTimer = window.setTimeout(() => {
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

export async function assertSourceWalletReady(environment, chainId, wallet) {
  const definition = getDefinition(environment, chainId)
  const expectedFamily = definition.type === 'evm' ? 'evm' : 'solana'
  if (!wallet?.address || wallet.family !== expectedFamily) {
    throw new Error('The connected wallet does not match the selected source chain.')
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
      throw new Error('The active EVM wallet account changed. Reconnect the source wallet and request a fresh quote.')
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
    throw new Error('The active Solana wallet changed or disconnected. Reconnect it before transferring.')
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

export async function checkDestinationReadiness(environment, chainId, address) {
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
  if (!account || !account.owner.equals(SOLANA_TOKEN_PROGRAM_ID)) {
    return {
      ready: false,
      ata: ata.toString(),
      error: `The recipient does not have a USDC Associated Token Account (${ata.toString()}). Create/fund that ATA before bridging to Solana.`,
    }
  }
  return { ready: true, ata: ata.toString() }
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

  const fees = estimate.fees || []
  if (fees.some((fee) => fee?.error || fee?.amount == null)) {
    return 'Bridge Kit could not verify all CCTP and Forwarding Service fees. Request a fresh quote.'
  }
  const forwarderFee = fees.find((fee) => fee?.type === 'forwarder')
  try {
    if (!forwarderFee || parseUnits(String(forwarderFee.amount), 6) <= 0n) {
      return 'The Forwarding Service fee is missing from the quote. The transfer was blocked before signing.'
    }
  } catch {
    return 'Bridge Kit returned an invalid Forwarding Service fee.'
  }
  return ''
}

function paramsFor({ environment, sourceId, destinationId, adapter, recipient, amount, speed, maxFee }) {
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
  return {
    ...sanitized,
    config: {
      transferSpeed: result.config.transferSpeed,
      batchTransactions: false,
      maxFee: String(result.config.maxFee),
    },
    source: {
      address: result.source.address,
      chain: sourceChain,
    },
    destination: {
      address: recipient,
      recipientAddress: recipient,
      useForwarder: true,
      chain: destinationChain,
    },
  }
}

export async function retryTransfer(result, wallet, environment, onEvent) {
  const normalizedResult = normalizeRetryResult(result, environment)
  const sourceId = findChainIdForDefinition(environment, normalizedResult.source.chain)
  const expectedSource = sourceId ? getDefinition(environment, sourceId) : null
  if (!expectedSource || !isWalletCompatibleWithResult(normalizedResult, wallet, expectedSource)) {
    throw new Error('请连接原转账使用的来源链钱包和账户后再重试。当前钱包与保存的来源地址或网络不匹配。')
  }
  const handler = (payload) => onEvent?.(payload)
  kit.on('*', handler)
  try {
    // Forwarder-only destinations: official RetryContext leaves `to` undefined so
    // mint confirmation uses IRIS forwardState instead of a destination adapter.
    return await kit.retry(normalizedResult, { from: wallet.adapter, to: undefined })
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
    destinationChain: getDefinition(input.environment, input.destinationId),
    speed: input.speed,
    maxFee: input.maxFee,
  })
}

export function persistTransfer(result, environment) {
  if (!result) return false
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
      return true
    } catch {
      try {
        localStorage.setItem(transferStorageKey(environment), JSON.stringify({
          version: 1,
          environment,
          updatedAt: payload.updatedAt,
          ...payload.summary,
        }))
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
