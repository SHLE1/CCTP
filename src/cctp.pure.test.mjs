import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createBridgeResultDraft,
  formatUsdcFromMicro,
  isAmountGreaterThanFee,
  isDestinationWalletCompatibleWithResult,
  isQuoteFresh,
  isRetryableBridgeResult,
  isWalletCompatibleWithResult,
  mergeBridgeEventIntoResult,
  parseUsdcToMicro,
  quoteInputKey,
  quoteFeeBreakdown,
  safeExplorerUrl,
  sanitizeAmountInput,
  serializeBridgeResult,
  subtractUsdcAmounts,
  validateAmount,
} from './cctp-utils.js'
import {
  assertSourceWalletReady,
  checkSourceGasReadiness,
  createTransferDraft,
  findChainIdForDefinition,
  getDefinition,
  isTransferStorageAvailable,
  loadTransferHistory,
  normalizeRetryResult,
  persistTransfer,
  validateRecipient,
  validateTransferEstimate,
} from './cctp.js'

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
    const base = { chain: 'Base', name: 'Base', chainId: 8453, type: 'evm', cctp: {} }
    const solana = { chain: 'Solana', name: 'Solana', type: 'solana', cctp: {} }
    const full = {
      provider: 'CCTPV2BridgingProvider',
      token: 'USDC',
      state: 'error',
      amount: '1',
      config: {
        transferSpeed: 'FAST',
        batchTransactions: false,
        maxFee: '0.21',
      },
      source: { address: '0xabc', chain: base },
      destination: {
        address: 'So111',
        chain: solana,
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
    assert.equal(isRetryableBridgeResult({
      ...full,
      steps: [{ name: 'approve', state: 'error' }],
    }), false)
    assert.equal(isRetryableBridgeResult({
      ...full,
      steps: [{
        name: 'burn',
        state: 'error',
        txHash: '0xreverted',
        errorCategory: 'chain_revert',
      }],
    }), false)
    assert.equal(isRetryableBridgeResult({
      ...full,
      steps: [{
        name: 'burn',
        state: 'error',
        txHash: '0xpending',
        errorCategory: 'polling_timeout',
      }],
    }), true)

    const serialized = serializeBridgeResult(full)
    assert.equal(serialized.provider, full.provider)
    assert.equal(serialized.steps[0].data.message, 'x')
    assert.equal(isRetryableBridgeResult(serialized), true)
  })
})

