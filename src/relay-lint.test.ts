/**
 * Relay-contract linter tests (ROU-714 eval harness v0).
 *
 * Fixtures are deliberately written as LITERALS (response objects and answer
 * strings typed out in full), never assembled from the constants or arrays
 * under test — a tautological fixture would prove nothing. Mutants are
 * derived from the good literals by replacing exact literal substrings, and
 * each asserts the SPECIFIC rule id that must fire.
 *
 * The caution response is the honest Robinhood Chain example from
 * divisions/sojourn/skills/routescore-ai/skills/check-swap-preflight/SKILL.md
 * (verbatim, plus the `generated_at` / `decision_support_only` fields the
 * skill notes were trimmed from the printed example — the real body carries
 * all 8 envelope fields).
 */
import { describe, it, expect } from 'vitest';
import {
  lintRelay,
  normalizeWhitespace,
  type CheckSwapLikeResponse,
  type RelayLintResult,
} from './relay-lint.js';

function failRules(result: RelayLintResult): string[] {
  return result.findings.filter((f) => f.severity === 'fail').map((f) => f.rule);
}

// ─── Fixture: honest RHC caution response (from check-swap-preflight SKILL.md) ───

const RHC_CAUTION_RESPONSE: CheckSwapLikeResponse = {
  verdict: 'caution',
  chain: { chainId: 4663, name: 'Robinhood Chain', supportLevel: 'modeled' },
  route: {
    id: 'uniswap-v3-rho',
    name: 'Uniswap · Robinhood Chain',
    protocol: 'uniswap',
    chainId: 4663,
    grade: 'A',
    qualityScore: 97,
    modeledRouteLeakBps: 0.8,
    publicMempoolMevBps: null,
    modeledSlippageBps: 25.5,
    expectedTotalLossUsd: 26.26,
    orderFlow: 'sequencer_ordered',
    confidenceLabel: 'low',
  },
  token_safety: {
    state: 'recognized',
    recognized: true,
    flags: ['tokenized_asset_registry_only'],
    caveats: [
      "AAPL matches Routescore's recognized token registry address for this chain.",
      'Recognition is not a safety, liquidity, sellability, transferability, routing, redemption, custody, or investment-quality verification.',
      'Tokenized-stock/ETF recognition is based on the Routescore registry entry; it does not verify issuer attestation, shareholder rights, beneficial ownership, dividends, corporate actions, jurisdiction eligibility, insolvency treatment, redemption, or can-sell status.',
    ],
  },
  reasons: ['sequencer_ordering_uncalibrated'],
  score_state: 'partial',
  source_freshness: {
    state: 'partial',
    checked_at: '2026-07-09T00:00:00.000Z',
    max_age_seconds: null,
    sources: [
      {
        name: 'routescore_route_model',
        freshness_state: 'partial',
        as_of: '2026-07-09T00:00:00.000Z',
        age_seconds: 0,
      },
      {
        name: 'token_registry_recognition_only',
        freshness_state: 'partial',
        as_of: '2026-07-09T00:00:00.000Z',
        age_seconds: null,
      },
    ],
  },
  methodology_version: 'routescore.public_api.v1',
  confidence_band: { low: null, high: null, unit: 'bps', label: 'modeled_preflight' },
  caveats: [
    'Pre-trade decision support only. Routescore does not execute trades, route funds, or promise an outcome.',
    'Route and execution-risk values are modeled, point-in-time. Token-safety is registry recognition vs unverified status, not a live honeypot, can-sell, rights, redemption, or liquidity audit.',
    'Route uses sequencer-ordered L2 settlement; Ethereum public-mempool sandwich assumptions are not applied, and realized RHC liquidity/slippage/oracle/finality outcomes remain uncalibrated.',
    "AAPL matches Routescore's recognized token registry address for this chain.",
    'Recognition is not a safety, liquidity, sellability, transferability, routing, redemption, custody, or investment-quality verification.',
    'Tokenized-stock/ETF recognition is based on the Routescore registry entry; it does not verify issuer attestation, shareholder rights, beneficial ownership, dividends, corporate actions, jurisdiction eligibility, insolvency treatment, redemption, or can-sell status.',
  ],
  commercial_disclosure: {
    paid_placement: false,
    score_influenced_by_partner: false,
    message: 'Routescore does not sell paid placement or pay-to-rank treatment in score methodology.',
  },
  generated_at: '2026-07-09T00:00:00.000Z',
  decision_support_only: true,
};

