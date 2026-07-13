/**
 * Trust-envelope enforcement for the Routescore MCP wrapper.
 *
 * Extracted from index.ts so this load-bearing downgrade logic can be unit
 * tested in isolation (see trust.test.ts). The wrapper's contract: never
 * present a Routescore response to an MCP client as trustworthy unless it
 * carries the complete trust envelope; otherwise stamp it `degraded` with
 * explicit caveats so a missing/partial envelope can never be mistaken for a
 * valid result.
 */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasTrustEnvelope(body: unknown): body is JsonRecord {
  if (!isRecord(body)) return false;
  return (
    typeof body.score_state === 'string' &&
    isRecord(body.source_freshness) &&
    typeof body.methodology_version === 'string' &&
    isRecord(body.confidence_band) &&
    Array.isArray(body.caveats) &&
    isRecord(body.commercial_disclosure)
  );
}

export function fallbackTrustEnvelope(): JsonRecord {
  const generatedAt = new Date().toISOString();
  return {
    score_state: 'degraded',
    source_freshness: {
      state: 'unknown',
      checked_at: generatedAt,
      max_age_seconds: null,
      sources: [
        {
          name: 'routescore_api',
          freshness_state: 'unknown',
          as_of: null,
          age_seconds: null,
        },
      ],
    },
    methodology_version: 'routescore.mcp.wrapper.v1',
    confidence_band: {
      low: null,
      high: null,
      unit: 'bps',
      label: 'upstream_trust_envelope_missing',
    },
    caveats: [
      'MCP received a Routescore response without the complete trust envelope; treat this result as degraded decision support.',
      'Routescore MCP does not execute trades, route funds, or guarantee outcomes.',
    ],
    commercial_disclosure: {
      paid_placement: false,
      score_influenced_by_partner: false,
      message: 'MCP wrapper detected no paid-placement signal in the response; scoring claims require the API trust envelope.',
    },
    generated_at: generatedAt,
    decision_support_only: true,
  };
}

export function ensureTrustEnvelope(body: unknown): JsonRecord {
  if (hasTrustEnvelope(body)) return body;
  const base = isRecord(body) ? body : { data: body };
  const trust = fallbackTrustEnvelope();
  return {
    ...base,
    ...trust,
    trust,
    mcp_response_validation: {
      trust_envelope_present: false,
      wrapper_action: 'marked_degraded',
    },
  };
}

/**
 * An EVALUATED gateway response: a body carrying a `verdict` and no `error`
 * envelope. The shipped `check_swap` contract (preflight_action.v0 §8)
 * returns HTTP 422 with a FULL evaluated response body when the verdict is
 * `unsupported` — an answer, not an error — so the wrapper must not discard
 * it as a failure.
 */
export function isEvaluatedResponse(body: unknown): body is JsonRecord {
  return isRecord(body) && typeof body.verdict === 'string' && !('error' in body);
}

export type GatewayInterpretation =
  | { kind: 'result'; body: JsonRecord }
  | { kind: 'error'; message: string };

/**
 * Decide how the wrapper relays a gateway HTTP result (ROU-715 Codex review).
 *
 * - 2xx → a tool result (trust-envelope enforced).
 * - 422 with an evaluated body (`verdict` present, no `error` object) → a
 *   tool result too: `verdict: unsupported` is first-class evidence, and its
 *   gap-state fields, caveats, and record linkage must reach the agent.
 * - Everything else (400/401/403/404/429/5xx, and 422 bodies that are NOT
 *   evaluated responses, e.g. the quote endpoints' `invalid_input` error
 *   envelopes) → an error.
 */
export function interpretGatewayResponse(
  status: number,
  ok: boolean,
  body: unknown,
): GatewayInterpretation {
  if (ok || (status === 422 && isEvaluatedResponse(body))) {
    return { kind: 'result', body: ensureTrustEnvelope(body) };
  }
  const detail = typeof body === 'object' ? JSON.stringify(body) : String(body);
  return { kind: 'error', message: `Routescore API ${status}: ${detail}` };
}
