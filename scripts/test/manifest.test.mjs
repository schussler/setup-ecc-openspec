import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, REPO_ROOT } from './helpers.mjs';

const manifest = readManifest();

test('docs agents e CLAUDE.md sao owned', () => {
  for (const path of ['docs/agents', 'CLAUDE.md']) {
    assert.ok(manifest.owned.includes(path), path);
    assert.ok(!manifest.managed.includes(path), path);
  }
});

test('modelos de contexto tem campos TBD', () => {
  for (const name of ['architecture.md', 'domain.md', 'issue-tracker.md']) {
    const path = join(REPO_ROOT, 'templates/docs/agents', name);
    assert.ok(existsSync(path), name);
    assert.match(readFileSync(path, 'utf8'), /TBD/, name);
  }
});

test('template declara checks do proprio repo', () => {
  const { checks } = manifest;
  for (const key of ['test', 'lint', 'typecheck']) {
    assert.equal(typeof checks[key], 'string', key);
    assert.ok(checks[key].trim().length > 0, key);
  }
  assert.match(checks.test_file, /\{file\}/);
});

test('template.json registra upstream mattpocock-skills', () => {
  assert.match(manifest.upstreams['mattpocock-skills'], /^[0-9a-f]{40}$/);
});

test('template_only cobre os caminhos exclusivos do template', () => {
  for (const path of ['templates', 'scripts/benchmark', 'scripts/test', 'openspec/specs', 'openspec/changes/archive']) {
    assert.ok(manifest.template_only.includes(path), path);
  }
  for (const path of manifest.template_only) {
    assert.ok(!manifest.managed.some((m) => m === path || m.startsWith(`${path}/`)), path);
  }
});

test('scripts/gates e managed', () => {
  assert.ok(manifest.managed.includes('scripts/gates'));
});
