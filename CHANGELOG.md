# Changelog — @routescore/mcp

All figures the tools return are modeled, point-in-time decision support.
They are never a live cover, insurance, refund, or premium-acceptance offer;
they are not a guarantee, and not investment advice. Routescore does not
execute trades, route funds, or custody assets.

## 0.3.2 — 2026-07-14

### Changed

- **`check_swap` is now a free-tier tool.** It no longer requires a Power-tier
  plan: a free API key runs 100 pre-sign checks/day (Pro 1,000/day, Power
  10,000/day). The modeled-quote and `simulate_scenario` tools still require
  Power. Updated the startup key-check messages and the `README` accordingly.
- **Sharper agent-facing tool descriptions** for `check_swap` (leads with "call
  this before signing an onchain swap"; relay verdict/reasons/caveats verbatim)
  and `get_preflight_record` (the "record" leg of plan → preflight → execute →
  record).
- README now leads with the read-only pre-sign-evidence / "pre-sign journal"
  positioning and links the public calibration surface.

## 0.3.0 — 2026-07-10 (publish pending founder gate)

### Added

- **`get_preflight_record` tool** (`GET /api/public/v1/records/{record_id}`,
  ROU-707). Fetches one persisted preflight evidence record by the
  `record_id` a keyed `check_swap` call returned. Owner-scoped: a key only
  ever sees records belonging to its own account. The record embeds the
  original `check_swap` response verbatim plus a canonical-JSON SHA-256
  integrity hash (`record_id` and `recorded_at` excluded from the hash
  input) so the evidence can be re-verified offline, and includes the stored
  evidence bundle. Tool runner gained `{path}`-parameter substitution to
  support it.
- **Agent-relay lint harness v0** (ROU-714). `src/relay-lint.ts` is a pure,
  I/O-free linter that grades an agent's final user-facing answer against
  the `verdict-and-caveat-relay` contract (verdict relayed as returned,
  caveats verbatim, reason codes surfaced, score_state and
  methodology_version disclosed, gap states represented as gaps). Ships
  with a CLI, exposed as a second bin so it runs from the published
  package: `npx -y -p @routescore/mcp routescore-relay-lint
  <response.json> <answer.txt>` (in-repo: `npm run relay-lint -- …`). The
  banned-shape vocabulary moved to `src/claims-shapes.ts` so the linter and
  the package claims guardrail share one source of truth.
- **Startup key check** (`src/key-check.ts`). The server now exits at
  startup with an actionable error when `ROUTESCORE_API_KEY` is missing or
  does not match the minted key shape (`rs_live_` + 64 lowercase hex
  characters), instead of surfacing the same failure on the first tool
  call. Shape check only — the configured value is never echoed; real key
  verification stays server-side (`whoami`).
- **`mcp` bin alias.** npm resolves a package's default executable by its
  unscoped name, so with multiple bins `npx -y @routescore/mcp` needs a bin
  literally named `mcp` — added alongside `routescore-mcp` (unchanged) and
  `routescore-relay-lint`.

### Changed

- **Evaluated HTTP 422 pass-through** (ROU-715 Codex review). `check_swap`
  answers `verdict: unsupported` as an HTTP 422 with a FULL evaluated body —
  an answer, not an error. The wrapper previously threw on every non-2xx and
  discarded those bodies; `interpretGatewayResponse` now relays an evaluated
  422 (string `verdict`, no `error` envelope) as a normal structured tool
  result — gap-state fields, caveats, and record linkage included — so
  agents receive "not evaluated" as first-class evidence. True errors
  (400/401/403/404/429/5xx and non-evaluated 422 error envelopes) still
  raise errors.
- **Relay-lint rule hardening** (ROU-714/ROU-715 adversarial reviews),
  including the mandated-caveat exemption in `registry-not-upgraded`: text
  the linter itself requires verbatim (`caveats-verbatim`) can never count
  as a registry-upgrade violation, byte-exact per normalized response
  caveat; genuine upgrade claims outside mandated text still fail. Scanner
  bypass fixes per Codex review (fake-negation intensifiers, question
  carve-out laundering, multi-match lines) landed alongside.
- Tool-description copy refinements per the composed-element claims
  doctrine (ROU-717) and the observed-state vocabulary extension (ROU-721):
  Routescore is one composable evidence/attestation element of an agentic
  stack — alongside planner, executor, and wallet elements — and reports
  observed states with dated citations.

### Unchanged

- **Trust envelope contract.** The 8 required fields (`score_state`,
  `source_freshness`, `methodology_version`, `confidence_band`, `caveats`,
  `commercial_disclosure`, `generated_at`, `decision_support_only`), the
  degraded stamping for responses missing the envelope, and the read-only /
  non-execution boundary are unchanged from 0.2.1.

> Note: the npm tarball published as 0.2.1 (2026-07-07) predates everything
> in this section — the registry copy of 0.2.1 does not contain the records
> tool, the evaluated-422 pass-through, or the relay-lint harness. 0.3.0 is
> the first publish that ships them.

## 0.2.1 — 2026-07-07 (published)

- `check_swap` pre-sign check tool with the `clear / caution / unsupported`
  verdict, Ethereum (1) + Robinhood Chain (4663) support, and token registry
  recognition reads (recognition is not safety, sellability, rights,
  redemption, liquidity, or investment-quality verification).
- Default API base fixed to `https://www.routescore.io` (the apex redirect
  drops `Authorization` in some clients).
- MIT license; claims-clean tool descriptions (ROU-684 guardrail).

## 0.2.0 and earlier

- Initial public API wrapper: `quote_mev_cover`, `quote_bridge_refund`,
  `quote_lrt_slashing`, `simulate_scenario`, `get_detector_manifest`,
  `whoami`; trust-envelope enforcement (`trust.ts`) marking envelope-less
  upstream responses degraded.
