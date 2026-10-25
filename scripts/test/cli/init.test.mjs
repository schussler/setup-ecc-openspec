// specloop init (framework-cli): projeto novo a partir do pacote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, writeTree } from '../helpers.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION, runCli, snapshot } from './support.mjs';

test('[SL-008] init cria projeto valido', () => {
  const parent = makeTempDir('specloop-init-');
  const target = join(parent, 'demo');

  const result = runCli(['init', target, '--yes', '--name', 'demo', '--languages', 'typescript'], { cwd: parent });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(execFileSync('git', ['-C', target, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(), '1');
  const manifest = JSON.parse(readFileSync(join(target, 'template.json'), 'utf8'));
  assert.deepEqual(manifest.framework, { package: PACKAGE_NAME, version: PACKAGE_VERSION });
  assert.deepEqual(manifest.project, { name: 'demo' });
  assert.deepEqual(manifest.rules, ['common', 'typescript']);
  assert.equal('template_only' in manifest, false);
  for (const dir of ['openspec/specs', 'openspec/changes']) assert.deepEqual(readdirSync(join(target, dir)), [], dir);
  for (const path of ['scripts/test', 'scripts/benchmark', 'templates', 'bin', 'scripts/cli', '.claude/rules/python']) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
  for (const path of ['.claude/rules/typescript', '.claude/rules/common', 'scripts/gates', 'docs/agents/domain.md']) {
    assert.ok(existsSync(join(target, path)), path);
  }
  assert.match(readFileSync(join(target, 'docs/agents/domain.md'), 'utf8'), /TBD/);
  assert.equal(readFileSync(join(target, 'CLAUDE.md'), 'utf8').split('\n')[0], '# demo');
  assert.equal(spawnSync('openspec', ['validate', '--all'], { cwd: target }).status, 0);
});

test('[SL-011] init recusa diretorio nao vazio', () => {
  const target = writeTree(makeTempDir('specloop-init-'), { 'existente.txt': 'não apagar\n' });
  const before = snapshot(target);

  const result = runCli(['init', target, '--yes', '--name', 'demo'], { cwd: target });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /não está vazio/);
  assert.deepEqual(snapshot(target), before);
  assert.equal(existsSync(join(target, '.git')), false);
});
