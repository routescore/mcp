#!/usr/bin/env node
/**
 * @routescore/mcp — a stdio MCP server that exposes the Routescore public API
 * as tools for Claude, Cursor, and other MCP clients.
 *
 * It is a thin, stateless wrapper: every tool call forwards to the keyed
 * gateway at ${ROUTESCORE_API_URL}/api/public/v1/* with the configured bearer
 * key. Tool definitions live in ./tools.ts so the hosted endpoint can share
 * them verbatim. The trust-envelope enforcement lives in ./trust.ts so it can
 * be unit tested in isolation (see trust.test.ts).
 *
 * Config (env):
 *   ROUTESCORE_API_KEY   required — an `rs_live_...` key (free to mint on any
 *                        tier; the check_swap tool works on the free agent tier,
 *                        modeled-quote + scenario tools require Power).
 *   ROUTESCORE_API_URL   optional — base URL (default https://www.routescore.io).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, type ToolSpec } from './tools.js';
import { interpretGatewayResponse } from './trust.js';
import { apiKeyStartupError } from './key-check.js';
import { PACKAGE_VERSION } from './version.js';

const API_URL = (process.env.ROUTESCORE_API_URL || 'https://www.routescore.io').replace(/\/+$/, '');
const API_KEY = process.env.ROUTESCORE_API_KEY;

async function callApi(spec: ToolSpec, args: Record<string, unknown>): Promise<unknown> {
  if (!API_KEY) {
    throw new Error(
      'ROUTESCORE_API_KEY is not set. Generate an API key in your Routescore account (Account → Developer) — free to mint on any tier; the check_swap tool works on the free agent tier, higher tiers unlock the quote/scenario tools — and add it to the MCP server env.',
    );
  }
  const init: RequestInit = {
    method: spec.method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Adoption attribution: lets the gateway distinguish MCP-driven calls
      // from raw REST in api.request telemetry (does not affect auth).
      'X-Routescore-Client': 'mcp',
    },
  };

  // Substitute `{name}` path placeholders from args (URL-encoded) and drop
  // them from the body — e.g. get_preflight_record → /records/{record_id}.
  let path = spec.path;
  const bodyArgs: Record<string, unknown> = { ...(args ?? {}) };
  for (const param of spec.pathParams ?? []) {
    const value = bodyArgs[param];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Missing required path parameter '${param}'.`);
    }
    path = path.replace(`{${param}}`, encodeURIComponent(value.trim()));
    delete bodyArgs[param];
  }
  if (spec.method === 'POST') init.body = JSON.stringify(bodyArgs);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/public/v1${path}`, init);
  } catch (err) {
    throw new Error(`Could not reach Routescore at ${API_URL}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  // An evaluated HTTP 422 body (check_swap's `verdict: unsupported` answer —
  // gap-state fields, caveats, and record linkage included) relays as a normal
  // tool result; true errors (400/401/403/404/429/5xx and non-evaluated 422
  // error envelopes) stay errors. Logic + tests live in ./trust.ts.
  const interpreted = interpretGatewayResponse(res.status, res.ok, body);
  if (interpreted.kind === 'error') throw new Error(interpreted.message);
  return interpreted.body;
}

async function main(): Promise<void> {
  // Fail loudly at startup on a missing/malformed key — env is fixed at
  // spawn, so waiting for the first tool call only buries the same error
  // inside an agent transcript. Shape check only (the exact minted format,
  // rs_live_ + 64 lowercase hex); real key verification stays server-side
  // (`whoami`). See key-check.ts.
  const keyError = apiKeyStartupError(API_KEY);
  if (keyError) {
    // eslint-disable-next-line no-console
    console.error(`[routescore-mcp] ${keyError}`);
    process.exit(1);
  }

  const server = new McpServer({ name: 'routescore', version: PACKAGE_VERSION });

  for (const spec of TOOLS) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await callApi(spec, args ?? {});
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: (err as Error).message }],
            isError: true,
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error(`[routescore-mcp] ready · ${TOOLS.length} tools · ${API_URL}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[routescore-mcp] fatal:', err);
  process.exit(1);
});
