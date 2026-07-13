# @routescore/mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **Routescore
public API** as tools for Claude, Codex, Cursor, and any MCP-capable agent. It is
a thin, stateless wrapper around the keyed REST gateway — no data is stored
locally.

**Requires a Power-tier Routescore plan.** Generate an API key at
**Account → Developer → API & MCP access** (`/account`). Keys look like
`rs_live_…` and are shown once.

## Setup

Add the server to your MCP client config and set your key in the env block.

**Claude Desktop** (`claude_desktop_config.json`) / **Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "routescore": {
      "command": "npx",
      "args": ["-y", "@routescore/mcp"],
      "env": {
        "ROUTESCORE_API_KEY": "rs_live_your_key_here"
      }
    }
  }
}
```

**Claude Code** (CLI):

```bash
claude mcp add routescore --env ROUTESCORE_API_KEY=rs_live_... -- npx -y @routescore/mcp
```

Optional env:

- `ROUTESCORE_API_URL` — override the API base (default `https://www.routescore.io`).
  Useful for local development: `http://localhost:3000`.

The server checks the key at startup: if `ROUTESCORE_API_KEY` is missing or
does not match the minted key shape (`rs_live_` followed by 64 lowercase hex
characters), it exits immediately with an actionable error instead of
failing on the first tool call. The configured value is never echoed. This
is a shape check only — real key verification stays server-side (run the
`whoami` tool).

## Tools

| Tool | What it does |
|---|---|
| `quote_mev_cover` | Modeled premium estimate for MEV-sandwich exposure on a swap (modeled premium, expected/CVaR loss). |
| `quote_bridge_refund` | Modeled premium estimate for cross-chain bridge execution failure vs a modeled SLA expectation. |
| `quote_lrt_slashing` | Modeled premium estimate for slashing risk on an LRT position given AVS exposure. |
| `simulate_scenario` | What-if Monte Carlo: modeled expected premium vs refund/loss over a horizon. |
| `check_swap` | Pre-trade check an agent runs before it signs: modeled route quality, price-impact / slippage band, modeled MEV/execution exposure where observable, and a token registry read (recognized vs unverified), as a `clear / caution / unsupported` verdict. Supports Ethereum (1) and Robinhood Chain (4663). Recognition is not safety, sellability, rights, redemption, liquidity, or investment-quality verification. Decision support, not execution. Every keyed call also attempts to persist a hash-verifiable evidence record and returns its `record_id`, `evidence_bundle_id`, and `record_output_hash` — null, with a `record_persistence_failed` caveat, if the record store is unavailable. |
| `get_preflight_record` | Fetch one persisted preflight evidence record by `record_id` (owner-scoped to the configured key's account). The record embeds the original check response verbatim plus a canonical-JSON SHA-256 integrity hash so the evidence can be re-verified offline. Read-only evidence: record creation rejects known execution-material keys (calldata, transaction payloads, signing material) and drops identity-shaped labels from the actor context. |
| `get_detector_manifest` | Latest public MEV-detector run manifest (version hash + universe). |
| `whoami` | Confirm the key works and report its plan tier. |

All `quote_*` tool results are **modeled, point-in-time premium estimates** —
decision support only, **not** a live cover, insurance, refund, or
premium-acceptance offer. Routescore does not underwrite risk.

## Output contract

Routescore MCP is decision support, not execution infrastructure. `check_swap`,
quote, and scenario tool results preserve the same trust envelope as the REST API, and the
wrapper marks output as degraded if the upstream API ever omits required trust
fields.

`check_swap` answers `verdict: unsupported` as an HTTP 422 with a full
evaluated body — an answer, not an error. The wrapper relays those evaluated
422 bodies as normal structured tool results (gap-state fields, caveats, and
record linkage included) so agents receive "not evaluated" as first-class
evidence; true errors (400/401/403/404/429/5xx and non-evaluated 422 error
envelopes) still surface as tool errors.

Downstream agents and dashboards should render the trust-envelope fields by
default (abbreviated example):

```json
{
  "score_state": "partial",
  "source_freshness": {
    "state": "partial",
    "checked_at": "2026-06-21T00:00:00.000Z",
    "sources": [
      { "name": "routescore_backend", "freshness_state": "fresh" },
      { "name": "bridge_risk_labels", "freshness_state": "unknown" }
    ]
  },
  "methodology_version": "routescore.public_api.v1",
  "confidence_band": { "low": null, "high": null, "unit": "bps" },
  "caveats": [
    "Modeled, point-in-time decision support. Not an execution guarantee.",
    "Unsupported or stale inputs widen uncertainty instead of hiding risk."
  ],
  "commercial_disclosure": {
    "paid_placement": false,
    "score_influenced_by_partner": false
  }
}
```

## Local development

```bash
npm install
npm run build
ROUTESCORE_API_KEY=rs_live_... ROUTESCORE_API_URL=http://localhost:3000 node dist/index.js
```

Then point [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
at the command, or wire it into a client config as above.

## Notes

- Scenario and quote outputs are modeled decision-support, **not investment advice**.
- MCP does not custody assets, execute transactions, route funds, or guarantee
  outcomes.
- Rate limits apply per key; responses carry `X-RateLimit-*` headers.