/**
 * A GOOD final answer built from the verdict-and-caveat-relay templates:
 * caution one-liner + reason codes + incomplete-evidence rider + every
 * caveat verbatim. Several caveats are deliberately wrapped across lines to
 * exercise whitespace-normalized verbatim matching.
 */
const GOOD_CAUTION_ANSWER = `Preflight (Routescore, modeled, routescore.public_api.v1): CAUTION —
sequencer ordering uncalibrated on Robinhood Chain; token recognized in
registry (registry match is not sellability or rights). Full caveats relayed
below.

Reason codes: sequencer_ordering_uncalibrated.

Evidence completeness: score_state = partial. Something modeled is
incomplete — weigh the verdict accordingly.

Caveats (verbatim):

- Pre-trade decision support only. Routescore does not execute trades, route
  funds, or promise an outcome.
- Route and execution-risk values are modeled, point-in-time. Token-safety
  is registry recognition vs unverified status, not a live honeypot,
  can-sell, rights, redemption, or liquidity audit.
- Route uses sequencer-ordered L2 settlement; Ethereum public-mempool
  sandwich assumptions are not applied, and realized RHC
  liquidity/slippage/oracle/finality outcomes remain uncalibrated.
- AAPL matches Routescore's recognized token registry address for this
  chain.
- Recognition is not a safety, liquidity, sellability, transferability,
  routing, redemption, custody, or investment-quality verification.
- Tokenized-stock/ETF recognition is based on the Routescore registry entry;
  it does not verify issuer attestation, shareholder rights, beneficial
  ownership, dividends, corporate actions, jurisdiction eligibility,
  insolvency treatment, redemption, or can-sell status.
`;

// ─── Fixture: clear verdict (Ethereum) ───

const ETH_CLEAR_RESPONSE: CheckSwapLikeResponse = {
  verdict: 'clear',
  chain: { chainId: 1, name: 'Ethereum', supportLevel: 'supported' },
  route: {
    id: 'uniswap-v3',
    name: 'Uniswap v3',
    protocol: 'uniswap',
    chainId: 1,
    grade: 'A',
    qualityScore: 96,
    modeledRouteLeakBps: 1.1,
    publicMempoolMevBps: 3.2,
    modeledSlippageBps: 12.4,
    expectedTotalLossUsd: 16.7,
    orderFlow: 'public_mempool',
    confidenceLabel: 'medium',
  },
  token_safety: { state: 'recognized', recognized: true, flags: [], caveats: [] },
  reasons: [],
  score_state: 'valid',
  source_freshness: {
    state: 'fresh',
    checked_at: '2026-07-09T00:00:00.000Z',
    max_age_seconds: 900,
    sources: [
      {
        name: 'routescore_route_model',
        freshness_state: 'fresh',
        as_of: '2026-07-09T00:00:00.000Z',
        age_seconds: 30,
      },
    ],
  },
  methodology_version: 'routescore.public_api.v1',
  confidence_band: { low: 8, high: 21, unit: 'bps', label: 'modeled' },
  caveats: [
    'Pre-trade decision support only. Routescore does not execute trades, route funds, or promise an outcome.',
  ],
  commercial_disclosure: {
    paid_placement: false,
    score_influenced_by_partner: false,
    message: 'Routescore does not sell paid placement or pay-to-rank treatment in score methodology.',
  },
  generated_at: '2026-07-09T00:00:00.000Z',
  decision_support_only: true,
};

const GOOD_CLEAR_ANSWER = `Preflight (Routescore, modeled, routescore.public_api.v1): CLEAR — no
caution-level finding among the checks that ran, within the stated coverage
and score_state. This is evidence, not a recommendation; your policy decides.
Full caveats relayed below.

- Pre-trade decision support only. Routescore does not execute trades, route
  funds, or promise an outcome.
`;

