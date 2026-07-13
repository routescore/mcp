/**
 * Claims-copy guardrail for the published @routescore/mcp package
 * (ROU-684, extended by ROU-717 with the composed-element shapes).
 *
 * This package ships to npm and its strings (tool descriptions, README,
 * package.json description) are read directly by LLM agents. Routescore is
 * decision support only: quote tools return MODELED, POINT-IN-TIME premium
 * estimates — never a live cover, insurance, refund, protection, or
 * premium-acceptance offer, and never a guarantee. It is ONE composable
 * evidence/attestation element of the agentic stack alongside planner /
 * executor / wallet elements — never "the trust layer" (2026-07-08
 * refinement of assert-routescore-agentic-defi-trust-envelope).
 *
 * The test is deliberately self-contained (no imports from the app package)
 * so sojourn-mcp-ci enforces it even when the app CI path-filters skip. It
 * ports the qualifier-window + negation-aware clause logic from
 * divisions/sojourn/app/src/__tests__/claims-boundary-guardrail.test.ts and
 * claims-copy-guardrail.test.ts — keep the three in sync.
 *
 * The banned-shape vocabulary + scanner live in ./claims-shapes.ts (extracted
 * for ROU-714 so the relay linter shares one source of truth); this test
 * keeps the copy-surface list and the enforcement.
 *
 * Canonical rules: divisions/sojourn/CLAIMS_BOUNDARY_QA.md and
 * divisions/sojourn/CLAIMS_REGISTRY.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLines } from './claims-shapes.js';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every agent-facing copy surface in the published package.
 *
 * claims-shapes.ts and relay-lint.ts are intentionally NOT listed: they are
 * rule data (their `reason`/`detail` metadata quotes the banned shapes they
 * ban and would self-trip the scanner), not agent-facing prose — exactly as
 * the vocabulary was unscanned when it lived inside this test file.
 */
const COPY_FILES: string[] = [
  'README.md',
  'CHANGELOG.md',
  'package.json',
  'src/tools.ts',
  'src/index.ts',
  'src/trust.ts',
  'src/key-check.ts',
];

describe('@routescore/mcp claims-copy guardrail (ROU-684)', () => {
  it('agent-facing package copy contains no banned claim shapes (negation/qualifier-aware)', () => {
    const violations: string[] = [];

    for (const rel of COPY_FILES) {
      const raw = readFileSync(path.join(PKG_ROOT, rel), 'utf8');
      scanLines(rel, raw.split('\n'), violations);
    }

    expect(
      violations,
      'Banned claim shapes found in the published @routescore/mcp package. Reword to ' +
        'modeled / point-in-time / caveated decision-support language (see ' +
        `divisions/sojourn/CLAIMS_BOUNDARY_QA.md):\n\n${violations.join('\n\n')}`,
    ).toEqual([]);
  });

  it('scanner self-test: a negated first occurrence cannot mask a later bare promise on the same line', () => {
    // Multi-match regression fixture: the first "guarantee" is a negated
    // disclaimer, the second is a bare promise in a fresh clause and MUST be
    // flagged (single-exec scanners only saw the first occurrence per line).
    const violations: string[] = [];
    scanLines(
      'self-test-fixture',
      ['This is not a guarantee. Routescore guarantees the outcome.'],
      violations,
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('guarantee');
  });

  it('scanner self-test: ROU-721 scam-class shapes bite affirmative claims and allow negated disclaimers', () => {
    const violations: string[] = [];
    scanLines(
      'self-test-fixture',
      [
        'Routescore is a rug-pull detector.',
        'Scam detection flags coordinated wallets and wash trading.',
      ],
      violations,
    );
    expect(violations.length).toBeGreaterThanOrEqual(3);

    const clean: string[] = [];
    scanLines(
      'self-test-fixture',
      ['Routescore is not a rug-pull detector; it reports observed states with dated citations.'],
      clean,
    );
    expect(clean).toEqual([]);
  });

  it('scanner self-test: ROU-721 Codex P2s — verb set, genuine-interrogative carve-out, intensifier negation', () => {
    // Synonym detection verbs, declarative-with-trailing-"?", and the
    // "not only" intensifier all FAIL.
    const violations: string[] = [];
    scanLines(
      'self-test-fixture',
      [
        'Routescore flags rug pulls before you buy.',
        'It identifies coordinated wallet activity on new tokens.',
        'Routescore is a rug-pull detector?',
        'Routescore is not only a rug-pull detector.',
      ],
      violations,
    );
    expect(violations.length).toBeGreaterThanOrEqual(4);
    // A genuine interrogative (an agent echoing the user's question) and a
    // genuine negation stay legal.
    const clean2: string[] = [];
    scanLines(
      'self-test-fixture',
      ['Does Routescore detect scams or rug pulls?', 'Routescore is not a rug-pull detector.'],
      clean2,
    );
    expect(clean2).toEqual([]);
  });

  it('tool descriptions carry modeled/disclaimer framing on every quote tool', async () => {
    const { TOOLS } = await import('./tools.js');
    for (const tool of TOOLS) {
      if (!tool.name.startsWith('quote_')) continue;
      expect(
        /\bmodel(ed|s)?\b/i.test(tool.description),
        `${tool.name}: quote-tool description must say the output is MODELED (got: "${tool.description}")`,
      ).toBe(true);
      expect(
        /\bnot\s+a\s+live\b/i.test(tool.description),
        `${tool.name}: quote-tool description must carry the "not a live … offer" disclaimer (got: "${tool.description}")`,
      ).toBe(true);
    }
  });
});
