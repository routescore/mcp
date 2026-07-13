/**
 * Shared Routescore tool definitions.
 *
 * Framework-free on purpose: this module imports only `zod`, so it can be
 * consumed by BOTH the stdio MCP server in this package (index.ts) AND the
 * fast-follow hosted Streamable-HTTP MCP endpoint in the Next.js app, without
 * either one re-deriving the tool surface.
 *
 * Each spec maps one MCP tool to one /api/public/v1 endpoint. Input schemas
 * mirror the FastAPI Pydantic models but expose only the user-facing fields;
 * the backend fills sensible defaults for anything omitted.
 */

import { z } from 'zod';

export type ToolSpec = {
  name: string;
  description: string;
  method: 'GET' | 'POST';
  /** Path under /api/public/v1, e.g. '/quote/mev' or '/records/{record_id}'. */
  path: string;
  /**
   * Arg names substituted into `{name}` placeholders in `path` (URL-encoded)
   * and removed from the JSON body before the request is sent.
   */
  pathParams?: string[];
  /** Zod raw shape — MCP's registerTool consumes this directly. */
  inputSchema: z.ZodRawShape;
};

export const TOOLS: ToolSpec[] = [
  {
    name: 'quote_mev_cover',
    description:
      'Modeled premium estimate for MEV-sandwich exposure on a swap. Returns a modeled premium (bps + USD), expected/CVaR loss, and conditions. Point-in-time decision support before routing a trade — not a live cover, insurance, or premium-acceptance offer.',
    method: 'POST',
    path: '/quote/mev',
    inputSchema: {
      notional_usd: z.number().positive().describe('Trade size in USD.'),
      asset_pair: z.string().optional().describe("Asset pair, e.g. 'USDC/ETH'. Default USDC/ETH."),
      route: z.string().optional().describe("Execution route, e.g. 'uniswap-v3'."),
      chain_id: z.number().int().optional().describe('Chain ID (1 = Ethereum). Default 1.'),
      slippage_allowance_bps: z.number().optional().describe('Slippage allowance in bps. Default 50.'),
      refund_threshold_bps: z.number().optional().describe('Modeled refund threshold in bps. Default 50.'),
      historical_sandwich_freq: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Historical sandwich frequency as a 0–1 fraction. Default 0.012.'),
    },
  },
  {
    name: 'quote_bridge_refund',
    description:
      'Modeled premium estimate for cross-chain bridge execution failure against a modeled SLA expectation. Returns a modeled premium and conditions — not a live cover, refund, or premium-acceptance offer.',
    method: 'POST',
    path: '/quote/bridge',
    inputSchema: {
      notional_usd: z.number().positive().describe('Amount bridged in USD.'),
      bridge: z.string().optional().describe("Bridge name, e.g. 'across'."),
      source_chain_id: z.number().int().optional().describe('Source chain ID. Default 1.'),
      dest_chain_id: z.number().int().optional().describe('Destination chain ID. Default 8453 (Base).'),
      sla_seconds: z.number().int().positive().optional().describe('Expected delivery SLA in seconds. Default 60.'),
      bridge_risk_score: z.number().min(0).max(1).optional().describe('Bridge risk score 0–1. Default 0.05.'),
    },
  },
  {
    name: 'quote_lrt_slashing',
    description:
      'Modeled premium estimate for slashing risk on a liquid-restaking-token (LRT) position given its AVS exposure. Returns a modeled premium and slashing bounds — not a live cover offer.',
    method: 'POST',
    path: '/quote/lrt',
    inputSchema: {
      covered_eth_amount: z.number().positive().describe('ETH amount used as the modeled position size.'),
      lrt_token: z.string().optional().describe("LRT token, e.g. 'weETH'."),
      underlying_avs_exposure: z
        .record(z.string(), z.number())
        .optional()
        .describe("AVS exposure weights, e.g. { \"EigenDA\": 1.0 }."),
      correlation_max_overlap: z.number().min(0).max(1).optional().describe('Max correlation overlap 0–1. Default 0.5.'),
      cover_duration_weeks: z.number().int().min(1).max(520).optional().describe('Modeled cover duration in weeks. Default 12.'),
    },
  },
  {
    name: 'simulate_scenario',
    description:
      'Run a what-if Monte Carlo: model expected premium vs expected refund/loss over a horizon, given assumptions about sandwich frequency, average loss, and deductible. Returns a narrative + distribution.',
    method: 'POST',
    path: '/scenario/simulate',
    inputSchema: {
      notional_usd: z.number().positive().describe('Per-swap notional in USD.'),
      sandwich_freq_pct: z.number().min(0).max(100).optional().describe('Sandwich frequency as a percentage 0–100. Default 1.2.'),
      avg_loss_bps: z.number().min(0).optional().describe('Average sandwich loss in bps. Default 40.'),
      horizon_days: z.number().int().min(1).max(365).optional().describe('Horizon in days (≈ swaps). Default 30.'),
      deductible_bps: z.number().min(0).optional().describe('Deductible in bps. Default 100.'),
    },
  },
  {
    name: 'get_detector_manifest',
    description:
      'Fetch the latest public MEV-detector run manifest: the detector version hash and the eligible pool/token universe it was committed to. Use to verify what the detector covers.',
    method: 'GET',
    path: '/benchmark/manifest',
    inputSchema: {},
  },
  {
    name: 'check_swap',
    description:
      'Pre-trade decision-support check for a swap — the call an agent makes before it signs. Given notional, chain, and an optional route and token, returns a modeled route-quality grade, price-impact / slippage band, modeled MEV/execution exposure where observable, and a token registry read (recognized vs unverified), plus a clear / caution / unsupported verdict with reasons. Point-in-time decision support: it does not execute, route funds, or promise an outcome. Recognition is not safety, sellability, redemption, rights, liquidity, or investment-quality verification; unverified tokens, unknown order flow, and uncalibrated sequencer ordering downgrade the verdict rather than reading as safe.',
    method: 'POST',
    path: '/check/swap',
    inputSchema: {
      notional_usd: z.number().positive().max(1e12).describe('Trade size in USD.'),
      chain_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Chain ID. 1 = Ethereum (default), 4663 = Robinhood Chain.'),
      route: z
        .string()
        .optional()
        .describe("Route id to score, e.g. 'uniswap-v3-rho'. Omit to score the chain's default public route."),
      token_out: z
        .string()
        .optional()
        .describe(
          "Token being received (address or symbol) — checked against Routescore's recognized-token registry (recognized vs unverified). RHC tokenized stock/ETF address-level recognition uses the Routescore registry contract address; symbol-only input is downgraded to unverified. Symbol-only recognition is not contract verification. Recognition is not a safety, sellability, rights, redemption, liquidity, or investment-quality verdict; unverified means Routescore has not confirmed the token.",
        ),
      token_in: z.string().optional().describe('Token being sold (address or symbol).'),
      slippage_allowance_bps: z
        .number()
        .min(0)
        .max(10000)
        .optional()
        .describe('Slippage allowance in bps. Default 50.'),
    },
  },
  {
    name: 'get_preflight_record',
    description:
      'Fetch one persisted preflight evidence record by the record_id a check_swap call returned. Owner-scoped: the configured key only ever sees records belonging to its own account. The record embeds the original check_swap response verbatim plus a canonical-JSON SHA-256 integrity hash (record_id and recorded_at excluded) so the evidence can be re-verified offline, and includes the stored evidence bundle. Read-only evidence: record creation rejects known execution-material keys (calldata, transaction payloads, signing material) and drops identity-shaped labels from the actor context.',
    method: 'GET',
    path: '/records/{record_id}',
    pathParams: ['record_id'],
    inputSchema: {
      record_id: z
        .string()
        .min(1)
        .describe('The record id returned by check_swap (its record_id field).'),
    },
  },
  {
    name: 'whoami',
    description:
      'Confirm the configured API key works and report which plan tier it carries. Returns the owning account email and tier.',
    method: 'GET',
    path: '/me',
    inputSchema: {},
  },
];
