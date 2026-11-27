import { describe, it, expect } from '@jest/globals';
// removed unused import
import { previewDestination } from '@/lib/muxed-address';

describe('muxed-address edge cases', () => {
  it('handles invalid M-addresses gracefully', () => {
    const invalidM = 'M0000000000000000000000000000000000000000000000000000000000000000000';
    const preview = previewDestination(invalidM);
    expect(preview.kind).toBeNull();
    expect(preview.account).toBeNull();
    expect(preview.muxedId).toBeNull();
  });
});
