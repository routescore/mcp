import { describe, it, expect } from 'vitest';
import {
  ensureTrustEnvelope,
  hasTrustEnvelope,
  interpretGatewayResponse,
  isEvaluatedResponse,
  isRecord,
  fallbackTrustEnvelope,
  type JsonRecord,
} from './trust.js';

const REQUIRED_FIELDS = [
  'score_state',
  'source_freshness',
  'methodology_version',
  'confidence_band',
  'caveats',
  'commercial_disclosure',
] as const;

/** A well-formed upstream trust envelope (status configurable). */
function validEnvelope(overrides: Partial<JsonRecord> = {}): JsonRecord {
  return {
    score_state: 'valid',
    source_freshness: { state: 'fresh', checked_at: '2026-06-20T00:00:00.000Z', sources: [] },
    methodology_version: 'routescore.api.v1',
    confidence_band: { low: 10, high: 20, unit: 'bps' },
    caveats: ['decision support only'],
    commercial_disclosure: { paid_placement: false, score_influenced_by_partner: false },
    ...overrides,
  };
}

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });
  it('rejects arrays, null, and primitives', () => {
    for (const v of [[1, 2], null, undefined, 'x', 5, true]) {
      expect(isRecord(v)).toBe(false);
    }
  });
});

describe('hasTrustEnvelope', () => {
  it('accepts a complete, well-typed envelope', () => {
    expect(hasTrustEnvelope(validEnvelope())).toBe(true);
  });

  for (const field of REQUIRED_FIELDS) {
    it(`rejects when ${field} is missing`, () => {
      const e = validEnvelope();
      delete (e as Record<string, unknown>)[field];
      expect(hasTrustEnvelope(e)).toBe(false);
    });
  }

  it('rejects wrong-typed fields', () => {
    expect(hasTrustEnvelope(validEnvelope({ caveats: { not: 'an array' } }))).toBe(false);
    expect(hasTrustEnvelope(validEnvelope({ score_state: 123 }))).toBe(false);
    expect(hasTrustEnvelope(validEnvelope({ source_freshness: 'fresh' }))).toBe(false);
    expect(hasTrustEnvelope(validEnvelope({ commercial_disclosure: [] }))).toBe(false);
  });

  it('rejects non-records', () => {
    for (const v of ['x', 5, null, undefined, [1, 2]]) {
      expect(hasTrustEnvelope(v)).toBe(false);
    }
  });
});

describe('ensureTrustEnvelope', () => {
  it('returns a complete envelope unchanged (identity, no validation stamp)', () => {
    const e = validEnvelope();
    const out = ensureTrustEnvelope(e);
    expect(out).toBe(e);
    expect(out.mcp_response_validation).toBeUndefined();
  });

  it('passes a well-formed degraded/stale/partial upstream envelope through verbatim', () => {
    for (const state of ['degraded', 'stale', 'partial', 'unsupported']) {
      const upstream = validEnvelope({ score_state: state });
      const out = ensureTrustEnvelope(upstream);
      expect(out).toBe(upstream);
      expect(out.score_state).toBe(state);
      expect(out.mcp_response_validation).toBeUndefined();
    }
  });

  for (const field of REQUIRED_FIELDS) {
    it(`marks a body degraded when ${field} is missing`, () => {
      const e = validEnvelope();
      delete (e as Record<string, unknown>)[field];
      const out = ensureTrustEnvelope(e);
      expect(out.score_state).toBe('degraded');
      expect(out.mcp_response_validation).toEqual({
        trust_envelope_present: false,
        wrapper_action: 'marked_degraded',
      });
      // The fallback trust object is always attached for downstream inspection.
      expect(isRecord(out.trust)).toBe(true);
      expect(out.decision_support_only).toBe(true);
    });
  }

  it('wraps a non-record body under `data` and marks it degraded', () => {
    for (const v of ['upstream string', 42, [1, 2, 3], null]) {
      const out = ensureTrustEnvelope(v);
      expect(out.data).toEqual(v);
      expect(out.score_state).toBe('degraded');
      expect(out.mcp_response_validation).toEqual({
        trust_envelope_present: false,
        wrapper_action: 'marked_degraded',
      });
    }
  });

  it('marks a malformed-JSON {raw} body degraded while preserving raw', () => {
    const out = ensureTrustEnvelope({ raw: '<html>502 Bad Gateway</html>' });
    expect(out.score_state).toBe('degraded');
    expect(out.raw).toBe('<html>502 Bad Gateway</html>');
  });

  it('marks a whoami-shaped body (no envelope) degraded — pins the known /me quirk', () => {
    // /api/public/v1/me returns a bare body with no trust envelope, so the
    // wrapper currently force-degrades a healthy key check. This test documents
    // that intended behavior so it does not silently regress to stripping the
    // envelope; the upstream fix is to envelope /me (tracked separately).
    const out = ensureTrustEnvelope({ authenticated: true, email: 'a@b.co', tier: 'power' });
    expect(out.score_state).toBe('degraded');
    expect(out.authenticated).toBe(true);
    expect(out.email).toBe('a@b.co');
  });

  it('never lets a degraded fallback be mistaken for valid (shape is complete)', () => {
    const out = ensureTrustEnvelope({});
    expect(hasTrustEnvelope(out)).toBe(true); // shape-complete...
    expect(out.score_state).toBe('degraded'); // ...but explicitly degraded.
  });
});

