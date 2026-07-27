import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import {
  ArchiveRestore,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Coins,
  Database,
  ExternalLink,
  LoaderCircle,
  Power,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import { friendlyError } from './cctp.js'
import {
  formatSolFromLamports,
  lookupTableExplorerUrl,
  scanLookupTables,
  sendLookupTableAction,
} from './lookup-tables.js'

const ENVIRONMENT_NAMES = { mainnet: 'Mainnet', testnet: 'Devnet' }
const STATUS_LABELS = {
  active: 'Active',
  deactivating: 'Cooling down',
  ready: 'Ready to close',
}

function shortAddress(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-6)}` : ''
}

function lookupTableError(error) {
  const message = friendlyError(error)
  if (/cooling down|fully deactivated|cannot be closed/i.test(message)) {
    return 'This Lookup Table is still cooling down. Refresh its status and try again.'
  }
  if (/incorrect authority|no longer this Lookup Table authority/i.test(message)) {
    return 'The connected wallet is not this Lookup Table authority.'
  }
  if (/failed to fetch|403|429|rate limit|too many requests/i.test(message)) {
    return 'The Solana RPC could not complete this request. Try again or configure a dedicated RPC endpoint.'
  }
  return message
}

function StatusIcon({ status }) {
  if (status === 'ready') return <CircleCheck size={16} />
  if (status === 'deactivating') return <Clock3 size={16} />
  return <ShieldCheck size={16} />
}

function LookupTableRow({ table, busy, onAction }) {
  return (
    <article className={`lookup-row ${table.status}`}>
      <div className="lookup-identity">
        <span className="lookup-table-mark" aria-hidden="true"><Database size={18} /></span>
        <div>
          <a href={table.explorerUrl} target="_blank" rel="noreferrer">
            <code>{shortAddress(table.address)}</code>
            <ExternalLink size={12} />
          </a>
          <span className="lookup-tags">
            {table.cctpRelated && <span className="lookup-tag cctp">CCTP-related</span>}
            {!table.cctpRelated && <span className="lookup-tag">Other app</span>}
          </span>
        </div>
      </div>

      <div className="lookup-metric" data-label="Addresses">
        <strong>{table.addressCount}</strong>
        <span>stored</span>
      </div>
      <div className="lookup-metric" data-label="Recoverable">
        <strong>{table.balanceSol} SOL</strong>
        <span>before fees</span>
      </div>
      <div className={`lookup-status ${table.status}`} data-label="Status">
        <StatusIcon status={table.status} />
        <span>
          <strong>{STATUS_LABELS[table.status]}</strong>
          {table.status === 'deactivating' && (
            <small>~{table.remainingSlots} slots remaining</small>
          )}
          {table.status === 'active' && <small>authority verified</small>}
          {table.status === 'ready' && <small>rent is reclaimable</small>}
        </span>
      </div>
      <div className="lookup-row-action">
        {table.status === 'active' && (
          <button
            type="button"
            className="lookup-action deactivate"
            onClick={() => onAction('deactivate', table)}
            disabled={busy || table.shared}
          >
            <Power size={14} /> Deactivate
          </button>
        )}
        {table.status === 'deactivating' && (
          <span className="lookup-wait"><Clock3 size={14} /> Waiting</span>
        )}
        {table.status === 'ready' && (
          <button
            type="button"
            className="lookup-action close"
            onClick={() => onAction('close', table)}
            disabled={busy || table.shared}
          >
            <ArchiveRestore size={14} /> Close &amp; reclaim
          </button>
        )}
      </div>
    </article>
  )
}

function ConfirmationDialog({ action, busy, confirmed, onCancel, onConfirm, onConfirmedChange }) {
  const deactivating = action.type === 'deactivate'
  return (
    <div className="modal-layer lookup-confirm-layer" role="dialog" aria-modal="true" aria-labelledby="lookup-confirm-title">
      <button className="modal-backdrop" onClick={busy ? undefined : onCancel} aria-label="Cancel Lookup Table action" />
      <div className="sheet lookup-confirm-sheet">
        <div className="sheet-head">
          <div className="sheet-head-copy">
            <h3 id="lookup-confirm-title">
              {deactivating ? 'Deactivate Lookup Table' : 'Close Lookup Table'}
            </h3>
          </div>
          <button className="icon-button" onClick={onCancel} disabled={busy} aria-label="Close confirmation">
            <X size={18} />
          </button>
        </div>

        <div className={`lookup-confirm-symbol ${deactivating ? 'warn' : 'success'}`} aria-hidden="true">
          {deactivating ? <Power size={22} /> : <Coins size={22} />}
        </div>
        <p className="lookup-confirm-copy">
          {deactivating
            ? 'Deactivation is permanent. The table enters a cooldown before its rent can be reclaimed.'
            : `${action.table.balanceSol} SOL will be returned to the connected wallet, before the transaction fee.`}
        </p>
        <dl className="lookup-confirm-details">
          <div><dt>Lookup Table</dt><dd><code>{action.table.address}</code></dd></div>
          <div><dt>Network</dt><dd>{action.environment}</dd></div>
          <div><dt>Recipient</dt><dd><code>{shortAddress(action.authority)}</code></dd></div>
        </dl>

        {deactivating && (
          <label className="lookup-confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirmedChange(event.target.checked)}
              disabled={busy}
            />
            <span aria-hidden="true"><Check size={13} /></span>
            <strong>The claim is complete and this table is no longer needed.</strong>
          </label>
        )}

        <div className="lookup-confirm-actions">
          <button type="button" className="lookup-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`lookup-submit ${deactivating ? 'danger' : ''}`}
            onClick={onConfirm}
            disabled={busy || (deactivating && !confirmed)}
          >
            {busy
              ? <><LoaderCircle className="spin" size={16} /> Waiting for wallet</>
              : deactivating
                ? <><Power size={15} /> Deactivate</>
                : <><ArchiveRestore size={15} /> Close &amp; reclaim</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LookupTableManager({ environment, onClose }) {
  const { connection } = useConnection()
  const {
    connect,
    connected,
    connecting,
    publicKey,
    sendTransaction,
    wallet,
  } = useWallet()
  const [scan, setScan] = useState({ status: 'idle', tables: [], error: '' })
  const [pendingAction, setPendingAction] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!wallet?.adapter || connected || connecting) return
    setNotice(null)
    connect().catch((error) => {
      setNotice({ type: 'error', message: friendlyError(error) })
    })
  }, [connect, connected, connecting, wallet])

  function requestClose() {
    if (busy || pendingAction) return
    onClose?.()
  }

  useEffect(() => {
    if (!onClose) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (busy) return
      if (pendingAction) {
        setPendingAction(null)
        setConfirmed(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, pendingAction])

  const loadTables = useCallback(async ({ silent = false } = {}) => {
    if (!connected || !publicKey) {
      setScan({ status: 'idle', tables: [], error: '' })
      return
    }
    if (!silent) setScan((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const tables = await scanLookupTables(connection, publicKey, environment)
      setScan({ status: 'ready', tables, error: '' })
    } catch (error) {
      setScan((current) => ({
        status: current.tables.length && silent ? 'ready' : 'error',
        tables: current.tables,
        error: lookupTableError(error),
      }))
    }
  }, [connected, connection, environment, publicKey])

  useEffect(() => {
    setNotice(null)
    setPendingAction(null)
    setConfirmed(false)
    loadTables()
  }, [loadTables])

  const hasCoolingTables = scan.tables.some((table) => table.status === 'deactivating')
  useEffect(() => {
    if (!hasCoolingTables || !connected) return undefined
    const timer = window.setInterval(() => loadTables({ silent: true }), 20_000)
    return () => window.clearInterval(timer)
  }, [connected, hasCoolingTables, loadTables])

  const summary = useMemo(() => {
    const recoverableLamports = scan.tables.reduce((sum, table) => sum + table.balanceLamports, 0)
    return {
      active: scan.tables.filter((table) => table.status === 'active').length,
      ready: scan.tables.filter((table) => table.status === 'ready').length,
      totalSol: formatSolFromLamports(recoverableLamports),
    }
  }, [scan.tables])

  function requestAction(type, table) {
    if (!publicKey) return
    setConfirmed(false)
    setNotice(null)
    setPendingAction({
      type,
      table,
      authority: publicKey.toBase58(),
      environment: ENVIRONMENT_NAMES[environment],
    })
  }

  async function confirmAction() {
    if (!pendingAction || !publicKey || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const signature = await sendLookupTableAction({
        action: pendingAction.type,
        authority: publicKey,
        connection,
        lookupTable: pendingAction.table.address,
        sendTransaction,
      })
      const closed = pendingAction.type === 'close'
      setNotice({
        type: 'success',
        message: closed
          ? `${pendingAction.table.balanceSol} SOL was reclaimed before fees.`
          : 'Lookup Table deactivated. Its cooldown is now being tracked.',
        url: lookupTableExplorerUrl(environment, signature, 'tx'),
      })
      setPendingAction(null)
      setConfirmed(false)
      await loadTables()
    } catch (error) {
      setNotice({ type: 'error', message: lookupTableError(error) })
      setPendingAction(null)
      setConfirmed(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="lookup-section" aria-labelledby="lookup-title">
      <div className="lookup-heading">
        <div>
          <h2 id="lookup-title">Recover rent</h2>
          <p className="lookup-heading-sub">
            Deactivate unused Lookup Tables, then close them to reclaim SOL rent.
          </p>
        </div>
        <div className="lookup-heading-actions">
          {connected && publicKey && (
            <>
              <span className="lookup-wallet"><Wallet size={13} />{shortAddress(publicKey.toBase58())}</span>
              <button
                type="button"
                className="lookup-refresh"
                onClick={() => loadTables()}
                disabled={scan.status === 'loading' || busy}
                aria-label="Refresh Lookup Tables"
                title="Refresh Lookup Tables"
              >
                <RefreshCw className={scan.status === 'loading' ? 'spin' : ''} size={15} />
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              className="icon-button lookup-close"
              onClick={requestClose}
              disabled={busy || Boolean(pendingAction)}
              aria-label="Close rent recovery"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`lookup-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.type === 'success' ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
          <span>{notice.message}</span>
          {notice.url && <a href={notice.url} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}
        </div>
      )}

      {!connected || !publicKey ? (
        <div className="lookup-empty connect">
          <span className="lookup-empty-icon"><Database size={22} /></span>
          <div>
            <strong>Connect a Solana wallet</strong>
            <p>Only Lookup Tables controlled by that wallet will appear.</p>
          </div>
          <WalletModalButton className="lookup-connect-button">
            {connecting ? 'Connecting…' : wallet ? 'Connect wallet' : 'Choose wallet'}
          </WalletModalButton>
        </div>
      ) : (
        <>
          <div className="lookup-summary" aria-label="Lookup Table summary">
            <div><span>Controlled tables</span><strong>{scan.tables.length}</strong></div>
            <div><span>Active</span><strong>{summary.active}</strong></div>
            <div><span>Ready to close</span><strong>{summary.ready}</strong></div>
            <div className="lookup-summary-total"><span>Recoverable</span><strong>{summary.totalSol} SOL</strong></div>
          </div>

          {scan.status === 'loading' && !scan.tables.length && (
            <div className="lookup-empty loading">
              <LoaderCircle className="spin" size={22} />
              <div><strong>Scanning authority accounts</strong><p>{ENVIRONMENT_NAMES[environment]}</p></div>
            </div>
          )}
          {scan.status === 'error' && !scan.tables.length && (
            <div className="lookup-empty error">
              <CircleAlert size={22} />
              <div><strong>Lookup Tables could not be loaded</strong><p>{scan.error}</p></div>
              <button type="button" onClick={() => loadTables()}>Try again</button>
            </div>
          )}
          {scan.status === 'ready' && !scan.tables.length && (
            <div className="lookup-empty">
              <ShieldCheck size={22} />
              <div><strong>No controlled Lookup Tables</strong><p>Nothing is available to deactivate or reclaim on {ENVIRONMENT_NAMES[environment]}.</p></div>
            </div>
          )}
          {scan.tables.length > 0 && (
            <div className="lookup-table-list">
              <div className="lookup-table-head" aria-hidden="true">
                <span>Lookup Table</span><span>Addresses</span><span>Recoverable</span><span>Status</span><span />
              </div>
              {scan.tables.map((table) => (
                <LookupTableRow
                  table={table}
                  busy={busy}
                  onAction={requestAction}
                  key={table.address}
                />
              ))}
            </div>
          )}
        </>
      )}

      {pendingAction && (
        <ConfirmationDialog
          action={pendingAction}
          busy={busy}
          confirmed={confirmed}
          onCancel={() => {
            if (!busy) {
              setPendingAction(null)
              setConfirmed(false)
            }
          }}
          onConfirm={confirmAction}
          onConfirmedChange={setConfirmed}
        />
      )}
    </section>
  )
}
