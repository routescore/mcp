/**
 * Shared banned-claim-shape vocabulary + scanner for the @routescore/mcp
 * package (ROU-684 / ROU-717, extracted for ROU-714).
 *
 * Single source of truth for two consumers:
 *   - claims-copy.test.ts — CI guardrail over the published package copy
 *     (README, package.json, tool descriptions).
 *   - relay-lint.ts — the agent-relay contract linter, which scans an
 *     agent's final user-facing ANSWER text for the same banned shapes.
 *
 * The rule logic (qualifier-window + negation-aware clause scanning) is
 * ported from divisions/sojourn/app/src/__tests__/claims-boundary-guardrail
 * .test.ts and claims-copy-guardrail.test.ts — keep the three in sync.
 * Canonical rules: divisions/sojourn/CLAIMS_BOUNDARY_QA.md and
 * divisions/sojourn/CLAIMS_REGISTRY.md.
 *
 * NOTE: this file is deliberately NOT in claims-copy.test.ts's COPY_FILES
 * scan list — its `reason` metadata quotes the banned shapes it bans, which
 * would self-trip the scanner. It carries rule data, not agent-facing prose.
 */

/**
 * Negators: a banned word preceded by one of these in the same clause is a
 * disclaimer ("not a live cover offer"), which is the REQUIRED framing.
 * "not" deliberately excludes the affirmative intensifiers "not only /
 * not just / not merely" — "Routescore is not only a rug-pull detector"
 * AMPLIFIES the claim, it does not disclaim it (ROU-721 Codex adversarial
 * review, fake-negation bypass).
 */
export const NEGATOR =
  /\b(no|not(?!\s+(?:only|just|merely)\b)|never|without|cannot|can(?:'|’)?t|isn(?:'|’)?t|aren(?:'|’)?t|don(?:'|’)?t|doesn(?:'|’)?t|won(?:'|’)?t|nothing|neither|nor)\b/i;

/**
 * Qualifiers that keep an insurance-adjacent phrase honest when they appear
 * in a 2-line window ("modeled premium estimate", "not a live cover", …).
 */
