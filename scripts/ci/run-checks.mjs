#!/usr/bin/env node
// Checks da CI (design.md D1): roda test, lint e typecheck de template.json → checks, em ordem.
// Saída 0 se todos passam, 1 no primeiro que falha (nomeando o check), 3 em configuração inválida.
// Uso: node scripts/ci/run-checks.mjs [--root <dir>]
import { resolve } from 'node:path';
import { ChecksError, REQUIRED_CHECKS, loadChecks, runCommand } from '../gates/checks.mjs';

const CONFIG_ERROR = 3;

export async function runChecks(root) {
  const checks = loadChecks(root);
  for (const name of REQUIRED_CHECKS) {
    console.log(`::group::${name}: ${checks[name]}`);
    const { code, output } = await runCommand(checks[name], { cwd: root });
    process.stdout.write(output);
    console.log('::endgroup::');
    if (code !== 0) return { ok: false, failed: name, code };
  }
  return { ok: true };
}

async function main(argv) {
  const index = argv.indexOf('--root');
  const root = resolve(index >= 0 ? argv[index + 1] : process.cwd());
  try {
    const result = await runChecks(root);
    if (result.ok) {
      console.log(`checks ok: ${REQUIRED_CHECKS.join(', ')}`);
      return 0;
    }
    console.error(`check falhou: ${result.failed} (código ${result.code})`);
    return 1;
  } catch (err) {
    if (!(err instanceof ChecksError)) throw err;
    console.error(`configuração inválida: ${err.message}`);
    return CONFIG_ERROR;
  }
}

process.exitCode = await main(process.argv.slice(2));