describe('mainnet transfer safety invariants', () => {
  const base = { chain: 'Base', name: 'Base', chainId: 8453, type: 'evm', cctp: {} }
  const ethereum = { chain: 'Ethereum', name: 'Ethereum', chainId: 1, type: 'evm', cctp: {} }
  const solana = { chain: 'Solana', name: 'Solana', type: 'solana', cctp: {} }

  it('binds a quote to every user-controlled transfer field', () => {
    const input = {
      environment: 'mainnet',
      sourceId: 'base',
      destinationId: 'solana',
      recipient: 'So111',
      amount: '1',
      speed: 'fast',
      walletAddress: '0xAbC',
      settlementMode: 'manual',
      destinationWalletAddress: 'SoClaim',
    }
    const key = quoteInputKey(input)
    assert.notEqual(key, quoteInputKey({ ...input, amount: '2' }))
    assert.notEqual(key, quoteInputKey({ ...input, recipient: 'So222' }))
    assert.notEqual(key, quoteInputKey({ ...input, speed: 'standard' }))
    assert.notEqual(key, quoteInputKey({ ...input, settlementMode: 'orbit' }))
    assert.notEqual(key, quoteInputKey({ ...input, destinationWalletAddress: 'SoOther' }))
    assert.equal(key, quoteInputKey({ ...input, walletAddress: '0xabc' }))
  })

  it('expires quotes after the safety window', () => {
    assert.equal(isQuoteFresh(1_000, 60_999, 60_000), true)
    assert.equal(isQuoteFresh(1_000, 61_000, 60_000), false)
    assert.equal(isQuoteFresh(0, 1_000, 60_000), false)
    assert.equal(isQuoteFresh(2_000, 1_000, 60_000), false)
  })

  it('only renders HTTPS explorer links from persisted transfer data', () => {
    assert.equal(safeExplorerUrl('https://basescan.org/tx/0xabc'), 'https://basescan.org/tx/0xabc')
    assert.equal(safeExplorerUrl('javascript:alert(1)'), '')
    assert.equal(safeExplorerUrl('http://example.com/tx/0xabc'), '')
    assert.equal(safeExplorerUrl('not a URL'), '')
  })

  it('requires the transfer amount to exceed all quoted USDC fees', () => {
    assert.equal(isAmountGreaterThanFee('1', '0.21'), true)
    assert.equal(isAmountGreaterThanFee('0.21', '0.21'), false)
    assert.equal(isAmountGreaterThanFee('0.1', '0.21'), false)
  })

  it('requires an exact route quote with a verified forwarder fee', () => {
    const input = {
      environment: 'mainnet',
      sourceId: 'base',
      destinationId: 'solana',
      recipient: 'So11111111111111111111111111111111111111112',
      amount: '1',
      speed: 'fast',
      useForwarder: true,
    }
    const estimate = {
      token: 'USDC',
      amount: '1.0',
      source: { address: '0xAbCdEf', chain: 'Base' },
      destination: {
        address: input.recipient,
        recipientAddress: input.recipient,
        chain: 'Solana',
      },
      fees: [{ type: 'forwarder', token: 'USDC', amount: '0.21' }],
      gasFees: [],
    }
    assert.equal(validateTransferEstimate(estimate, input, '0xabcdef'), '')
    assert.match(
      validateTransferEstimate({
        ...estimate,
        fees: [{ type: 'provider', token: 'USDC', amount: null, error: new Error('IRIS') }],
      }, input, '0xabcdef'),
      /could not verify/,
    )
    assert.match(
      validateTransferEstimate({
        ...estimate,
        destination: { ...estimate.destination, recipientAddress: 'So222' },
      }, input, '0xabcdef'),
      /recipient/,
    )

    const manualInput = {
      ...input,
      useForwarder: false,
      destinationWalletAddress: 'SoClaim1111111111111111111111111111111111111',
    }
    const manualEstimate = {
      ...estimate,
      destination: {
        address: manualInput.destinationWalletAddress,
        recipientAddress: manualInput.recipient,
        chain: 'Solana',
      },
      fees: [],
    }
    assert.equal(validateTransferEstimate(manualEstimate, manualInput, '0xabcdef'), '')
    assert.match(
      validateTransferEstimate({
        ...manualEstimate,
        fees: [{ type: 'forwarder', token: 'USDC', amount: '0.2' }],
      }, manualInput, '0xabcdef'),
      /Self-claim/,
    )
  })

  it('rejects burn-like destination addresses even when their format is valid', () => {
    assert.match(
      validateRecipient('mainnet', 'base', '0x0000000000000000000000000000000000000000'),
      /零地址/,
    )
    assert.match(
      validateRecipient('mainnet', 'solana', '11111111111111111111111111111111'),
      /默认地址/,
    )
  })

  it('requires the exact saved source wallet and chain for retry', () => {
    const result = createBridgeResultDraft({
      amount: '1',
      sourceAddress: '0xABCDEF',
      sourceChain: base,
      destinationAddress: 'So111',
      destinationChain: solana,
      speed: 'fast',
    })
    assert.equal(isWalletCompatibleWithResult(
      result,
      { address: '0xabcdef', family: 'evm' },
      base,
    ), true)
    assert.equal(isWalletCompatibleWithResult(
      result,
      { address: '0x999999', family: 'evm' },
      base,
    ), false)
    assert.equal(isWalletCompatibleWithResult(
      result,
      { address: '0xabcdef', family: 'evm' },
      ethereum,
    ), false)
  })

  it('requires the original destination signer for Self-claim retry', () => {
    const result = createBridgeResultDraft({
      amount: '1',
      sourceAddress: '0xABCDEF',
      sourceChain: base,
      destinationAddress: 'SoRecipient',
      destinationSignerAddress: 'SoClaim',
      destinationChain: solana,
      speed: 'standard',
      maxFee: '0',
      useForwarder: false,
    })
    result.state = 'error'
    result.steps = [{ name: 'burn', state: 'success', txHash: '0xburn' }]

    assert.equal(isRetryableBridgeResult(result), true)
    assert.equal(isDestinationWalletCompatibleWithResult(
      result,
      { address: 'SoClaim', family: 'solana' },
      solana,
    ), true)
    assert.equal(isDestinationWalletCompatibleWithResult(
      result,
      { address: 'SoOther', family: 'solana' },
      solana,
    ), false)
  })

  it('rechecks the active EVM account and chain immediately before signing', async () => {
    const provider = {
      async request({ method }) {
        if (method === 'eth_accounts') return ['0xabcdef']
        if (method === 'eth_chainId') return '0x2105'
        throw new Error(`unexpected method: ${method}`)
      },
    }
    const wallet = { address: '0xAbCdEf', family: 'evm', provider }
    await assert.doesNotReject(() => assertSourceWalletReady('mainnet', 'base', wallet))
    await assert.rejects(
      () => assertSourceWalletReady('mainnet', 'ethereum', wallet),
      /Ethereum.*required/,
    )
    await assert.rejects(
      () => assertSourceWalletReady('mainnet', 'base', {
        ...wallet,
        address: '0x999999',
      }),
      /account changed/,
    )
  })

  it('requires a buffered source gas balance and complete gas estimates', async () => {
    let gasBalance = 5_000_000_000_000_000n
    const wallet = {
      address: '0xabcdef',
      family: 'evm',
      provider: {
        async request({ method }) {
          assert.equal(method, 'eth_getBalance')
          return `0x${gasBalance.toString(16)}`
        },
      },
    }
    const estimate = {
      gasFees: [
        {
          name: 'Approve',
          blockchain: 'Base',
          fees: { fee: '0.001' },
        },
        {
          name: 'Burn',
          blockchain: 'Base',
          fees: { fee: '0.002' },
        },
      ],
    }
    const ready = await checkSourceGasReadiness('mainnet', 'base', wallet, estimate)
    assert.equal(ready.ready, true)
    assert.equal(ready.requiredGas, 4_500_000_000_000_000n)

    gasBalance = 4_000_000_000_000_000n
    const insufficient = await checkSourceGasReadiness('mainnet', 'base', wallet, estimate)
    assert.equal(insufficient.ready, false)
    assert.match(insufficient.error, /Insufficient ETH/)

    const incomplete = await checkSourceGasReadiness('mainnet', 'base', wallet, {
      gasFees: [{ name: 'Burn', blockchain: 'Base', fees: null, error: new Error('RPC') }],
    })
    assert.equal(incomplete.ready, false)
    assert.match(incomplete.error, /Could not estimate/)
  })

  it('round-trips persisted Bridge Kit chain definitions to UI route IDs', () => {
    const draft = createTransferDraft({
      environment: 'mainnet',
      sourceId: 'base',
      destinationId: 'solana',
      recipient: 'So11111111111111111111111111111111111111112',
      amount: '1',
      speed: 'fast',
      maxFee: '0.21',
    }, '0xabcdef')
    assert.equal(findChainIdForDefinition('mainnet', draft.source.chain), 'base')
    assert.equal(findChainIdForDefinition('mainnet', draft.destination.chain), 'solana')
    assert.equal(draft.source.chain.chainId, getDefinition('mainnet', 'base').chainId)
    assert.equal(draft.config.maxFee, '0.21')
    assert.equal(isRetryableBridgeResult(draft), false)
  })

  it('turns each Bridge Kit step event into a recoverable snapshot', () => {
    const draft = createBridgeResultDraft({
      amount: '1',
      sourceAddress: '0xabcdef',
      sourceChain: base,
      destinationAddress: 'So111',
      destinationChain: solana,
      speed: 'fast',
      maxFee: '0.21',
    })
    const afterBurn = mergeBridgeEventIntoResult(draft, {
      method: 'burn',
      values: {
        name: 'burn',
        state: 'success',
        txHash: '0xburn',
        explorerUrl: 'https://example.test/tx/0xburn',
      },
    })
    assert.equal(afterBurn.steps.length, 1)
    assert.equal(afterBurn.steps[0].txHash, '0xburn')
    assert.equal(isRetryableBridgeResult(afterBurn), true)
  })

  it('replaces persisted chain configuration with canonical definitions before retry', () => {
    const sourceAddress = '0x00000000000000000000000000000000000000ab'
    const recipient = 'So11111111111111111111111111111111111111112'
    const draft = createTransferDraft({
      environment: 'mainnet',
      sourceId: 'base',
      destinationId: 'solana',
      recipient,
      amount: '1',
      speed: 'fast',
      maxFee: '0.21',
    }, sourceAddress)
    const retryable = mergeBridgeEventIntoResult(draft, {
      method: 'burn',
      values: { name: 'burn', state: 'success', txHash: '0xburn' },
    })
    retryable.source.chain = {
      ...retryable.source.chain,
      rpcEndpoints: ['https://attacker.invalid'],
      cctp: { contracts: { v2: { tokenMessenger: '0xdead' } } },
    }
    const normalized = normalizeRetryResult(retryable, 'mainnet')
    assert.deepEqual(normalized.source.chain, getDefinition('mainnet', 'base'))
    assert.equal(normalized.destination.chain, getDefinition('mainnet', 'solana'))
    assert.deepEqual(normalized.config, {
      transferSpeed: 'FAST',
      batchTransactions: false,
      maxFee: '0.21',
    })

    assert.throws(
      () => normalizeRetryResult({
        ...retryable,
        config: {
          ...retryable.config,
          customFee: { value: '0.1', recipientAddress: sourceAddress },
        },
      }, 'mainnet'),
      /safety rules/,
    )
  })

  it('treats storage failures as non-fatal and detectable', () => {
    const previousStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          setItem() {
            throw new Error('storage disabled')
          },
          removeItem() {},
        },
      })
      const draft = createBridgeResultDraft({
        amount: '1',
        sourceAddress: '0xabcdef',
        sourceChain: base,
        destinationAddress: 'So111',
        destinationChain: solana,
        speed: 'fast',
      })
      assert.equal(isTransferStorageAvailable('mainnet'), false)
      assert.doesNotThrow(() => persistTransfer(draft, 'mainnet'))
      assert.equal(persistTransfer(draft, 'mainnet'), false)
    } finally {
      if (previousStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousStorageDescriptor)
      } else {
        delete globalThis.localStorage
      }
    }
  })

  it('upserts transfer progress into bounded browser history', () => {
    const previousStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const entries = new Map()
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem(key) {
            return entries.get(key) ?? null
          },
          setItem(key, value) {
            entries.set(key, String(value))
          },
          removeItem(key) {
            entries.delete(key)
          },
        },
      })
      const draft = createTransferDraft({
        environment: 'testnet',
        sourceId: 'base',
        destinationId: 'solana',
        amount: '12.5',
        recipient: 'So11111111111111111111111111111111111111112',
        destinationWalletAddress: 'So11111111111111111111111111111111111111112',
        speed: 'fast',
        maxFee: '0.1',
        useForwarder: true,
      }, '0x1111111111111111111111111111111111111111')

      assert.equal(persistTransfer(draft, 'testnet'), true)
      assert.equal(loadTransferHistory('testnet').length, 1)

      const completed = {
        ...draft,
        state: 'success',
        steps: [{
          name: 'burn',
          state: 'success',
          txHash: '0xabc',
          explorerUrl: 'https://sepolia.basescan.org/tx/0xabc',
        }],
      }
      assert.equal(persistTransfer(completed, 'testnet'), true)
      const history = loadTransferHistory('testnet')
      assert.equal(history.length, 1)
      assert.equal(history[0].state, 'success')
      assert.equal(history[0].amount, '12.5')
      assert.equal(history[0].sourceId, 'base')
      assert.equal(history[0].destinationId, 'solana')
      assert.equal(history[0].explorerLinks[0].url, 'https://sepolia.basescan.org/tx/0xabc')
    } finally {
      if (previousStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousStorageDescriptor)
      } else {
        delete globalThis.localStorage
      }
    }
  })
})
