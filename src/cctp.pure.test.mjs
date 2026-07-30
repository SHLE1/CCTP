import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PublicKey } from '@solana/web3.js'
import {
  beginQuoteRefresh,
  canStartTransferFromQuote,
  createBridgeResultDraft,
  failQuoteRefresh,
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
  resolveAmountFieldError,
  safeExplorerUrl,
  sanitizeAmountInput,
  serializeBridgeResult,
  shouldAutoQuote,
  subtractUsdcAmounts,
  validateAmount,
} from './cctp-utils.js'
import {
  assertSourceWalletReady,
  checkSourceGasReadiness,
  executeManualClaim,
  fetchManualClaim,
  createTransferDraft,
  findChainIdForDefinition,
  findChainIdForDomain,
  getDefinition,
  isTransferStorageAvailable,
  listChainIds,
  loadTransferHistory,
  normalizeRetryResult,
  reconcileAlreadyCompletedClaim,
  repairTransferHistoryRecord,
  manualClaimBlockReason,
  persistTransfer,
  supportsFastTransfer,
  supportsForwarderDestination,
  switchConnectedEvmWallet,
  validateRecipient,
  validateManualClaimBurnHash,
  validateTransferEstimate,
} from './cctp.js'

describe('Bridge Kit chain coverage', () => {
  const supportedMainnets = [
    'arbitrum',
    'avalanche',
    'base',
    'codex',
    'cronos',
    'edge',
    'ethereum',
    'hyperevm',
    'injective',
    'ink',
    'linea',
    'monad',
    'morph',
    'optimism',
    'pharos',
    'plume',
    'polygon',
    'sei',
    'solana',
    'sonic',
    'unichain',
    'worldchain',
    'xdc',
  ]

  it('includes every USDC mainnet exported by Bridge Kit', () => {
    assert.deepEqual([...listChainIds('mainnet')].sort(), supportedMainnets)
    assert.deepEqual([...listChainIds('testnet')].sort(), supportedMainnets)
    for (const environment of ['mainnet', 'testnet']) {
      for (const chainId of supportedMainnets) {
        assert.ok(getDefinition(environment, chainId).cctp?.contracts?.v2)
      }
    }
  })

  it('uses Circle public capability rules to expose Fast Transfer', () => {
    assert.equal(supportsFastTransfer('mainnet', 'base'), true)
    assert.equal(supportsFastTransfer('mainnet', 'avalanche'), false)
    assert.equal(supportsFastTransfer('mainnet', 'polygon'), false)
  })

  it('exposes destination Forwarding Service availability', () => {
    assert.equal(supportsForwarderDestination('mainnet', 'linea'), true)
    assert.equal(supportsForwarderDestination('mainnet', 'cronos'), false)
    assert.equal(supportsForwarderDestination('mainnet', 'injective'), false)
  })
})