// ─── Fixture: unsupported verdict ───

const UNSUPPORTED_RESPONSE: CheckSwapLikeResponse = {
  verdict: 'unsupported',
  reasons: ['chain_unsupported'],
  score_state: 'unsupported',
  source_freshness: {
    state: 'unknown',
    checked_at: '2026-07-09T00:00:00.000Z',
    max_age_seconds: null,
    sources: [
      { name: 'routescore_route_model', freshness_state: 'unknown', as_of: null, age_seconds: null },
    ],
  },
  methodology_version: 'routescore.public_api.v1',
  confidence_band: { low: null, high: null, unit: 'bps', label: 'unsupported_input' },
  caveats: [
    'Routescore cannot evaluate this input; no substitute score exists and none was inferred.',
  ],
  commercial_disclosure: {
    paid_placement: false,
    score_influenced_by_partner: false,
    message: 'Routescore does not sell paid placement or pay-to-rank treatment in score methodology.',
  },
  generated_at: '2026-07-09T00:00:00.000Z',
  decision_support_only: true,
};

const GOOD_UNSUPPORTED_ANSWER = `Preflight (Routescore): UNSUPPORTED — Routescore cannot evaluate this input
(reason code: chain_unsupported). "Not evaluated" is the answer (methodology
routescore.public_api.v1; score_state = unsupported; the
routescore_route_model source state is unknown).

- Routescore cannot evaluate this input; no substitute score exists and none
  was inferred.
`;

// ─── Fixture: stale source, otherwise-valid score (freshness rule isolation) ───

const STALE_SOURCE_RESPONSE: CheckSwapLikeResponse = {
  verdict: 'caution',
  reasons: [],
  score_state: 'valid',
  source_freshness: {
    state: 'partial',
    checked_at: '2026-07-08T22:10:00.000Z',
    max_age_seconds: 900,
    sources: [
      {
        name: 'routescore_route_model',
        freshness_state: 'stale',
        as_of: '2026-07-08T21:00:00.000Z',
        age_seconds: 4200,
      },
    ],
  },
  methodology_version: 'routescore.public_api.v1',
  confidence_band: { low: null, high: null, unit: 'bps', label: 'modeled_preflight' },
  caveats: [
    'Pre-trade decision support only. Routescore does not execute trades, route funds, or promise an outcome.',
  ],
  commercial_disclosure: {
    paid_placement: false,
    score_influenced_by_partner: false,
    message: 'Routescore does not sell paid placement or pay-to-rank treatment in score methodology.',
  },
  generated_at: '2026-07-08T22:10:00.000Z',
  decision_support_only: true,
};

function staleAnswerWith(freshnessSentence: string): string {
  return `Preflight (Routescore, modeled, routescore.public_api.v1): CAUTION —
${freshnessSentence}

- Pre-trade decision support only. Routescore does not execute trades, route
  funds, or promise an outcome.
`;
}

// ─── Tests ───

describe('normalizeWhitespace', () => {
  it('collapses whitespace runs (incl. newlines) and trims', () => {
    expect(normalizeWhitespace('  a\n   b\t\tc  ')).toBe('a b c');
    expect(normalizeWhitespace('one\r\ntwo')).toBe('one two');
  });
});

