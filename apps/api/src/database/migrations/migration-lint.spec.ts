import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from '@jest/globals';

describe('migration filename lint', () => {
  it('has strictly increasing and unique numeric timestamp prefixes', () => {
    const migrationsDir = join(__dirname);
    const files = readdirSync(migrationsDir).filter(
      (file: string) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
    );

    const timestamps: number[] = [];
    for (const file of files) {
      const match = file.match(/^(\d+)-/);
      expect(match).not.toBeNull();
      const ts = Number(match![1]);
      timestamps.push(ts);
    }

    const uniqueTimestamps = new Set<number>(timestamps);
    expect(uniqueTimestamps.size).toBe(timestamps.length);

    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });
});
