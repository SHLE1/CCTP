/** Pure CCTP UI helpers — no Bridge Kit / browser wallet imports (unit-testable). */

export const USDC_DECIMALS = 6
export const TRANSFER_STORAGE_VERSION = 2
export const QUOTE_TTL_MS = 60_000

export function parseUsdcToMicro(value) {
  const text = String(value ?? '').trim()
  if (!text || !/^\d+(\.\d+)?$/.test(text)) throw new Error('Invalid USDC amount')
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > USDC_DECIMALS) throw new Error('USDC supports at most 6 decimal places')
  const micro = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction.padEnd(USDC_DECIMALS, '0'))
  return micro
}

export function formatUsdcFromMicro(micro) {
  const negative = micro < 0n
  const abs = negative ? -micro : micro
  const whole = abs / 10n ** BigInt(USDC_DECIMALS)
  const fraction = (abs % 10n ** BigInt(USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  const body = fraction ? `${whole}.${fraction}` : whole.toString()
  return negative ? `-${body}` : body
}

export function addUsdcAmounts(...values) {
  return formatUsdcFromMicro(values.reduce((sum, value) => {
    if (value == null || value === '') return sum
    try {
      return sum + parseUsdcToMicro(value)
    } catch {
      return sum
    }
  }, 0n))
}

export function subtractUsdcAmounts(amount, fee) {
  try {
    const result = parseUsdcToMicro(amount) - parseUsdcToMicro(fee || '0')
    return formatUsdcFromMicro(result < 0n ? 0n : result)
  } catch {
    return '0'
  }
}

/** Keep only digits + one dot, max 6 fractional digits. */
export function sanitizeAmountInput(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) {
    if (cleaned === '') return ''
    return cleaned.replace(/^0+(\d)/, '$1')
  }
  const wholeRaw = cleaned.slice(0, firstDot)
  const whole = wholeRaw === '' ? '0' : wholeRaw.replace(/^0+(\d)/, '$1')
  const fraction = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, USDC_DECIMALS)
  return `${whole}.${fraction}`
}

export function validateAmount(amount) {
  const text = String(amount ?? '').trim()
  if (!text) return '请输入转账金额'
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return '金额格式不正确（最多 6 位小数）'
  try {
    if (parseUsdcToMicro(text) <= 0n) return '金额必须大于 0'
  } catch {
    return '金额格式不正确（最多 6 位小数）'
  }
  return ''
}

export function isAmountGreaterThanFee(amount, fee) {
  try {
    return parseUsdcToMicro(amount) > parseUsdcToMicro(fee || '0')
  } catch {
    return false
  }
}

export function isQuoteFresh(quotedAt, now = Date.now(), ttl = QUOTE_TTL_MS) {
  return Number.isFinite(quotedAt)
    && quotedAt > 0
    && Number.isFinite(now)
    && now >= quotedAt
    && now - quotedAt < ttl
}

/**
 * Start a quote refresh without blanking the previous quote payload.
 * Keeps fee/receive display stable while Start remains gated on status === 'ready'.
 */
export function beginQuoteRefresh(current, requestKey) {
  const prev = current && typeof current === 'object' ? current : {}
  return {
    status: 'loading',
    data: prev.data ?? null,
    error: '',
    key: requestKey,
    quotedAt: 0,
  }
}

/** Refresh failed: keep prior quote data for display, surface error, block Start. */
export function failQuoteRefresh(current, requestKey, errorMessage) {
  const prev = current && typeof current === 'object' ? current : {}
  return {
    status: 'error',
    data: prev.data ?? null,
    error: String(errorMessage || 'Quote refresh failed'),
    key: requestKey,
    quotedAt: 0,
  }
}

/** Confirm sheet may start only when a fresh matching quote is ready. */
export function canStartTransferFromQuote(quoteStatus, quoteIsCurrent) {
  return quoteStatus === 'ready' && quoteIsCurrent === true
}