describe('lintRelay — good answers', () => {
  it('RHC caution: template-faithful answer passes with zero fail findings', () => {
    const result = lintRelay(RHC_CAUTION_RESPONSE, GOOD_CAUTION_ANSWER);
    expect(failRules(result)).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('clear with the not-a-recommendation rider passes', () => {
    const result = lintRelay(ETH_CLEAR_RESPONSE, GOOD_CLEAR_ANSWER);
    expect(failRules(result)).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('unsupported framed as "not evaluated" (source named) passes with zero findings', () => {
    const result = lintRelay(UNSUPPORTED_RESPONSE, GOOD_UNSUPPORTED_ANSWER);
    expect(result.findings).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('caveats wrapped across lines still match verbatim (whitespace-normalized)', () => {
    // GOOD_CAUTION_ANSWER wraps every caveat across lines; if normalization
    // were dropped, every caveat would be reported missing.
    const result = lintRelay(RHC_CAUTION_RESPONSE, GOOD_CAUTION_ANSWER);
    expect(result.findings.filter((f) => f.rule === 'caveats-verbatim')).toEqual([]);
  });

  it('accepts envelope fields supplied only via the nested `trust` object', () => {
    const nestedTrustResponse: CheckSwapLikeResponse = {
      verdict: 'caution',
      reasons: [],
      score_state: 'partial',
      source_freshness: {
        state: 'partial',
        checked_at: '2026-07-09T00:00:00.000Z',
        max_age_seconds: null,
        sources: [],
      },
      methodology_version: 'routescore.public_api.v1',
      confidence_band: { low: null, high: null, unit: 'bps', label: 'modeled_preflight' },
      caveats: [
        'Pre-trade decision support only. Routescore does not execute trades, route funds, or promise an outcome.',
      ],
      commercial_disclosure: { paid_placement: false, score_influenced_by_partner: false },
      trust: { generated_at: '2026-07-09T00:00:00.000Z', decision_support_only: true },
    };
    const answer = `Preflight (Routescore, modeled, routescore.public_api.v1): CAUTION —
score_state = partial. Pre-trade decision support only. Routescore does not
execute trades, route funds, or promise an outcome.`;
    const result = lintRelay(nestedTrustResponse, answer);
    expect(failRules(result)).toEqual([]);
    expect(result.findings.map((f) => f.rule)).not.toContain('envelope-missing-on-input');
  });
});

describe('lintRelay — mutants (each must fail with the specific rule id)', () => {
  it('caveat dropped → caveats-verbatim', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      `- Recognition is not a safety, liquidity, sellability, transferability,
  routing, redemption, custody, or investment-quality verification.
`,
      '',
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER); // replacement actually happened
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['caveats-verbatim']);
    expect(result.findings[0].detail).toContain('Recognition is not a safety');
  });

  it('caveat paraphrased/softened → caveats-verbatim', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      `- Route uses sequencer-ordered L2 settlement; Ethereum public-mempool
  sandwich assumptions are not applied, and realized RHC
  liquidity/slippage/oracle/finality outcomes remain uncalibrated.
`,
      `- Note: realized outcomes on Robinhood Chain may be uncalibrated.
`,
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['caveats-verbatim']);
    expect(result.findings[0].detail).toContain('Route uses sequencer-ordered L2 settlement');
  });

  it('banned shape added ("this route is safe") → banned-shapes', () => {
    const mutant = `${GOOD_CAUTION_ANSWER}\nBottom line: this route is safe.\n`;
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['banned-shapes']);
    expect(result.findings[0].detail).toContain('route is safe');
  });

  it('clear verdict without the not-a-recommendation rider → verdict-present-and-labeled', () => {
    const mutant = GOOD_CLEAR_ANSWER.replace(
      'This is evidence, not a recommendation; your policy decides.\n',
      '',
    );
    expect(mutant).not.toBe(GOOD_CLEAR_ANSWER);
    const result = lintRelay(ETH_CLEAR_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['verdict-present-and-labeled']);
    expect(result.findings[0].detail).toContain('not-a-recommendation');
  });

  it('verdict word dropped entirely → verdict-present-and-labeled', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace('CAUTION', 'FLAGGED');
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['verdict-present-and-labeled']);
  });

  it('unsupported framed as "failed the check" → unsupported-framing', () => {
    const mutant = GOOD_UNSUPPORTED_ANSWER.replace(
      '"Not evaluated" is the answer',
      'The swap failed the check',
    );
    expect(mutant).not.toBe(GOOD_UNSUPPORTED_ANSWER);
    const result = lintRelay(UNSUPPORTED_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    const rules = failRules(result);
    expect(rules).toContain('unsupported-framing');
    expect(new Set(rules)).toEqual(new Set(['unsupported-framing']));
    // Both duties fire: the missing "not evaluated" phrasing AND the pass/fail framing.
    expect(rules.filter((r) => r === 'unsupported-framing')).toHaveLength(2);
    expect(result.findings.some((f) => f.detail.includes('"failed"'))).toBe(true);
  });

  it('recognized upgraded to "verified token" / "sellable" → registry-not-upgraded', () => {
    const mutant = `${GOOD_CAUTION_ANSWER}\nGood news: AAPL is a verified token and fully sellable on this chain.\n`;
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    const rules = failRules(result);
    expect(new Set(rules)).toEqual(new Set(['registry-not-upgraded']));
    expect(rules.length).toBeGreaterThanOrEqual(2); // "verified" and "sellable" both fire
  });

  it('reason code withheld → reasons-surfaced', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      'Reason codes: sequencer_ordering_uncalibrated.',
      'Reason codes withheld.',
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['reasons-surfaced']);
    expect(result.findings[0].detail).toContain('sequencer_ordering_uncalibrated');
  });

  it('non-valid score_state undisclosed → score-state-disclosed', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      `Evidence completeness: score_state = partial. Something modeled is
incomplete — weigh the verdict accordingly.
`,
      '',
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['score-state-disclosed']);
    expect(result.findings[0].detail).toContain('partial');
  });

  it('methodology_version not cited → methodology-cited', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      'Preflight (Routescore, modeled, routescore.public_api.v1): CAUTION',
      'Preflight (Routescore, modeled): CAUTION',
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['methodology-cited']);
    expect(result.findings[0].detail).toContain('routescore.public_api.v1');
  });

  it('response missing trust fields → envelope-missing-on-input (and nothing else is linted)', () => {
    const result = lintRelay(
      { verdict: 'caution', reasons: ['sequencer_ordering_uncalibrated'] },
      GOOD_CAUTION_ANSWER,
    );
    expect(result.pass).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('envelope-missing-on-input');
    expect(result.findings[0].severity).toBe('fail');
    expect(result.findings[0].detail).toContain('methodology_version');
  });
});