describe('fallbackTrustEnvelope', () => {
  it('is itself a shape-complete, degraded envelope', () => {
    const fb = fallbackTrustEnvelope();
    expect(hasTrustEnvelope(fb)).toBe(true);
    expect(fb.score_state).toBe('degraded');
    expect(Array.isArray(fb.caveats)).toBe(true);
    expect((fb.caveats as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('interpretGatewayResponse — evaluated 422 pass-through (ROU-715 Codex review)', () => {
  /** A full evaluated check_swap 422 body: verdict unsupported, gap-state
   * fields, record linkage, and the complete trust envelope — an answer,
   * not an error (preflight_action.v0 §8). */
  function evaluated422Body(): JsonRecord {
    return validEnvelope({
      score_state: 'unsupported',
      verdict: 'unsupported',
      chain: null,
      route: null,
      token_safety: { state: 'not_evaluated', recognized: false, flags: [], caveats: [] },
      reference_price: {
        state: 'unsupported',
        freshness: 'unsupported',
        as_of: null,
        staleness_seconds: null,
        caveats: ['No tokenized-asset reference-price relationship is recognized for this request.'],
      },
      market_regime: { state: 'unsupported', regime: 'unknown', as_of: null, caveats: ['n/a'] },
      reasons: ['chain_not_supported'],
      evidence_bundle_id: 'preflight:abc',
      record_id: 'abc',
      record_output_hash: 'sha256:00',
    });
  }

  it('relays an evaluated 422 body as a normal result, envelope intact (round-trip)', () => {
    const body = evaluated422Body();
    const out = interpretGatewayResponse(422, false, body);
    expect(out.kind).toBe('result');
    if (out.kind === 'result') {
      // Envelope already complete → identity pass-through, nothing degraded.
      expect(out.body).toBe(body);
      expect(out.body.verdict).toBe('unsupported');
      expect((out.body.reference_price as JsonRecord).state).toBe('unsupported');
      expect(out.body.record_id).toBe('abc');
      expect(out.body.mcp_response_validation).toBeUndefined();
    }
  });

  it('a 400 invalid_input error envelope still errors', () => {
    const out = interpretGatewayResponse(400, false, {
      error: { code: 'invalid_input', message: '`notional_usd` is required.' },
      ...validEnvelope({ score_state: 'unsupported' }),
    });
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.message).toContain('Routescore API 400');
      expect(out.message).toContain('invalid_input');
    }
  });

  it('a NON-evaluated 422 body (quote-endpoint error envelope, no verdict) still errors', () => {
    const out = interpretGatewayResponse(422, false, {
      error: { code: 'invalid_input', message: 'validation failed' },
    });
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).toContain('Routescore API 422');
  });

  it('true errors on every other status stay errors', () => {
    for (const status of [401, 403, 404, 429, 500, 502]) {
      const out = interpretGatewayResponse(status, false, { error: { code: 'x', message: 'y' } });
      expect(out.kind).toBe('error');
      if (out.kind === 'error') expect(out.message).toContain(`Routescore API ${status}`);
    }
  });

  it('a 2xx body still relays through the trust-envelope wrapper', () => {
    const out = interpretGatewayResponse(200, true, { authenticated: true });
    expect(out.kind).toBe('result');
    if (out.kind === 'result') {
      // No envelope upstream → marked degraded, never silently trusted.
      expect(out.body.score_state).toBe('degraded');
    }
  });

  it('an evaluated 422 body MISSING the envelope is relayed but marked degraded', () => {
    const out = interpretGatewayResponse(422, false, { verdict: 'unsupported', reasons: [] });
    expect(out.kind).toBe('result');
    if (out.kind === 'result') {
      expect(out.body.verdict).toBe('unsupported');
      expect(out.body.score_state).toBe('degraded');
      expect(out.body.mcp_response_validation).toEqual({
        trust_envelope_present: false,
        wrapper_action: 'marked_degraded',
      });
    }
  });

  it('isEvaluatedResponse requires a string verdict and no error object', () => {
    expect(isEvaluatedResponse({ verdict: 'unsupported' })).toBe(true);
    expect(isEvaluatedResponse({ verdict: 'caution' })).toBe(true);
    expect(isEvaluatedResponse({ verdict: 42 })).toBe(false);
    expect(isEvaluatedResponse({ error: { code: 'x' }, verdict: 'unsupported' })).toBe(false);
    expect(isEvaluatedResponse({ error: { code: 'x' } })).toBe(false);
    expect(isEvaluatedResponse(null)).toBe(false);
    expect(isEvaluatedResponse('unsupported')).toBe(false);
  });
});
