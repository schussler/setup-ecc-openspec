// Conteúdo do pacote (framework-cli): só o que chega aos projetos, mais o CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, readManifest, readRepoFile } from '../helpers.mjs';

const FORBIDDEN = ['scripts/test/', 'scripts/benchmark/', 'openspec/specs/', 'openspec/changes/'];

function packedFiles() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(output)[0].files.map((file) => file.path);
}

function trackedFiles(entry) {
  return execFileSync('git', ['ls-files', '-z', '--', entry], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

test('[SL-010] pacote contem so o permitido', () => {
  const files = new Set(packedFiles());

  assert.ok(files.has('bin/specloop.mjs'));
  for (const entry of [...readManifest().managed, 'templates/docs/agents']) {
    const expected = trackedFiles(entry);
    assert.ok(expected.length > 0, `${entry} tem arquivos versionados`);
    for (const file of expected) assert.ok(files.has(file), `${file} está no pacote`);
  }
  for (const file of files) {
    assert.ok(!FORBIDDEN.some((prefix) => file.startsWith(prefix)), `${file} não deveria estar no pacote`);
  }
  assert.equal('dependencies' in JSON.parse(readRepoFile('package.json')), false);
});
