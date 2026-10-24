// Decisão de publicar (release-ci, design.md D2). O npm é fronteira externa: a resposta de
// `npm view specloop versions --json` é simulada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, writeTree } from '../helpers.mjs';
import { decide } from '../../ci/should-publish.mjs';

const SHOULD_PUBLISH = join(REPO_ROOT, 'scripts/ci/should-publish.mjs');
const NOT_FOUND = 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/specloop - Not found\n';

test('[CI-003] versao nova e publicada', () => {
  const result = decide({ version: '0.2.0', view: { code: 0, stdout: '["0.1.0"]', stderr: '' } });

  assert.equal(result.publish, true);
});

test('[CI-004] versao ja publicada nao republica', () => {
  const result = decide({ version: '0.1.0', view: { code: 0, stdout: '["0.1.0"]', stderr: '' } });

  assert.equal(result.publish, false);
  assert.match(result.reason, /versão já publicada/);
});

test('decisao aceita a resposta de uma unica versao como texto', () => {
  assert.equal(decide({ version: '0.1.0', view: { code: 0, stdout: '"0.1.0"', stderr: '' } }).publish, false);
  assert.equal(decide({ version: '0.2.0', view: { code: 0, stdout: '"0.1.0"', stderr: '' } }).publish, true);
});

test('[CI-005] pacote inexistente pede primeira publicacao manual', () => {
  const result = decide({ version: '0.1.0', view: { code: 1, stdout: '', stderr: NOT_FOUND } });

  assert.equal(result.publish, false);
  assert.match(result.reason, /primeira publicação é manual/);
});

// O CLI roda com um `npm` falso no PATH que responde com erro de rede.
test('[CI-006] erro do npm falha o job', () => {
  const bin = writeTree(makeTempDir('ci-npm-'), {
    npm: '#!/bin/sh\necho "npm error code ECONNRESET" >&2\nexit 1\n',
  });
  chmodSync(join(bin, 'npm'), 0o755);
  const project = writeTree(makeTempDir('ci-pkg-'), { 'package.json': { name: 'specloop', version: '0.2.0' } });
  const output = join(project, 'github-output');

  const result = spawnSync(process.execPath, [SHOULD_PUBLISH], {
    cwd: project, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ECONNRESET/);
  assert.ok(!existsSync(output) || !readFileSync(output, 'utf8').includes('publish='), 'nenhuma decisão gravada');
});
