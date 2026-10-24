// Simulated agent for the benchmark tests, loaded by fake-claude.mjs through
// FAKE_CLAUDE_HOOK. It imitates each pipeline skill just enough for the
// runner's independent verification. FAKE_AGENT_BREAK=<skill> makes that step
// "succeed" while leaving broken work behind (or no work, for new-project).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCENARIO = 'converte horas e minutos';

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd });

function newProject(prompt) {
  const target = prompt.match(/--target (\S+)/)[1];
  const task = JSON.parse(readFileSync(process.env.FAKE_AGENT_TASK, 'utf8'));
  mkdirSync(target, { recursive: true });
  cpSync(join(REPO_ROOT, 'scripts/gates'), join(target, 'scripts/gates'), { recursive: true });
  // scripts/harness é managed no template.json: os gates importam dele (process-group, identity).
  cpSync(join(REPO_ROOT, 'scripts/harness'), join(target, 'scripts/harness'), { recursive: true });
  cpSync(join(REPO_ROOT, 'templates/docs/agents'), join(target, 'docs/agents'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude/settings.json'), join(target, '.claude/settings.json'));
  write(target, 'template.json', JSON.stringify({ checks: task.checks }, null, 2));
  write(target, 'openspec/config.yaml', 'schema: spec-driven\n');
  write(target, 'openspec/specs/.gitkeep', '');
  write(target, 'openspec/changes/.gitkeep', '');
  git(target, 'init', '-q', '-b', 'main');
  git(target, 'add', '-A');
  git(target, 'commit', '-q', '-m', 'init');
}

function specCreate(cwd, change) {
  const dir = `openspec/changes/${change}`;
  write(cwd, `${dir}/proposal.md`, '# Proposal\n\n## Why\nConverter durações.\n\n## What Changes\n- parseDuration\n\n## Premissas\n- Nenhuma: o brief resolve todas as decisões.\n');
  write(cwd, `${dir}/specs/duration/spec.md`, `## ADDED Requirements\n\n### Requirement: Conversão\nA biblioteca SHALL converter durações.\n\n#### Scenario: ${SCENARIO}\n- **WHEN** "1h30m"\n- **THEN** 5400\n`);
  write(cwd, `${dir}/tasks.md`, '# Tasks\n\n## 1. Parser\n\n- [x] 1.1 parseDuration\n');
}

function specImplement(cwd, broken) {
  write(cwd, 'src/duration.mjs', 'export const parseDuration = () => 5400;\n');
  const expected = broken ? 1 : 5400;
  write(cwd, 'test/duration.test.mjs', `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { parseDuration } from '../src/duration.mjs';\ntest('${SCENARIO}', () => assert.equal(parseDuration('1h30m'), ${expected}));\n`);
}

export default function fakeAgent({ args, cwd }) {
  const prompt = args[1];
  const skill = prompt.split(' ')[0].slice(1);
  const broken = process.env.FAKE_AGENT_BREAK === skill;
  const change = prompt.split(' ').find((word) => /^(add|refactor)-[a-z-]+:?$/.test(word))?.replace(':', '');
  if (skill === 'new-project' && !broken) newProject(prompt);
  if (skill === 'spec-create' && !broken) specCreate(cwd, change);
  if (skill === 'spec-implement') specImplement(cwd, broken);
  if (skill === 'spec-archive' && !broken) execFileSync('openspec', ['archive', change, '--yes'], { cwd, stdio: 'ignore' });
}
