// Procedimentos documentados: restauração manual (PM-011, D32) e identidade owned (RS-019, RS-023).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectId } from '../../harness/identity.mjs';
import { DERIVED_PROJECT_ID, PROJECT_ID, REPO_ROOT, cloneRepo, makeRepo } from './fixture.mjs';

const policyDoc = readFileSync(join(REPO_ROOT, '.claude', 'harness', 'policy.md'), 'utf8');
const section = () => {
  const start = policyDoc.indexOf('manual_rollback');
  assert.ok(start >= 0, 'policy.md descreve manual_rollback');
  return policyDoc.slice(start, start + 4000);
};

test('[PM-011] manual_rollback exige autorização humana registrada antes da restauração', () => {
  assert.match(section(), /autoriza[çc][ãa]o humana|autorização registrada|terminal interativo/i);
});

test('[PM-011] manual_rollback exige cópia pré-migração com hash conferido', () => {
  assert.match(section(), /c[óo]pia pr[ée]-migra[çc][ãa]o[\s\S]*hash/i);
});

test('[PM-011] manual_rollback preserva o consumo acumulado e a evidência local', () => {
  assert.match(section(), /consumo[\s\S]*preserv|preserv[\s\S]*consumo/i);
});

test('[PM-011] manual_rollback exige reconciliar reservas abertas antes de continuar', () => {
  assert.match(section(), /reserva[s]? aberta[s]?[\s\S]*reconcili|reconcili[\s\S]*reserva[s]? aberta/i);
});

test('[PM-011] manual_rollback não promete reversão transparente e não cria kind novo', () => {
  const text = section();
  assert.match(text, /n[ãa]o [ée] transparente/i);
  assert.doesNotMatch(text, /kind:\s*"?manual_rollback/);
});

test('[RS-023] .harness-project.json é owned e fica fora de managed no template', () => {
  const template = JSON.parse(readFileSync(join(REPO_ROOT, 'template.json'), 'utf8'));
  assert.ok(template.owned.includes('.harness-project.json'));
  assert.ok(!template.managed.includes('.harness-project.json'));
});

test('[RS-019] clone preserva o project_id versionado do projeto de origem', () => {
  const source = makeRepo({ projectId: PROJECT_ID });
  const clone = cloneRepo(source, 'clone-identidade');
  assert.equal(projectId(clone), PROJECT_ID);
  assert.notEqual(projectId(clone), DERIVED_PROJECT_ID);
  assert.ok(existsSync(join(clone, '.harness-project.json')));
});