/** Single amount-field message for aria-describedby (priority order). */
export function resolveAmountFieldError({
  amount = '',
  amountError = '',
  balanceStatus = 'idle',
  balanceError = '',
  balanceTooLow = false,
  feeTooHigh = false,
} = {}) {
  if (amount && amountError) return amountError
  if (balanceStatus === 'error') return balanceError || 'USDC balance is unavailable'
  if (balanceTooLow) return 'Amount exceeds USDC balance'
  if (feeTooHigh) return 'Amount must be greater than all quoted USDC fees'
  return ''
}

export function safeExplorerUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

export function quoteInputKey({
  environment,
  sourceId,
  destinationId,
  recipient,
  amount,
  speed,
  walletAddress,
  settlementMode,
  destinationWalletAddress,
}) {
  return JSON.stringify([
    String(environment || ''),
    String(sourceId || ''),
    String(destinationId || ''),
    String(recipient || '').trim(),
    String(amount || '').trim(),
    String(speed || ''),
    String(walletAddress || '').toLowerCase(),
    String(settlementMode || ''),
    String(destinationWalletAddress || '').toLowerCase(),
  ])
}

function chainIdentity(chain) {
  if (!chain || typeof chain !== 'object') return ''
  if (chain.chainId != null) return `evm:${String(chain.chainId)}`
  return `chain:${String(chain.chain || chain.name || '')}`
}

export function isWalletCompatibleWithResult(result, wallet, expectedSourceChain) {
  if (!result?.source?.address || !wallet?.address || !expectedSourceChain) return false
  if (chainIdentity(result.source.chain) !== chainIdentity(expectedSourceChain)) return false

  const expectedFamily = expectedSourceChain.type === 'evm' ? 'evm' : 'solana'
  if (wallet.family !== expectedFamily) return false

  return expectedFamily === 'evm'
    ? result.source.address.toLowerCase() === wallet.address.toLowerCase()
    : result.source.address === wallet.address
}

export function isDestinationWalletCompatibleWithResult(result, wallet, expectedDestinationChain) {
  if (!result?.destination?.address || !wallet?.address || !expectedDestinationChain) return false
  if (chainIdentity(result.destination.chain) !== chainIdentity(expectedDestinationChain)) return false

  const expectedFamily = expectedDestinationChain.type === 'evm' ? 'evm' : 'solana'
  if (wallet.family !== expectedFamily) return false

  return expectedFamily === 'evm'
    ? result.destination.address.toLowerCase() === wallet.address.toLowerCase()
    : result.destination.address === wallet.address
}

export function createBridgeResultDraft({
  amount,
  sourceAddress,
  sourceChain,
  destinationAddress,
  destinationSignerAddress,
  destinationChain,
  speed,
  maxFee,
  useForwarder = true,
}) {
  return {
    amount: String(amount).trim(),
    token: 'USDC',
    state: 'pending',
    config: {
      transferSpeed: speed === 'fast' ? 'FAST' : 'SLOW',
      batchTransactions: false,
      ...(maxFee ? { maxFee: String(maxFee).trim() } : {}),
    },
    provider: 'CCTPV2BridgingProvider',
    source: {
      address: sourceAddress,
      chain: sourceChain,
    },
    destination: {
      address: destinationSignerAddress || destinationAddress,
      recipientAddress: destinationAddress,
      ...(useForwarder ? { useForwarder: true } : {}),
      chain: destinationChain,
    },
    steps: [],
  }
}

export function mergeBridgeEventIntoResult(result, payload) {
  const candidate = payload?.values || payload?.step
  if (!result || !candidate || typeof candidate !== 'object') return result

  const name = candidate.name || payload?.method || payload?.name
  if (!name) return result

  const step = { ...candidate, name }
  const steps = [...(result.steps || [])]
  const lastIndex = steps.length - 1
  if (
    lastIndex >= 0
    && steps[lastIndex]?.name === name
    && steps[lastIndex]?.state === 'pending'
  ) {
    steps[lastIndex] = step
  } else {
    steps.push(step)
  }

  return {
    ...result,
    state: step.state === 'error' ? 'error' : 'pending',
    steps,
  }
}