export const QUALIFIER =
  /\b(model(ed|s)?|estimate(s|d)?|not\s+a\s+live|not\s+a\s+cover|never|does\s+not|do\s+not|don['’]?t|exposure|simulat(e|ed|ion)|scenario|point-in-time|decision\s+support)\b/i;

/**
 * Compound terms that legitimately contain a banned word (external,
 * caveated references — NOT Routescore claims). Masked before scanning.
 */
export const COMPOUND_EXCEPTIONS: RegExp[] = [
  /protected[-\s]?rpc/gi,
  /protected\s+submission\s+path(s)?/gi,
  // Regulatory / technical terms of art containing "best" (ROU-717).
  /best[-\s]execution\b/gi,
  /best[-\s]effort(s)?\b/gi,
  /best\s+practices?\b/gi,
  /best\s+(bid|ask)s?\b/gi,
];

export type BannedShape = {
  re: RegExp;
  requireQualifierWindow?: boolean;
  reason: string;
  /**
   * Allow the match when it sits inside a GENUINE question (sentence starts
   * with an interrogative/auxiliary lead AND ends with "?") — a FAQ heading
   * or an agent answer echoing the user's question is not a claim; the
   * answer text is scanned and must carry the honest framing. Opt-in per
   * shape (ROU-721 Codex review); a declarative sentence with a trailing
   * "?" is never treated as a question.
   */
  allowInterrogative?: boolean;
};

/**
 * Banned claim shapes (ROU-505 / ROU-684 claims vocabulary). Tool NAMES
 * (quote_mev_cover etc.) are stable API identifiers and are masked below;
 * only prose is scanned.
 */
export const BANNED: BannedShape[] = [
  {
    re: /\bbest\s+route\b/i,
    reason: '"best route" promise — say the score compares routes, it does not name a winner',
  },
  {
    re: /\bmev[-\s]?safe\b|\bsafe\s+from\s+mev\b/i,
    reason: '"MEV safe" promise — no route or tool can promise a swap avoids MEV',
  },
  {
    re: /\bavoided[-\s]?loss(es)?\b|\bloss(es)?\s+avoided\b/i,
    reason: '"avoided loss" claim — outcomes are modeled estimates, not realized savings',
  },
  {
    re: /\bguarantee[sd]?\b/i,
    reason: 'bare "guarantee" — only allowed in negated/disclaimer form ("not a guarantee")',
  },
  {
    re: /\binsur(?:ance|e[sd]?|er)\b/i,
    requireQualifierWindow: true,
    reason: 'insurance framing — Routescore is not an insurer; say "modeled premium estimate"',
  },
  {
    re: /\bprotect(?:s|ed|ion|ing)?\b/i,
    requireQualifierWindow: true,
    reason: '"protection" claim — Routescore models exposure, it does not protect trades',
  },
  {
    re: /\bcover\s+(quote|pricing|offer)s?\b|\b(buy|purchase|get|live)\s+(mev\s+)?cover\b/i,
    reason: 'live-cover offer framing — quote tools return modeled premium estimates (ROU-505)',
  },
  {
    re: /\bpremium\s+(accept|acceptance|binding|bound|paid\s+out)\b/i,
    reason: 'premium-acceptance/binding claim — estimates are modeled, not accepted or bound',
  },
  {
    re: /\brefund\s+if\b|\bwe\s+refund\b/i,
    reason: 'live refund promise — say "modeled SLA expectation", not a refund commitment',
  },
  // Advice / execution shapes ported from the app claims-copy-guardrail
  // FORBIDDEN_PATTERNS so the published package enforces them too
  // (ROU-717 coverage extension — registered in CLAIMS_BOUNDARY_QA.md).
  {
    re: /\bwe\s+recommend\b/i,
    reason:
      '"we recommend" reads as advice/promise — Routescore is decision support, not advice',
  },
  {
    re: /\b(we|routescore)\s+(execute|route|trade|swap|transact|send|move)\s+(your\s+|the\s+)?(funds?|trade|order|transaction|swap|money|capital|assets?)\b/i,
    reason: 'execution claim — Routescore does NOT execute trades or route funds',
  },
  {
    re: /\bexecutes?\s+(your\s+|the\s+)?(trade|order|swap|transaction)s?\s+(for\s+you|on\s+your\s+behalf|automatically)\b/i,
    reason: 'execution-on-your-behalf claim — Routescore is decision support only',
  },
  // ──────────────────────────────────────────────────────────────────────
  // Composed-element positioning shapes (ROU-717; 2026-07-08 refinement of
  // assert-routescore-agentic-defi-trust-envelope in
  // strategy/assertions/routescore.md). Routescore is ONE composable
  // evidence/attestation element alongside planner/executor/wallet —
  // never "the trust layer", never a guarantor of outcomes.
  // ──────────────────────────────────────────────────────────────────────
  {
    re: /\btrust\s+layer\b/i,
    reason:
      '"trust layer" positioning — Routescore is one composable evidence/attestation element alongside planner/executor/wallet, never a layer above or wrapping them (composed-element doctrine, 2026-07-08)',
  },
  {
    re: /\bultimate\b/i,
    reason:
      '"ultimate" superlative — trust claims point at published calibration and methodology versions, not adjectives (composed-element doctrine, 2026-07-08)',
  },
  {
    re: /\bbest\b/i,
    reason:
      'unscoped "best" superlative — scope the comparison or drop it; regulatory/technical terms of art (best execution, best-effort, best bid/ask, best practices) are masked compound exceptions (ROU-717)',
  },
  {
    re: /\b(swaps?|trades?|trading|routes?|routing|tokens?|transactions?|bridges?|bridging|chains?|wallets?|funds?|assets?|positions?)\s+(is|are|will\s+be|stays?|remains?)\s+safe\b|\bsafe\s+to\s+(swap|trade|sign|execute|approve|bridge|buy|sell|hold|proceed)\b|\b(100%|completely|totally|fully|always|perfectly)\s+safe\b|\bsafe\s+(swaps?|trades?|routes?|tokens?)\b/i,
    reason:
      'promise-form "safe" — no route, token, or tool can be promised safe; report observed/modeled states with caveats ("not evaluated", "unsupported") instead (ROU-717)',
  },
  {
    re: /\bprevents?\s+(any\s+|all\s+|further\s+)?loss(es)?\b|\bloss[-\s]prevention\b|\bprevents?\s+(mev|sandwich(es|ing)?|front[-\s]?run\w*)\b/i,
    reason:
      '"prevents loss/MEV" claim — Routescore is read-only evidence: it models and records exposure, it does not prevent anything (ROU-717)',
  },
  {
    re: /\b(we|routescore)\s+insures?\b/i,
    reason:
      'first-person "insures" — Routescore is not an insurer; no qualifier launders an affirmative insuring verb (ROU-717)',
  },
  // ──────────────────────────────────────────────────────────────────────
  // RHC scam-class observed-state shapes (ROU-721; Relay disclosure
  // 2026-07-09). Routescore reports observed on-chain states with dated
  // citations — never intent labels, never detection-as-assurance branding.
  // The negated/disclaimer form ("not a rug-pull detector") stays allowed.
  // The shipped MEV sandwich-detector vocabulary is deliberately unmatched.
  // ──────────────────────────────────────────────────────────────────────
  {
    // Verb set widened per Codex adversarial review: detection branding
    // includes flagging/identifying/spotting/catching/screening/finding, not
    // just "detect" ("Routescore flags rug pulls" is the same claim).
    re: /\b(?:rug(?:[-\s]?pull)?|scam|honeypot)[-\s]+detect(?:or|ion|ors|ing)\b|\b(?:detect(?:s|ed|ing)?|flag(?:s|ged|ging)?|identif(?:y|ies|ied|ying)|spot(?:s|ted|ting)?|catch(?:es|ing)?|caught|screen(?:s|ed|ing)?|find(?:s|ing)?|found)\s+(?:rugs?|rug[-\s]?pulls?|scams?|honeypots?)\b/i,
    reason:
      'scam/rug/honeypot detection branding — Routescore reports observed on-chain states and gaps with dated citations; it does not brand itself a detector of intent-labeled classes (ROU-721)',
    allowInterrogative: true,
  },
  {
    re: /\bwash[-\s]+(?:trad(?:e|es|ed|ing)|volume)\b|\bcoordinated\s+(?:wallets?|clusters?|pumps?|dumps?|trading|buys?|buying|selling)\b|\bmanipulat(?:e[sd]?|ing|ion)\b/i,
    reason:
      'intent-attribution language ("wash trading", "coordinated wallets", "manipulated") — describe observable on-chain facts, never allege intent; the fact accuses, we only observe (ROU-721)',
    allowInterrogative: true,
  },
];

/** Mask stable identifiers + compound exceptions so only prose is scanned. */
export function maskLine(line: string): string {
  let out = line
    // snake_case identifiers (tool names, schema fields) and inline code.
    // Hyphenated prose ("mev-safe", "avoided-loss") is NOT masked — those
    // stay scannable as claims.
    .replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, 'IDENT')
    .replace(/`[^`]*`/g, 'CODE');
  for (const re of COMPOUND_EXCEPTIONS) out = out.replace(re, 'EXTERNAL_REF');
  return out;
}

/** Clause before the match on the same line (see claims-copy-guardrail). */
export function clauseBefore(line: string, index: number): string {
  const head = line.slice(0, index);
  const lastBoundary = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf(';'),
  );
  return lastBoundary >= 0 ? head.slice(lastBoundary + 1) : head;
}

/**
 * EVERY match of `re` on the line — not just the first. Each occurrence gets
 * its own clause-scoped negation check, so a negated disclaimer earlier on
 * the line cannot shadow a bare promise later on the same line.
 */
export function matchesIn(re: RegExp, line: string): RegExpExecArray[] {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out: RegExpExecArray[] = [];
  for (let m = global.exec(line); m; m = global.exec(line)) {
    out.push(m);
    if (m.index === global.lastIndex) global.lastIndex++; // zero-length guard
  }
  return out;
}

/**
 * Interrogative/auxiliary sentence leads. A sentence only counts as a
 * question when it STARTS with one of these AND ends with "?" — a
 * declarative sentence with a trailing question mark ("Routescore is a
 * rug-pull detector?") is a hedged claim, not a question (ROU-721 Codex
 * review, question-carve-out laundering).
 */
export const INTERROGATIVE_LEAD =
  /^(?:does|do|did|is|are|was|were|can|could|will|would|should|shall|may|might|must|what|how|why|when|where|which|who|whose|whom)\b/i;

/**
 * True when the sentence containing the match is a GENUINE question ("Does
 * Routescore detect scams or rug pulls?"). Honored only for shapes that opt
 * in via `allowInterrogative` — the answer text is scanned on its own and
 * must carry the honest framing.
 */
export function isQuestion(line: string, index: number): boolean {
  const tail = line.slice(index);
  const end = tail.search(/[.!?]/);
  if (end < 0 || tail[end] !== '?') return false;
  const sentence = `${clauseBefore(line, index)}${tail.slice(0, end + 1)}`;
  // Strip leading non-sentence syntax so FAQ copy like `q: 'Does …?'` or
  // markdown headings (`## How …?`) are recognized: markers/quotes plus an
  // optional short `key:` label.
  const stripped = sentence
    .replace(/^[\s#>*\-"'“”‘’`([{]+/, '')
    .replace(/^[A-Za-z_$][\w$]*\s*:\s*["'“”‘’`]*\s*/, '');
  return INTERROGATIVE_LEAD.test(stripped);
}

export function scanLines(label: string, rawLines: string[], violations: string[]): void {
  const lines = rawLines.map(maskLine);

  lines.forEach((line, idx) => {
    for (const { re, reason, requireQualifierWindow, allowInterrogative } of BANNED) {
      for (const m of matchesIn(re, line)) {
        if (NEGATOR.test(clauseBefore(line, m.index))) continue; // disclaimer — required framing
        // Question carve-out is per-shape opt-in (ROU-721 Codex review) and
        // only for genuine interrogatives — see isQuestion.
        if (allowInterrogative && isQuestion(line, m.index)) continue;
        if (requireQualifierWindow) {
          const windowText = `${lines[idx - 1] ?? ''} ${line} ${lines[idx + 1] ?? ''}`;
          if (QUALIFIER.test(windowText)) continue; // modeled/caveated framing — allowed
        }
        violations.push(
          `${label}:${idx + 1}  [${reason}]\n      → "${m[0].trim()}"  (line: ${rawLines[idx].trim().slice(0, 140)})`,
        );
      }
    }
  });
}
