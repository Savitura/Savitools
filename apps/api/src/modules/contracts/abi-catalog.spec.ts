import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { nativeToScVal } from '@stellar/stellar-sdk';
import { buildAbiCatalog, encodeAbiArgument } from './abi-catalog';

const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

const VALID_ABI = {
  methods: [
    {
      name: 'transfer',
      args: [
        { name: 'from', type: 'Address' },
        { name: 'to', type: 'Address' },
        { name: 'amount', type: 'i128' },
      ],
      return: 'void',
    },
    {
      name: 'balance',
      args: [{ name: 'id', type: 'Address' }],
      return: 'i128',
    },
  ],
  events: [
    {
      name: 'transfer',
      args: [
        { name: 'from', type: 'Address' },
        { name: 'to', type: 'Address' },
      ],
      topics: [
        { name: 'transfer', indexed: true },
        { name: 'amount', indexed: false },
      ],
    },
  ],
};

describe('buildAbiCatalog (#219)', () => {
  it('builds a stable method and event catalog', () => {
    const entry = buildAbiCatalog(CONTRACT_ID, VALID_ABI, { network: 'testnet' });

    expect(entry.contractId).toBe(CONTRACT_ID);
    expect(entry.methods).toHaveLength(2);
    expect(entry.methods[0].name).toBe('transfer');
    expect(entry.methods[0].arguments[0]).toEqual({ name: 'from', type: 'Address' });
    expect(entry.methods[1].returnType).toBe('I128');
    expect(entry.events).toHaveLength(1);
    expect(entry.events[0].topics[0]).toEqual({ name: 'transfer', indexed: true });
  });

  it('reports field-level errors for duplicate method and event names', () => {
    expect(() =>
      buildAbiCatalog(CONTRACT_ID, {
        methods: [
          { name: 'transfer', args: [] },
          { name: 'transfer', args: [] },
        ],
        events: [],
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('reports field-level errors for unsupported types', () => {
    expect(() =>
      buildAbiCatalog(CONTRACT_ID, {
        methods: [{ name: 'set', args: [{ name: 'flag', type: 'BigInt128' }] }],
        events: [],
      }),
    ).toThrow(UnprocessableEntityException);
    try {
      buildAbiCatalog(CONTRACT_ID, {
        methods: [{ name: 'set', args: [{ name: 'flag', type: 'BigInt128' }] }],
        events: [],
      });
      fail('expected UnprocessableEntityException');
    } catch (err) {
      const response = (err as UnprocessableEntityException).getResponse() as {
        errors?: Array<{ message: string }>;
      };
      expect(JSON.stringify(response)).toMatch(/unsupported type/i);
    }
  });

  it('rejects invalid schemas, duplicate names, and oversized documents', () => {
    expect(() =>
      buildAbiCatalog(CONTRACT_ID, 'not-an-object' as unknown as Record<string, unknown>),
    ).toThrow(BadRequestException);

    const oversized = JSON.parse(
      `{"methods":[{"name":"m0","args":[{"name":"pad","type":"String"}]}],"padding":"${'x'.repeat(600 * 1024)}"}`,
    );
    expect(() => buildAbiCatalog(CONTRACT_ID, oversized)).toThrow(/maximum accepted size/);
  });

  it('rejects __proto__ keys so a pollution payload cannot reach the catalog', () => {
    const payload = JSON.parse(
      '{"methods":[],"events":[],"__proto__":{"polluted":true}}',
    ) as unknown as Record<string, unknown>;
    expect(() => buildAbiCatalog(CONTRACT_ID, payload)).toThrow(BadRequestException);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('buildAbiCatalog type resolution (#712)', () => {
  it('resolves supported types case-insensitively and canonicalizes aliases', () => {
    const entry = buildAbiCatalog(CONTRACT_ID, {
      methods: [
        {
          name: 'resolved',
          args: [
            { name: 'owner', type: 'address' },
            { name: 'flag', type: 'boolEAN' },
            { name: 'amount', type: 'i128' },
            { name: 'total', type: 'U64' },
            { name: 'maybe', type: 'option<Address>' },
          ],
          return: 'void',
        },
      ],
      events: [],
    });

    expect(entry.methods[0].arguments).toEqual([
      { name: 'owner', type: 'Address' },
      { name: 'flag', type: 'Bool' },
      { name: 'amount', type: 'I128' },
      { name: 'total', type: 'U64' },
      { name: 'maybe', type: 'Option' },
    ]);
  });

  it('rejects nested vec, map, and struct argument types as unsupported', () => {
    let thrown: unknown;
    try {
      buildAbiCatalog(CONTRACT_ID, {
        methods: [
          {
            name: 'batch',
            args: [
              { name: 'items', type: 'Vec<Map<Symbol, i128>>' },
              { name: 'record', type: 'Struct<TransferRecord>' },
            ],
          },
        ],
        events: [],
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    const response = (thrown as UnprocessableEntityException).getResponse() as {
      errors: Array<{ field: string; message: string }>;
    };
    expect(response.errors).toHaveLength(2);
    expect(response.errors.map((e) => e.field)).toEqual([
      'schema.methods[0].args.items.type',
      'schema.methods[0].args.record.type',
    ]);
    for (const error of response.errors) {
      expect(error.message).toMatch(/unsupported type/i);
    }
  });

  it('preserves nested struct and vec return types verbatim', () => {
    const entry = buildAbiCatalog(CONTRACT_ID, {
      methods: [
        { name: 'accounts', args: [], return: 'Vec<Address>' },
        { name: 'balances', args: [], return: 'Map<Symbol, i128>' },
        { name: 'record', args: [], return: 'TransferRecord' },
      ],
      events: [],
    });

    expect(entry.methods.map((m) => m.returnType)).toEqual([
      'Vec<Address>',
      'Map<Symbol, i128>',
      'TransferRecord',
    ]);
  });
});

describe('encodeAbiArgument (#219)', () => {
  it('preserves decimal precision beyond binary floating point for i128', () => {
    const exact = '170141183460469231731687303715884105727';
    const { decoded } = encodeAbiArgument('i128', exact);
    expect(decoded.type).toMatch(/i128/i);
    expect(decoded.value).toBe(exact);
  });

  it('round-trips an Address argument through the SCVal utilities', () => {
    const accountId = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
    const { decoded } = encodeAbiArgument('Address', accountId);
    expect(decoded.type).toBe('scvAddress');
    expect(decoded.value).toBe(accountId);
  });

  it('rejects unsupported types', () => {
    expect(() => encodeAbiArgument('Vec<Map<String,i64>>', {})).toThrow(
      /Unsupported argument type/,
    );
  });

  it('matches nativeToScVal output byte-for-byte for u64 decimal strings', () => {
    const expected = nativeToScVal(9007199254740993n, { type: 'u64' });
    const { xdrBase64, decoded } = encodeAbiArgument('u64', '9007199254740993');
    expect(xdrBase64).toBe(expected.toXDR('base64'));
    expect(decoded.value).toBe('9007199254740993');
  });
});
