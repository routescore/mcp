import { createRequire } from 'node:module';

type PackageMetadata = { version?: unknown };

// package.json is the release source of truth. Resolve it at runtime instead of
// copying a version literal into the MCP handshake, where it can silently drift.
const require = createRequire(import.meta.url);
const metadata = require('../package.json') as PackageMetadata;

if (typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error('Invalid or missing version in @routescore/mcp package.json.');
}

export const PACKAGE_VERSION = metadata.version;
