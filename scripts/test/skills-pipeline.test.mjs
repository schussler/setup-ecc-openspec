import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readRepoFile, readManifest, REPO_ROOT } from './helpers.mjs';

const skill = (name) => readRepoFile(`.claude/skills/${name}/SKILL.md`);
// Ordering checks look only at the numbered steps, not at the intro or frontmatter.
const steps = (text) => text.slice(text.indexOf('## Steps'));
const ADAPTED = ['spec-create', 'spec-implement', 'pr', 'handoff'];

test('spec-create usa fallback sem grill-me', () => {
  const text = skill('spec-create');
  assert.match(text, /grill-me/);
  assert.match(text, /interview\.md/);
  assert.ok(existsSync(join(REPO_ROOT, '.claude/skills/spec-create/interview.md')));
});

test('spec-create delega ao opsx propose e le docs agents', () => {
  const text = skill('spec-create');
  assert.match(text, /\/opsx:propose/);
  assert.match(text, /openspec new change/);
  assert.match(text, /docs\/agents\//);
});

test('spec-implement segue red green refactor', () => {
  const text = skill('spec-implement');
  assert.match(text, /Red/);
  assert.match(text, /Green/);
  assert.match(text, /Refactor/);
  assert.match(text, /implement-gate\.mjs baseline/);
  assert.match(text, /implement-gate\.mjs score/);
  assert.match(text, /\/opsx:apply/);
  assert.match(text, /issue-tracker\.md/);
});

test('spec-implement proibe afrouxar gate ou alterar teste sem justificativa', () => {
  const text = skill('spec-implement');
  assert.match(text, /[Nn]ever lower a gate threshold/);
  assert.match(text, /[Nn]ever change a test to make it pass/);
});

test('skills adaptadas levam a licenca do upstream', () => {
  const commit = readManifest().upstreams['mattpocock-skills'];
  for (const name of ADAPTED) {
    const notice = readRepoFile(`.claude/skills/${name}/NOTICE.md`);
    assert.match(notice, /MIT License/, name);
    assert.match(notice, /Copyright \(c\) 2026 Matt Pocock/, name);
    assert.ok(notice.includes(commit), name);
  }
});

test('skills spec delegam ao opsx', () => {
  const pairs = { 'spec-create': '/opsx:propose', 'spec-implement': '/opsx:apply', 'spec-archive': '/opsx:archive' };
  for (const [name, command] of Object.entries(pairs)) {
    const text = skill(name);
    assert.ok(text.includes(command), name);
    assert.match(text, /cannot be skipped/, name);
  }
});

test('spec-archive roda gate antes de arquivar', () => {
  const text = steps(skill('spec-archive'));
  const gate = text.indexOf('archive-gate.mjs');
  assert.ok(gate > -1);
  assert.ok(gate < text.indexOf('/opsx:archive'));
  assert.ok(gate < text.indexOf('openspec archive'));
  assert.match(text, /openspec-sync-specs/);
  assert.match(text, /openspec\/changes\/archive\//);
});

test('pr so executa sob pedido explicito', () => {
  const text = skill('pr');
  assert.match(text, /explicit/i);
  assert.match(text, /pr-gate\.mjs/);
  assert.match(text, /headless/);
  const ordered = steps(text);
  const confirm = ordered.search(/[Ww]ait for (the user's )?confirmation/);
  assert.ok(confirm > -1);
  assert.ok(confirm < ordered.indexOf('gh pr create'));
});

test('handoff grava ponto de restauracao', () => {
  const text = skill('handoff');
  assert.match(text, /docs\/agents\/issue-tracker\.md/);
  assert.match(text, /Ponto de restauração/);
});
