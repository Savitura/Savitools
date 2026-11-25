import { ComposerStateSchema } from './composer-state.schema';

describe('ComposerStateSchema.validate', () => {
  const validData = {
    sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
    memo: 'test memo',
    operations: [
      {
        type: 'ManageBuyOffer',
        fields: {
          selling: 'USD',
          buying: 'EUR',
          amount: '100',
        },
      },
    ],
  };

  it('returns null for valid data with all fields', () => {
    const result = ComposerStateSchema.validate(validData);
    expect(result).toBeNull();
  });

  it('returns null for valid data without sourceAccount', () => {
    const result = ComposerStateSchema.validate({
      memo: 'test memo',
    });
    expect(result).toBeNull();
  });

  it('returns null for valid data without memo', () => {
    const result = ComposerStateSchema.validate({
      sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
    });
    expect(result).toBeNull();
  });

  it('returns null for valid data without operations', () => {
    const result = ComposerStateSchema.validate({
      sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      memo: 'test memo',
    });
    expect(result).toBeNull();
  });

  it('returns error when data is null', () => {
    const result = ComposerStateSchema.validate(null);
    expect(result).toBe('composer state must be an object');
  });

  it('returns error when data is undefined', () => {
    const result = ComposerStateSchema.validate(undefined);
    expect(result).toBe('composer state must be an object');
  });

  it('returns error when data is an array', () => {
    const result = ComposerStateSchema.validate([1, 2, 3]);
    expect(result).toBe('composer state must be an object');
  });

  it('returns error when data is a string', () => {
    const result = ComposerStateSchema.validate('invalid');
    expect(result).toBe('composer state must be an object');
  });

  it('returns error when data is a number', () => {
    const result = ComposerStateSchema.validate(42);
    expect(result).toBe('composer state must be an object');
  });

  it('returns error when sourceAccount is not a string', () => {
    const result = ComposerStateSchema.validate({
      sourceAccount: 123,
    });
    expect(result).toBe('sourceAccount must be a string');
  });

  it('returns error when memo is not a string', () => {
    const result = ComposerStateSchema.validate({
      memo: 123,
    });
    expect(result).toBe('memo must be a string');
  });

  it('returns error when operations is not an array', () => {
    const result = ComposerStateSchema.validate({
      operations: 'not-an-array',
    });
    expect(result).toBe('operations must be an array');
  });

  it('returns error when operations[index] is not an object', () => {
    const result = ComposerStateSchema.validate({
      operations: ['not an object'],
    });
    expect(result).toBe('operations[0] must be an object');
  });

  it('returns error when operations[index] is an array', () => {
    const result = ComposerStateSchema.validate({
      operations: [[{ type: 'test' }]],
    });
    expect(result).toBe('operations[0] must be an object');
    expect(result).toBe('operations[1] must be an object');
  });

  it('returns error when operations[index].type is not a string', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: 123 }],
    });
    expect(result).toBe('operations[0].type must be a non-empty string');
  });

  it('returns error when operations[index].type is an empty string', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: '' }],
    });
    expect(result).toBe('operations[0].type must be a non-empty string');
  });

  it('returns error when operations[index].fields is not an object', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: 'ManageBuyOffer', fields: 'not-an-object' }],
    });
    expect(result).toBe('operations[0].fields must be an object');
  });

  it('returns error when operations[index].fields is null', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: 'ManageBuyOffer', fields: null }],
    });
    expect(result).toBe('operations[0].fields must be an object');
  });

  it('returns error when operations[index].fields is an array', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: 'ManageBuyOffer', fields: [1, 2, 3] }],
    });
    expect(result).toBe('operations[0].fields must be an object');
  });

  it('accepts operations with fields omitted', () => {
    const result = ComposerStateSchema.validate({
      operations: [{ type: 'ManageBuyOffer' }],
    });
    expect(result).toBeNull();
  });

  it('accepts empty operations array', () => {
    const result = ComposerStateSchema.validate({
      operations: [],
    });
    expect(result).toBeNull();
  });
});