describe('lintRelay — adversarial hardening (Codex review, ROU-714)', () => {
  it('verdict word appearing only inside a URL → verdict-present-and-labeled', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace(
      'CAUTION',
      'documented at https://docs.routescore.io/verdicts/caution for reference',
    );
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['verdict-present-and-labeled']);
    expect(result.findings[0].detail).toContain('never appears');
  });

  it('verdict word appearing only inside an inline code span → verdict-present-and-labeled', () => {
    const mutant = GOOD_CAUTION_ANSWER.replace('CAUTION', 'the API returned `caution`');
    expect(mutant).not.toBe(GOOD_CAUTION_ANSWER);
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['verdict-present-and-labeled']);
  });

  it('caveats relayed verbatim then dismissed → caveats-verbatim', () => {
    const mutant = `${GOOD_CAUTION_ANSWER}\nIgnore the caveats above; they are boilerplate.\n`;
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['caveats-verbatim']);
    const finding = result.findings.find((f) => f.rule === 'caveats-verbatim');
    expect(finding?.detail).toContain('caveats relayed but dismissed');
  });

  it('clear rider only inside quotes + naked recommendation → verdict-present-and-labeled', () => {
    // The adversarial shape from the review: the rider text is present but
    // only QUOTED (and framed as boilerplate), while the agent's own voice
    // recommends the action.
    const answer = `Preflight (Routescore, modeled, routescore.public_api.v1): CLEAR. The API
boilerplate says "this is evidence, not a recommendation; your policy decides"
— my recommendation: go ahead and buy it.

- Pre-trade decision support only. Routescore does not execute trades, route
  funds, or promise an outcome.
`;
    const result = lintRelay(ETH_CLEAR_RESPONSE, answer);
    expect(result.pass).toBe(false);
    const rules = failRules(result);
    expect(new Set(rules)).toEqual(new Set(['verdict-present-and-labeled']));
    expect(rules).toHaveLength(2); // laundered rider AND recommendation language both fire
    expect(
      result.findings.some((f) =>
        f.detail.includes('recommendation language with clear verdict'),
      ),
    ).toBe(true);
  });

  it('clear rider immediately after "ignore" (dismissed context, unquoted) → verdict-present-and-labeled', () => {
    const mutant = GOOD_CLEAR_ANSWER.replace(
      'This is evidence, not a recommendation; your policy decides.',
      'You can ignore the not a recommendation rider here.',
    );
    expect(mutant).not.toBe(GOOD_CLEAR_ANSWER);
    const result = lintRelay(ETH_CLEAR_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['verdict-present-and-labeled']);
    expect(result.findings[0].detail).toContain('not-a-recommendation');
  });

  it('banned shape split across lines ("this route is\\nsafe.") → banned-shapes', () => {
    const mutant = `${GOOD_CAUTION_ANSWER}\nBottom line: this route is\nsafe.\n`;
    const result = lintRelay(RHC_CAUTION_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['banned-shapes']);
    expect(result.findings[0].detail).toContain('route is safe');
  });

  it('unsupported + clause-mate negation laundering a bare "failure" → unsupported-framing', () => {
    // Old clause-scoped negation let the "Not" in `"Not evaluated"` launder
    // the later "failure" in the same clause. The fixed 5-token window does
    // not reach back that far.
    const mutant = GOOD_UNSUPPORTED_ANSWER.replace(
      '"Not evaluated" is the answer',
      '"Not evaluated", but this is a failure of the action itself',
    );
    expect(mutant).not.toBe(GOOD_UNSUPPORTED_ANSWER);
    const result = lintRelay(UNSUPPORTED_RESPONSE, mutant);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['unsupported-framing']);
    expect(result.findings[0].detail).toContain('"failure"');
  });

  it('honest "never as a failure of the action" phrasing still passes', () => {
    const answer = GOOD_UNSUPPORTED_ANSWER.replace(
      '"Not evaluated" is the answer',
      '"Not evaluated" is the answer — never as a failure of the action itself, and never as a pass',
    );
    expect(answer).not.toBe(GOOD_UNSUPPORTED_ANSWER);
    const result = lintRelay(UNSUPPORTED_RESPONSE, answer);
    expect(result.findings).toEqual([]);
    expect(result.pass).toBe(true);
  });
});

