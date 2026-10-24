// Workflows e regra da main (release-ci, design.md D3 a D6). Os YAML são lidos como texto:
// o repositório não tem parser YAML, e o que se verifica são chaves e linhas fixas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, readRepoFile } from '../helpers.mjs';

const WORKFLOWS = '.github/workflows';
const ci = () => readRepoFile(`${WORKFLOWS}/ci.yml`);
const publish = () => readRepoFile(`${WORKFLOWS}/publish.yml`);
const workflows = () => readdirSync(join(REPO_ROOT, WORKFLOWS)).map((name) => [name, readRepoFile(`${WORKFLOWS}/${name}`)]);

// Bloco de nível superior `on:` até a próxima chave de nível superior.
function topLevel(text, key) {
  const match = text.match(new RegExp(`^${key}:\\n((?:[ \\t]+.*\\n|\\n)*)`, 'm'));
  return match ? match[1] : '';
}

test('[CI-007] ci roda em pull request com node 22', () => {
  const text = ci();
  const on = topLevel(text, 'on');
  assert.match(on, /^ {2}pull_request:\n {4}branches: \[main\]/m);
  assert.doesNotMatch(on, /^ {2}push:/m);
  assert.match(text, /^jobs:\n {2}ci:\n/m);
  assert.match(text, /node-version: '22'/);
  assert.match(text, /run: node scripts\/ci\/run-checks\.mjs/);
});

test('[CI-008] ci nao recebe credenciais', () => {
  for (const [name, text] of workflows()) assert.doesNotMatch(text, /pull_request_target/, name);
  const text = ci();
  assert.match(topLevel(text, 'permissions'), /^ {2}contents: read\n/);
  assert.doesNotMatch(text, /id-token/);
  assert.doesNotMatch(text, /secrets\./);
});

test('[CI-009] publish so roda no push da main com environment npm', () => {
  const text = publish();
  assert.equal(topLevel(text, 'on'), '  push:\n    branches: [main]\n\n');
  assert.match(text, /^ {4}environment: npm$/m);
});

test('[CI-010] publish usa oidc sem token', () => {
  const text = publish();
  assert.match(text, /id-token: write/);
  assert.match(text, /node-version: '24'/);
  assert.match(text, /run: npm publish --provenance --access public/);
  assert.doesNotMatch(text, /secrets\./);
  assert.doesNotMatch(text, /NODE_AUTH_TOKEN/);
});

test('[CI-011] publish roda checks antes de publicar', () => {
  const text = publish();
  const checks = text.indexOf('node scripts/ci/run-checks.mjs');
  const decision = text.indexOf('node scripts/ci/should-publish.mjs');
  const release = text.indexOf('npm publish');
  assert.ok(checks > 0 && checks < decision && decision < release, 'ordem: run-checks, should-publish, npm publish');
  const releaseStep = text.slice(text.lastIndexOf('- name:', release), release);
  assert.match(releaseStep, /if: steps\.decide\.outputs\.publish == 'true'/);
  assert.match(text, /id: decide\n/);
});

test('[CI-012] actions fixadas por sha', () => {
  for (const [name, text] of workflows()) {
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    assert.ok(uses.length > 0, `${name} usa actions`);
    for (const ref of uses) assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${name}: ${ref}`);
  }
});

test('[CI-013] regra da main exige pr e ci sem excecao', () => {
  const ruleset = JSON.parse(readRepoFile('.github/rulesets/main.json'));
  assert.equal(ruleset.target, 'branch');
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
  assert.deepEqual(ruleset.bypass_actors, []);
  const rules = Object.fromEntries(ruleset.rules.map((rule) => [rule.type, rule]));
  for (const type of ['pull_request', 'required_status_checks', 'non_fast_forward', 'deletion']) assert.ok(rules[type], type);
  assert.deepEqual(rules.required_status_checks.parameters.required_status_checks.map((check) => check.context), ['ci']);
});
