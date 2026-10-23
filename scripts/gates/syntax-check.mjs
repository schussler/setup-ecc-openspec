#!/usr/bin/env node
// Type-check stand-in for dependency-free JavaScript: runs `node --check` on
// every script under the given directories (default: scripts).
// Usage: node scripts/gates/syntax-check.mjs [dir ...]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { walkFiles } from './checks.mjs';

const SCRIPT = /\.(mjs|cjs|js)$/;

const dirs = process.argv.slice(2);
const files = (dirs.length ? dirs : ['scripts'])
  .flatMap((dir) => walkFiles(process.cwd(), join(process.cwd(), dir)))
  .filter((file) => SCRIPT.test(file));

let errors = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    errors += 1;
    const detail = result.stderr.split('\n').find((line) => /Error/.test(line)) ?? 'erro de sintaxe';
    console.log(`error: ${file}: ${detail.trim()}`);
  }
}
console.log(`syntax-check: ${files.length} arquivo(s), ${errors} erro(s)`);
process.exit(errors === 0 ? 0 : 1);
