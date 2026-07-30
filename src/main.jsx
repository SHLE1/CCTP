import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton, WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Coins,
  ExternalLink,
  Filter,
  Globe,
  Info,
  LoaderCircle,
  Moon,
  Sun,
  UserRound,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import {
  QUOTE_TTL_MS,
  assertSourceWalletReady,
  attachEvmWalletListeners,
  beginQuoteRefresh,
  canStartTransferFromQuote,
  checkDestinationGasReadiness,
  checkDestinationReadiness,
  checkSourceGasReadiness,
  connectSourceWallet,
  createTransferDraft,
  estimateTransfer,
  executeTransfer,
  executeManualClaim,
  failQuoteRefresh,
  fetchUsdcBalance,
  fetchManualClaim,
  findChainIdForDefinition,
  friendlyError,
  getDefinition,
  formatUsdcFromMicro,
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
  manualClaimBlockReason,
  parseUsdcToMicro,
  persistTransfer,
  repairTransferHistoryRecord,
  quoteInputKey,
  quoteFeeBreakdown,
  resolveAmountFieldError,
  retryTransfer,
  reconcileAlreadyCompletedClaim,
  safeExplorerUrl,
  sanitizeAmountInput,
  shouldAutoQuote,
  subtractUsdcAmounts,
  subscribeEvmProviders,
  supportsFastTransfer,
  supportsForwarderDestination,
  switchConnectedEvmWallet,
  usesPublicSolanaRpc,
  validateAmount,
  validateManualClaimBurnHash,
  validateRecipient,
  validateTransferEstimate,
} from './cctp'
import '@solana/wallet-adapter-react-ui/styles.css'
import LookupTableManager from './LookupTableManager.jsx'
import './styles.css'

// Chain icons: Trust Wallet / DefiLlama; USDC: Circle asset via Trust Wallet.
// Capability flags use Circle's public matrix plus Bridge Kit chain definitions.
const CHAIN_META = {
  ethereum: { family: 'evm', icon: '/icons/ethereum.png', color: '#627EEA', eta: '~15–19 min', fastEta: '~20 sec' },
  arbitrum: { family: 'evm', icon: '/icons/arbitrum.png', color: '#28A0F0', eta: '~15–19 min', fastEta: '~8 sec' },
  avalanche: { family: 'evm', icon: '/icons/avalanche.png', color: '#E84142', eta: '~8 sec' },
  base: { family: 'evm', icon: '/icons/base.png', color: '#0052FF', eta: '~15–19 min', fastEta: '~8 sec' },
  codex: { family: 'evm', icon: '/icons/codex.webp', color: '#20242C', eta: '~15–19 min', fastEta: '~8 sec' },
  cronos: { family: 'evm', icon: '/icons/cronos.webp', color: '#002D74', eta: '~0.5 sec' },
  edge: { family: 'evm', color: '#16181D', eta: '~16–21 min', fastEta: '~8 sec' },
  hyperevm: { family: 'evm', icon: '/icons/hyperevm.webp', color: '#2C7468', eta: '~5 sec' },
  injective: { family: 'evm', icon: '/icons/injective.webp', color: '#0082C9', eta: '~0.65 sec' },
  ink: { family: 'evm', icon: '/icons/ink.webp', color: '#7132F5', eta: '~30 min', fastEta: '~8 sec' },
  linea: { family: 'evm', icon: '/icons/linea.webp', color: '#1F9DC0', eta: '~6–32 hr', fastEta: '~8 sec' },
  monad: { family: 'evm', icon: '/icons/monad.webp', color: '#836EF9', eta: '~5 sec' },
  morph: { family: 'evm', icon: '/icons/morph.webp', color: '#168CA8', eta: '~20–30 min', fastEta: '~8 sec' },
  optimism: { family: 'evm', icon: '/icons/optimism.png', color: '#FF0420', eta: '~15–19 min', fastEta: '~8 sec' },
  pharos: { family: 'evm', icon: '/icons/pharos.webp', color: '#D97706', eta: '~7 sec' },
  plume: { family: 'evm', icon: '/icons/plume.webp', color: '#EA580C', eta: '~15–19 min', fastEta: '~8 sec' },
  polygon: { family: 'evm', icon: '/icons/polygon.png', color: '#8247E5', eta: '~8 sec' },
  sei: { family: 'evm', icon: '/icons/sei.webp', color: '#9B1C31', eta: '~5 sec' },
  solana: { family: 'solana', icon: '/icons/solana.png', color: '#9945FF', eta: '~25 sec', fastEta: '~8 sec' },
  sonic: { family: 'evm', icon: '/icons/sonic.png', color: '#2563EB', eta: '~8 sec' },
  unichain: { family: 'evm', icon: '/icons/unichain.png', color: '#FF2D8D', eta: '~15–19 min', fastEta: '~8 sec' },
  worldchain: { family: 'evm', icon: '/icons/world-chain.webp', color: '#111111', eta: '~15–19 min', fastEta: '~8 sec' },
  xdc: { family: 'evm', icon: '/icons/xdc.webp', color: '#0D97D5', eta: '~10 sec' },
}

const USDC_ICON = '/icons/usdc.png'

const ENVIRONMENT = 'mainnet'
const ENVIRONMENT_LABEL = 'Mainnet'

const CHAIN_NAMES = {
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  avalanche: 'Avalanche',
  base: 'Base',
  codex: 'Codex',
  cronos: 'Cronos',
  edge: 'EDGE',
  hyperevm: 'HyperEVM',
  injective: 'Injective',
  ink: 'Ink',
  linea: 'Linea',
  monad: 'Monad',
  morph: 'Morph',
  optimism: 'OP Mainnet',
  pharos: 'Pharos',
  plume: 'Plume',
  polygon: 'Polygon PoS',
  sei: 'Sei',
  solana: 'Solana',
  sonic: 'Sonic',
  unichain: 'Unichain',
  worldchain: 'World Chain',
  xdc: 'XDC',
}

