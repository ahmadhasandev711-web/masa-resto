import { describe, it, expect } from 'vitest';

const shouldSkip = true;

describe.skipIf(shouldSkip)('Skip test demo', () => {
  it('should be skipped', () => {
    expect(true).toBe(false);
  });
});
