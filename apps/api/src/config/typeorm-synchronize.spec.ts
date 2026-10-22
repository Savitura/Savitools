import { shouldSynchronizeSchema } from './typeorm-synchronize';

describe('shouldSynchronizeSchema', () => {
  it('is true only for development and test', () => {
    expect(shouldSynchronizeSchema('development')).toBe(true);
    expect(shouldSynchronizeSchema('test')).toBe(true);
    expect(shouldSynchronizeSchema('Development')).toBe(true);
  });

  it('is false for production, staging, preview, and unset', () => {
    expect(shouldSynchronizeSchema('production')).toBe(false);
    expect(shouldSynchronizeSchema('staging')).toBe(false);
    expect(shouldSynchronizeSchema('preview')).toBe(false);
    expect(shouldSynchronizeSchema(undefined)).toBe(false);
    expect(shouldSynchronizeSchema('')).toBe(false);
  });
});
