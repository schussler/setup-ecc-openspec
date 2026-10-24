// F10 (tarefas 10.1, 10.2, 10.4): as skills spec-* e handoff distinguem o modo
// `runner` do modo `legacy`, e nenhuma skill grava contadores ou vereditos fora
// do runner. Os testes leem o texto das skills; não chamam o modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRepoFile, REPO_ROOT } from './helpers.mjs';

const skill = (name) => readRepoFile(`.claude/skills/${name}/SKILL.md`);
const steps = (text) => text.slice(text.indexOf('## Steps'));
const modeSection = (text) => {
  const start = text.indexOf('## Modo da execução');
  const end = text.indexOf('\n## ', start + 1);
  return start === -1 ? '' : text.slice(start, end === -1 ? undefined : end);
};

test('[SP-004] spec-implement exige teste falhando por comportamento e registra o baseline', () => {
  const text = skill('spec-implement');
  assert.match(text, /fail/i);
  assert.match(text, /expected reason/);
  assert.ok(text.indexOf('Red') < text.indexOf('Green'));
  assert.match(text, /implement-gate\.mjs baseline/);
});

test('[SP-004] spec-implement pede ao runner a avaliação do gate no modo runner', () => {
  const section = modeSection(skill('spec-implement'));
  assert.match(section, /runner/);
  assert.match(section, /cli\.mjs gate-implement/);
  assert.doesNotMatch(section, /implement-gate\.mjs score/, 'o modo runner não chama a CLI legada');
});

test('[SP-005] spec-archive pede a validação final ao runner antes de arquivar', () => {
  const section = modeSection(skill('spec-archive'));
  assert.match(section, /runner/);
  assert.match(section, /cli\.mjs validate-final/);
  const text = skill('spec-archive');
  assert.ok(text.indexOf('cli.mjs validate-final') < text.indexOf('openspec archive'));
  assert.match(text, /openspec-sync-specs/);
});

test('[SP-006] handoff lê contadores e vereditos do estado e grava só o contexto', () => {
  const text = skill('handoff');
  assert.match(text, /run-state\.json/);
  assert.match(text, /gates\.json/);
  assert.match(text, /[Nn]unca digite|[Nn]ever type|[Nn]ão digite/);
  assert.match(modeSection(text), /contexto|context/);
});

test('[SP-007] arquivamento grava evidence-summary.json e o checkpoint antes de mover a change', () => {
  const text = steps(skill('spec-archive'));
  const archive = text.indexOf('openspec archive');
  assert.ok(archive > -1);
  assert.ok(text.indexOf('evidence-summary.json') > -1, 'resumo ausente');
  assert.ok(text.indexOf('checkpoint.json') > -1, 'checkpoint ausente');
  assert.ok(text.indexOf('evidence-summary.json') < archive, 'resumo gravado depois de mover');
  assert.ok(text.indexOf('checkpoint.json') < archive, 'checkpoint gravado depois de mover');
});

test('[SP-008] skills em legacy usam as CLIs de gate com --legacy-write e em runner pedem ao runner', () => {
  for (const name of ['spec-implement', 'spec-archive']) {
    const text = skill(name);
    const section = modeSection(text);
    assert.match(section, /legacy/, name);
    assert.match(section, /--legacy-write/, name);
    assert.match(section, /runner/, name);
    assert.doesNotMatch(text, /Record the attempt as a row/, `${name} grava veredito à mão`);
  }
});

test('[SP-009] sem marco de adoção registrado, nenhuma execução é atribuída ao runner', () => {
  for (const name of ['spec-implement', 'spec-archive', 'handoff']) {
    const section = modeSection(skill(name));
    assert.match(section, /marco de ado[cç]ão/, name);
    assert.match(section, /issue-tracker\.md/, name);
    assert.match(section, /legacy/, name);
    assert.match(section, /nenhuma execução|no execution/i, name);
  }
});

test('nenhuma skill grava contadores ou vereditos fora do runner (pr sem mudança de comportamento)', () => {
  for (const name of ['spec-implement', 'spec-archive', 'handoff', 'pr']) {
    const text = skill(name);
    assert.doesNotMatch(text, /Record the attempt as a row/, name);
    assert.doesNotMatch(text, /Gates\*\* table/, `${name} edita a tabela de gates à mão`);
  }
  const pr = skill('pr');
  assert.match(pr, /pr-gate\.mjs/);
  assert.doesNotMatch(pr, /--legacy-write/);
  // pr só lê gates.json para montar a evidência; não o escreve.
  assert.doesNotMatch(pr, /(write|grave|record|escreva|grava)[^\n]{0,60}gates\.json/i);
});

test('a tabela Gates do issue-tracker é derivada e não se edita à mão', () => {
  const template = readFileSync(join(REPO_ROOT, 'templates/docs/agents/issue-tracker.md'), 'utf8');
  assert.match(template, /derivad/i);
  const rootTracker = readRepoFile('docs/agents/issue-tracker.md');
  assert.doesNotMatch(readRepoFile('.claude/skills/spec-archive/SKILL.md'), /row in the \*\*Gates\*\*/);
  assert.ok(rootTracker.includes('## Gates'));
});

test('[10.3 pendente] remoção do --legacy-write continua pendente do marco e da confirmação de ausência de execução legacy', () => {
  // Quando o marco 13 estiver registrado e não houver execução legacy ativa, esta
  // verificação é substituída pelo teste de remoção. Até lá, o flag permanece.
  const tasks = readRepoFile('openspec/changes/add-spec-harness/tasks.md');
  assert.match(tasks, /- \[ \] 10\.3 /);
  const gate = readRepoFile('scripts/gates/implement-gate.mjs');
  assert.match(gate, /legacy-write/);
});

test('[10.4] CLAUDE.md traz a tabela de gates derivada e o limite de isolamento', () => {
  const text = readRepoFile('CLAUDE.md');
  assert.match(text, /\| Gate \|/);
  for (const script of ['scripts/gates/implement-gate.mjs', 'scripts/gates/archive-gate.mjs', 'scripts/gates/pr-gate.mjs', 'scripts/harness/validate.mjs']) {
    assert.ok(text.includes(script), script);
    assert.ok(existsSync(join(REPO_ROOT, script)), script);
  }
  assert.match(text, /advisory/);
  assert.match(text, /isol/);
});

test('[10.4] README declara o limite de isolamento e a tabela de gates derivada', () => {
  const text = readRepoFile('README.md');
  assert.match(text, /advisory/);
  assert.match(text, /isolament|isolar/);
  assert.match(text, /derivad/);
});

test('[10.4] o template do issue-tracker declara a tabela de gates derivada', () => {
  const text = readFileSync(join(REPO_ROOT, 'templates/docs/agents/issue-tracker.md'), 'utf8');
  assert.match(text, /## Gates[\s\S]*derivad/);
});