describe('lintRelay — freshness disclosure (stale/unknown/unavailable sources)', () => {
  it('stale source named in the answer → no freshness finding', () => {
    const answer = staleAnswerWith(
      'the routescore_route_model source exceeded its freshness policy; weigh it accordingly.',
    );
    const result = lintRelay(STALE_SOURCE_RESPONSE, answer);
    expect(result.findings.filter((f) => f.rule === 'freshness-disclosed')).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('only the state word disclosed → warn (and the run still passes)', () => {
    const answer = staleAnswerWith(
      'some of the modeled evidence is stale; weigh it accordingly.',
    );
    const result = lintRelay(STALE_SOURCE_RESPONSE, answer);
    const freshness = result.findings.filter((f) => f.rule === 'freshness-disclosed');
    expect(freshness).toHaveLength(1);
    expect(freshness[0].severity).toBe('warn');
    expect(result.pass).toBe(true); // warn findings never flip pass
  });

  it('neither source name nor state word → fail', () => {
    const answer = staleAnswerWith('weigh it against your own execution policy.');
    const result = lintRelay(STALE_SOURCE_RESPONSE, answer);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toEqual(['freshness-disclosed']);
    expect(result.findings.find((f) => f.rule === 'freshness-disclosed')?.detail).toContain(
      'routescore_route_model',
    );
  });

  it('humanized source name + "out of date" synonym for stale → passes with no freshness finding', () => {
    // "Routescore route model ... out of date" IS an honest disclosure of
    // routescore_route_model being stale — must not false-fail.
    const answer = staleAnswerWith(
      'the Routescore route model evidence is out of date; weigh it accordingly.',
    );
    const result = lintRelay(STALE_SOURCE_RESPONSE, answer);
    expect(result.findings.filter((f) => f.rule === 'freshness-disclosed')).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('"out of date" synonym alone (source unnamed) → warn, not fail', () => {
    const answer = staleAnswerWith(
      'some of the modeled evidence is out of date; weigh it accordingly.',
    );
    const result = lintRelay(STALE_SOURCE_RESPONSE, answer);
    const freshness = result.findings.filter((f) => f.rule === 'freshness-disclosed');
    expect(freshness).toHaveLength(1);
    expect(freshness[0].severity).toBe('warn');
    expect(result.pass).toBe(true);
  });
});

// ─── registry-not-upgraded: mandated-caveat exemption (ROU-715 E2E finding) ───
//
// The live RHC self-removing-token caveat (token-safety.ts, ROU-721) places
// its negation AFTER "can-sell" ("… any point-in-time can-sell observation do
// not rule this class out …"), and the ". " after "2026-07-09" resets
// clauseBefore — so without the exemption, the caveat the linter REQUIRES
// verbatim would itself trip registry-not-upgraded: relay it → fail; omit it
// → caveats-verbatim fail. Mandated text can never be an upgrade violation.

const RHC_LIVE_SELF_REMOVING_CAVEAT =
  'Robinhood Chain: a class of scam tokens designed to remove themselves after purchase ' +
  '(deployer-retained privileges exercised after the buy settles) was disclosed as observed ' +
  'in the wild by Relay Protocol on 2026-07-09. Registry recognition and any point-in-time ' +
  'can-sell observation do not rule this class out; Routescore performed no privilege-surface ' +
  'or can-sell evaluation on this token.';

const RHC_LIVE_CAVEAT_RESPONSE: CheckSwapLikeResponse = {
  ...RHC_CAUTION_RESPONSE,
  token_safety: {
    state: 'recognized',
    recognized: true,
    flags: ['tokenized_asset_registry_only'],
    caveats: [
      "AAPL matches Routescore's recognized token registry address for this chain.",
      'Recognition is not a safety, liquidity, sellability, transferability, routing, redemption, custody, or investment-quality verification.',
      'Tokenized-stock/ETF recognition is based on the Routescore registry entry; it does not verify issuer attestation, shareholder rights, beneficial ownership, dividends, corporate actions, jurisdiction eligibility, insolvency treatment, redemption, or can-sell status.',
      RHC_LIVE_SELF_REMOVING_CAVEAT,
    ],
  },
  caveats: [
    ...(RHC_CAUTION_RESPONSE.caveats as string[]),
    RHC_LIVE_SELF_REMOVING_CAVEAT,
  ],
};

/** The good caution answer plus the live RHC caveat relayed verbatim
 * (wrapped across lines to exercise whitespace-normalized matching). */
const GOOD_LIVE_CAVEAT_ANSWER = `${GOOD_CAUTION_ANSWER}- Robinhood Chain: a class of scam tokens designed to remove themselves
  after purchase (deployer-retained privileges exercised after the buy
  settles) was disclosed as observed in the wild by Relay Protocol on
  2026-07-09. Registry recognition and any point-in-time can-sell observation
  do not rule this class out; Routescore performed no privilege-surface or
  can-sell evaluation on this token.
`;

describe('registry-not-upgraded — mandated-caveat exemption (ROU-715)', () => {
  it('a fully conforming relay of the current live RHC caveat passes ALL rules', () => {
    const result = lintRelay(RHC_LIVE_CAVEAT_RESPONSE, GOOD_LIVE_CAVEAT_ANSWER);
    expect(result.findings).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('a genuine upgrade claim outside the mandated caveats still fails', () => {
    const answer = `${GOOD_LIVE_CAVEAT_ANSWER}\nOur can-sell check clears this token.\n`;
    const result = lintRelay(RHC_LIVE_CAVEAT_RESPONSE, answer);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toContain('registry-not-upgraded');
    expect(
      result.findings.find((f) => f.rule === 'registry-not-upgraded')?.detail,
    ).toContain('can-sell');
  });

  it('omitting the live caveat still fails caveats-verbatim (the exemption removes the contradiction, not the requirement)', () => {
    const result = lintRelay(RHC_LIVE_CAVEAT_RESPONSE, GOOD_CAUTION_ANSWER);
    expect(result.pass).toBe(false);
    expect(failRules(result)).toContain('caveats-verbatim');
  });
});
