import { ComposerStateSchema } from './composer-state.schema';

describe('ComposerStateSchema', () => {
  it('returns null for valid composer state objects', () => {
    const validState = {
      sourceAccount: 'GA...', 
      memo: 'test memo',
      operations: [
        {
          type: 'payment',
          fields: {
            destination: 'GB...', 
            amount: '10',
          },
        },
      ],
    };

    expect(ComposerStateSchema.validate(validState)).toBeNull();
  });

  it('accepts empty or minimal valid states', () => {
    expect(ComposerStateSchema.validate({})).toBeNull();
  });

  it('rejects non-object values', () => {
    expect(ComposerStateSchema.validate(null)).toBe('composer state must be an object');
    expect(ComposerStateSchema.validate(undefined)).toBe('composer state must be an object');
    expect(ComposerStateSchema.validate([])).toBe('composer state must be an object');
    expect(ComposerStateSchema.validate('string')).toBe('composer state must be an object');
  });

  it('rejects non-string sourceAccount', () => {
    expect(ComposerStateSchema.validate({ sourceAccount: 123 })).toBe('sourceAccount must be a string');
  });

  it('rejects non-string memo', () => {
    expect(ComposerStateSchema.validate({ memo: true })).toBe('memo must be a string');
  });

  it('rejects non-array operations', () => {
    expect(ComposerStateSchema.validate({ operations: 'not-an-array' })).toBe('operations must be an array');
  });

  it('rejects operations entries that are not objects', () => {
    expect(ComposerStateSchema.validate({ operations: [null] })).toBe('operations[0] must be an object');
    expect(ComposerStateSchema.validate({ operations: ['string-op'] })).toBe('operations[0] must be an object');
    expect(ComposerStateSchema.validate({ operations: [[]] })).toBe('operations[0] must be an object');
  });

  it('rejects operations without valid type', () => {
    expect(ComposerStateSchema.validate({ operations: [{}] })).toBe('operations[0].type must be a non-empty string');
    expect(ComposerStateSchema.validate({ operations: [{ type: 123 }] })).toBe('operations[0].type must be a non-empty string');
    expect(ComposerStateSchema.validate({ operations: [{ type: '' }] })).toBe('operations[0].type must be a non-empty string');
  });

  it('rejects operations with invalid fields property', () => {
    expect(
      ComposerStateSchema.validate({
        operations: [
          {
            type: 'payment',
            fields: 'not-an-object',
          },
        ],
      }),
    ).toBe('operations[0].fields must be an object');

    expect(
      ComposerStateSchema.validate({
        operations: [
          {
            type: 'payment',
            fields: null,
          },
        ],
      }),
    ).toBe('operations[0].fields must be an object');

    expect(
      ComposerStateSchema.validate({
        operations: [
          {
            type: 'payment',
            fields: [],
          },
        ],
      }),
    ).toBe('operations[0].fields must be an object');
  });
});
