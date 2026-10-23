import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from './helpers.mjs';

const claude = readRepoFile('CLAUDE.md');

test('CLAUDE.md exige leitura inicial de docs agents', () => {
  for (const file of ['architecture.md', 'domain.md', 'issue-tracker.md']) {
    assert.ok(claude.includes(`docs/agents/${file}`), file);
  }
});

test('CLAUDE.md descreve o pipeline de quatro passos com gates', () => {
  assert.match(claude, /spec-create.*spec-implement.*spec-archive.*pr/s);
  assert.match(claude, /pedido explícito/);
  assert.match(claude, /não podem ser pulados/);
  assert.match(claude, /headless/);
  assert.match(claude, /hooks/i);
});
