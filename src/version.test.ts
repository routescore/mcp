import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PACKAGE_VERSION } from './version.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as {
  version: string;
  mcpName?: string;
  repository: { url: string };
};
const packageLock = require('../package-lock.json') as {
  version: string;
  packages: Record<string, { version?: string }>;
};
const serverJson = require('../server.json') as {
  name: string;
  version: string;
  repository: { url: string };
  packages: Array<{
    identifier: string;
    version: string;
    environmentVariables: Array<{ name: string; description: string }>;
  }>;
};

describe('release metadata parity', () => {
  it('uses package.json as the MCP runtime version', () => {
    expect(PACKAGE_VERSION).toBe(packageJson.version);
    expect(readFileSync(new URL('./index.ts', import.meta.url), 'utf8')).not.toMatch(
      /new McpServer\(\{ name: 'routescore', version: '\d+\.\d+\.\d+' \}\)/,
    );
  });

  it('keeps npm lock metadata synchronized with package.json', () => {
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages['']?.version).toBe(packageJson.version);
  });

  it('keeps the official MCP Registry artifact synchronized', () => {
    expect(packageJson.mcpName).toBe('io.routescore/mcp');
    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages).toContainEqual(
      expect.objectContaining({ identifier: '@routescore/mcp', version: packageJson.version }),
    );
    expect(packageJson.repository.url).toBe('git+https://github.com/routescore/mcp.git');
    expect(serverJson.repository.url).toBe('https://github.com/routescore/mcp');
  });

  it('keeps registry auth copy inside the tier and quota contract', () => {
    const apiKey = serverJson.packages[0]?.environmentVariables.find(
      (variable) => variable.name === 'ROUTESCORE_API_KEY',
    );
    expect(apiKey?.description).toContain('per account');
    expect(apiKey?.description).toContain('per key');
    expect(apiKey?.description).toContain('requires Power');
  });

  it('keeps current release operations docs on the source version', () => {
    const release = readFileSync(new URL('../RELEASE.md', import.meta.url), 'utf8');
    const launch = readFileSync(new URL('../LAUNCH_RUNBOOK.md', import.meta.url), 'utf8');
    const registry = readFileSync(new URL('../REGISTRY_SUBMISSIONS.md', import.meta.url), 'utf8');
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

    expect(release).toContain(`| this source tree | \`${packageJson.version}\``);
    expect(launch).toContain(`Publish \`@routescore/mcp@${packageJson.version}\``);
    expect(registry).toContain(`| Version | \`${packageJson.version}\` |`);
    expect(changelog).toContain(`## ${packageJson.version} —`);
  });
});
