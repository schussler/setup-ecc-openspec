#!/usr/bin/env node
// Verificação do próprio template (template-check): caminhos managed existem, esquema de
// checks (D27: checks.test em string ou objeto, checks.test_report com format tap) e
// distribuição dos gates (scripts/harness e .claude/harness, imports dentro de managed).
// Uso: node scripts/harness/template-check.mjs [raiz do template]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateChecksSchema } from '../gates/checks.mjs';
import { describeGaps, distributionGaps } from '../../.claude/skills/template-migrate/distribution.mjs';

const REQUIRED_CHECKS = ['test', 'lint', 'typecheck'];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Falhas do bloco checks. validateChecksSchema cobre o formato e a suíte; aqui só se exige
// que os três comandos obrigatórios estejam preenchidos.
function checksFailures(checks = {}) {
  try {
    validateChecksSchema(checks);
  } catch (err) {
    return [err.message];
  }
  const failures = [];
  for (const key of REQUIRED_CHECKS) {
    const value = key === 'test' && typeof checks.test === 'object' ? checks.test?.command : checks[key];
    if (!nonEmpty(value)) failures.push(`checks.${key} ausente ou vazio em template.json`);
  }
  return failures;
}

export function checkTemplate(root) {
  const path = join(root, 'template.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { failures: [`template.json ausente ou inválido: ${err.message}`] };
  }
  const managed = manifest.managed ?? [];
  const failures = managed.filter((rel) => !existsSync(join(root, rel))).map((rel) => `managed ausente: ${rel}`);
  failures.push(...checksFailures(manifest.checks));
  const gaps = distributionGaps(root, managed);
  if (gaps.length > 0) failures.push(describeGaps(gaps));
  return { failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { failures } = checkTemplate(resolve(process.argv[2] ?? process.cwd()));
  if (failures.length > 0) {
    console.log(`NOT READY\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('READY: managed, checks e distribuição dos gates verificados');
}
