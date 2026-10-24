// Identidade do framework (framework-identity): nome, créditos e ausência dos nomes proibidos.
// Os termos proibidos são montados por partes para que este arquivo não os contenha (design.md D6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, readRepoFile } from '../helpers.mjs';
import { calculateContractHash } from '../../harness/identification.mjs';

const OLD_NAME = ['setup', 'ecc', 'openspec'].join('-');
const PERSONAL_NAME = ['dou', 'glas'].join('');
const ARCHIVE = join(REPO_ROOT, 'openspec/changes/archive');

function versionedFiles() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && existsSync(join(REPO_ROOT, file)));
}

function filesContaining(term) {
  return versionedFiles().filter((file) => readFileSync(join(REPO_ROOT, file), 'utf8').toLowerCase().includes(term));
}

function section(text, heading) {
  const start = text.search(new RegExp(`^## ${heading}`, 'mi'));
  if (start < 0) return '';
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

test('[SL-001] nenhum arquivo cita o nome antigo', () => {
  assert.deepEqual(filesContaining(OLD_NAME), []);
});

test('[SL-002] nenhum arquivo cita o nome pessoal', () => {
  assert.deepEqual(filesContaining(PERSONAL_NAME), []);
});

test('[SL-003] aprovações arquivadas seguem válidas', () => {
  const archived = readdirSync(ARCHIVE).filter((name) => existsSync(join(ARCHIVE, name, 'authorizations.json')));
  assert.ok(archived.length > 0, 'há changes arquivadas com authorizations.json');
  for (const name of archived) {
    const copy = join(makeTempDir('sl003-'), name);
    cpSync(join(ARCHIVE, name), copy, { recursive: true });
    const before = calculateContractHash(copy);
    const file = join(copy, 'authorizations.json');
    const records = JSON.parse(readFileSync(file, 'utf8')).map((record) => ({ ...record, approver: 'outro aprovador' }));
    writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
    assert.equal(calculateContractHash(copy), before, `${name}: approver não entra no hash do contrato`);
  }
});

test('[SL-004] README credita os tres upstreams', () => {
  const readme = readRepoFile('README.md');
  assert.match(readme.split('\n')[0], /SpecLoop/);
  assert.match(readme, /\bframework\b/i);
  const credits = section(readme, 'Créditos');
  for (const repo of ['affaan-m/everything-claude-code', 'Fission-AI/OpenSpec', 'mattpocock/skills']) {
    assert.ok(credits.includes(`https://github.com/${repo}`), `créditos citam ${repo}`);
  }
});

test('[SL-005] README documenta so o npx', () => {
  const readme = readRepoFile('README.md');
  for (const command of ['install', 'init', 'adopt', 'update']) {
    assert.match(readme, new RegExp(`npx specloop(@\\S+)? ${command}\\b`), `README documenta npx specloop ${command}`);
  }
  assert.doesNotMatch(readme, /git (-C \S+ )?fetch/, 'README não instala por git fetch');
});