/**
 * True when the object is a full Bridge Kit result that can be passed to kit.retry.
 * Summary-only (v1) snapshots are inspectable but not retryable.
 */
export function isRetryableBridgeResult(result) {
  if (
    !result
    || typeof result !== 'object'
    || result.provider !== 'CCTPV2BridgingProvider'
    || result.token !== 'USDC'
    || (result.state !== 'pending' && result.state !== 'error')
    || typeof result.source?.address !== 'string'
    || typeof result.destination?.recipientAddress !== 'string'
    || !result.source?.chain?.chain
    || !result.source?.chain?.cctp
    || !result.destination?.chain?.chain
    || !result.destination?.chain?.cctp
    || !Array.isArray(result.steps)
    || !result.config
    || (result.config.transferSpeed !== 'FAST' && result.config.transferSpeed !== 'SLOW')
    || result.config.batchTransactions !== false
    || result.config.customFee != null
  ) {
    return false
  }
  let amountMicro
  try {
    amountMicro = parseUsdcToMicro(result.amount)
    if (amountMicro <= 0n) return false
    if (result.config.maxFee != null) {
      const maxFeeMicro = parseUsdcToMicro(result.config.maxFee)
      if (maxFeeMicro < 0n || maxFeeMicro >= amountMicro) return false
      if (result.destination.useForwarder === true && maxFeeMicro === 0n) return false
    } else if (result.destination.useForwarder === true) {
      return false
    }
  } catch {
    return false
  }

  // Automatic retry is only safe once there is evidence that the burn was
  // submitted. A pre-signing draft or approve-only failure can start over with
  // a fresh quote; treating it as retryable would reuse a stale maxFee and an
  // object Bridge Kit never returned.
  const burnStep = result.steps.find((step) => /burn/i.test(String(step?.name || '')))
  const definitivelyFailedCategories = new Set([
    'failed_offchain',
    'reverted_onchain',
    'partial_reverted',
    'chain_revert',
  ])
  return Boolean(
    burnStep
    && (
      burnStep.state === 'success'
      || (
        !definitivelyFailedCategories.has(burnStep.errorCategory)
        && (
          typeof burnStep.txHash === 'string'
          || typeof burnStep.explorerUrl === 'string'
        )
      )
    ),
  )
}

export function quoteFeeBreakdown(estimate) {
  const empty = {
    protocol: '0',
    forwarder: '0',
    kit: '0',
    total: '0',
    gasFees: [],
  }
  if (!estimate) return empty

  let protocol = 0n
  let forwarder = 0n
  let kitFee = 0n

  for (const fee of estimate.fees || []) {
    if (fee?.amount == null || fee.amount === '') continue
    let micro
    try {
      micro = parseUsdcToMicro(fee.amount)
    } catch {
      continue
    }
    if (fee.type === 'forwarder') forwarder += micro
    else if (fee.type === 'kit') kitFee += micro
    else protocol += micro
  }

  return {
    protocol: formatUsdcFromMicro(protocol),
    forwarder: formatUsdcFromMicro(forwarder),
    kit: formatUsdcFromMicro(kitFee),
    total: formatUsdcFromMicro(protocol + forwarder + kitFee),
    gasFees: (estimate.gasFees || []).map((item) => ({
      name: item.name,
      token: item.token,
      blockchain: item.blockchain,
      fees: item.fees,
      error: item.error,
    })),
  }
}

export function quoteFees(estimate) {
  return Number(quoteFeeBreakdown(estimate).total) || 0
}

export function serializeBridgeResult(result) {
  return {
    amount: result.amount,
    token: result.token,
    state: result.state,
    config: result.config,
    provider: result.provider,
    source: result.source,
    destination: result.destination,
    steps: (result.steps || []).map((step) => ({
      name: step.name,
      state: step.state,
      txHash: step.txHash,
      explorerUrl: step.explorerUrl,
      data: step.data,
      forwarded: step.forwarded,
      batched: step.batched,
      batchId: step.batchId,
      errorMessage: step.errorMessage,
      errorCategory: step.errorCategory,
    })),
  }
}
