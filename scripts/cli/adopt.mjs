// specloop adopt: leva um projeto existente ao pipeline completo com o migrate.mjs do pacote
// (design.md D3). Mostra o plano, pergunta item a item e só adiciona.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { apply, plan } from '../../.claude/skills/template-migrate/migrate.mjs';
import {
  CliError, PACKAGE_ROOT, assertGitRepo, confirm, frameworkField, packageManifest, toJson, writeFile,
} from './common.mjs';

const CHECK_KEYS = ['test', 'test_file', 'lint', 'typecheck', 'coverage', 'test_report', 'suite', 'format'];
const SKIPPED = new Set(['.git', 'node_modules']);

// Manifesto de partida de um projeto que ainda não usa o framework: o item managed do plano
// acrescenta os caminhos managed e owned do pacote.
const startingManifest = () => ({ framework: frameworkField(), upstreams: packageManifest().upstreams, managed: [], owned: [], checks: {} });

// Sem template.json, o plano roda numa cópia com o manifesto de partida: nada é escrito no projeto.
function planWithoutManifest(project) {
  const stage = join(mkdtempSync(join(tmpdir(), 'specloop-adopt-')), basename(project));
  try {
    cpSync(project, stage, { recursive: true, filter: (source) => !SKIPPED.has(basename(source)) });
    writeFile(join(stage, 'template.json'), toJson(startingManifest()));
    return plan({ template: PACKAGE_ROOT, project: stage });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function checksFrom(options, items) {
  const detected = items.find((item) => item.id === 'checks')?.details.detected ?? {};
  const given = Object.fromEntries(CHECK_KEYS
    .map((key) => [key, options[`checks-${key.replace('_', '-')}`]])
    .filter(([, value]) => value));
  return { ...detected, ...given };
}

// --items a,b aplica só os itens listados, sem perguntar: a skill confirma cada um na conversa.
async function chooseItems(items, options) {
  const needed = items.filter(({ status }) => status === 'needed').map(({ id }) => id);
  if (options.items !== undefined) {
    const listed = options.items.split(',').map((id) => id.trim()).filter(Boolean);
    const unknown = listed.filter((id) => !items.some((item) => item.id === id));
    if (unknown.length > 0) throw new CliError(`itens desconhecidos: ${unknown.join(', ')}`);
    return listed.filter((id) => needed.includes(id));
  }
  const chosen = [];
  for (const id of needed) {
    if (await confirm(`Aplicar ${id}?`, options)) chosen.push(id);
  }
  return chosen;
}

function printPlan(items) {
  console.log('Plano de adoção:');
  for (const { id, status } of items) console.log(`  ${id}: ${status}`);
}

export async function adopt(project, options) {
  assertGitRepo(project);
  const hasManifest = existsSync(join(project, 'template.json'));
  const { items } = hasManifest ? plan({ template: PACKAGE_ROOT, project }) : planWithoutManifest(project);
  printPlan(items);
  const chosen = await chooseItems(items, options);
  if (chosen.length === 0) {
    console.log('Nada foi escrito.');
    return;
  }
  if (!hasManifest) writeFile(join(project, 'template.json'), toJson(startingManifest()));
  try {
    const result = apply({ template: PACKAGE_ROOT, project, items: chosen, checks: checksFrom(options, items) });
    console.log(`Aplicado: ${result.applied.join(', ')} (${result.changed_files.length} arquivos).`);
  } catch (err) {
    throw new CliError(err.message);
  }
}
