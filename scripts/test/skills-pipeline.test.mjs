import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readRepoFile, readManifest, REPO_ROOT } from './helpers.mjs';

const skill = (name) => readRepoFile(`.claude/skills/${name}/SKILL.md`);
const ADAPTED = ['spec-create', 'spec-implement'];

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
