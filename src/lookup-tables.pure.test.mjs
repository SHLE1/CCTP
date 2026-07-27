import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PublicKey } from '@solana/web3.js'
import {
  LOOKUP_TABLE_U64_MAX,
  formatSolFromLamports,
  getLookupTableLifecycle,
  isCctpLookupTable,
  lookupTableExplorerUrl,
  parseSlotHashes,
  sendLookupTableAction,
} from './lookup-tables.js'

function writeU64LE(data, offset, value) {
  new DataView(data.buffer, data.byteOffset + offset, 8).setBigUint64(0, BigInt(value), true)
}

function slotHashesData(slots) {
  const data = new Uint8Array(8 + slots.length * 40)
  writeU64LE(data, 0, slots.length)
  slots.forEach((slot, index) => writeU64LE(data, 8 + index * 40, slot))
  return data
}

describe('Lookup Table SlotHashes helpers', () => {
  it('parses the bincode slot vector without reading hash bytes', () => {
    assert.deepEqual(parseSlotHashes(slotHashesData([500n, 498n, 497n])), [500n, 498n, 497n])
  })

  it('rejects truncated SlotHashes data', () => {
    const data = slotHashesData([10n])
    writeU64LE(data, 0, 2n)
    assert.throws(() => parseSlotHashes(data), /invalid entry count/)
  })
})

describe('Lookup Table lifecycle', () => {
  it('keeps an undeactivated table active', () => {
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: LOOKUP_TABLE_U64_MAX }, [100n], 100),
      { status: 'active', remainingSlots: null },
    )
  })

  it('uses the protocol 513-slot boundary in the deactivation slot', () => {
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: 100n }, [100n], 100),
      { status: 'deactivating', remainingSlots: 513 },
    )
  })

  it('tracks the deactivation slot position in SlotHashes', () => {
    const slots = Array.from({ length: 512 }, (_, index) => 999n - BigInt(index))
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: slots[0] }, slots, 1000),
      { status: 'deactivating', remainingSlots: 512 },
    )
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: slots[511] }, slots, 1000),
      { status: 'deactivating', remainingSlots: 1 },
    )
  })

  it('marks a table ready only after its deactivation slot leaves SlotHashes', () => {
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: 400n }, [999n, 998n], 1000),
      { status: 'ready', remainingSlots: 0 },
    )
    assert.deepEqual(
      getLookupTableLifecycle({ deactivationSlot: 1001n }, [999n, 998n], 1000),
      { status: 'deactivating', remainingSlots: 513 },
    )
  })
})

describe('Lookup Table display helpers', () => {
  it('formats rent balances as SOL without float-looking zero padding', () => {
    assert.equal(formatSolFromLamports(3_730_560), '0.00373056')
    assert.equal(formatSolFromLamports(0), '0')
  })

  it('identifies tables containing a CCTP v2 program', () => {
    const address = (value) => ({ toBase58: () => value })
    assert.equal(isCctpLookupTable({ addresses: [address('11111111111111111111111111111111')] }), false)
    assert.equal(isCctpLookupTable({
      addresses: [address('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe')],
    }), true)
  })

  it('builds cluster-safe explorer links', () => {
    assert.equal(
      lookupTableExplorerUrl('mainnet', 'abc'),
      'https://explorer.solana.com/address/abc',
    )
    assert.equal(
      lookupTableExplorerUrl('testnet', 'sig', 'tx'),
      'https://explorer.solana.com/tx/sig?cluster=devnet',
    )
  })
})

describe('Lookup Table transactions', () => {
  const authority = new PublicKey('Cj4DgktnLw9nUd8MiMhG5oPgoSv4EQBsghkXTdVpXjVJ')
  const lookupTable = new PublicKey('6CeCeJRheeemo71g7DBCCAfNGAcvkSqUNijmLikKxHgP')

  function mockConnection(deactivationSlot) {
    return {
      getAddressLookupTable: async () => ({
        value: { state: { authority, deactivationSlot } },
      }),
      getAccountInfo: async () => ({ data: slotHashesData([100n, 99n]) }),
      getSlot: async () => 100,
      getLatestBlockhash: async () => ({
        blockhash: PublicKey.default.toBase58(),
        lastValidBlockHeight: 200,
      }),
      confirmTransaction: async () => ({ value: { err: null } }),
    }
  }

  it('builds a deactivate instruction signed by the authority', async () => {
    let transaction
    const signature = await sendLookupTableAction({
      action: 'deactivate',
      authority,
      connection: mockConnection(LOOKUP_TABLE_U64_MAX),
      lookupTable,
      sendTransaction: async (value) => {
        transaction = value
        return 'deactivate-signature'
      },
    })
    assert.equal(signature, 'deactivate-signature')
    assert.equal(transaction.instructions.length, 1)
    assert.equal(transaction.instructions[0].keys[0].pubkey.toBase58(), lookupTable.toBase58())
    assert.equal(transaction.instructions[0].keys[1].pubkey.toBase58(), authority.toBase58())
    assert.equal(transaction.instructions[0].keys[1].isSigner, true)
  })

  it('always returns closed account lamports to the authority wallet', async () => {
    let transaction
    await sendLookupTableAction({
      action: 'close',
      authority,
      connection: mockConnection(1n),
      lookupTable,
      sendTransaction: async (value) => {
        transaction = value
        return 'close-signature'
      },
    })
    const instruction = transaction.instructions[0]
    assert.equal(instruction.keys[0].pubkey.toBase58(), lookupTable.toBase58())
    assert.equal(instruction.keys[1].pubkey.toBase58(), authority.toBase58())
    assert.equal(instruction.keys[2].pubkey.toBase58(), authority.toBase58())
    assert.equal(instruction.keys[2].isWritable, true)
  })

  it('rejects close while the deactivation slot is still in SlotHashes', async () => {
    await assert.rejects(
      sendLookupTableAction({
        action: 'close',
        authority,
        connection: mockConnection(99n),
        lookupTable,
        sendTransaction: async () => 'unexpected',
      }),
      /still cooling down/,
    )
  })
})
