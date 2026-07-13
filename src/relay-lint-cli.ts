#!/usr/bin/env node
/**
 * Thin CLI for the relay-contract linter (ROU-714 eval harness v0).
 *
 * Usage:
 *   npm run relay-lint -- <response.json> <answer.txt>
 *
 * <response.json>  a check_swap response body (REST or MCP tool result JSON)
 * <answer.txt>     the agent's FINAL user-facing answer text
 *
 * Exit codes: 0 = relay contract honored (warn findings allowed),
 *             1 = fail findings, 2 = usage/input error.
 *
 * Dependency-free (node:fs + the pure linter). Live agent runs that produce
 * the answer file are manual/local — see
 * divisions/sojourn/skills/routescore-ai/eval/README.md.
 */
import { readFileSync } from 'node:fs';
import { lintRelay, type CheckSwapLikeResponse } from './relay-lint.js';
import { isRecord } from './trust.js';

function main(): void {
  const [responsePath, answerPath] = process.argv.slice(2);
  if (!responsePath || !answerPath) {
    console.error('Usage: relay-lint <response.json> <answer.txt>');
    process.exit(2);
  }

  let response: unknown;
  try {
    response = JSON.parse(readFileSync(responsePath, 'utf8'));
  } catch (err) {
    console.error(`relay-lint: could not read/parse ${responsePath}: ${(err as Error).message}`);
    process.exit(2);
  }
  if (!isRecord(response)) {
    console.error(`relay-lint: ${responsePath} is not a JSON object`);
    process.exit(2);
  }

  let answer: string;
  try {
    answer = readFileSync(answerPath, 'utf8');
  } catch (err) {
    console.error(`relay-lint: could not read ${answerPath}: ${(err as Error).message}`);
    process.exit(2);
  }

  const result = lintRelay(response as CheckSwapLikeResponse, answer);

  for (const finding of result.findings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.rule}: ${finding.detail}`);
  }
  const fails = result.findings.filter((f) => f.severity === 'fail').length;
  const warns = result.findings.filter((f) => f.severity === 'warn').length;
  console.log(
    result.pass
      ? `PASS — relay contract honored (${warns} warning${warns === 1 ? '' : 's'})`
      : `FAIL — ${fails} fail finding${fails === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`,
  );
  process.exit(result.pass ? 0 : 1);
}

main();
