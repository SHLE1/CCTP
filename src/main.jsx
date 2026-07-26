import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton, WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  Info,
  LoaderCircle,
  Moon,
  Radio,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import {
  attachEvmWalletListeners,
  connectSourceWallet,
  estimateTransfer,
  executeTransfer,
  fetchUsdcBalance,
  friendlyError,
  getSolanaRpcEndpoint,
  isRetryableBridgeResult,
  loadPersistedTransfer,
  parseUsdcToMicro,
  persistTransfer,
  quoteFeeBreakdown,
  retryTransfer,
  sanitizeAmountInput,
  subtractUsdcAmounts,
  supportsFastTransfer,
  usesPublicSolanaRpc,
  validateAmount,
  validateRecipient,
} from './cctp'
import '@solana/wallet-adapter-react-ui/styles.css'
import './styles.css'

// Chain icons: Trust Wallet / DefiLlama; USDC: Circle asset via Trust Wallet
// supportsFast is resolved at runtime from Bridge Kit chain defs (CCTP v2 fastConfirmations).
const CHAIN_META = {
  ethereum: { family: 'evm', icon: '/icons/ethereum.png', color: '#627EEA', eta: '14–19 min' },
  base: { family: 'evm', icon: '/icons/base.png', color: '#0052FF', eta: '4–7 min' },
  arbitrum: { family: 'evm', icon: '/icons/arbitrum.png', color: '#28A0F0', eta: '4–7 min' },
  optimism: { family: 'evm', icon: '/icons/optimism.png', color: '#FF0420', eta: '4–7 min' },
  avalanche: { family: 'evm', icon: '/icons/avalanche.png', color: '#E84142', eta: '4–7 min' },
  polygon: { family: 'evm', icon: '/icons/polygon.png', color: '#8247E5', eta: '8–12 min' },
  unichain: { family: 'evm', icon: '/icons/unichain.png', color: '#FF2D8D', eta: '4–7 min' },
  sonic: { family: 'evm', icon: '/icons/sonic.png', color: '#2563EB', eta: '4–7 min' },
  solana: { family: 'solana', icon: '/icons/solana.png', color: '#9945FF', eta: '8–12 sec' },
}

const USDC_ICON = '/icons/usdc.png'

const FAQ_ITEMS = [
  {
    q: 'What is CCTP?',
    a: 'Circle Cross-Chain Transfer Protocol (CCTP) lets you move native USDC between supported blockchains by burning on the source chain and minting on the destination. No wrapped tokens or liquidity pools.',
  },
  {
    q: 'How does CCTP work?',
    a: 'USDC is burned on the source chain, Circle attests the burn, then native USDC is minted on the destination. This interface uses Circle Bridge Kit with Orbit for the full burn–attest–mint flow.',
  },
  {
    q: 'What is the difference between Fast Transfer and Standard Transfer?',
    a: 'Fast Transfer uses Circle’s fast finality path for shorter wait times and may include a CCTP fee. Standard Transfer follows the normal attestation path with no CCTP fee, but can take longer.',
  },
  {
    q: 'Which blockchains are supported?',
    a: 'This app supports the CCTP V2 networks available in Bridge Kit for the selected environment (Mainnet or Testnet), including major EVM chains and Solana.',
  },
  {
    q: 'Are there any fees?',
    a: 'This interface does not charge extra fees. You still pay gas on the source (and sometimes destination) chain, and Fast Transfer may include a CCTP fee shown before you sign.',
  },
  {
    q: 'Is CCTP secure?',
    a: 'CCTP is designed by Circle with a burn-and-mint model so funds are not parked in third-party bridge pools. Always verify network, amount, and recipient before signing.',
  },
]

const CHAIN_NAMES = {
  mainnet: {
    ethereum: 'Ethereum',
    base: 'Base',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    avalanche: 'Avalanche',
    polygon: 'Polygon',
    unichain: 'Unichain',
    sonic: 'Sonic',
    solana: 'Solana',
  },
  testnet: {
    ethereum: 'Sepolia',
    base: 'Base Sepolia',
    arbitrum: 'Arb Sepolia',
    optimism: 'OP Sepolia',
    avalanche: 'Fuji',
    polygon: 'Amoy',
    unichain: 'Unichain Sepolia',
    sonic: 'Sonic Testnet',
    solana: 'Solana Devnet',
  },
}

