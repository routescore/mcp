import { describe, it, expect } from 'vitest';
import { apiKeyStartupError } from './key-check.js';

const VALID_KEY = `rs_live_${'0123456789abcdef'.repeat(4)}`; // 64 lowercase hex chars

describe('apiKeyStartupError (startup key check, 0.3.0)', () => {
  it('missing / empty / whitespace-only key → actionable "not set" error', () => {
    for (const value of [undefined, '', '   ']) {
      const err = apiKeyStartupError(value);
      expect(err).toBeTruthy();
      expect(err).toContain('ROUTESCORE_API_KEY is not set');
      expect(err).toContain('https://www.routescore.io/account');
    }
  });

  it('values that cannot be a minted key → format error that never echoes the value', () => {
    for (const value of [
      'dummy',
      'sk-proj-abc123',
      `Bearer ${VALID_KEY}`,
      'rs_test_something', // only rs_live_ keys are minted (app/src/lib/db/api-keys.ts)
      'rs_live_not_hex', // wrong charset
      `rs_live_${'a'.repeat(63)}`, // one hex char short
      `rs_live_${'a'.repeat(65)}`, // one hex char long
      `rs_live_${'A'.repeat(64)}`, // uppercase — toString('hex') mints lowercase
    ]) {
      const err = apiKeyStartupError(value);
      expect(err, `expected format error for ${JSON.stringify(value.slice(0, 12))}…`).toBeTruthy();
      expect(err).toContain('does not look like a Routescore API key');
      // Never leak the configured value (it may be a mis-pasted real secret).
      expect(err).not.toContain(value);
    }
  });

  it('the exact minted shape (rs_live_ + 64 lowercase hex) passes; verification stays server-side via whoami', () => {
    expect(apiKeyStartupError(VALID_KEY)).toBeNull();
    // Trimmed before checking (env files often carry stray whitespace).
    expect(apiKeyStartupError(`  ${VALID_KEY}  `)).toBeNull();
  });
});
