import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Transaction,
} from '@solana/web3.js'

export const LOOKUP_TABLE_AUTHORITY_OPTION_OFFSET = 21
export const LOOKUP_TABLE_AUTHORITY_OFFSET = 22
export const LOOKUP_TABLE_COOLDOWN_SLOTS = 512
export const LOOKUP_TABLE_U64_MAX = (1n << 64n) - 1n

const CCTP_PROGRAM_ADDRESSES = new Set([
  'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
  'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
])

export const CIRCLE_SHARED_LOOKUP_TABLES = new Set([
  'qj4EYgsGpnRdt9rvQW3wWZR8JVaKPg9rG9EB8DNgfz8',
  '29VCJ73d5aR5dE6oxaUkipntw1tFzDDKNLqrXE2ujWHW',
])

function readU64LE(data, offset) {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  return view.getBigUint64(0, true)
}

export function parseSlotHashes(data) {
  if (!(data instanceof Uint8Array) || data.byteLength < 8) {
    throw new Error('The SlotHashes sysvar returned invalid data.')
  }
  const count = Number(readU64LE(data, 0))
  const entrySize = 40
  if (!Number.isSafeInteger(count) || count < 0 || 8 + count * entrySize > data.byteLength) {
    throw new Error('The SlotHashes sysvar returned an invalid entry count.')
  }
  const slots = []
  for (let index = 0; index < count; index += 1) {
    slots.push(readU64LE(data, 8 + index * entrySize))
  }
  return slots
}

export function getLookupTableLifecycle(state, slotHashes, currentSlot) {
  const deactivationSlot = BigInt(state.deactivationSlot)
  const current = BigInt(currentSlot)
  if (deactivationSlot === LOOKUP_TABLE_U64_MAX) {
    return { status: 'active', remainingSlots: null }
  }
  if (deactivationSlot === current) {
    return { status: 'deactivating', remainingSlots: LOOKUP_TABLE_COOLDOWN_SLOTS + 1 }
  }
  const position = slotHashes.findIndex((slot) => slot === deactivationSlot)
  if (position === -1 && deactivationSlot < current) {
    return { status: 'ready', remainingSlots: 0 }
  }
  return {
    status: 'deactivating',
    remainingSlots: position >= 0
      ? Math.max(1, LOOKUP_TABLE_COOLDOWN_SLOTS - position)
      : LOOKUP_TABLE_COOLDOWN_SLOTS + 1,
  }
}

export function formatSolFromLamports(lamports) {
  const value = Number(lamports) / LAMPORTS_PER_SOL
  return value.toFixed(9).replace(/0+$/, '').replace(/\.$/, '') || '0'
}

export function isCctpLookupTable(state) {
  return state.addresses.some((address) => CCTP_PROGRAM_ADDRESSES.has(address.toBase58()))
}

export function lookupTableExplorerUrl(environment, address, type = 'address') {
  const cluster = environment === 'testnet' ? '?cluster=devnet' : ''
  return `https://explorer.solana.com/${type}/${address}${cluster}`
}

async function fetchSlotHashesSnapshot(connection) {
  const [accountInfo, currentSlot] = await Promise.all([
    connection.getAccountInfo(SYSVAR_SLOT_HASHES_PUBKEY, 'confirmed'),
    connection.getSlot('confirmed'),
  ])
  if (!accountInfo?.data) throw new Error('Could not read the Solana SlotHashes sysvar.')
  return {
    slotHashes: parseSlotHashes(accountInfo.data),
    currentSlot,
  }
}

export async function scanLookupTables(connection, authority, environment) {
  const authorityKey = authority instanceof PublicKey ? authority : new PublicKey(authority)
  const [accounts, snapshot] = await Promise.all([
    connection.getProgramAccounts(AddressLookupTableProgram.programId, {
      commitment: 'confirmed',
      filters: [
        { memcmp: { offset: LOOKUP_TABLE_AUTHORITY_OPTION_OFFSET, bytes: '2' } },
        { memcmp: { offset: LOOKUP_TABLE_AUTHORITY_OFFSET, bytes: authorityKey.toBase58() } },
      ],
    }),
    fetchSlotHashesSnapshot(connection),
  ])

  const tables = accounts.flatMap(({ pubkey, account }) => {
    try {
      const state = AddressLookupTableAccount.deserialize(account.data)
      if (!state.authority?.equals(authorityKey)) return []
      const lifecycle = getLookupTableLifecycle(
        state,
        snapshot.slotHashes,
        snapshot.currentSlot,
      )
      const address = pubkey.toBase58()
      return [{
        address,
        addressCount: state.addresses.length,
        authority: state.authority.toBase58(),
        balanceLamports: account.lamports,
        balanceSol: formatSolFromLamports(account.lamports),
        cctpRelated: isCctpLookupTable(state),
        deactivationSlot: state.deactivationSlot.toString(),
        explorerUrl: lookupTableExplorerUrl(environment, address),
        lastExtendedSlot: state.lastExtendedSlot,
        shared: CIRCLE_SHARED_LOOKUP_TABLES.has(address),
        ...lifecycle,
      }]
    } catch {
      return []
    }
  })

  const statusRank = { ready: 0, active: 1, deactivating: 2 }
  tables.sort((a, b) => (
    Number(b.cctpRelated) - Number(a.cctpRelated)
    || statusRank[a.status] - statusRank[b.status]
    || b.balanceLamports - a.balanceLamports
  ))
  return tables
}

async function assertLookupTableActionReady(connection, authority, lookupTable, action) {
  const { value } = await connection.getAddressLookupTable(lookupTable, { commitment: 'confirmed' })
  if (!value) throw new Error('This Lookup Table no longer exists.')
  if (!value.state.authority?.equals(authority)) {
    throw new Error('The connected wallet is no longer this Lookup Table authority.')
  }
  const snapshot = await fetchSlotHashesSnapshot(connection)
  const lifecycle = getLookupTableLifecycle(
    value.state,
    snapshot.slotHashes,
    snapshot.currentSlot,
  )
  if (action === 'deactivate' && lifecycle.status !== 'active') {
    throw new Error('This Lookup Table has already been deactivated.')
  }
  if (action === 'close' && lifecycle.status !== 'ready') {
    throw new Error('This Lookup Table is still cooling down and cannot be closed yet.')
  }
  return lifecycle
}

export async function sendLookupTableAction({
  action,
  authority,
  connection,
  lookupTable,
  sendTransaction,
}) {
  if (action !== 'deactivate' && action !== 'close') {
    throw new Error(`Unsupported Lookup Table action: ${action}`)
  }
  if (typeof sendTransaction !== 'function') {
    throw new Error('The connected wallet cannot send Solana transactions.')
  }
  const authorityKey = authority instanceof PublicKey ? authority : new PublicKey(authority)
  const lookupTableKey = lookupTable instanceof PublicKey ? lookupTable : new PublicKey(lookupTable)
  await assertLookupTableActionReady(connection, authorityKey, lookupTableKey, action)

  const instruction = action === 'deactivate'
    ? AddressLookupTableProgram.deactivateLookupTable({
        lookupTable: lookupTableKey,
        authority: authorityKey,
      })
    : AddressLookupTableProgram.closeLookupTable({
        lookupTable: lookupTableKey,
        authority: authorityKey,
        recipient: authorityKey,
      })
  const latestBlockhash = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({
    feePayer: authorityKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(instruction)
  const signature = await sendTransaction(transaction, connection, {
    maxRetries: 3,
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  })
  const confirmation = await connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  }, 'confirmed')
  if (confirmation.value.err) {
    throw new Error(`The transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }
  return signature
}
