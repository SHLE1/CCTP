import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton, WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  ExternalLink,
  Info,
  LoaderCircle,
  Moon,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import {
  QUOTE_TTL_MS,
  assertSourceWalletReady,
  attachEvmWalletListeners,
  checkDestinationGasReadiness,
  checkDestinationReadiness,
  checkSourceGasReadiness,
  connectSourceWallet,
  createTransferDraft,
  estimateTransfer,
  executeTransfer,
  fetchUsdcBalance,
  findChainIdForDefinition,
  friendlyError,
  getDefinition,
  getSolanaRpcEndpoint,
  isAmountGreaterThanFee,
  isDestinationWalletCompatibleWithResult,
  isRetryableBridgeResult,
  isQuoteFresh,
  isTransferStorageAvailable,
  isWalletCompatibleWithResult,
  loadTransferHistory,
  loadPersistedTransfer,
  mergeBridgeEventIntoResult,
  parseUsdcToMicro,
  persistTransfer,
  quoteInputKey,
  quoteFeeBreakdown,
  retryTransfer,
  safeExplorerUrl,
  sanitizeAmountInput,
  subtractUsdcAmounts,
  subscribeEvmProviders,
  supportsFastTransfer,
  usesPublicSolanaRpc,
  validateAmount,
  validateRecipient,
  validateTransferEstimate,
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
    a: 'USDC is burned on the source chain, Circle attests the burn, then native USDC is minted on the destination. Self-claim lets your destination wallet submit the mint; Orbit can submit it automatically for a quoted USDC fee.',
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
    a: 'This interface does not charge an extra fee. Self-claim has no Orbit fee but requires destination-chain gas. Fast Transfer may include a CCTP fee. Orbit automatic minting adds a quoted Forwarding Service fee.',
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

function WalletMark({ name, icon }) {
  const [broken, setBroken] = useState(false)
  const label = (name || '?').slice(0, 1).toUpperCase()
  if (broken || !icon) {
    return <span className="wallet-mark fallback">{label}</span>
  }
  return (
    <img
      className="wallet-mark"
      src={icon}
      alt=""
      width={36}
      height={36}
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
  const { wallet, wallets, connected, connecting, publicKey, connect } = useWallet()
  const [message, setMessage] = useState('')
  const [preparing, setPreparing] = useState(false)
  const handledConnection = useRef('')

  useEffect(() => {
    if (!wallet?.adapter || connected || connecting) return
    setMessage('')
    connect().catch((error) => setMessage(friendlyError(error)))
  }, [connect, connected, connecting, wallet])

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
  const [connectingProvider, setConnectingProvider] = useState('')
  const [message, setMessage] = useState('')
  const [evmProviders, setEvmProviders] = useState([])

  useEffect(() => {
    if (chain.family !== 'evm') return undefined
    setEvmProviders([])
    return subscribeEvmProviders((entry) => {
      setEvmProviders((current) => (
        current.some((item) => item.info.uuid === entry.info.uuid || item.provider === entry.provider)
          ? current
          : [...current, entry]
      ))
    })
  }, [chain.family])

  async function connect(entry) {
    setConnectingProvider(entry.info.uuid)
    setMessage('')
    try {
      const connected = await connectSourceWallet(environment, chain.id, entry.provider)
      onConnected({ ...connected, walletName: entry.info.name })
    } catch (error) {
      setMessage(friendlyError(error))
    } finally {
      setConnectingProvider('')
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
            {evmProviders.map((entry) => (
              <button
                className="wallet-option"
                key={entry.info.uuid}
                onClick={() => connect(entry)}
                disabled={Boolean(connectingProvider)}
              >
                <WalletMark name={entry.info.name} icon={entry.info.icon} />
                <span>
                  <strong>
                    {connectingProvider === entry.info.uuid ? 'Waiting for wallet…' : entry.info.name}
                  </strong>
                  <small>{entry.info.rdns || 'EIP-1193 wallet'}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {!evmProviders.length && (
              <p className="hint">No EVM wallet detected. Install or unlock MetaMask, Rabby, or Coinbase Wallet.</p>
            )}
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

const PHASE_HEADING = {
  ready: 'Confirm transfer',
  approve: 'Approve in wallet',
  burn: 'Burning USDC',
  attest: 'Waiting for attestation',
  mint: 'Minting on destination',
  success: 'Transfer complete',
  error: 'Needs attention',
}

function ProgressModal({
  environment,
  source,
  destination,
  amount,
  speed,
  settlementMode,
  phase,
  error,
  warning,
  result,
  canRetry,
  retryBlockedReason,
  sourceAddress,
  destinationSignerAddress,
  recipient,
  feeCap,
  receive,
  routeVerified,
  onClose,
  onStart,
  onRetry,
}) {
  const busy = ['approve', 'burn', 'attest', 'mint'].includes(phase)
  const phaseIndex = PHASE_INDEX[phase] ?? 0
  const totalSteps = 4
  const displayStep = phase === 'success' ? totalSteps : Math.min(phaseIndex + 1, totalSteps)
  const progressPct = phase === 'success'
    ? 100
    : busy
      ? Math.round((phaseIndex / totalSteps) * 100 + (100 / totalSteps) * 0.45)
      : 0
  const steps = [
    {
      title: 'Approve',
      detail: `Confirm in ${source.family === 'evm' ? 'EVM' : 'Solana'} wallet`,
      activeDetail: `Waiting for ${source.family === 'evm' ? 'EVM' : 'Solana'} wallet confirmation`,
    },
    {
      title: `Burn ${amount || '0'} USDC`,
      detail: `On ${source.name}`,
      activeDetail: `Confirm burn on ${source.name}`,
    },
    {
      title: 'Attestation',
      detail: 'Circle signed message',
      activeDetail: 'Circle is signing the burn message',
    },
    {
      title: 'Mint',
      detail: `Native USDC on ${destination.name}`,
      activeDetail: `Minting native USDC on ${destination.name}`,
    },
  ]
  const transactionSteps = (result?.steps || []).filter((item) => item.txHash || item.explorerUrl)
  const heading = PHASE_HEADING[phase] || 'Confirm transfer'
  const stepStatusLabel = busy
    ? `Step ${displayStep} of ${totalSteps}`
    : phase === 'success'
      ? 'All steps done'
      : phase === 'error'
        ? 'Paused'
        : `${totalSteps} steps`

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
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="progress-modal-title">
      <button className="modal-backdrop" onClick={busy ? undefined : onClose} aria-label="Close transfer dialog" disabled={busy} />
      <div className="sheet progress-sheet">
        <div className="sheet-head">
          <div className="sheet-head-copy">
            <h3 id="progress-modal-title">{heading}</h3>
            {(busy || phase === 'success' || phase === 'error') && (
              <p className="step-status-label">{stepStatusLabel}</p>
            )}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        {(busy || phase === 'success') && (
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Transfer progress ${progressPct}%`}
          >
            <span className="progress-track-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        {routeVerified
          ? (
            <div className="route-summary">
              <ChainMark chain={source} />
              <span className="route-line" />
              <ChainMark chain={destination} />
              <strong>{amount || '0'} USDC</strong>
            </div>
          )
          : (
            <div className="route-summary unresolved">
              <strong>{amount || '0'} USDC · saved route unavailable</strong>
            </div>
          )}
        {phase === 'ready' && (
          <div className="confirm-details">
            <span>Source wallet</span>
            <code>{sourceAddress}</code>
            <span>Recipient</span>
            <code>{recipient}</code>
            <span>Completion</span>
            <strong>{settlementMode === 'orbit' ? 'Orbit automatic mint' : 'Self-claim'}</strong>
            {settlementMode !== 'orbit' && (
              <>
                <span>Claim wallet</span>
                <code>{destinationSignerAddress}</code>
              </>
            )}
            <span>Maximum USDC fees</span>
            <strong>{feeCap} USDC</strong>
            <span>Transfer mode</span>
            <strong>{speed === 'fast' ? 'Fast' : 'Standard'}</strong>
            <span>Expected receive</span>
            <strong>{receive} USDC</strong>
          </div>
        )}
        <ol className="steps" aria-label="Transfer steps">
          {steps.map((item, index) => {
            const complete = phase === 'success' || index < phaseIndex
            const active = busy && index === phaseIndex
            const detail = complete ? 'Done' : active ? item.activeDetail : item.detail
            const stateClass = complete ? 'complete' : active ? 'active' : 'pending'
            return (
              <li className={`step ${stateClass}`} key={item.title} aria-current={active ? 'step' : undefined}>
                {index < steps.length - 1 && <span className={`step-rail ${complete ? 'filled' : ''}`} aria-hidden="true" />}
                <span className="step-icon" aria-hidden="true">
                  {complete
                    ? <Check size={15} strokeWidth={2.5} />
                    : active
                      ? <LoaderCircle className="spin" size={15} />
                      : <span className="step-num">{index + 1}</span>}
                </span>
                <span className="step-copy">
                  <strong>{item.title}</strong>
                  <small>{detail}</small>
                </span>
                {active && <span className="step-badge">Now</span>}
                {complete && <span className="step-badge done">Done</span>}
              </li>
            )
          })}
        </ol>
        {transactionSteps.length > 0 && (
          <div className="tx-links">
            {transactionSteps.map((item, index) => {
              const explorerUrl = safeExplorerUrl(item.explorerUrl)
              return explorerUrl
                ? <a href={explorerUrl} target="_blank" rel="noreferrer" key={`${item.name}-${index}`}>{item.name}<ExternalLink size={12} /></a>
                : <span key={`${item.name}-${index}`}>{item.name}: {shortAddress(item.txHash)}</span>
            })}
          </div>
        )}
        {phase === 'ready' && (
          <div className={`real-warning ${environment === 'mainnet' ? 'mainnet-warning' : ''}`}>
            <Info size={15} />
            <span>
              {environment === 'mainnet'
                ? <><strong>Mainnet.</strong> Real USDC will be burned. Check network, address, amount, and completion mode. Keep this tab open until mint completes.</>
                : <><strong>Testnet.</strong> Test USDC will be burned and minted with the selected completion mode. Keep this tab open until mint completes.</>}
            </span>
          </div>
        )}
        {busy && (
          <p className="progress-hint">Do not close this tab while attestation or mint is running. Progress is saved so you can resume if something fails.</p>
        )}
        {error && <div className="error-message"><Info size={15} /><span>{error}</span></div>}
        {warning && <div className="real-warning"><Info size={15} /><span>{warning}</span></div>}
        {retryBlockedReason && (
          <div className="error-message"><Info size={15} /><span>{retryBlockedReason}</span></div>
        )}
        <button className="primary-button" onClick={primaryAction} disabled={busy}>
          {busy && <LoaderCircle className="spin" size={16} />}
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}

function BridgeCard({ environment, onEnvironmentChange, chains, resumeRequest = 0 }) {
  const solanaWalletState = useWallet()
  const [sourceId, setSourceId] = useState('base')
  const [destinationId, setDestinationId] = useState('solana')
  const [amount, setAmount] = useState('')
  const [speed, setSpeed] = useState('fast')
  const [settlementMode, setSettlementMode] = useState('manual')
  const [wallet, setWallet] = useState(null)
  const [destinationWallet, setDestinationWallet] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [quote, setQuote] = useState({
    status: 'idle',
    data: null,
    error: '',
    key: '',
    quotedAt: 0,
  })
  const [walletModal, setWalletModal] = useState(null)
  const [transfer, setTransfer] = useState({
    open: false,
    phase: 'ready',
    error: '',
    warning: '',
    result: null,
    canRetry: false,
  })
  const [balance, setBalance] = useState({ status: 'idle', value: null, error: '' })
  const quoteRequestRef = useRef(0)
  const quoteKeyRef = useRef('')
  const activeTransferRef = useRef(null)
  const transferInFlightRef = useRef(false)
  const handledResumeRequestRef = useRef(0)
  const source = findChain(chains, sourceId)
  const destination = findChain(chains, destinationId)
  const useForwarder = settlementMode === 'orbit'
  const claimWallet = useForwarder
    ? null
    : source.family === destination.family
      ? wallet
      : destinationWallet
  const needsDestinationWallet = !useForwarder
    && source.family !== destination.family
    && !destinationWallet
  const amountError = validateAmount(amount)
  const feeBreakdown = quoteFeeBreakdown(quote.data)
  const receive = quote.data && !amountError ? subtractUsdcAmounts(amount, feeBreakdown.total) : null
  const publicSolanaRpc = usesPublicSolanaRpc(environment)
  const solanaRoute = sourceId === 'solana' || destinationId === 'solana'
  const rpcNotReady = environment === 'mainnet' && solanaRoute && publicSolanaRpc
  const currentQuoteKey = quoteInputKey({
    environment,
    sourceId,
    destinationId,
    recipient,
    amount,
    speed,
    walletAddress: wallet?.address,
    settlementMode,
    destinationWalletAddress: claimWallet?.address,
  })
  quoteKeyRef.current = currentQuoteKey
  const quoteIsCurrent = quote.status === 'ready'
    && quote.key === currentQuoteKey
    && isQuoteFresh(quote.quotedAt)
  const feeTooHigh = quoteIsCurrent && !amountError && !isAmountGreaterThanFee(amount, feeBreakdown.total)
  const retrySourceId = transfer.result
    ? findChainIdForDefinition(environment, transfer.result.source?.chain)
    : null
  const resultDestinationId = transfer.result
    ? findChainIdForDefinition(environment, transfer.result.destination?.chain)
    : null
  const retrySourceDefinition = retrySourceId ? getDefinition(environment, retrySourceId) : null
  const retryDestinationDefinition = resultDestinationId
    ? getDefinition(environment, resultDestinationId)
    : null
  const modalSource = retrySourceId ? findChain(chains, retrySourceId) : source
  const modalDestination = resultDestinationId ? findChain(chains, resultDestinationId) : destination
  const routeVerified = !transfer.result || Boolean(retrySourceId && resultDestinationId)
  const retryWalletMatches = Boolean(
    transfer.result
    && wallet
    && retrySourceDefinition
    && isWalletCompatibleWithResult(transfer.result, wallet, retrySourceDefinition),
  )
  const retryUsesForwarder = transfer.result?.destination?.useForwarder === true
  const retryClaimWallet = retryUsesForwarder
    ? null
    : retrySourceDefinition?.type === retryDestinationDefinition?.type
      ? wallet
      : destinationWallet
  const retryDestinationWalletMatches = Boolean(
    retryUsesForwarder
    || (
      transfer.result
      && retryClaimWallet
      && retryDestinationDefinition
      && isDestinationWalletCompatibleWithResult(
        transfer.result,
        retryClaimWallet,
        retryDestinationDefinition,
      )
    ),
  )

  useEffect(() => {
    if (!resumeRequest || handledResumeRequestRef.current === resumeRequest) return
    handledResumeRequestRef.current = resumeRequest
    resumeLastTransfer()
  }, [resumeRequest])

  useEffect(() => {
    quoteRequestRef.current += 1
    setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
  }, [
    environment,
    sourceId,
    destinationId,
    amount,
    speed,
    recipient,
    settlementMode,
    wallet?.address,
    claimWallet?.address,
  ])

  useEffect(() => {
    if (quote.status !== 'ready' || !quote.quotedAt) return undefined
    const remaining = Math.max(0, quote.quotedAt + QUOTE_TTL_MS - Date.now())
    const timer = window.setTimeout(() => {
      setQuote((current) => {
        if (current.status !== 'ready' || current.key !== quote.key) return current
        return {
          status: 'idle',
          data: null,
          error: 'Quote expired before signing. Request a fresh quote.',
          key: '',
          quotedAt: 0,
        }
      })
      setTransfer((current) => (
        current.open && current.phase === 'ready'
          ? {
              ...current,
              phase: 'error',
              error: 'Quote expired before signing. Close this dialog and request a fresh quote.',
            }
          : current
      ))
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [quote.key, quote.quotedAt, quote.status])

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
    fetchUsdcBalance(environment, sourceId, wallet.address, wallet.provider)
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
          setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
          return
        }
        const next = accounts[0]
        if (next?.toLowerCase() !== wallet.address?.toLowerCase()) {
          // Adapter was created for the previous account — force a clean reconnect.
          setWallet(null)
          setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
        }
      },
      onChainChanged: () => {
        if (
          transferInFlightRef.current
          && settlementMode === 'manual'
          && source.family === destination.family
        ) {
          return
        }
        setWallet(null)
        setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
      },
    })
  }, [destination.family, settlementMode, source.family, wallet])

  useEffect(() => {
    if (
      !destinationWallet?.provider
      || destinationWallet.family !== 'evm'
      || source.family === destination.family
    ) return undefined
    return attachEvmWalletListeners(destinationWallet.provider, {
      onAccountsChanged: (accounts) => {
        const next = accounts?.[0]
        if (!next || next.toLowerCase() !== destinationWallet.address?.toLowerCase()) {
          setDestinationWallet(null)
          setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
        }
      },
      onChainChanged: () => {
        setDestinationWallet(null)
        setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
      },
    })
  }, [destination.family, destinationWallet, source.family])

  useEffect(() => {
    if (wallet?.family !== 'solana') return
    const currentAddress = solanaWalletState.publicKey?.toString()
    if (!solanaWalletState.connected || currentAddress !== wallet.address) {
      setWallet(null)
      setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
    }
  }, [solanaWalletState.connected, solanaWalletState.publicKey, wallet])

  useEffect(() => {
    if (destinationWallet?.family !== 'solana') return
    const currentAddress = solanaWalletState.publicKey?.toString()
    if (!solanaWalletState.connected || currentAddress !== destinationWallet.address) {
      setDestinationWallet(null)
      setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
    }
  }, [destinationWallet, solanaWalletState.connected, solanaWalletState.publicKey])

  function swap() {
    setSourceId(destinationId)
    setDestinationId(sourceId)
    setWallet(null)
    setDestinationWallet(null)
    setRecipient('')
  }

  function setSource(value) {
    setSourceId(value)
    setWallet(null)
    setDestinationWallet(null)
  }

  function setDestination(value) {
    setDestinationId(value)
    setDestinationWallet(null)
  }

  async function changeEnvironment(value) {
    if (value === environment) return
    await wallet?.provider?.disconnect?.().catch?.(() => {})
    if (destinationWallet?.provider !== wallet?.provider) {
      await destinationWallet?.provider?.disconnect?.().catch?.(() => {})
    }
    setWallet(null)
    setDestinationWallet(null)
    setRecipient('')
    setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
    setTransfer({
      open: false,
      phase: 'ready',
      error: '',
      warning: '',
      result: null,
      canRetry: false,
    })
    try {
      localStorage.setItem('relay:environment', value)
    } catch { /* environment still changes even when storage is unavailable */ }
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

  const bridgeInput = (maxFee) => ({
    environment,
    sourceId,
    destinationId,
    adapter: wallet.adapter,
    destinationAdapter: claimWallet?.adapter,
    destinationWalletAddress: claimWallet?.address,
    recipient,
    amount,
    speed,
    useForwarder,
    ...(maxFee ? { maxFee } : {}),
  })

  async function fetchQuote() {
    const requestId = ++quoteRequestRef.current
    const requestKey = currentQuoteKey
    const input = bridgeInput()
    setQuote({ status: 'loading', data: null, error: '', key: requestKey, quotedAt: 0 })
    try {
      await checkDestinationReadiness(environment, destinationId, recipient, useForwarder)
        .then((status) => {
          if (!status.ready) throw new Error(status.error)
        })
      const data = await estimateTransfer(input)
      const estimateError = validateTransferEstimate(data, input, wallet.address)
      if (estimateError) throw new Error(estimateError)
      const [sourceGasReadiness, destinationGasReadiness] = await Promise.all([
        checkSourceGasReadiness(environment, sourceId, wallet, data),
        useForwarder
          ? Promise.resolve({ ready: true })
          : checkDestinationGasReadiness(
              environment,
              destinationId,
              claimWallet,
              data,
            ),
      ])
      if (!sourceGasReadiness.ready) throw new Error(sourceGasReadiness.error)
      if (!destinationGasReadiness.ready) throw new Error(destinationGasReadiness.error)
      if (requestId !== quoteRequestRef.current || requestKey !== quoteKeyRef.current) return
      setQuote({
        status: 'ready',
        data,
        error: '',
        key: requestKey,
        quotedAt: Date.now(),
      })
    } catch (error) {
      if (requestId !== quoteRequestRef.current || requestKey !== quoteKeyRef.current) return
      setQuote({
        status: 'error',
        data: null,
        error: friendlyError(error),
        key: requestKey,
        quotedAt: 0,
      })
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
    const updated = mergeBridgeEventIntoResult(activeTransferRef.current, payload)
    if (updated) {
      activeTransferRef.current = updated
      const stored = persistTransfer(updated, environment)
      setTransfer((current) => ({
        ...current,
        ...(next ? { phase: next } : {}),
        result: updated,
        warning: stored
          ? current.warning
          : 'Transfer progress could not be saved. Keep this tab open and copy every transaction link.',
      }))
    } else if (next) {
      setTransfer((current) => ({ ...current, phase: next }))
    }
  }

  async function startTransfer(isRetry = false) {
    if (transferInFlightRef.current) return
    transferInFlightRef.current = true
    setTransfer((current) => ({
      ...current,
      phase: 'approve',
      error: '',
      warning: '',
    }))
    try {
      if (!wallet) throw new Error('Connect the source wallet before starting the transfer.')
      const resultForRetry = isRetry ? transfer.result : null
      const verifiedSourceId = resultForRetry
        ? findChainIdForDefinition(environment, resultForRetry.source?.chain)
        : sourceId
      if (!verifiedSourceId) throw new Error('The transfer source chain could not be verified.')
      await assertSourceWalletReady(environment, verifiedSourceId, wallet)
      if (!isTransferStorageAvailable(environment)) {
        throw new Error('Browser storage is unavailable. Enable site storage before transferring so burn and mint recovery data can be saved.')
      }

      const readinessDestinationId = resultForRetry
        ? findChainIdForDefinition(environment, resultForRetry.destination?.chain)
        : destinationId
      const readinessRecipient = resultForRetry
        ? (resultForRetry.destination?.recipientAddress || resultForRetry.destination?.address)
        : recipient
      const activeUseForwarder = resultForRetry
        ? resultForRetry.destination?.useForwarder === true
        : useForwarder
      const activeClaimWallet = resultForRetry ? retryClaimWallet : claimWallet
      if (!readinessDestinationId || !readinessRecipient) {
        throw new Error('The transfer destination could not be verified.')
      }
      if (!activeUseForwarder && !activeClaimWallet) {
        throw new Error('Connect the destination claim wallet before continuing this Self-claim transfer.')
      }
      if (
        !activeUseForwarder
        && getDefinition(environment, verifiedSourceId).type
          !== getDefinition(environment, readinessDestinationId).type
      ) {
        await assertSourceWalletReady(
          environment,
          readinessDestinationId,
          activeClaimWallet,
          'destination',
        )
      }
      const readiness = await checkDestinationReadiness(
        environment,
        readinessDestinationId,
        readinessRecipient,
        activeUseForwarder,
      )
      if (!readiness.ready) throw new Error(readiness.error)

      let result
      if (isRetry) {
        if (!resultForRetry || !isRetryableBridgeResult(resultForRetry)) {
          throw new Error('The saved transfer is not retryable.')
        }
        activeTransferRef.current = {
          ...resultForRetry,
          steps: [...(resultForRetry.steps || [])],
        }
        if (!persistTransfer(activeTransferRef.current, environment)) {
          throw new Error('The recovery snapshot could not be saved. Retry was not started.')
        }
        result = await retryTransfer(
          resultForRetry,
          wallet,
          activeClaimWallet,
          environment,
          handleBridgeEvent,
        )
      } else {
        const quoteStillFresh = quote.status === 'ready'
          && quote.key === currentQuoteKey
          && isQuoteFresh(quote.quotedAt)
        if (!quoteStillFresh) {
          throw new Error('The quote expired or no longer matches the transfer. Request a fresh quote.')
        }
        const estimateError = validateTransferEstimate(
          quote.data,
          bridgeInput(),
          wallet.address,
        )
        if (estimateError) throw new Error(estimateError)
        if (!isAmountGreaterThanFee(amount, feeBreakdown.total)) {
          throw new Error('The transfer amount must be greater than all quoted USDC fees.')
        }
        const refreshedEstimate = await estimateTransfer(bridgeInput())
        const refreshedEstimateError = validateTransferEstimate(
          refreshedEstimate,
          bridgeInput(),
          wallet.address,
        )
        if (refreshedEstimateError) throw new Error(refreshedEstimateError)
        const refreshedFeeBreakdown = quoteFeeBreakdown(refreshedEstimate)
        setQuote({
          status: 'ready',
          data: refreshedEstimate,
          error: '',
          key: currentQuoteKey,
          quotedAt: Date.now(),
        })
        if (
          parseUsdcToMicro(refreshedFeeBreakdown.total)
          !== parseUsdcToMicro(feeBreakdown.total)
        ) {
          throw new Error(
            `USDC fees changed from ${feeBreakdown.total} to ${refreshedFeeBreakdown.total}. Close this dialog and review the refreshed quote before signing.`,
          )
        }
        if (!isAmountGreaterThanFee(amount, refreshedFeeBreakdown.total)) {
          throw new Error('The refreshed fees leave no positive destination amount.')
        }
        const [latestBalance, sourceGasReadiness, destinationGasReadiness] = await Promise.all([
          fetchUsdcBalance(environment, verifiedSourceId, wallet.address, wallet.provider),
          checkSourceGasReadiness(environment, verifiedSourceId, wallet, refreshedEstimate),
          useForwarder
            ? Promise.resolve({ ready: true })
            : checkDestinationGasReadiness(
                environment,
                destinationId,
                claimWallet,
                refreshedEstimate,
              ),
        ])
        if (latestBalance == null) {
          throw new Error('The source USDC balance could not be verified immediately before signing.')
        }
        setBalance({ status: 'ready', value: latestBalance, error: '' })
        if (parseUsdcToMicro(amount) > parseUsdcToMicro(latestBalance)) {
          throw new Error('The source USDC balance changed and is now below the transfer amount.')
        }
        if (!sourceGasReadiness.ready) throw new Error(sourceGasReadiness.error)
        if (!destinationGasReadiness.ready) throw new Error(destinationGasReadiness.error)

        await assertSourceWalletReady(environment, verifiedSourceId, wallet)
        const input = bridgeInput(refreshedFeeBreakdown.total)
        activeTransferRef.current = createTransferDraft(input, wallet.address)
        if (!persistTransfer(activeTransferRef.current, environment)) {
          throw new Error('The recovery snapshot could not be saved. Transfer was not started.')
        }
        result = await executeTransfer(input, handleBridgeEvent)
      }

      const stored = persistTransfer(result, environment)
      const failed = result.state !== 'success'
      const failedStep = [...(result.steps || [])].reverse().find((item) => item.state === 'error')
      setTransfer((current) => ({
        ...current,
        result,
        canRetry: failed && isRetryableBridgeResult(result),
        phase: failed ? 'error' : 'success',
        warning: stored
          ? current.warning
          : 'The transfer completed, but its recovery record could not be saved. Copy the transaction links now.',
        error: failed
          ? (failedStep?.errorMessage || 'Transfer incomplete. You can retry from the last step.')
          : '',
      }))
      if (wallet?.address) {
        fetchUsdcBalance(environment, sourceId, wallet.address)
          .then((value) => setBalance({ status: 'ready', value, error: '' }))
          .catch((error) => setBalance({
            status: 'error',
            value: null,
            error: friendlyError(error),
          }))
      }
    } catch (error) {
      const partialResult = activeTransferRef.current || transfer.result
      if (partialResult) persistTransfer(partialResult, environment)
      setTransfer((current) => ({
        ...current,
        phase: 'error',
        error: friendlyError(error),
        result: partialResult || current.result,
        canRetry: isRetryableBridgeResult(partialResult || current.result),
      }))
    } finally {
      activeTransferRef.current = null
      transferInFlightRef.current = false
      if (!useForwarder && source.family === destination.family && wallet?.family === 'evm') {
        setWallet(null)
        setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
      }
    }
  }

  async function disconnect() {
    await wallet?.provider?.disconnect?.().catch?.(() => {})
    setWallet(null)
    setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
  }

  async function disconnectDestination() {
    if (destinationWallet?.provider !== wallet?.provider) {
      await destinationWallet?.provider?.disconnect?.().catch?.(() => {})
    }
    setDestinationWallet(null)
    setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
  }

  function resumeLastTransfer() {
    const saved = loadPersistedTransfer(environment)
    if (!saved) {
      window.alert('No saved transfer found in this browser. After a partial transfer you can retry from here.')
      return
    }
    const state = saved.result?.state || saved.summary?.state
    const steps = saved.result?.steps || saved.summary?.steps || []
    if (saved.legacy) {
      setTransfer({
        open: true,
        phase: 'error',
        error: 'This browser only has a summary of the last transfer (not enough data to verify its route or auto-retry). Use the explorer links below, or start a new transfer.',
        warning: '',
        result: { steps, state, amount: saved.summary?.amount || saved.result?.amount },
        canRetry: false,
      })
      return
    }
    const restoredSourceId = findChainIdForDefinition(environment, saved.result?.source?.chain)
    const restoredDestinationId = findChainIdForDefinition(environment, saved.result?.destination?.chain)
    if (restoredSourceId && restoredDestinationId) {
      const restoredRecipient = saved.result.destination?.recipientAddress
        || saved.result.destination?.address
        || ''
      const restoredSpeed = saved.result.config?.transferSpeed === 'SLOW' ? 'standard' : 'fast'
      setSourceId(restoredSourceId)
      setDestinationId(restoredDestinationId)
      setAmount(String(saved.result.amount || ''))
      setRecipient(restoredRecipient)
      setSpeed(restoredSpeed)
      setSettlementMode(saved.result.destination?.useForwarder === true ? 'orbit' : 'manual')
      setQuote({ status: 'idle', data: null, error: '', key: '', quotedAt: 0 })
      const expectedSource = getDefinition(environment, restoredSourceId)
      if (wallet && !isWalletCompatibleWithResult(saved.result, wallet, expectedSource)) {
        setWallet(null)
      }
      const expectedDestination = getDefinition(environment, restoredDestinationId)
      if (
        destinationWallet
        && !isDestinationWalletCompatibleWithResult(
          saved.result,
          destinationWallet,
          expectedDestination,
        )
      ) {
        setDestinationWallet(null)
      }
    }
    if (state === 'success') {
      setTransfer({
        open: true,
        phase: 'success',
        error: '',
        warning: '',
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
        warning: '',
        result: saved.result,
        canRetry: Boolean(restoredSourceId && restoredDestinationId),
      })
      return
    }
    setTransfer({
      open: true,
      phase: 'error',
      error: 'Saved transfer cannot be auto-retried. Inspect explorer links or start a new transfer.',
      warning: '',
      result: { steps, state, amount: saved.summary?.amount || saved.result?.amount },
      canRetry: false,
    })
  }

  function primaryAction() {
    if (rpcNotReady) return
    if (!wallet) return setWalletModal('source')
    if (needsDestinationWallet) return setWalletModal('destination')
    if (balance.status !== 'ready' || balance.value == null) return
    if (amountError || recipientError || balanceTooLow) return
    if (
      quote.status !== 'ready'
      || quote.key !== currentQuoteKey
      || !isQuoteFresh(quote.quotedAt)
    ) {
      return fetchQuote()
    }
    if (feeTooHigh) return
    if (!isTransferStorageAvailable(environment)) {
      setQuote({
        status: 'error',
        data: null,
        error: 'Browser storage is unavailable. Enable site storage before transferring.',
        key: currentQuoteKey,
        quotedAt: 0,
      })
      return
    }
    setTransfer({
      open: true,
      phase: 'ready',
      error: '',
      warning: '',
      result: null,
      canRetry: false,
    })
  }

  const eta = useMemo(
    () => (speed === 'fast' ? (destination.family === 'solana' ? '~8 seconds' : '< 20 seconds') : source.eta),
    [speed, destination, source],
  )

  const feeLabel = quote.data
    ? (feeBreakdown.total !== '0' ? `${feeBreakdown.total} USDC` : '0 USDC')
    : '—'
  const destinationGasEstimate = !useForwarder
    ? feeBreakdown.gasFees.find((item) => (
        item.blockchain === getDefinition(environment, destinationId).chain
        && item.fees?.fee != null
      ))
    : null

  const balanceLabel = !wallet
    ? '—'
    : balance.status === 'loading'
      ? '…'
      : balance.status === 'ready' && balance.value != null
        ? balance.value
        : '—'

  const formBlocked = Boolean(
    rpcNotReady
    || (wallet && !needsDestinationWallet && (
      amountError
      || recipientError
      || balance.status !== 'ready'
      || balance.value == null
      || balanceTooLow
      || feeTooHigh
      || quote.status === 'loading'
    )),
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

      {rpcNotReady && (
        <div className="rpc-banner blocking" role="alert">
          <Info size={14} />
          <span>
            Mainnet Solana transfers are disabled while using a public RPC. Set <code>VITE_SOLANA_MAINNET_RPC</code> and restart the app.
          </span>
        </div>
      )}

      <div className="chain-grid">
        <ChainSelect chains={chains} label="Source Chain" value={sourceId} otherValue={destinationId} onChange={setSource} />
        <button className="swap-button" onClick={swap} aria-label="Swap chains">
          <ArrowLeftRight size={15} />
        </button>
        <ChainSelect chains={chains} label="Destination Chain" value={destinationId} otherValue={sourceId} onChange={setDestination} />
      </div>

      <div className="settlement-panel" role="radiogroup" aria-label="Mint completion mode">
        <button
          type="button"
          role="radio"
          aria-checked={settlementMode === 'manual'}
          className={settlementMode === 'manual' ? 'active' : ''}
          onClick={() => setSettlementMode('manual')}
        >
          <span>
            <strong>Self-claim</strong>
            <small>0 Orbit fee · destination wallet pays gas</small>
          </span>
          <Check size={16} />
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={settlementMode === 'orbit'}
          className={settlementMode === 'orbit' ? 'active' : ''}
          onClick={() => setSettlementMode('orbit')}
        >
          <span>
            <strong>Orbit automatic</strong>
            <small>One source wallet · quoted USDC fee</small>
          </span>
          <Check size={16} />
        </button>
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
        {balance.status === 'error' && <small className="field-error">{balance.error || 'USDC balance is unavailable'}</small>}
        {balanceTooLow && <small className="field-error">Amount exceeds USDC balance</small>}
        {feeTooHigh && <small className="field-error">Amount must be greater than all quoted USDC fees</small>}
      </div>

      <div className="recipient-panel">
        <div className="amount-meta">
          <span className="field-label">Recipient on {destination.name}</span>
          {(claimWallet || (useForwarder && wallet && source.family === destination.family)) && (
            <button
              type="button"
              className="use-wallet"
              onClick={() => setRecipient((claimWallet || wallet).address)}
            >
              Use wallet
            </button>
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
          {destinationGasEstimate && (
            <span className="info-pill soft">
              Claim gas: {destinationGasEstimate.fees.fee} {destinationGasEstimate.token}
            </span>
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
          <span><Wallet size={14} />Source · {shortAddress(wallet.address)}</span>
          <button type="button" onClick={disconnect}>Disconnect</button>
        </div>
      )}
      {!useForwarder && source.family !== destination.family && destinationWallet && (
        <div className="connected-row">
          <span><Wallet size={14} />Claim · {shortAddress(destinationWallet.address)}</span>
          <button type="button" onClick={disconnectDestination}>Disconnect</button>
        </div>
      )}

      <button
        className="primary-button"
        onClick={primaryAction}
        disabled={formBlocked}
      >
        {quote.status === 'loading' && <LoaderCircle className="spin" size={16} />}
        {rpcNotReady
          ? 'Configure Solana RPC'
          : !wallet
            ? 'Connect source wallet'
            : needsDestinationWallet
              ? `Connect ${destination.name} claim wallet`
            : amountError
              ? (amount ? 'Invalid amount' : 'Enter amount')
              : recipientError
                ? 'Invalid recipient'
                : balance.status === 'loading'
                  ? 'Checking balance…'
                  : balance.status === 'error'
                    ? 'Balance unavailable'
                    : balance.status !== 'ready'
                      ? 'Checking balance…'
                      : balanceTooLow
                        ? 'Insufficient USDC'
                        : feeTooHigh
                          ? 'Amount below fees'
                          : quote.status === 'loading'
                            ? 'Quoting…'
                            : quote.data
                              ? 'Review transfer'
                              : 'Get quote'}
      </button>

      {walletModal && (
        <WalletModal
          chain={walletModal === 'destination' ? destination : source}
          environment={environment}
          onClose={() => setWalletModal(false)}
          onConnected={(connected) => {
            if (walletModal === 'destination') setDestinationWallet(connected)
            else setWallet(connected)
            setWalletModal(null)
          }}
        />
      )}
      {transfer.open && (
        <ProgressModal
          environment={environment}
          source={modalSource}
          destination={modalDestination}
          amount={transfer.result?.amount || amount || '0'}
          speed={speed}
          settlementMode={transfer.result
            ? (transfer.result.destination?.useForwarder === true ? 'orbit' : 'manual')
            : settlementMode}
          phase={transfer.phase}
          error={transfer.error}
          warning={transfer.warning}
          result={transfer.result}
          canRetry={transfer.canRetry && retryWalletMatches && retryDestinationWalletMatches}
          retryBlockedReason={transfer.canRetry && (!retryWalletMatches || !retryDestinationWalletMatches)
            ? 'Close this dialog, connect the exact source and destination claim wallets shown in the saved transfer, then open Resume transfer again.'
            : ''}
          sourceAddress={transfer.result?.source?.address || wallet?.address || ''}
          destinationSignerAddress={transfer.result?.destination?.address || claimWallet?.address || ''}
          recipient={transfer.result?.destination?.recipientAddress || recipient}
          feeCap={feeBreakdown.total}
          receive={receive || '0'}
          routeVerified={routeVerified}
          onClose={() => setTransfer((current) => ({ ...current, open: false }))}
          onStart={() => startTransfer(false)}
          onRetry={() => startTransfer(true)}
        />
      )}
    </div>
  )
}

function formatHistoryDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '')
}

function HistoryStatus({ state }) {
  if (state === 'success') {
    return <span className="history-status success"><CircleCheck size={17} />Fulfilled</span>
  }
  if (state === 'error') {
    return <span className="history-status error"><CircleAlert size={17} />Needs attention</span>
  }
  return <span className="history-status pending"><Clock3 size={17} />Processing</span>
}

function HistoryChain({ chains, chainId }) {
  const chain = findChain(chains, chainId) || {
    id: chainId,
    name: chainId || 'Unknown',
    color: '#7a6e6d',
  }
  return (
    <span className="history-chain">
      <ChainMark chain={chain} small />
      <span>{chain.name}</span>
    </span>
  )
}

function TransactionLinks({ links }) {
  const safeLinks = (links || []).filter((item) => safeExplorerUrl(item?.url))
  if (!safeLinks.length) return <span className="history-action-muted">Pending</span>
  if (safeLinks.length === 1) {
    return (
      <a
        className="history-action"
        href={safeExplorerUrl(safeLinks[0].url)}
        target="_blank"
        rel="noreferrer"
      >
        View transaction <ExternalLink size={13} />
      </a>
    )
  }
  return (
    <details className="history-action-menu">
      <summary>View transactions <ChevronRight size={13} /></summary>
      <div>
        {safeLinks.map((item, index) => (
          <a
            href={safeExplorerUrl(item.url)}
            target="_blank"
            rel="noreferrer"
            key={`${item.url}-${index}`}
          >
            {item.label || `Transaction ${index + 1}`}
            <ExternalLink size={12} />
          </a>
        ))}
      </div>
    </details>
  )
}

function TransferHistory({ environment, chains, onResume }) {
  const [records, setRecords] = useState(() => loadTransferHistory(environment))

  useEffect(() => {
    const refresh = (event) => {
      if (!event?.detail?.environment || event.detail.environment === environment) {
        setRecords(loadTransferHistory(environment))
      }
    }
    refresh()
    window.addEventListener('relay:transfer-history-updated', refresh)
    return () => window.removeEventListener('relay:transfer-history-updated', refresh)
  }, [environment])

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="section-kicker">{ENVIRONMENT_LABELS[environment]} activity</p>
          <h2 id="history-title">Recent transfers</h2>
        </div>
        <span>Saved in this browser</span>
      </div>

      {records.length ? (
        <div className="history-table" role="table" aria-label={`${ENVIRONMENT_LABELS[environment]} transfer history`}>
          <div className="history-table-head" role="row">
            <span role="columnheader">Time</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">Destination</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          <div className="history-table-body" role="rowgroup">
            {records.map((record, index) => (
              <div className="history-row" role="row" key={record.id}>
                <time role="cell" dateTime={record.createdAt} data-label="Time">
                  {formatHistoryDate(record.createdAt)}
                </time>
                <span role="cell" data-label="Source">
                  <HistoryChain chains={chains} chainId={record.sourceId} />
                </span>
                <span role="cell" data-label="Destination">
                  <HistoryChain chains={chains} chainId={record.destinationId} />
                </span>
                <span className="history-amount" role="cell" data-label="Amount">
                  {record.amount || '0'}
                  <img src={USDC_ICON} alt="USDC" width="18" height="18" />
                </span>
                <span role="cell" data-label="Status">
                  <HistoryStatus state={record.state} />
                </span>
                <span className="history-actions" role="cell">
                  {index === 0 && record.retryable && (
                    <button type="button" className="history-action secondary" onClick={onResume}>
                      Resume
                    </button>
                  )}
                  <TransactionLinks links={record.explorerLinks} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="history-empty">
          <Clock3 size={21} />
          <div>
            <strong>No transfers yet</strong>
            <p>Your completed and resumable {ENVIRONMENT_LABELS[environment]} transfers will appear here.</p>
          </div>
        </div>
      )}
    </section>
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
  const [resumeRequest, setResumeRequest] = useState(0)

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
        <BridgeCard
          environment={environment}
          onEnvironmentChange={setEnvironment}
          chains={chains}
          resumeRequest={resumeRequest}
        />
        <p className="footnote">No interface fee. Self-claim uses destination gas; Orbit and CCTP fees apply only when quoted.</p>

        <TransferHistory
          environment={environment}
          chains={chains}
          onResume={() => {
            setResumeRequest((current) => current + 1)
            document.getElementById('bridge')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />

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
    try {
      const saved = localStorage.getItem('relay:environment')
      return saved === 'mainnet' || saved === 'testnet' ? saved : 'testnet'
    } catch {
      return 'testnet'
    }
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
