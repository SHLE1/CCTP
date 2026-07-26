import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatUsdcFromMicro,
  isRetryableBridgeResult,
  parseUsdcToMicro,
  quoteFeeBreakdown,
  sanitizeAmountInput,
  serializeBridgeResult,
  subtractUsdcAmounts,
  validateAmount,
} from './cctp-utils.js'

describe('USDC amount helpers', () => {
  it('parses and formats micro-USDC without float drift', () => {
    assert.equal(parseUsdcToMicro('1.5'), 1_500_000n)
    assert.equal(formatUsdcFromMicro(1_500_000n), '1.5')
    assert.equal(formatUsdcFromMicro(1n), '0.000001')
    assert.equal(subtractUsdcAmounts('10', '0.100001'), '9.899999')
  })

  it('rejects more than 6 decimals', () => {
    assert.equal(validateAmount('1.1234567'), '金额格式不正确（最多 6 位小数）')
    assert.equal(validateAmount('0'), '金额必须大于 0')
    assert.equal(validateAmount('1.25'), '')
  })

  it('sanitizes input to at most 6 fractional digits', () => {
    assert.equal(sanitizeAmountInput('12.3456789'), '12.345678')
    assert.equal(sanitizeAmountInput('abc1.2.3'), '1.23')
    assert.equal(sanitizeAmountInput('00.5'), '0.5')
  })
})

describe('fee breakdown', () => {
  it('sums protocol and forwarder fees as strings', () => {
    const breakdown = quoteFeeBreakdown({
      fees: [
        { type: 'provider', amount: '0.01' },
        { type: 'forwarder', amount: '0.002' },
        { type: 'kit', amount: null },
      ],
    })
    assert.equal(breakdown.protocol, '0.01')
    assert.equal(breakdown.forwarder, '0.002')
    assert.equal(breakdown.total, '0.012')
  })
})

describe('retryable BridgeResult detection', () => {
  it('accepts a full error result and rejects summary-only snapshots', () => {
    const full = {
      provider: 'CCTPV2BridgingProvider',
      state: 'error',
      amount: '1',
      source: { address: '0xabc', chain: { chain: 'Base', name: 'Base' } },
      destination: {
        address: 'So111',
        chain: { chain: 'Solana', name: 'Solana' },
        recipientAddress: 'So111',
        useForwarder: true,
      },
      steps: [{ name: 'burn', state: 'success', txHash: '0x1', data: { message: 'x' } }],
    }
    assert.equal(isRetryableBridgeResult(full), true)
    assert.equal(isRetryableBridgeResult({ ...full, state: 'success' }), false)
    assert.equal(isRetryableBridgeResult({
      state: 'error',
      amount: '1',
      source: 'Base',
      destination: 'Solana',
      steps: [{ name: 'burn', state: 'success' }],
    }), false)

    const serialized = serializeBridgeResult(full)
    assert.equal(serialized.provider, full.provider)
    assert.equal(serialized.steps[0].data.message, 'x')
    assert.equal(isRetryableBridgeResult(serialized), true)
  })
})