describe('external CCTP v2 manual claim', () => {
  const uintHex = (value, bytes) => BigInt(value).toString(16).padStart(bytes * 2, '0')
  const bytes32 = (value = '0x') => value.replace(/^0x/i, '').padStart(64, '0')
  const makeCctpV2Message = ({
    sourceDomain,
    destinationDomain,
    eventNonce,
    mintRecipient,
    destinationCaller = '0x',
    amount = '1000000',
    expirationBlock = '0',
  }) => `0x${[
    uintHex(1, 4),
    uintHex(sourceDomain, 4),
    uintHex(destinationDomain, 4),
    bytes32(eventNonce),
    bytes32(),
    bytes32(),
    bytes32(destinationCaller),
    uintHex(1000, 4),
    uintHex(1000, 4),
    uintHex(1, 4),
    bytes32(),
    bytes32(mintRecipient),
    uintHex(amount, 32),
    bytes32(),
    uintHex(0, 32),
    uintHex(0, 32),
    uintHex(expirationBlock, 32),
  ].join('')}`

  it('maps Circle domains and validates source transaction identifiers', () => {
    assert.equal(
      findChainIdForDomain('mainnet', getDefinition('mainnet', 'sonic').cctp.domain),
      'sonic',
    )
    assert.equal(findChainIdForDomain('mainnet', 'not-a-domain'), null)
    assert.equal(
      validateManualClaimBurnHash('mainnet', 'ethereum', `0x${'ab'.repeat(32)}`),
      '',
    )
    assert.match(
      validateManualClaimBurnHash('mainnet', 'ethereum', '0x1234'),
      /32-byte/,
    )
    assert.equal(
      validateManualClaimBurnHash('mainnet', 'solana', '1'.repeat(88)),
      '',
    )
  })

  it('blocks relayed or caller-restricted burns before destination signing', () => {
    const wallet = {
      address: '0x1111111111111111111111111111111111111111',
      family: 'evm',
    }
    const claim = {
      environment: 'mainnet',
      destinationId: 'sonic',
      destinationCaller: `0x${'0'.repeat(24)}${wallet.address.slice(2)}`,
      forwardState: null,
    }
    assert.equal(manualClaimBlockReason(claim, null), '')
    assert.equal(manualClaimBlockReason(claim, wallet), '')
    assert.match(
      manualClaimBlockReason(claim, {
        ...wallet,
        address: '0x2222222222222222222222222222222222222222',
      }),
      /another destination caller/,
    )
    assert.match(
      manualClaimBlockReason({ ...claim, forwardState: 'PENDING' }, null),
      /Orbit is already completing/,
    )
  })

  it('reports a consumed Solana nonce as already claimed', async () => {
    const sonic = getDefinition('mainnet', 'sonic')
    const solana = getDefinition('mainnet', 'solana')
    const transactionHash = `0x${'9d'.repeat(32)}`
    const eventNonce = `0x${'d2'.repeat(32)}`
    const recipient = new PublicKey('ChPnWjj947MDzFF3o3kcJPZVh9wdNuvnZeJkz8h69F15')
    const recipientHex = `0x${Buffer.from(recipient.toBytes()).toString('hex')}`
    const rawMessage = makeCctpV2Message({
      sourceDomain: sonic.cctp.domain,
      destinationDomain: solana.cctp.domain,
      eventNonce,
      mintRecipient: recipientHex,
      amount: '2203274043',
    })
    const claimTx = '5KqirXvuH99VEFxBEiUt5s7tYswSrrxkycjeiYKKFCPYMku9uZo3fJUK1LYGKuMVCeDpFrh99X1665P2ZkeZS8B8'
    const originalFetch = globalThis.fetch
    const rpcMethods = []
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes('/v2/messages/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              messages: [{
                cctpVersion: 2,
                status: 'complete',
                message: rawMessage,
                attestation: '0x34',
                eventNonce,
              }],
            }
          },
        }
      }
      const request = JSON.parse(options.body)
      rpcMethods.push(request.method)
      if (request.method === 'getAccountInfo') {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              jsonrpc: '2.0',
              result: {
                value: {
                  owner: solana.cctp.contracts.v2.messageTransmitter,
                  data: ['', 'base64'],
                },
              },
            }
          },
        }
      }
      assert.equal(request.method, 'getSignaturesForAddress')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            jsonrpc: '2.0',
            result: [{ signature: claimTx, err: null }],
          }
        },
      }
    }
    try {
      const claim = await fetchManualClaim('mainnet', 'sonic', transactionHash)
      assert.equal(claim.destinationId, 'solana')
      assert.equal(claim.destinationStatus.state, 'claimed')
      assert.equal(claim.destinationStatus.txHash, claimTx)
      assert.match(claim.destinationStatus.explorerUrl, new RegExp(claimTx))
      assert.deepEqual(rpcMethods, ['getAccountInfo', 'getSignaturesForAddress'])
      assert.match(manualClaimBlockReason(claim, null), /already claimed on Solana/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('loads an external burn from Circle and submits only the destination mint', async () => {
    const ethereum = getDefinition('mainnet', 'ethereum')
    const sonic = getDefinition('mainnet', 'sonic')
    const walletAddress = '0x1111111111111111111111111111111111111111'
    const transactionHash = `0x${'ab'.repeat(32)}`
    const originalFetch = globalThis.fetch
    let preparedAction
    let fetchCalls = 0
    const eventNonce = `0x${'cd'.repeat(32)}`
    const rawMessage = makeCctpV2Message({
      sourceDomain: ethereum.cctp.domain,
      destinationDomain: sonic.cctp.domain,
      eventNonce,
      mintRecipient: walletAddress,
    })
    globalThis.fetch = async (url) => {
      fetchCalls += 1
      assert.match(String(url), new RegExp(`/v2/messages/${ethereum.cctp.domain}`))
      assert.match(String(url), /transactionHash=/)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            messages: [{
              cctpVersion: 2,
              status: 'complete',
              message: rawMessage,
              attestation: '0x34',
              eventNonce,
              decodedMessage: {
                sourceDomain: String(ethereum.cctp.domain),
                destinationDomain: String(sonic.cctp.domain),
                destinationCaller: `0x${'00'.repeat(32)}`,
                decodedMessageBody: {
                  mintRecipient: '0x2222222222222222222222222222222222222222',
                  amount: '999',
                  expirationBlock: '999',
                },
              },
            }],
          }
        },
      }
    }
    try {
      const claim = await fetchManualClaim('mainnet', 'ethereum', transactionHash)
      assert.equal(claim.destinationId, 'sonic')
      assert.equal(claim.amountMicro, '1000000')

      const wallet = {
        address: walletAddress,
        family: 'evm',
        provider: {
          async request({ method }) {
            if (method === 'eth_accounts') return [walletAddress]
            if (method === 'eth_chainId') return `0x${sonic.chainId.toString(16)}`
            if (method === 'eth_blockNumber') return '0x1'
            throw new Error(`unexpected method: ${method}`)
          },
        },
        adapter: {
          async prepareAction(action, params, context) {
            preparedAction = { action, params, context }
            return { async execute() { return `0x${'ef'.repeat(32)}` } }
          },
          async waitForTransaction() {
            return { status: 'confirmed' }
          },
        },
      }
      const result = await executeManualClaim(claim, wallet)
      assert.equal(preparedAction.action, 'cctp.v2.receiveMessage')
      assert.equal(preparedAction.params.message, rawMessage)
      assert.equal(preparedAction.params.destinationAddress, walletAddress)
      assert.match(result.txHash, /^0xef/)
      assert.equal(fetchCalls, 2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

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

  it('keeps prior quote data while refreshing and only allows Start when ready', () => {
    const prior = {
      status: 'ready',
      data: { fees: [{ type: 'provider', amount: '0.1' }] },
      error: '',
      key: 'k1',
      quotedAt: 1_000,
    }
    const loading = beginQuoteRefresh(prior, 'k1')
    assert.equal(loading.status, 'loading')
    assert.equal(loading.data, prior.data)
    assert.equal(loading.quotedAt, 0)
    assert.equal(loading.error, '')
    assert.equal(canStartTransferFromQuote(loading.status, false), false)
    assert.equal(canStartTransferFromQuote('ready', true), true)
    assert.equal(canStartTransferFromQuote('ready', false), false)

    const failed = failQuoteRefresh(loading, 'k1', 'RPC timed out')
    assert.equal(failed.status, 'error')
    assert.equal(failed.data, prior.data)
    assert.equal(failed.error, 'RPC timed out')
    assert.equal(failed.quotedAt, 0)
    assert.equal(canStartTransferFromQuote(failed.status, false), false)

    // Fee breakdown still works from retained payload during refresh/error.
    assert.equal(quoteFeeBreakdown(loading.data).total, '0.1')
    assert.equal(quoteFeeBreakdown(failed.data).total, '0.1')
  })

  it('automatically quotes only when every transfer prerequisite is ready', () => {
    const ready = {
      quoteStatus: 'idle',
      rpcNotReady: false,
      walletAddress: '0x1234',
      needsDestinationWallet: false,
      balanceStatus: 'ready',
      balanceValue: '10',
      amountError: '',
      recipientError: '',
      balanceTooLow: false,
      transferOpen: false,
    }

    assert.equal(shouldAutoQuote(ready), true)
    assert.equal(shouldAutoQuote({ ...ready, quoteStatus: 'loading' }), false)
    assert.equal(shouldAutoQuote({ ...ready, quoteStatus: 'error' }), false)
    assert.equal(shouldAutoQuote({ ...ready, walletAddress: '' }), false)
    assert.equal(shouldAutoQuote({ ...ready, needsDestinationWallet: true }), false)
    assert.equal(shouldAutoQuote({ ...ready, amountError: 'invalid' }), false)
    assert.equal(shouldAutoQuote({ ...ready, transferOpen: true }), false)
  })

  it('resolves a single amount field error for aria-describedby', () => {
    assert.equal(resolveAmountFieldError({
      amount: '1',
      amountError: '金额格式不正确（最多 6 位小数）',
      balanceTooLow: true,
      feeTooHigh: true,
    }), '金额格式不正确（最多 6 位小数）')
    assert.equal(resolveAmountFieldError({
      amount: '1',
      amountError: '',
      balanceStatus: 'error',
      balanceError: 'rpc down',
      balanceTooLow: true,
    }), 'rpc down')
    assert.equal(resolveAmountFieldError({
      amount: '1',
      amountError: '',
      balanceStatus: 'ready',
      balanceTooLow: true,
      feeTooHigh: true,
    }), 'Amount exceeds USDC balance')
    assert.equal(resolveAmountFieldError({
      amount: '1',
      amountError: '',
      balanceStatus: 'ready',
      balanceTooLow: false,
      feeTooHigh: true,
    }), 'Amount must be greater than all quoted USDC fees')
    assert.equal(resolveAmountFieldError({}), '')
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

  it('reuses the connected EVM wallet when switching chains', async () => {
    const calls = []
    let chainId = '0x1'
    const provider = {
      async request(request) {
        calls.push(request)
        if (request.method === 'eth_chainId') return chainId
        if (request.method === 'wallet_switchEthereumChain') {
          chainId = request.params[0].chainId
          return null
        }
        if (request.method === 'eth_accounts') {
          return ['0x1234567890123456789012345678901234567890']
        }
        throw new Error(`unexpected method: ${request.method}`)
      },
    }
    const adapter = { id: 'same-adapter' }
    const wallet = {
      address: '0x1234567890123456789012345678901234567890',
      family: 'evm',
      provider,
      adapter,
      chainId: 1,
    }

    const switched = await switchConnectedEvmWallet('mainnet', 'base', wallet)

    assert.equal(switched.provider, provider)
    assert.equal(switched.adapter, adapter)
    assert.equal(switched.address, wallet.address)
    assert.equal(switched.chainId, 8453)
    assert.deepEqual(calls.map((call) => call.method), [
      'eth_chainId',
      'wallet_switchEthereumChain',
      'eth_accounts',
    ])
    assert.equal(calls.some((call) => call.method === 'eth_requestAccounts'), false)
  })

  it('adds newly supported EVM chains with a wallet-safe explorer URL', async () => {
    const calls = []
    const provider = {
      async request(request) {
        calls.push(request)
        if (request.method === 'eth_chainId') return '0x1'
        if (request.method === 'wallet_switchEthereumChain') {
          const error = new Error('Unrecognized chain')
          error.code = 4902
          throw error
        }
        if (request.method === 'wallet_addEthereumChain') return null
        if (request.method === 'eth_accounts') {
          return ['0x1234567890123456789012345678901234567890']
        }
        throw new Error(`unexpected method: ${request.method}`)
      },
    }
    const wallet = {
      address: '0x1234567890123456789012345678901234567890',
      family: 'evm',
      provider,
      chainId: 1,
    }

    const switched = await switchConnectedEvmWallet('mainnet', 'injective', wallet)
    const addChainCall = calls.find((call) => call.method === 'wallet_addEthereumChain')

    assert.equal(switched.chainId, 1776)
    assert.equal(addChainCall.params[0].chainId, '0x6f0')
    assert.deepEqual(addChainCall.params[0].blockExplorerUrls, ['https://injscan.com'])
    assert.equal(addChainCall.params[0].rpcUrls[0], 'https://sentry.evm-rpc.injective.network')
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

  it('reconciles a duplicate CCTP claim revert as an on-chain success', async () => {
    const previousFetch = globalThis.fetch
    const destination = getDefinition('mainnet', 'sonic')
    const failedHash = `0x${'1'.repeat(64)}`
    const result = {
      ...createTransferDraft({
        environment: 'mainnet',
        sourceId: 'base',
        destinationId: 'sonic',
        amount: '10.98807',
        recipient: '0xd6fab449d7e06122e8eda3726efb2c813cecc19c',
        destinationWalletAddress: '0xd6fab449d7e06122e8eda3726efb2c813cecc19c',
        speed: 'fast',
        maxFee: '0.01',
        useForwarder: false,
      }, '0xd6fab449d7e06122e8eda3726efb2c813cecc19c'),
      state: 'error',
      steps: [
        { name: 'burn', state: 'success', txHash: `0x${'2'.repeat(64)}` },
        {
          name: 'mint',
          state: 'error',
          txHash: failedHash,
          errorMessage: 'Transaction reverted',
          errorCategory: 'chain_revert',
        },
      ],
    }

    try {
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body)
        let payload
        if (request.method === 'eth_getTransactionReceipt') {
          payload = { result: { status: '0x0' } }
        } else if (request.method === 'eth_getTransactionByHash') {
          payload = {
            result: {
              from: result.destination.address,
              to: destination.cctp.contracts.v2.messageTransmitter,
              input: '0x57ecfd28deadbeef',
              value: '0x0',
            },
          }
        } else if (request.method === 'eth_call') {
          payload = { error: { message: 'execution reverted: Nonce already used' } }
        } else {
          throw new Error(`Unexpected RPC method: ${request.method}`)
        }
        return { ok: true, json: async () => payload }
      }

      const reconciled = await reconcileAlreadyCompletedClaim(result, 'mainnet')
      assert.equal(reconciled.state, 'success')
      assert.equal(reconciled.steps[1].state, 'noop')
      assert.equal(reconciled.steps[1].txHash, failedHash)
      assert.equal(reconciled.steps[1].errorMessage, 'Claim was already completed on-chain.')

      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body)
        if (request.method === 'eth_getTransactionReceipt') {
          return { ok: true, json: async () => ({ result: { status: '0x0' } }) }
        }
        if (request.method === 'eth_getTransactionByHash') {
          return {
            ok: true,
            json: async () => ({
              result: {
                from: result.destination.address,
                to: destination.cctp.contracts.v2.messageTransmitter,
                input: '0x57ecfd28deadbeef',
                value: '0x0',
              },
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({ error: { message: 'execution reverted: Invalid attestation' } }),
        }
      }
      assert.equal(
        (await reconcileAlreadyCompletedClaim(result, 'mainnet')).state,
        'error',
      )
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('repairs a selected older history record without replacing the latest transfer', async () => {
    const previousFetch = globalThis.fetch
    const previousStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const destination = getDefinition('mainnet', 'sonic')
    const failedHash = `0x${'3'.repeat(64)}`
    const records = [
      {
        id: 'latest',
        environment: 'mainnet',
        createdAt: '2026-07-30T05:32:00.000Z',
        updatedAt: '2026-07-30T05:32:00.000Z',
        amount: '1005',
        sourceId: 'sonic',
        destinationId: 'ethereum',
        state: 'success',
        retryable: false,
        explorerLinks: [],
        txHashes: ['0xlatest'],
      },
      {
        id: 'older-interrupted',
        environment: 'mainnet',
        createdAt: '2026-07-30T04:49:00.000Z',
        updatedAt: '2026-07-30T04:49:00.000Z',
        amount: '10.98807',
        sourceId: 'base',
        destinationId: 'sonic',
        state: 'error',
        retryable: true,
        explorerLinks: [],
        txHashes: [failedHash],
      },
    ]
    const entries = new Map([
      ['relay:transfer-history:mainnet', JSON.stringify(records)],
    ])

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
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body)
        if (request.method === 'eth_getTransactionReceipt') {
          return { ok: true, json: async () => ({ result: { status: '0x0' } }) }
        }
        if (request.method === 'eth_getTransactionByHash') {
          return {
            ok: true,
            json: async () => ({
              result: {
                from: '0xd6fab449d7e06122e8eda3726efb2c813cecc19c',
                to: destination.cctp.contracts.v2.messageTransmitter,
                input: '0x57ecfd28deadbeef',
                value: '0x0',
              },
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({ error: { message: 'execution reverted: Nonce already used' } }),
        }
      }

      assert.equal(await repairTransferHistoryRecord(records[1], 'mainnet'), true)
      const repaired = loadTransferHistory('mainnet')
      assert.equal(repaired.length, 2)
      assert.equal(repaired[0].id, 'latest')
      assert.equal(repaired[0].state, 'success')
      assert.equal(repaired[1].id, 'older-interrupted')
      assert.equal(repaired[1].state, 'success')
      assert.equal(repaired[1].retryable, false)
    } finally {
      globalThis.fetch = previousFetch
      if (previousStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousStorageDescriptor)
      } else {
        delete globalThis.localStorage
      }
    }
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
      assert.equal(loadTransferHistory('testnet').length, 0)

      assert.equal(persistTransfer({
        ...draft,
        state: 'error',
        steps: [{ name: 'approve', state: 'error', errorMessage: 'User rejected' }],
      }, 'testnet'), true)
      assert.equal(loadTransferHistory('testnet').length, 0)

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

      const failedClaim = {
        ...draft,
        amount: '13',
        state: 'error',
        steps: [
          { name: 'burn', state: 'success', txHash: '0xburn13' },
          {
            name: 'mint',
            state: 'error',
            txHash: '0xfailed',
            errorCategory: 'chain_revert',
          },
        ],
      }
      assert.equal(persistTransfer(failedClaim, 'testnet'), true)
      const withOnChainFailure = loadTransferHistory('testnet')
      assert.equal(withOnChainFailure.length, 2)
      assert.equal(withOnChainFailure[0].state, 'error')
      assert.equal(withOnChainFailure[0].retryable, true)

      assert.equal(persistTransfer({
        ...failedClaim,
        state: 'success',
        steps: [
          failedClaim.steps[0],
          {
            ...failedClaim.steps[1],
            state: 'noop',
            errorMessage: 'Claim was already completed on-chain.',
            errorCategory: undefined,
          },
        ],
      }, 'testnet'), true)
      const reconciledHistory = loadTransferHistory('testnet')
      assert.equal(reconciledHistory.length, 2)
      assert.equal(reconciledHistory[0].state, 'success')
      assert.equal(reconciledHistory[0].txHashes.includes('0xfailed'), true)
    } finally {
      if (previousStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousStorageDescriptor)
      } else {
        delete globalThis.localStorage
      }
    }
  })
})
