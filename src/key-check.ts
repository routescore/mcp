/**
 * Startup key check for the @routescore/mcp server.
 *
 * The server is useless without a Routescore API key, and env is fixed at
 * process spawn — so a missing/malformed key should fail LOUDLY at startup
 * with an actionable message, not surface later as a per-tool-call error
 * inside an agent transcript. This also gives the post-publish smoke a
 * deterministic, key-free way to prove the published tarball resolves and
 * runs its entrypoint end to end (see RELEASE.md).
 *
 * The shape enforced here mirrors exactly what the Routescore backend mints
 * (app/src/lib/db/api-keys.ts: KEY_PREFIX 'rs_live_' +
 * randomBytes(32).toString('hex')): `rs_live_` followed by 64 lowercase hex
 * characters. Real key VERIFICATION stays server-side (`whoami`); this
 * check only rejects values that cannot be a minted key. Never echo any
 * part of the configured value back — a mis-pasted secret from another
 * system must not leak into logs.
 */

/** `rs_live_` + randomBytes(32).toString('hex') — the exact minted shape. */
const KEY_SHAPE = /^rs_live_[0-9a-f]{64}$/;

export function apiKeyStartupError(key: string | undefined): string | null {
  const trimmed = (key ?? '').trim();
  if (!trimmed) {
    return (
      'ROUTESCORE_API_KEY is not set. Generate a key at ' +
      'https://www.routescore.io/account (Account → Developer → API & MCP access) — ' +
      'free to mint on any tier; the pre-sign check_swap tool works on the free ' +
      'agent tier, and the modeled-quote tools require Power. Add it to the MCP ' +
      'server env.'
    );
  }
  if (!KEY_SHAPE.test(trimmed)) {
    return (
      'ROUTESCORE_API_KEY does not look like a Routescore API key (keys are ' +
      'rs_live_ followed by 64 lowercase hex characters; the configured value is ' +
      'not echoed here). Generate a key at https://www.routescore.io/account ' +
      '(Account → Developer → API & MCP access).'
    );
  }
  return null;
}
