// Passos do dono e distribuição (release-ci): README → Publicação e CI fora do pacote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readManifest, readRepoFile } from '../helpers.mjs';

function section(text, heading) {
  const start = text.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
  if (start < 0) return '';
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

const OWNER_STEPS = [
  'gh repo rename specloop',
  /environment `npm`[^\n]*`main`/,
  'npm publish --access public',
  'npm trust github specloop --file publish.yml --repo schussler/specloop --env npm',
  /disallow tokens/,
  'gh api repos/schussler/specloop/rulesets --method POST --input .github/rulesets/main.json',
  /outside collaborators/,
];

test('[CI-014] readme documenta os passos do dono na ordem', () => {
  const text = section(readRepoFile('README.md'), 'Publicação');
  assert.ok(text, 'README tem a seção Publicação');
  let cursor = 0;
  for (const step of OWNER_STEPS) {
    const rest = text.slice(cursor);
    const index = typeof step === 'string' ? rest.indexOf(step) : rest.search(step);
    assert.ok(index >= 0, `passo ${step} depois do anterior`);
    cursor += index + 1;
  }
});

test('[CI-015] ci fica fora do pacote e dos projetos', () => {
  const { template_only: templateOnly } = readManifest();
  assert.ok(templateOnly.includes('.github'));
  assert.ok(templateOnly.includes('scripts/ci'));
  const { files } = JSON.parse(readRepoFile('package.json'));
  for (const entry of files) {
    assert.ok(!entry.startsWith('.github') && !entry.startsWith('scripts/ci'), entry);
  }
});