// Rough usage-based ordering: corridors people actually bridge between come first,
// the long tail follows alphabetically.
const CHAIN_POPULARITY = [
  'base', 'solana', 'arbitrum', 'sonic', 'ethereum', 'polygon', 'avalanche', 'monad',
]

const chainPopularityRank = (id) => {
  const index = CHAIN_POPULARITY.indexOf(id)
  return index === -1 ? CHAIN_POPULARITY.length : index
}

const makeChains = () => Object.entries(CHAIN_NAMES).map(([id, name]) => ({
  id,
  name,
  ...CHAIN_META[id],
  supportsFast: supportsFastTransfer(ENVIRONMENT, id),
  supportsForwarder: supportsForwarderDestination(ENVIRONMENT, id),
})).sort((a, b) => chainPopularityRank(a.id) - chainPopularityRank(b.id) || a.name.localeCompare(b.name))

const shortAddress = (value) => value ? `${value.slice(0, 5)}…${value.slice(-4)}` : ''
const findChain = (chains, id) => chains.find((chain) => chain.id === id)
const AUTO_QUOTE_DEBOUNCE_MS = 450

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

function useEscapeToClose(open, onClose, enabled = true) {
  useEffect(() => {
    if (!open || !enabled || !onClose) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onClose, open])
}

function formatQuoteCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function ChainSelect({ chains, label, value, otherValue, onChange, rpcLimited = false }) {
  const [open, setOpen] = useState(false)
  const selected = findChain(chains, value)
  useEscapeToClose(open, () => setOpen(false))
  return (
    <div className="field-group chain-field">
      <span className="field-label">{label}</span>
      <button className="chain-trigger" onClick={() => setOpen(true)} aria-label={`Choose ${label.toLowerCase()}`}>
        <ChainMark chain={selected} />
        <span className="chain-name">{selected.name}</span>
        <ChevronRight className="chev" size={16} strokeWidth={2} />
      </button>
      {open && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="chain-select-title">
          <button className="modal-backdrop" onClick={() => setOpen(false)} aria-label="Close chain selector" />
          <div className="sheet">
            <div className="sheet-head">
              <h3 id="chain-select-title">Select chain</h3>
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
                    <small>
                      {chain.family === 'evm' ? 'EVM' : 'SVM'}
                      {rpcLimited && chain.id === 'solana' ? ' · needs dedicated RPC' : ''}
                    </small>
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
  useEscapeToClose(true, onClose, !connectingProvider)

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
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close wallet dialog" />
      <div className="sheet">
        <div className="sheet-head">
          <h3 id="wallet-modal-title">Connect · {chain.name}</h3>
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
        <p className="legal-note mainnet-note">
          Mainnet uses real USDC and gas. Connecting does not move funds.
        </p>
      </div>
    </div>
  )
}

function ManualClaimModal({
  environment,
  chains,
  initialSourceId,
  onClose,
}) {
  const [sourceId, setSourceId] = useState(initialSourceId)
  const [transactionHash, setTransactionHash] = useState('')
  const [phase, setPhase] = useState('input')
  const [claim, setClaim] = useState(null)
  const [claimWallet, setClaimWallet] = useState(null)
  const [solanaRecipientOwner, setSolanaRecipientOwner] = useState('')
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const busy = phase === 'searching' || phase === 'claiming'
  const source = findChain(chains, sourceId)
  const destination = claim ? findChain(chains, claim.destinationId) : null
  const hashError = validateManualClaimBurnHash(environment, sourceId, transactionHash)
  const rpcBlocked = destination?.id === 'solana' && usesPublicSolanaRpc(environment)
  const blockReason = claim
    ? (
        rpcBlocked
          ? 'This build needs a dedicated Solana RPC before it can submit a Solana claim.'
          : manualClaimBlockReason(claim, claimWallet, solanaRecipientOwner)
      )
    : ''
  const amount = claim ? formatUsdcFromMicro(BigInt(claim.amountMicro)) : ''
  useEscapeToClose(true, onClose, !busy && !walletModalOpen)

  function resetClaim(nextSourceId = sourceId, nextHash = transactionHash) {
    setSourceId(nextSourceId)
    setTransactionHash(nextHash)
    setClaim(null)
    setClaimWallet(null)
    setSolanaRecipientOwner('')
    setResult(null)
    setError('')
    setPhase('input')
  }

  async function findTransfer() {
    if (hashError) {
      setError(transactionHash ? '' : hashError)
      return
    }
    setPhase('searching')
    setError('')
    try {
      const nextClaim = await fetchManualClaim(environment, sourceId, transactionHash)
      setClaim(nextClaim)
      setResult(null)
      setPhase('ready')
    } catch (nextError) {
      setError(friendlyError(nextError))
      setPhase('input')
    }
  }

  async function claimTransfer() {
    if (!claim || !claimWallet || blockReason) return
    setPhase('claiming')
    setError('')
    try {
      const nextResult = await executeManualClaim(
        claim,
        claimWallet,
        solanaRecipientOwner,
      )
      setResult(nextResult)
      setPhase('success')
    } catch (nextError) {
      setError(friendlyError(nextError))
      setPhase('ready')
    }
  }

  function primaryAction() {
    if (!claim) return findTransfer()
    if (!claimWallet) {
      setWalletModalOpen(true)
      return undefined
    }
    return claimTransfer()
  }

  const primaryLabel = phase === 'searching'
    ? 'Checking Circle…'
    : phase === 'claiming'
      ? 'Claiming on destination…'
      : phase === 'success'
        ? 'Claim complete'
        : !claim
          ? 'Find transfer'
          : blockReason
            ? 'Manual claim unavailable'
            : !claimWallet
              ? `Connect ${destination.name} wallet`
              : 'Claim USDC'

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="manual-claim-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close manual claim" disabled={busy} />
      <div className="sheet manual-claim-sheet">
        <div className="sheet-head">
          <div className="sheet-head-copy">
            <h3 id="manual-claim-title">Manual claim</h3>
            <p className="step-status-label">
              Finish a CCTP v2 burn started in another app.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        {!claim && (
          <>
            <ChainSelect
              chains={chains}
              label="Burn source chain"
              value={sourceId}
              otherValue=""
              onChange={(value) => resetClaim(value, transactionHash)}
            />
            <div className="recipient-panel manual-claim-hash">
              <span className="field-label" id="manual-claim-hash-label">Burn transaction hash</span>
              <input
                value={transactionHash}
                onChange={(event) => resetClaim(sourceId, event.target.value.trim())}
                placeholder={source.family === 'evm' ? '0x…' : 'Solana signature…'}
                aria-labelledby="manual-claim-hash-label"
                aria-invalid={Boolean(transactionHash && hashError) || undefined}
                spellCheck="false"
                disabled={busy}
              />
              {transactionHash && hashError && <small className="field-error">{hashError}</small>}
            </div>
            <div className="mode-callout" role="note">
              <Info size={14} />
              <span>
                Use the source-chain burn transaction, not an approval or destination transaction.
                The encoded recipient cannot be changed.
              </span>
            </div>
          </>
        )}

        {claim && destination && (
          <>
            <div className="route-summary manual-claim-route">
              <ChainMark chain={source} />
              <span className="route-line" />
              <ChainMark chain={destination} />
              <strong>{amount} USDC</strong>
            </div>
            <div className="confirm-details manual-claim-details">
              <span>Burn transaction</span>
              <code>{shortAddress(claim.transactionHash)}</code>
              <span>Destination</span>
              <strong>{destination.name}</strong>
              <span>Mint recipient</span>
              <code>{shortAddress(claim.mintRecipient)}</code>
              <span>Destination gas</span>
              <strong>Paid by claim wallet</strong>
            </div>
            {destination.family === 'solana' && (
              <div className="recipient-panel">
                <span className="field-label" id="manual-claim-recipient-label">
                  Solana recipient wallet
                </span>
                <input
                  value={solanaRecipientOwner}
                  onChange={(event) => setSolanaRecipientOwner(event.target.value.trim())}
                  placeholder="Recipient wallet that owns the encoded USDC account"
                  aria-labelledby="manual-claim-recipient-label"
                  spellCheck="false"
                  disabled={busy}
                />
              </div>
            )}
            {claimWallet && (
              <div className="connected-row">
                <span><Wallet size={14} />Claim · {shortAddress(claimWallet.address)}</span>
                <button
                  type="button"
                  onClick={() => setWalletModalOpen(true)}
                  disabled={busy}
                >
                  Change
                </button>
              </div>
            )}
            {blockReason && (
              <div className="error-message" role="alert">
                <Info size={14} />
                <span>{blockReason}</span>
              </div>
            )}
            {!blockReason && phase !== 'success' && (
              <div className="mode-callout" role="note">
                <Info size={14} />
                <span>
                  Claiming only submits the destination mint. USDC goes to the recipient encoded
                  in the burn; the connected wallet only pays destination gas.
                </span>
              </div>
            )}
          </>
        )}

        {phase === 'success' && result && (
          <div className="mode-callout manual-claim-success" role="status">
            <CircleCheck size={16} />
            <span>
              <strong>USDC claimed on {destination.name}.</strong>
              {result.explorerUrl && (
                <> <a href={result.explorerUrl} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a></>
              )}
            </span>
          </div>
        )}
        {error && <div className="error-message" role="alert"><Info size={14} /><span>{error}</span></div>}

        <button
          type="button"
          className="primary-button"
          onClick={primaryAction}
          disabled={busy || phase === 'success' || Boolean(claim && blockReason)}
        >
          {busy && <LoaderCircle className="spin" size={16} />}
          {primaryLabel}
        </button>
        {claim && phase !== 'success' && !busy && (
          <button
            type="button"
            className="manual-claim-reset"
            onClick={() => resetClaim(sourceId, '')}
          >
            Use another burn transaction
          </button>
        )}

        {walletModalOpen && destination && (
          <WalletModal
            chain={destination}
            environment={environment}
            onClose={() => setWalletModalOpen(false)}
            onConnected={(connected) => {
              setClaimWallet(connected)
              if (destination.family === 'solana' && !solanaRecipientOwner) {
                setSolanaRecipientOwner(connected.address)
              }
              setWalletModalOpen(false)
            }}
          />
        )}
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
  source,
  destination,
  amount,
  speed,
  settlementMode,
  phase,
  quoteCountdownLabel = '',
  quoteStatus = 'idle',
  quoteError = '',
  quoteIsCurrent = false,
  onRefreshQuote = null,
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
  const quoteRefreshing = phase === 'ready' && quoteStatus === 'loading'
  const startBlocked = phase === 'ready' && !canStartTransferFromQuote(quoteStatus, quoteIsCurrent)
  const phaseIndex = PHASE_INDEX[phase] ?? 0
  const eta = speed === 'fast' ? source.fastEta : source.eta
  const hasLongAttestationWait = /\b(?:min|hr)\b/.test(eta)
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

  useEscapeToClose(true, onClose, !busy)

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
        : quoteRefreshing
          ? 'Refreshing quote…'
          : startBlocked
            ? (quoteStatus === 'error' ? 'Quote unavailable' : 'Waiting for quote…')
            : `Start ${ENVIRONMENT_LABEL} transfer`

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
            <span
              className="progress-track-fill"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressPct / 100))})` }}
            />
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
        {phase === 'ready' && (quoteCountdownLabel || onRefreshQuote || quoteRefreshing) && (
          <p className="quote-freshness confirm-quote-freshness" role="status">
            {quoteRefreshing
              ? <span>Refreshing quote…</span>
              : quoteCountdownLabel
                ? <span>Quote valid for <strong>{quoteCountdownLabel}</strong></span>
                : <span>Quote not ready</span>}
            {onRefreshQuote && (
              <button
                type="button"
                className="quote-refresh"
                onClick={onRefreshQuote}
                disabled={quoteRefreshing}
              >
                {quoteRefreshing ? 'Refreshing…' : 'Refresh quote'}
              </button>
            )}
          </p>
        )}
        {phase === 'ready' && quoteError && (
          <div className="error-message quote-error" role="alert">
            <Info size={15} />
            <span>{quoteError}</span>
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
        {phase === 'attest' && (
          <div className="mode-callout" role="status">
            <Info size={14} />
            <span>
              Attestation from {source.name} usually takes <strong>{eta}</strong>.
              {hasLongAttestationWait && ' This is normal—not stuck.'}
              {' '}Keep this tab open; minting will start automatically. Progress is saved so you can resume if something fails.
            </span>
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
          <div className="real-warning mainnet-warning">
            <Info size={15} />
            <span>
              <strong>Mainnet.</strong> Real USDC will be burned. Check network, address, amount, and completion mode. Keep this tab open until mint completes.
            </span>
          </div>
        )}
        {busy && phase !== 'attest' && (
          <p className="progress-hint">Keep this tab open while the transfer runs. Progress is saved so you can resume if something fails.</p>
        )}
        {error && <div className="error-message"><Info size={15} /><span>{error}</span></div>}
        {warning && <div className="real-warning"><Info size={15} /><span>{warning}</span></div>}
        {retryBlockedReason && (
          <div className="error-message"><Info size={15} /><span>{retryBlockedReason}</span></div>
        )}
        <button
          className="primary-button"
          onClick={primaryAction}
          disabled={busy || startBlocked}
        >
          {(busy || quoteRefreshing) && <LoaderCircle className="spin" size={16} />}
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}

function BridgeCard({ environment, chains, resumeRequest = 0 }) {
  const solanaWalletState = useWallet()
  const [sourceId, setSourceId] = useState('base')
  // Default to a corridor this build can actually serve: Solana needs a private RPC.
  const [destinationId, setDestinationId] = useState(() => (
    usesPublicSolanaRpc(environment) ? 'arbitrum' : 'solana'
  ))
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
  const [manualClaimOpen, setManualClaimOpen] = useState(false)
  const [transfer, setTransfer] = useState({
    open: false,
    phase: 'ready',
    error: '',
    warning: '',
    result: null,
    canRetry: false,
  })
  const [balance, setBalance] = useState({ status: 'idle', value: null, error: '' })
  const [quoteRemainingMs, setQuoteRemainingMs] = useState(0)
  const [incompleteNotice, setIncompleteNotice] = useState(null)
  const quoteRequestRef = useRef(0)
  const quoteKeyRef = useRef('')
  const activeTransferRef = useRef(null)
  const transferInFlightRef = useRef(false)
  const handledResumeRequestRef = useRef(0)
  const source = findChain(chains, sourceId)
  const destination = findChain(chains, destinationId)
  const forwarderAvailable = destination.supportsForwarder
  const useForwarder = settlementMode === 'orbit' && forwarderAvailable
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
  const rpcNotReady = solanaRoute && publicSolanaRpc
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
    if (quote.status !== 'ready' || !quote.quotedAt) {
      setQuoteRemainingMs(0)
      return undefined
    }
    const tick = () => {
      const remaining = Math.max(0, quote.quotedAt + QUOTE_TTL_MS - Date.now())
      setQuoteRemainingMs(remaining)
      if (remaining > 0) return
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
    }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [quote.key, quote.quotedAt, quote.status])

  useEffect(() => {
    if (transfer.open || transferInFlightRef.current) {
      setIncompleteNotice(null)
      return undefined
    }
    const saved = loadPersistedTransfer(environment)
    if (!saved?.result || saved.legacy) {
      setIncompleteNotice(null)
      return undefined
    }
    const state = saved.result.state || saved.summary?.state
    if (state === 'success' || !saved.retryable) {
      setIncompleteNotice(null)
      return undefined
    }
    const fromId = findChainIdForDefinition(environment, saved.result.source?.chain)
    const toId = findChainIdForDefinition(environment, saved.result.destination?.chain)
    const fromName = fromId ? (findChain(chains, fromId)?.name || fromId) : 'source'
    const toName = toId ? (findChain(chains, toId)?.name || toId) : 'destination'
    const stepIndex = Array.isArray(saved.result.steps)
      ? saved.result.steps.findIndex((step) => step?.state === 'pending' || step?.state === 'error')
      : -1
    const stepLabel = stepIndex >= 0
      ? (saved.result.steps[stepIndex]?.name
        || saved.result.steps[stepIndex]?.title
        || `Step ${stepIndex + 1}`)
      : 'In progress'
    setIncompleteNotice({
      amount: String(saved.result.amount || saved.summary?.amount || ''),
      fromName,
      toName,
      stepLabel,
      state: state || 'pending',
    })
    return undefined
  }, [chains, environment, transfer.open, transfer.phase, transfer.result])

  useEffect(() => {
    if (!source.supportsFast && speed === 'fast') setSpeed('standard')
  }, [source, speed])

  useEffect(() => {
    if (!forwarderAvailable && settlementMode === 'orbit') setSettlementMode('manual')
  }, [forwarderAvailable, settlementMode])

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

  async function swap() {
    if (source.family === 'evm' && destination.family === 'evm' && wallet?.family === 'evm') {
      try {
        const switchedWallet = await switchConnectedEvmWallet(environment, destinationId, wallet)
        setWallet(switchedWallet)
      } catch (error) {
        setQuote({ status: 'idle', data: null, error: friendlyError(error), key: '', quotedAt: 0 })
        return
      }
    } else {
      setWallet(null)
      setDestinationWallet(null)
    }
    setSourceId(destinationId)
    setDestinationId(sourceId)
    setRecipient('')
  }

  async function setSource(value) {
    if (value === sourceId) return
    const nextSource = findChain(chains, value)
    if (source.family === 'evm' && nextSource?.family === 'evm' && wallet?.family === 'evm') {
      try {
        const switchedWallet = await switchConnectedEvmWallet(environment, value, wallet)
        setWallet(switchedWallet)
      } catch (error) {
        setQuote({ status: 'idle', data: null, error: friendlyError(error), key: '', quotedAt: 0 })
        return
      }
    } else {
      setWallet(null)
    }
    if (source.family !== nextSource?.family) setDestinationWallet(null)
    setSourceId(value)
  }

  async function setDestination(value) {
    if (value === destinationId) return
    const nextDestination = findChain(chains, value)
    if (
      source.family !== destination.family
      && destination.family === 'evm'
      && nextDestination?.family === 'evm'
      && destinationWallet?.family === 'evm'
    ) {
      try {
        const switchedWallet = await switchConnectedEvmWallet(environment, value, destinationWallet)
        setDestinationWallet(switchedWallet)
      } catch (error) {
        setQuote({ status: 'idle', data: null, error: friendlyError(error), key: '', quotedAt: 0 })
        return
      }
    } else if (destination.family !== nextDestination?.family) {
      setDestinationWallet(null)
    }
    if (!nextDestination?.supportsForwarder) setSettlementMode('manual')
    setDestinationId(value)
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

  const autoQuoteReady = shouldAutoQuote({
    quoteStatus: quote.status,
    rpcNotReady,
    walletAddress: wallet?.address,
    needsDestinationWallet,
    balanceStatus: balance.status,
    balanceValue: balance.value,
    amountError,
    recipientError,
    balanceTooLow,
    transferOpen: transfer.open,
  })

  useEffect(() => {
    if (!autoQuoteReady) return undefined
    const timer = window.setTimeout(() => fetchQuote(), AUTO_QUOTE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [autoQuoteReady, currentQuoteKey])

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
    setQuote((current) => beginQuoteRefresh(current, requestKey))
    try {
      if (wallet?.family === 'evm') {
        const switchedWallet = await switchConnectedEvmWallet(environment, sourceId, wallet)
        setWallet(switchedWallet)
      }
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
      setQuote((current) => failQuoteRefresh(current, requestKey, friendlyError(error)))
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
        const reconciled = await reconcileAlreadyCompletedClaim(
          activeTransferRef.current,
          environment,
        )
        if (reconciled.state === 'success') {
          result = reconciled
        } else {
          result = await retryTransfer(
            resultForRetry,
            wallet,
            activeClaimWallet,
            environment,
            handleBridgeEvent,
          )
        }
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
      result = await reconcileAlreadyCompletedClaim(result, environment)

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
      const reconciled = partialResult
        ? await reconcileAlreadyCompletedClaim(partialResult, environment)
        : null
      if (reconciled) persistTransfer(reconciled, environment)
      setTransfer((current) => ({
        ...current,
        phase: reconciled?.state === 'success' ? 'success' : 'error',
        error: reconciled?.state === 'success' ? '' : friendlyError(error),
        result: reconciled || current.result,
        canRetry: reconciled?.state === 'success'
          ? false
          : isRetryableBridgeResult(reconciled || current.result),
      }))
    } finally {
      activeTransferRef.current = null
      transferInFlightRef.current = false
      if (!useForwarder && source.family === destination.family && wallet?.family === 'evm') {
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

  async function resumeLastTransfer() {
    const saved = loadPersistedTransfer(environment)
    if (!saved) {
      window.alert('No saved transfer found in this browser. After a partial transfer you can retry from here.')
      return
    }
    if (!saved.legacy && saved.result?.state === 'error') {
      const reconciled = await reconcileAlreadyCompletedClaim(saved.result, environment)
      if (reconciled.state === 'success') {
        saved.result = reconciled
        saved.retryable = false
        persistTransfer(reconciled, environment)
      }
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
    () => (speed === 'fast' ? source.fastEta : source.eta),
    [speed, source],
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
      || autoQuoteReady
      || quote.status === 'loading'
    )),
  )

  const quoteCountdownLabel = quoteIsCurrent && quoteRemainingMs > 0
    ? formatQuoteCountdown(quoteRemainingMs)
    : ''
  const amountErrorId = 'amount-field-error'
  const recipientErrorId = 'recipient-field-error'
  const amountFieldMessage = resolveAmountFieldError({
    amount,
    amountError,
    balanceStatus: balance.status,
    balanceError: balance.error,
    balanceTooLow,
    feeTooHigh,
  })
  const amountInvalid = Boolean(amountFieldMessage)
  const recipientInvalid = Boolean(recipient && recipientError)

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
            <p className="card-sub">Native USDC across chains via Circle CCTP · Mainnet</p>
          </div>
        </div>
        <div className="card-actions">
          <button type="button" className="ghost-btn" onClick={() => setManualClaimOpen(true)}>
            Manual claim
          </button>
          <button type="button" className="ghost-btn" onClick={resumeLastTransfer}>
            Resume latest transfer
          </button>
        </div>
      </div>

      {incompleteNotice && (
        <div className="resume-banner" role="status">
          <div className="resume-banner-copy">
            <strong>Incomplete transfer</strong>
            <span>
              {incompleteNotice.amount ? `${incompleteNotice.amount} USDC · ` : ''}
              {incompleteNotice.fromName} → {incompleteNotice.toName}
              {' · '}
              {incompleteNotice.stepLabel}
            </span>
          </div>
          <button type="button" className="ghost-btn resume-banner-action" onClick={resumeLastTransfer}>
            Resume latest
          </button>
        </div>
      )}

      {rpcNotReady && (
        <div className="rpc-banner" role="status">
          <Info size={14} />
          <span>
            Solana routes stay off on this build's public RPC. Pick an EVM pair, or run your own Solana RPC to enable them.
          </span>
        </div>
      )}

      <div className="chain-grid">
        <ChainSelect chains={chains} label="Source Chain" value={sourceId} otherValue={destinationId} onChange={setSource} rpcLimited={publicSolanaRpc} />
        <button className="swap-button" onClick={swap} aria-label="Swap chains">
          <ArrowLeftRight size={15} />
        </button>
        <ChainSelect chains={chains} label="Destination Chain" value={destinationId} otherValue={sourceId} onChange={setDestination} rpcLimited={publicSolanaRpc} />
      </div>

      <div className="amount-panel">
        <span className="field-label" id="amount-label">Amount</span>
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
              aria-labelledby="amount-label"
              aria-label="USDC amount"
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? amountErrorId : undefined}
            />
            <span className="balance-hint">
              Balance: {balanceLabel}
              <button
                type="button"
                className="max-amount"
                disabled={!wallet || balance.status !== 'ready' || balance.value == null}
                onClick={() => setAmount(sanitizeAmountInput(balance.value))}
              >
                Max
              </button>
            </span>
          </div>
        </div>
        {amountFieldMessage && (
          <small className="field-error" id={amountErrorId}>{amountFieldMessage}</small>
        )}
      </div>

      <div className="recipient-panel">
        <div className="amount-meta">
          <span className="field-label" id="recipient-label">Recipient on {destination.name}</span>
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
          aria-labelledby="recipient-label"
          aria-label="Destination recipient address"
          aria-invalid={recipientInvalid || undefined}
          aria-describedby={recipientInvalid ? recipientErrorId : undefined}
          spellCheck="false"
        />
        {recipient && recipientError && (
          <small className="field-error" id={recipientErrorId}>{recipientError}</small>
        )}
      </div>

      <details className="completion-method">
        <summary>
          <span className="completion-method-icon" aria-hidden="true">
            {settlementMode === 'manual' ? <UserRound size={18} /> : <ArrowRight size={18} />}
          </span>
          <span className="completion-method-copy">
            <small>Completion method</small>
            <strong>{settlementMode === 'manual' ? 'Self-claim' : 'Orbit automatic'}</strong>
            <span>
              {settlementMode === 'manual'
                ? 'You control minting · No Orbit fee'
                : 'One source wallet · Quoted USDC fee'}
            </span>
          </span>
          <span className="completion-method-change">
            Change <ChevronRight size={16} />
          </span>
        </summary>

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
            onClick={() => {
              if (forwarderAvailable) setSettlementMode('orbit')
            }}
            disabled={!forwarderAvailable}
          >
            <span>
              <strong>Orbit automatic</strong>
              <small>
                {forwarderAvailable
                  ? 'One source wallet · quoted USDC fee'
                  : `Unavailable to ${destination.name}`}
              </small>
            </span>
            <Check size={16} />
          </button>
        </div>
      </details>

      <div className="mode-callout completion-note" role="note">
        <Info size={14} />
        <span>
          {settlementMode === 'manual'
            ? `${destination.name} wallet signs the mint and pays destination gas.`
            : 'Circle Forwarding Service completes minting for the quoted USDC fee.'}
        </span>
      </div>

      <div className="meta-row">
        <label className={`fast-toggle ${!source.supportsFast ? 'disabled' : ''}`}>
          <span><Zap size={16} aria-hidden="true" />Fast transfer</span>
          <button
            type="button"
            role="switch"
            aria-label="Fast Transfer"
            aria-checked={speed === 'fast'}
            disabled={!source.supportsFast}
            title={!source.supportsFast ? 'Fast transfer is not available on this source chain' : undefined}
            className={speed === 'fast' ? 'on' : ''}
            onClick={() => setSpeed(speed === 'fast' ? 'standard' : 'fast')}
          >
            <i />
          </button>
        </label>
        <div className="delivery-facts" aria-label="Transfer estimate">
          <span><small>Est.</small> {eta}</span>
          <span><small>Fee</small> {feeLabel}</span>
          <span className="protocol-badge">CCTP v2</span>
        </div>
      </div>

      {(quote.data || destinationGasEstimate || receive != null) && (
        <div className="quote-breakdown" aria-label="Quote details">
          {quote.data && feeBreakdown.forwarder !== '0' && (
            <span>Orbit fee {feeBreakdown.forwarder}</span>
          )}
          {quote.data && feeBreakdown.protocol !== '0' && (
            <span>CCTP fee {feeBreakdown.protocol}</span>
          )}
          {destinationGasEstimate && (
            <span>Claim gas {destinationGasEstimate.fees.fee} {destinationGasEstimate.token}</span>
          )}
          {receive != null && <span>Receive {receive} USDC</span>}
        </div>
      )}

      {quoteIsCurrent && quoteCountdownLabel && (
        <div className="quote-freshness" role="status">
          <span>Quote valid for <strong>{quoteCountdownLabel}</strong></span>
          <button type="button" className="quote-refresh" onClick={() => fetchQuote()}>
            Refresh quote
          </button>
        </div>
      )}

      {quote.error && <div className="error-message quote-error" role="alert"><Info size={14} /><span>{quote.error}</span></div>}
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
        {(autoQuoteReady || quote.status === 'loading') && <LoaderCircle className="spin" size={16} />}
        {rpcNotReady
          ? 'Solana RPC unavailable'
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
                            : quoteIsCurrent
                              ? 'Review transfer'
                              : autoQuoteReady
                                ? 'Preparing quote…'
                                : 'Get quote'}
      </button>
      <p className="card-trust">No interface fee · Native USDC · Uses Circle CCTP v2</p>

      {walletModal && (
        <WalletModal
          chain={walletModal === 'destination' ? destination : source}
          environment={environment}
          onClose={() => setWalletModal(null)}
          onConnected={(connected) => {
            if (walletModal === 'destination') setDestinationWallet(connected)
            else setWallet(connected)
            setWalletModal(null)
          }}
        />
      )}
      {manualClaimOpen && (
        <ManualClaimModal
          environment={environment}
          chains={chains}
          initialSourceId={sourceId}
          onClose={() => setManualClaimOpen(false)}
        />
      )}
      {transfer.open && (
        <ProgressModal
          source={modalSource}
          destination={modalDestination}
          amount={transfer.result?.amount || amount || '0'}
          speed={speed}
          settlementMode={transfer.result
            ? (transfer.result.destination?.useForwarder === true ? 'orbit' : 'manual')
            : settlementMode}
          phase={transfer.phase}
          quoteCountdownLabel={transfer.phase === 'ready' ? quoteCountdownLabel : ''}
          quoteStatus={quote.status}
          quoteError={transfer.phase === 'ready' ? (quote.error || '') : ''}
          quoteIsCurrent={quoteIsCurrent}
          onRefreshQuote={transfer.phase === 'ready' ? () => fetchQuote() : null}
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
          receive={receive != null ? receive : (quote.data ? '0' : '—')}
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

function HistoryStatus({ state, retryable, canResume }) {
  if (state === 'success') {
    return <span className="history-status success"><CircleCheck size={17} />Fulfilled</span>
  }
  if (state === 'error' && canResume) {
    return <span className="history-status action"><CircleAlert size={17} />Action required</span>
  }
  if (state === 'error' && retryable) {
    return <span className="history-status action"><CircleAlert size={17} />Interrupted</span>
  }
  if (state === 'error') {
    return <span className="history-status error"><CircleAlert size={17} />Failed</span>
  }
  return <span className="history-status pending"><Clock3 size={17} />In progress</span>
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
  if (!safeLinks.length) return <span className="history-action-muted">Explorer unavailable</span>
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [destinationFilter, setDestinationFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [checkingId, setCheckingId] = useState(null)
  const [checkFailedId, setCheckFailedId] = useState(null)

  useEffect(() => {
    const refresh = (event) => {
      if (!event?.detail?.environment || event.detail.environment === environment) {
        setRecords(loadTransferHistory(environment))
      }
    }
    refresh()
    setStatusFilter('all')
    setSourceFilter('all')
    setDestinationFilter('all')
    setTimeFilter('all')
    window.addEventListener('relay:transfer-history-updated', refresh)
    return () => window.removeEventListener('relay:transfer-history-updated', refresh)
  }, [environment])

  const statusCounts = useMemo(() => records.reduce((counts, record) => {
    counts.all += 1
    if (record.state === 'success') counts.success += 1
    else if (record.state === 'pending' || record.retryable) counts.open += 1
    else counts.failed += 1
    return counts
  }, { all: 0, success: 0, open: 0, failed: 0 }), [records])

  const filteredRecords = useMemo(() => {
    const timeWindow = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[timeFilter]
    const cutoff = timeWindow ? Date.now() - timeWindow : null
    return records.filter((record) => {
      const statusMatches = statusFilter === 'all'
        || (statusFilter === 'success' && record.state === 'success')
        || (statusFilter === 'open' && (record.state === 'pending' || record.retryable))
        || (statusFilter === 'failed' && record.state === 'error' && !record.retryable)
      const sourceMatches = sourceFilter === 'all' || record.sourceId === sourceFilter
      const destinationMatches = destinationFilter === 'all'
        || record.destinationId === destinationFilter
      const timeMatches = cutoff == null || new Date(record.createdAt).getTime() >= cutoff
      return statusMatches && sourceMatches && destinationMatches && timeMatches
    })
  }, [destinationFilter, records, sourceFilter, statusFilter, timeFilter])

  const secondaryFilterCount = [
    sourceFilter !== 'all',
    destinationFilter !== 'all',
    timeFilter !== 'all',
  ].filter(Boolean).length
  const hasAnyFilter = statusFilter !== 'all' || secondaryFilterCount > 0

  function clearFilters() {
    setStatusFilter('all')
    setSourceFilter('all')
    setDestinationFilter('all')
    setTimeFilter('all')
  }

  async function checkHistoricalStatus(record) {
    setCheckingId(record.id)
    setCheckFailedId(null)
    const repaired = await repairTransferHistoryRecord(record, environment)
    if (!repaired) setCheckFailedId(record.id)
    setCheckingId(null)
  }

  const statusOptions = [
    { id: 'all', label: 'All', count: statusCounts.all },
    { id: 'success', label: 'Completed', count: statusCounts.success },
    { id: 'open', label: 'Open', count: statusCounts.open },
    { id: 'failed', label: 'Failed', count: statusCounts.failed },
  ]

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <h2 id="history-title">Recent transfers</h2>
        </div>
        <span>Saved in this browser</span>
      </div>

      {records.length ? (
        <>
          <div className="history-toolbar">
            <div className="history-quick-filters" role="tablist" aria-label="Filter transfers by status">
              {statusOptions.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === option.id}
                  className={statusFilter === option.id ? 'active' : ''}
                  onClick={() => setStatusFilter(option.id)}
                  key={option.id}
                >
                  {option.label}
                  <span>{option.count}</span>
                </button>
              ))}
            </div>

            <details className="history-filter-menu">
              <summary>
                <Filter size={14} />
                Filters
                {secondaryFilterCount > 0 && <span>{secondaryFilterCount}</span>}
              </summary>
              <div className="history-filter-popover">
                <div className="history-filter-popover-head">
                  <strong>Filter transfers</strong>
                  <button type="button" onClick={clearFilters} disabled={!hasAnyFilter}>
                    Clear
                  </button>
                </div>
                <label>
                  <span>Source chain</span>
                  <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                    <option value="all">All source chains</option>
                    {chains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Destination chain</span>
                  <select value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value)}>
                    <option value="all">All destination chains</option>
                    {chains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Time</span>
                  <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}>
                    <option value="all">Any time</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                  </select>
                </label>
              </div>
            </details>
          </div>

          {filteredRecords.length ? (
            <div className="history-table" role="table" aria-label={`${ENVIRONMENT_LABEL} transfer history`}>
          <div className="history-table-head" role="row">
            <span role="columnheader">Time</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">Destination</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          <div className="history-table-body" role="rowgroup">
            {filteredRecords.map((record) => (
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
                  <HistoryStatus
                    state={record.state}
                    retryable={record.retryable}
                    canResume={record.id === records[0]?.id && record.retryable}
                  />
                </span>
                <span className="history-actions" role="cell">
                  {record.id === records[0]?.id && record.retryable && (
                    <button type="button" className="history-action secondary" onClick={onResume}>
                      Resume
                    </button>
                  )}
                  {record.id !== records[0]?.id
                    && record.state === 'error'
                    && Array.isArray(record.txHashes)
                    && record.txHashes.length > 0 && (
                      <button
                        type="button"
                        className="history-action secondary"
                        disabled={checkingId === record.id}
                        title={checkFailedId === record.id
                          ? 'On-chain completion was not found. The saved status was not changed.'
                          : 'Check this transfer on-chain'}
                        onClick={() => checkHistoricalStatus(record)}
                      >
                        {checkingId === record.id
                          ? 'Checking…'
                          : checkFailedId === record.id
                            ? 'Not completed'
                            : 'Check status'}
                      </button>
                    )}
                  <TransactionLinks links={record.explorerLinks} />
                </span>
              </div>
            ))}
          </div>
            </div>
          ) : (
            <div className="history-empty filtered">
              <Filter size={21} />
              <div>
                <strong>No matching transfers</strong>
                <p>Try another status, chain, or time range.</p>
              </div>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          )}
        </>
      ) : (
        <div className="history-empty">
          <Clock3 size={21} />
          <div>
            <strong>No on-chain transfers yet</strong>
            <p>Completed and recoverable {ENVIRONMENT_LABEL} transfers will appear here.</p>
          </div>
        </div>
      )}
    </section>
  )
}

// External bridge/swap destinations. Third-party sites (except Circle's bridge):
// descriptions stay factual and non-evaluative — no endorsement language.
const QUICK_LINKS = [
  {
    id: 'native',
    label: 'Native USDC',
    links: [
      { name: 'CCTP.to', url: 'https://www.cctp.to/', desc: 'Third-party USDC bridge interface' },
      { name: 'USDC Bridge', url: 'https://bridge.usdc.com/', desc: 'Circle official' },
    ],
  },
  {
    id: 'cross-chain',
    label: 'Cross-chain',
    links: [
      { name: 'Relay', url: 'https://relay.link/', desc: 'Cross-chain transfers' },
      { name: 'Stargate', url: 'https://stargate.finance/', desc: 'Cross-chain liquidity protocol' },
      { name: 'Transporter', url: 'https://www.transporter.io/', desc: 'Built on Chainlink CCIP' },
    ],
  },
  {
    id: 'swap',
    label: 'Swap',
    links: [
      { name: 'Jupiter', url: 'https://jup.ag/', desc: 'Solana swap aggregator' },
      { name: 'KyberSwap', url: 'https://kyberswap.com/', desc: 'Multi-chain swap aggregator' },
      { name: 'CoW Swap', url: 'https://swap.cow.fi/', desc: 'Intent-based swaps' },
    ],
  },
]

// Topbar disclosure popover listing external destinations. Closes on Escape (focus
// returns to the trigger), outside pointer-down, or link activation.
function QuickLinksMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  useEscapeToClose(open, () => {
    setOpen(false)
    triggerRef.current?.focus()
  })

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector('.explore-link')?.focus()
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className="explore" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="topbar-nav explore-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="explore-panel"
        id="explore-trigger"
        aria-label="Explore bridges and swaps"
        title="Explore bridges and swaps"
      >
        <Globe size={14} />
        <span className="topbar-nav-label">Explore</span>
        <ChevronDown size={11} className="explore-chev" aria-hidden="true" />
      </button>
      {open && (
        <nav className="explore-panel" id="explore-panel" aria-labelledby="explore-trigger">
          {QUICK_LINKS.map((group) => (
            <div className="explore-group" key={group.id}>
              <span className="explore-group-label">{group.label}</span>
              {group.links.map((link) => (
                <a
                  key={link.url}
                  className="explore-link"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                >
                  <span className="explore-link-text">
                    <strong>{link.name}</strong>
                    <small>{link.desc}</small>
                  </span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ))}
            </div>
          ))}
          <p className="explore-note">
            Third-party services, not operated or endorsed by CCTP One. Verify the network, token, and fees before continuing.
          </p>
        </nav>
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

function App({ environment }) {
  const chains = useMemo(() => makeChains(), [])
  const [theme, setTheme] = useState(resolveInitialTheme)
  const [resumeRequest, setResumeRequest] = useState(0)
  const [lookupOpen, setLookupOpen] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!lookupOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [lookupOpen])

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" aria-label="CCTP One home">
          <img
            className="brand-mark"
            src="/cctp-one-logo.png"
            alt=""
            width="32"
            height="32"
            draggable={false}
          />
          <span className="brand-wordmark">
            <span>CCTP One</span>
            <small>Native USDC</small>
          </span>
        </a>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-nav"
            onClick={() => setLookupOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={lookupOpen}
            aria-label="Recover Solana rent"
            title="Recover Solana rent"
          >
            <Coins size={14} />
            <span className="topbar-nav-label">Recover rent</span>
          </button>
          <a
            className="topbar-nav"
            href="https://developers.circle.com/cctp"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs <ExternalLink size={12} />
          </a>
          <QuickLinksMenu />
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
          chains={chains}
          resumeRequest={resumeRequest}
        />

        <TransferHistory
          environment={environment}
          chains={chains}
          onResume={() => {
            setResumeRequest((current) => current + 1)
            document.getElementById('bridge')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />

      </main>

      <footer className="site-footer">
        <div className="footer-links">
          <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer">
            Circle CCTP <ExternalLink size={11} />
          </a>
          <a href="https://developers.circle.com/cctp/concepts/supported-chains-and-domains" target="_blank" rel="noreferrer">
            Supported chains <ExternalLink size={11} />
          </a>
          <a href="https://github.com/SHLE1/CCTP" target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={11} />
          </a>
        </div>
        <p className="footer-note">
          CCTP One · {chains.length} chains · Independent UI, not affiliated with Circle.
        </p>
      </footer>

      {lookupOpen && (
        <div
          className="lookup-drawer-layer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lookup-title"
        >
          <button
            type="button"
            className="modal-backdrop"
            onClick={() => setLookupOpen(false)}
            aria-label="Close rent recovery"
          />
          <div className="lookup-drawer">
            <LookupTableManager
              environment={environment}
              onClose={() => setLookupOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CctpOneRoot() {
  const solanaEndpoint = useMemo(() => getSolanaRpcEndpoint(ENVIRONMENT), [])

  return (
    <ConnectionProvider endpoint={solanaEndpoint}>
      <WalletProvider wallets={[]} autoConnect={false} localStorageKey="relay:solana-wallet">
        <WalletModalProvider>
          <App environment={ENVIRONMENT} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')).render(<CctpOneRoot />)