const ENVIRONMENT_LABELS = { mainnet: 'Mainnet', testnet: 'Testnet' }
const makeChains = (environment) => Object.entries(CHAIN_NAMES[environment]).map(([id, name]) => ({
  id,
  name,
  ...CHAIN_META[id],
  supportsFast: supportsFastTransfer(environment, id),
}))

const shortAddress = (value) => value ? `${value.slice(0, 5)}…${value.slice(-4)}` : ''
const findChain = (chains, id) => chains.find((chain) => chain.id === id)

function ChainMark({ chain, small = false }) {
  const [broken, setBroken] = useState(false)
  if (broken || !chain?.icon) {
    return (
      <span className={`chain-mark fallback ${small ? 'small' : ''}`} style={{ '--chain-color': chain?.color || '#888' }}>
        {(chain?.name || '?').slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      className={`chain-mark ${small ? 'small' : ''}`}
      src={chain.icon}
      alt=""
      width={small ? 18 : 24}
      height={small ? 18 : 24}
      draggable={false}
      onError={() => setBroken(true)}
    />
  )
}

function UsdcMark() {
  const [broken, setBroken] = useState(false)
  if (broken) return <span className="usdc-mark fallback">$</span>
  return (
    <img
      className="usdc-mark"
      src={USDC_ICON}
      alt=""
      width={28}
      height={28}
      draggable={false}
      onError={() => setBroken(true)}
    />
  )
}

function ChainSelect({ chains, label, value, otherValue, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = findChain(chains, value)
  return (
    <div className="field-group chain-field">
      <span className="field-label">{label}</span>
      <button className="chain-trigger" onClick={() => setOpen(true)} aria-label={`Choose ${label.toLowerCase()} chain`}>
        <ChainMark chain={selected} />
        <span className="chain-name">{selected.name}</span>
        <ChevronRight className="chev" size={16} strokeWidth={2} />
      </button>
      {open && (
        <div className="modal-layer" role="dialog" aria-modal="true">
          <button className="modal-backdrop" onClick={() => setOpen(false)} aria-label="Close chain selector" />
          <div className="sheet">
            <div className="sheet-head">
              <h3>Select chain</h3>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="chain-list">
              {chains.map((chain) => (
                <button
                  key={chain.id}
                  disabled={chain.id === otherValue}
                  className={`chain-option ${chain.id === value ? 'active' : ''}`}
                  onClick={() => { onChange(chain.id); setOpen(false) }}
                >
                  <ChainMark chain={chain} />
                  <span>
                    <strong>{chain.name}</strong>
                    <small>{chain.family === 'evm' ? 'EVM' : 'SVM'}</small>
                  </span>
                  {chain.id === value && <Check size={16} />}
                  {chain.id === otherValue && <small className="in-use">In use</small>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SolanaWalletConnector({ chain, environment, onConnected }) {
  const { wallet, wallets, connected, connecting, publicKey } = useWallet()
  const [message, setMessage] = useState('')
  const [preparing, setPreparing] = useState(false)
  const handledConnection = useRef('')

  useEffect(() => {
    if (!connected || !wallet?.adapter || !publicKey) return
    const connectionKey = `${wallet.adapter.name}:${publicKey.toString()}:${environment}`
    if (handledConnection.current === connectionKey) return
    handledConnection.current = connectionKey
    setPreparing(true)
    setMessage('')
    connectSourceWallet(environment, chain.id, wallet.adapter)
      .then(onConnected)
      .catch((error) => {
        handledConnection.current = ''
        setMessage(friendlyError(error))
      })
      .finally(() => setPreparing(false))
  }, [chain.id, connected, environment, onConnected, publicKey, wallet])

  return (
    <>
      <WalletModalButton>
        {preparing ? 'Preparing…' : connecting ? 'Waiting…' : 'Choose Solana wallet'}
      </WalletModalButton>
      <p className="hint">
        {wallets.length
          ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} detected`
          : 'Install a Solana wallet extension to continue'}
      </p>
      {message && <p className="error-message"><Info size={14} />{message}</p>}
    </>
  )
}

function WalletModal({ chain, environment, onClose, onConnected }) {
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function connect() {
    setStatus('loading')
    setMessage('')
    try {
      const connected = await connectSourceWallet(environment, chain.id)
      onConnected(connected)
    } catch (error) {
      setStatus('error')
      setMessage(friendlyError(error))
    }
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close wallet dialog" />
      <div className="sheet">
        <div className="sheet-head">
          <h3>Connect · {chain.name}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {chain.family === 'solana'
          ? <SolanaWalletConnector chain={chain} environment={environment} onConnected={onConnected} />
          : <>
            <button className="wallet-option" onClick={connect} disabled={status === 'loading'}>
              <span className="wallet-mark">E</span>
              <span>
                <strong>{status === 'loading' ? 'Waiting for wallet…' : 'Browser wallet'}</strong>
                <small>MetaMask, Rabby, Coinbase</small>
              </span>
              <ArrowRight size={16} />
            </button>
            {message && <p className="error-message"><Info size={14} />{message}</p>}
          </>}
        <p className={`legal-note ${environment === 'mainnet' ? 'mainnet-note' : ''}`}>
          {environment === 'mainnet'
            ? 'Mainnet uses real USDC and gas. Connecting does not move funds.'
            : 'Testnet uses test assets. Connecting does not move funds.'}
        </p>
      </div>
    </div>
  )
}

const PHASE_INDEX = { ready: 0, approve: 0, burn: 1, attest: 2, mint: 3, success: 4 }

function ProgressModal({
  environment,
  source,
  destination,
  amount,
  phase,
  error,
  result,
  canRetry,
  onClose,
  onStart,
  onRetry,
}) {
  const busy = ['approve', 'burn', 'attest', 'mint'].includes(phase)
  const phaseIndex = PHASE_INDEX[phase] ?? 0
  const steps = [
    { title: 'Approve', detail: `Confirm in ${source.family === 'evm' ? 'EVM' : 'Solana'} wallet`, icon: Check },
    { title: `Burn ${amount || '0'} USDC`, detail: `On ${source.name}`, icon: Flame },
    { title: 'Attestation', detail: 'Circle signed message', icon: Radio },
    { title: 'Mint', detail: `Native USDC on ${destination.name}`, icon: Check },
  ]
  const transactionSteps = (result?.steps || []).filter((item) => item.txHash || item.explorerUrl)

  useEffect(() => {
    if (!busy) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [busy])

  const primaryAction = phase === 'success'
    ? onClose
    : phase === 'error'
      ? (canRetry ? onRetry : onClose)
      : onStart
  const primaryLabel = phase === 'success'
    ? 'Done'
    : phase === 'error'
      ? (canRetry ? 'Retry from last step' : 'Close')
      : busy
        ? 'Keep this open…'
        : `Start ${ENVIRONMENT_LABELS[environment]} transfer`

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={busy ? undefined : onClose} aria-label="Close transfer dialog" disabled={busy} />
      <div className="sheet progress-sheet">
        <div className="sheet-head">
          <h3>
            {phase === 'success' ? 'Complete' : phase === 'error' ? 'Needs attention' : busy ? 'In progress' : 'Confirm transfer'}
          </h3>
          <button className="icon-button" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <div className="route-summary">
          <ChainMark chain={source} />
          <span className="route-line" />
          <ChainMark chain={destination} />
          <strong>{amount || '0'} USDC</strong>
        </div>
        <div className="steps">
          {steps.map((item, index) => {
            const Icon = item.icon
            const complete = phase === 'success' || index < phaseIndex
            const active = busy && index === phaseIndex
            return (
              <div className={`step ${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={item.title}>
                <span className="step-icon">{complete ? <Check size={15} /> : <Icon size={15} />}</span>
                <span><strong>{item.title}</strong><small>{complete ? 'Done' : item.detail}</small></span>
                {active && <span className="pulse-dot" />}
              </div>
            )
          })}
        </div>
        {transactionSteps.length > 0 && (
          <div className="tx-links">
            {transactionSteps.map((item, index) => item.explorerUrl
              ? <a href={item.explorerUrl} target="_blank" rel="noreferrer" key={`${item.name}-${index}`}>{item.name}<ExternalLink size={12} /></a>
              : <span key={`${item.name}-${index}`}>{item.name}: {shortAddress(item.txHash)}</span>)}
          </div>
        )}
        {phase === 'ready' && (
          <div className={`real-warning ${environment === 'mainnet' ? 'mainnet-warning' : ''}`}>
            <Info size={15} />
            <span>
              {environment === 'mainnet'
                ? <><strong>Mainnet.</strong> Real USDC will be burned. Check network, address, and amount. Keep this tab open until mint completes.</>
                : <><strong>Testnet.</strong> Test USDC will be burned and reminted via Orbit. Keep this tab open until mint completes.</>}
            </span>
          </div>
        )}
        {busy && (
          <p className="progress-hint">Do not close this tab while attestation or mint is running. Progress is saved so you can resume if something fails.</p>
        )}
        {error && <div className="error-message"><Info size={15} /><span>{error}</span></div>}
        <button className="primary-button" onClick={primaryAction} disabled={busy}>
          {busy && <LoaderCircle className="spin" size={16} />}
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}

function BridgeCard({ environment, onEnvironmentChange, chains }) {
  const [sourceId, setSourceId] = useState('base')
  const [destinationId, setDestinationId] = useState('solana')
  const [amount, setAmount] = useState('')
  const [speed, setSpeed] = useState('fast')
  const [wallet, setWallet] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [quote, setQuote] = useState({ status: 'idle', data: null, error: '' })
  const [walletModal, setWalletModal] = useState(false)
  const [transfer, setTransfer] = useState({ open: false, phase: 'ready', error: '', result: null, canRetry: false })
  const [balance, setBalance] = useState({ status: 'idle', value: null, error: '' })
  const source = findChain(chains, sourceId)
  const destination = findChain(chains, destinationId)
  const amountError = validateAmount(amount)
  const amountNumber = amountError ? 0 : (Number(amount) || 0)
  const feeBreakdown = quoteFeeBreakdown(quote.data)
  const receive = quote.data && !amountError ? subtractUsdcAmounts(amount, feeBreakdown.total) : null
  const publicSolanaRpc = usesPublicSolanaRpc(environment)

  useEffect(() => {
    setQuote({ status: 'idle', data: null, error: '' })
  }, [environment, sourceId, destinationId, amount, speed, recipient])

  useEffect(() => {
    if (!source.supportsFast && speed === 'fast') setSpeed('standard')
  }, [source, speed])

  useEffect(() => {
    if (!wallet?.address) {
      setBalance({ status: 'idle', value: null, error: '' })
      return undefined
    }
    let cancelled = false
    setBalance({ status: 'loading', value: null, error: '' })
    fetchUsdcBalance(environment, sourceId, wallet.address)
      .then((value) => {
        if (!cancelled) setBalance({ status: 'ready', value, error: '' })
      })
      .catch((error) => {
        if (!cancelled) setBalance({ status: 'error', value: null, error: friendlyError(error) })
      })
    return () => { cancelled = true }
  }, [environment, sourceId, wallet?.address])

  useEffect(() => {
    if (!wallet?.provider || wallet.family !== 'evm') return undefined
    return attachEvmWalletListeners(wallet.provider, {
      onAccountsChanged: (accounts) => {
        if (!accounts?.length) {
          setWallet(null)
          setQuote({ status: 'idle', data: null, error: '' })
          return
        }
        const next = accounts[0]
        if (next?.toLowerCase() !== wallet.address?.toLowerCase()) {
          // Adapter was created for the previous account — force a clean reconnect.
          setWallet(null)
          setQuote({ status: 'idle', data: null, error: '' })
        }
      },
      onChainChanged: () => {
        setWallet(null)
        setQuote({ status: 'idle', data: null, error: '' })
      },
    })
  }, [wallet])

  function swap() {
    setSourceId(destinationId)
    setDestinationId(sourceId)
    setWallet(null)
    setRecipient('')
  }

  function setSource(value) {
    setSourceId(value)
    setWallet(null)
  }

  async function changeEnvironment(value) {
    if (value === environment) return
    await wallet?.provider?.disconnect?.().catch?.(() => {})
    setWallet(null)
    setRecipient('')
    setQuote({ status: 'idle', data: null, error: '' })
    setTransfer({ open: false, phase: 'ready', error: '', result: null, canRetry: false })
    localStorage.setItem('relay:environment', value)
    onEnvironmentChange(value)
  }

  const recipientError = validateRecipient(environment, destinationId, recipient)
  let balanceTooLow = false
  if (wallet && balance.status === 'ready' && balance.value != null && !amountError && amount) {
    try {
      balanceTooLow = parseUsdcToMicro(amount) > parseUsdcToMicro(balance.value)
    } catch {
      balanceTooLow = false
    }
  }

  const bridgeInput = () => ({
    environment,
    sourceId,
    destinationId,
    adapter: wallet.adapter,
    recipient,
    amount,
    speed,
  })

  async function fetchQuote() {
    setQuote({ status: 'loading', data: null, error: '' })
    try {
      const data = await estimateTransfer(bridgeInput())
      setQuote({ status: 'ready', data, error: '' })
    } catch (error) {
      setQuote({ status: 'error', data: null, error: friendlyError(error) })
    }
  }

  function phaseFromEvent(payload) {
    const method = String(payload?.method || payload?.name || '').toLowerCase()
    if (method.includes('mint') || method.includes('forward')) return 'mint'
    if (method.includes('attest') || method.includes('message')) return 'attest'
    if (method.includes('burn')) return 'burn'
    if (method.includes('approve')) return 'approve'
    return null
  }

  function handleBridgeEvent(payload) {
    const next = phaseFromEvent(payload)
    if (next) setTransfer((current) => ({ ...current, phase: next }))
  }

  async function startTransfer(isRetry = false) {
    setTransfer((current) => ({ ...current, phase: 'approve', error: '' }))
    try {
      const result = isRetry && transfer.result && isRetryableBridgeResult(transfer.result)
        ? await retryTransfer(transfer.result, wallet.adapter, handleBridgeEvent)
        : await executeTransfer(bridgeInput(), handleBridgeEvent)
      persistTransfer(result, environment)
      const failed = result.state !== 'success'
      const failedStep = result.steps?.find((item) => item.state === 'error')
      setTransfer((current) => ({
        ...current,
        result,
        canRetry: failed && isRetryableBridgeResult(result),
        phase: failed ? 'error' : 'success',
        error: failed
          ? (failedStep?.errorMessage || 'Transfer incomplete. You can retry from the last step.')
          : '',
      }))
      if (wallet?.address) {
        fetchUsdcBalance(environment, sourceId, wallet.address)
          .then((value) => setBalance({ status: 'ready', value, error: '' }))
          .catch(() => {})
      }
    } catch (error) {
      setTransfer((current) => ({
        ...current,
        phase: 'error',
        error: friendlyError(error),
        canRetry: isRetryableBridgeResult(current.result),
      }))
    }
  }

  async function disconnect() {
    await wallet?.provider?.disconnect?.().catch?.(() => {})
    setWallet(null)
    setQuote({ status: 'idle', data: null, error: '' })
  }

  function resumeLastTransfer() {
    const saved = loadPersistedTransfer(environment)
    if (!saved) {
      window.alert('No saved transfer found in this browser. After a partial transfer you can retry from here.')
      return
    }
    const state = saved.result?.state || saved.summary?.state
    const steps = saved.result?.steps || saved.summary?.steps || []
    if (state === 'success') {
      setTransfer({
        open: true,
        phase: 'success',
        error: '',
        result: { ...saved.result, steps },
        canRetry: false,
      })
      return
    }
    if (saved.retryable) {
      setTransfer({
        open: true,
        phase: 'error',
        error: 'Incomplete transfer restored. Connect the same source wallet, then retry from the last step.',
        result: saved.result,
        canRetry: true,
      })
      return
    }
    setTransfer({
      open: true,
      phase: 'error',
      error: saved.legacy
        ? 'This browser only has a summary of the last transfer (not enough data to auto-retry). Use the explorer links below, or start a new transfer.'
        : 'Saved transfer cannot be auto-retried. Inspect explorer links or start a new transfer.',
      result: { steps, state, amount: saved.summary?.amount || saved.result?.amount },
      canRetry: false,
    })
  }

  function primaryAction() {
    if (!wallet) return setWalletModal(true)
    if (amountError || recipientError || balanceTooLow) return
    if (!quote.data) return fetchQuote()
    setTransfer({ open: true, phase: 'ready', error: '', result: null, canRetry: false })
  }

  const eta = useMemo(
    () => (speed === 'fast' ? (destination.family === 'solana' ? '~8 seconds' : '< 20 seconds') : destination.eta),
    [speed, destination],
  )

  const feeLabel = quote.data
    ? (feeBreakdown.total !== '0' ? `${feeBreakdown.total} USDC` : '0 USDC')
    : '—'

  const balanceLabel = !wallet
    ? '—'
    : balance.status === 'loading'
      ? '…'
      : balance.status === 'ready' && balance.value != null
        ? balance.value
        : '—'

  const formBlocked = Boolean(
    wallet && (amountError || recipientError || balanceTooLow || quote.status === 'loading'),
  )

  return (
    <div className="bridge-card" id="bridge">
      <div className="card-topline">
        <div className="card-title">
          <span className="bridge-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 14c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M3 14h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M6 14v4M10 14v4M14 14v4M18 14v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1>Transfer USDC</h1>
            <p className="card-sub">Native USDC across chains via Circle CCTP.</p>
          </div>
        </div>
        <div className="card-actions">
          <button type="button" className="ghost-btn" onClick={resumeLastTransfer}>
            Resume transfer
          </button>
          <div className="env-pills">
            {Object.entries(ENVIRONMENT_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`env-pill ${environment === key ? `active ${key}` : ''}`}
                onClick={() => changeEnvironment(key)}
                aria-pressed={environment === key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {environment === 'mainnet' && publicSolanaRpc && (
        <div className="rpc-banner" role="status">
          <Info size={14} />
          <span>
            Mainnet is using a public Solana RPC. Set <code>VITE_SOLANA_MAINNET_RPC</code> for production reliability.
          </span>
        </div>
      )}

      <div className="chain-grid">
        <ChainSelect chains={chains} label="Source Chain" value={sourceId} otherValue={destinationId} onChange={setSource} />
        <button className="swap-button" onClick={swap} aria-label="Swap chains">
          <ArrowLeftRight size={15} />
        </button>
        <ChainSelect chains={chains} label="Destination Chain" value={destinationId} otherValue={sourceId} onChange={setDestinationId} />
      </div>

      <div className="amount-panel">
        <span className="field-label">Amount</span>
        <div className="amount-row">
          <span className="asset-pill">
            <UsdcMark />
            USDC
          </span>
          <div className="amount-input-wrap">
            <input
              value={amount}
              onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
              inputMode="decimal"
              placeholder="0.0"
              aria-label="USDC amount"
            />
            <span className="balance-hint">
              Balance: {balanceLabel}
              {wallet && balance.status === 'ready' && balance.value != null && (
                <button
                  type="button"
                  className="max-amount"
                  onClick={() => setAmount(sanitizeAmountInput(balance.value))}
                >
                  Max
                </button>
              )}
            </span>
          </div>
        </div>
        {amount && amountError && <small className="field-error">{amountError}</small>}
        {balanceTooLow && <small className="field-error">Amount exceeds USDC balance</small>}
      </div>

      <div className="recipient-panel">
        <div className="amount-meta">
          <span className="field-label">Recipient on {destination.name}</span>
          {wallet && source.family === destination.family && (
            <button type="button" className="use-wallet" onClick={() => setRecipient(wallet.address)}>Use wallet</button>
          )}
        </div>
        <input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value.trim())}
          placeholder={destination.family === 'evm' ? '0x…' : 'Solana address…'}
          aria-label="Destination recipient address"
          spellCheck="false"
        />
        {recipient && recipientError && <small className="field-error">{recipientError}</small>}
      </div>

      <div className="meta-row">
        <div className="info-pills">
          <span className="info-pill">Fee: {feeLabel}</span>
          {quote.data && feeBreakdown.forwarder !== '0' && (
            <span className="info-pill soft">Orbit: {feeBreakdown.forwarder}</span>
          )}
          {quote.data && feeBreakdown.protocol !== '0' && (
            <span className="info-pill soft">CCTP: {feeBreakdown.protocol}</span>
          )}
          <span className="info-pill">ETA: {eta}</span>
          <span className="info-pill">CCTP v2</span>
          {receive != null && (
            <span className="info-pill soft">Receive: {receive}</span>
          )}
        </div>
        <label className={`fast-toggle ${!source.supportsFast ? 'disabled' : ''}`}>
          <span>Fast Transfer</span>
          <button
            type="button"
            role="switch"
            aria-checked={speed === 'fast'}
            disabled={!source.supportsFast}
            className={speed === 'fast' ? 'on' : ''}
            onClick={() => setSpeed(speed === 'fast' ? 'standard' : 'fast')}
          >
            <i />
          </button>
        </label>
      </div>

      {quote.error && <div className="error-message quote-error"><Info size={14} /><span>{quote.error}</span></div>}
      {wallet && (
        <div className="connected-row">
          <span><Wallet size={14} />{shortAddress(wallet.address)}</span>
          <button type="button" onClick={disconnect}>Disconnect</button>
        </div>
      )}

      <button
        className="primary-button"
        onClick={primaryAction}
        disabled={formBlocked}
      >
        {quote.status === 'loading' && <LoaderCircle className="spin" size={16} />}
        {!wallet
          ? 'Connect Wallet'
          : amountError
            ? (amount ? 'Invalid amount' : 'Enter amount')
            : recipientError
              ? 'Invalid recipient'
              : balanceTooLow
                ? 'Insufficient USDC'
                : quote.status === 'loading'
                  ? 'Quoting…'
                  : quote.data
                    ? 'Review transfer'
                    : 'Get quote'}
      </button>

      {walletModal && (
        <WalletModal
          chain={source}
          environment={environment}
          onClose={() => setWalletModal(false)}
          onConnected={(connected) => { setWallet(connected); setWalletModal(false) }}
        />
      )}
      {transfer.open && (
        <ProgressModal
          environment={environment}
          source={source}
          destination={destination}
          amount={amount || transfer.result?.amount || '0'}
          phase={transfer.phase}
          error={transfer.error}
          result={transfer.result}
          canRetry={transfer.canRetry && Boolean(wallet)}
          onClose={() => setTransfer((current) => ({ ...current, open: false }))}
          onStart={() => startTransfer(false)}
          onRetry={() => startTransfer(true)}
        />
      )}
    </div>
  )
}

function resolveInitialTheme() {
  try {
    const saved = localStorage.getItem('relay:theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0200' : '#f8f9ff')
  try {
    localStorage.setItem('relay:theme', theme)
  } catch { /* ignore */ }
}

function App({ environment, setEnvironment }) {
  const chains = useMemo(() => makeChains(environment), [environment])
  const [theme, setTheme] = useState(resolveInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className="app">
      <div className="bg-layer" aria-hidden="true">
        <div className="bg-grid" />
      </div>

      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark" aria-hidden="true" />
          Relay
        </a>
        <div className="topbar-right">
          <a
            className="topbar-link"
            href="https://developers.circle.com/cctp"
            target="_blank"
            rel="noreferrer"
          >
            Docs <ExternalLink size={12} />
          </a>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main>
        <BridgeCard environment={environment} onEnvironmentChange={setEnvironment} chains={chains} />
        <p className="footnote">No interface fee. Gas and CCTP network fees still apply.</p>

        <section className="faq" aria-label="Frequently asked questions">
          <h2>FAQ</h2>
          {FAQ_ITEMS.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-links">
          <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer">
            Circle CCTP <ExternalLink size={11} />
          </a>
          <a href="https://developers.circle.com/cctp/cctp-supported-blockchains" target="_blank" rel="noreferrer">
            Supported chains <ExternalLink size={11} />
          </a>
          <a href="https://github.com/SHLE1/CCTP" target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={11} />
          </a>
        </div>
        <p className="footer-note">
          Relay · {chains.length} chains · Independent UI, not affiliated with Circle.
        </p>
      </footer>
    </div>
  )
}

function RelayRoot() {
  const [environment, setEnvironment] = useState(() => {
    const saved = localStorage.getItem('relay:environment')
    return saved === 'mainnet' || saved === 'testnet' ? saved : 'testnet'
  })
  const solanaEndpoint = useMemo(() => getSolanaRpcEndpoint(environment), [environment])

  return (
    <ConnectionProvider endpoint={solanaEndpoint}>
      <WalletProvider wallets={[]} autoConnect={false} localStorageKey="relay:solana-wallet">
        <WalletModalProvider>
          <App environment={environment} setEnvironment={setEnvironment} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')).render(<RelayRoot />)
