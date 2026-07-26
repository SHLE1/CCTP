/** Pure CCTP UI helpers — no Bridge Kit / browser wallet imports (unit-testable). */

export const USDC_DECIMALS = 6
export const TRANSFER_STORAGE_VERSION = 2

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

/**
 * True when the object is a full Bridge Kit result that can be passed to kit.retry.
 * Summary-only (v1) snapshots are inspectable but not retryable.
 */
export function isRetryableBridgeResult(result) {
  return Boolean(
    result
    && typeof result === 'object'
    && typeof result.provider === 'string'
    && result.source
    && result.destination
    && (result.source.chain?.chain || typeof result.source.chain === 'string' || result.source.chain?.name)
    && (result.destination.chain?.chain || typeof result.destination.chain === 'string' || result.destination.chain?.name)
    && Array.isArray(result.steps)
    && result.state
    && result.state !== 'success',
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
