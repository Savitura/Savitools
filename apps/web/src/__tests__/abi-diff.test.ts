import { compareAbis } from '@/lib/abi-diff';

describe('abi-diff', () => {
  it('detects added, removed, and changed methods and events', () => {
    const before = {
      methods: [
      {
          name: 'transfer',
          arguments: [
            { name: 'to', type: 'Address' },
            { name: 'amount', type: 'i128' },
          ],
          returnType: 'bool',
        },
        {
          name: 'balance',
          arguments: [{ name: 'id', type: 'Address' }],
          returnType: 'i128',
        },
      ],
      events: [
        {
          name: 'Transfer',
          topics: [
            { name: 'from', indexed: true },
            { name: 'to', indexed: true },
          ],
        },
      ],
    };

    const after = {
        methods: [
        // changed signature for transfer (added a memo argument)
        {
          name: 'transfer',
          arguments: [
            { name: 'to', type: 'Address' },
            { name: 'amount', type: 'i128' },
            { name: 'memo', type: 'Bytes' },
        ],
          returnType: 'bool',
      },
        // balance removed
        // added mint method
        {
          name: 'mint',
          arguments: [
            { name: 'to', type: 'Address' },
            { name: 'amount', type: 'i128' },
          ],
          returnType: 'Void',
        },
      ],
      events: [
        // Transfer event kept
        {
          name: 'Transfer',
          topics: [
            { name: 'from', indexed: true },
            { name: 'to', indexed: true },
          ],
        },
        // added Burn event
        {
          name: 'Burn',
          topics: [{ name: 'owner', indexed: true }],
        },
      ],
    };

    const changes = compareAbis(before, after);

    const changedTransfer = changes.find((c) => c.name === 'transfer' && c.kind === 'method');
    expect(changedTransfer).toBeDefined();
    expect(changedTransfer?.classification).toBe('breaking');
    expect(changedTransfer?.detail).toContain('Changed method signature');

    const removedBalance = changes.find((c) => c.name === 'balance' && c.kind === 'method');
    expect(removedBalance).toBeDefined();
    expect(removedBalance?.classification).toBe('breaking');
    expect(removedBalance?.detail).toContain('Removed method balance');

    const addedMint = changes.find((c) => c.name === 'mint' && c.kind === 'method');
    expect(addedMint).toBeDefined();
    expect(addedMint?.classification).toBe('additive');
    expect(addedMint?.detail).toContain('Added method mint');

    const addedBurn = changes.find((c) => c.name === 'Burn' && c.kind === 'event');
    expect(addedBurn).toBeDefined();
    expect(addedBurn?.classification).toBe('additive');
    expect(addedBurn?.detail).toContain('Added event Burn');
  });
});