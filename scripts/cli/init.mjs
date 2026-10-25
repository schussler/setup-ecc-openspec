// specloop init <dir>: projeto novo a partir do pacote (design.md D3), no lugar do git fetch
// que o /new-project fazia. O projeto não herda specs, changes nem caminhos template_only.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { renewProjectId } from '../../.claude/skills/new-project/renew-id.mjs';
import {
  CliError, PACKAGE_ROOT, UsageError, confirm, copyFromPackage, frameworkField, languagesOf, listFiles,
  managedEntries, packageManifest, readText, toJson, writeFile,
} from './common.mjs';

// Arquivos owned que o projeto recebe uma vez, na criação.
const SEED = ['CLAUDE.md', '.claude/settings.json', 'openspec/config.yaml'];
const AGENT_MODELS = 'templates/docs/agents';
const EMPTY_DIRS = ['openspec/specs', 'openspec/changes'];

function resolveTarget(cwd, options, positional) {
  const dir = options.target ?? positional[0];
  if (!dir) throw new UsageError('uso: specloop init <dir> [--name <nome>] [--languages "<linguagens>"] [--yes]');
  const target = resolve(cwd, dir);
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new CliError(`${target} não está vazio: escolha um diretório novo ou vazio`);
  }
  return target;
}

function assertLanguages(languages) {
  const unknown = languages.filter((lang) => !existsSync(join(PACKAGE_ROOT, '.claude/rules', lang)));
  if (unknown.length > 0) throw new CliError(`linguagens sem rules no pacote: ${unknown.join(', ')}`);
}

// checks do projeto (D27): checks.test vira {command, suite} só quando há comando TAP.
function projectChecks(options) {
  const checks = { test: options['checks-test'] ?? '', lint: options['checks-lint'] ?? '', typecheck: options['checks-typecheck'] ?? '' };
  if (options['checks-test-file']) checks.test_file = options['checks-test-file'];
  if (options['checks-coverage']) checks.coverage = options['checks-coverage'];
  if (!options['checks-test-report']) return checks;
  const suite = options.suite ?? 'unit';
  return {
    ...checks,
    test: { command: checks.test, suite },
    test_report: { command: options['checks-test-report'], suite, format: 'tap' },
  };
}

function projectManifest(source, name, rules, options) {
  return {
    project: { name },
    framework: frameworkField(),
    upstreams: source.upstreams,
    managed: source.managed,
    owned: source.owned,
    rules,
    checks: projectChecks(options),
  };
}

function readmeStub(name, description) {
  return `# ${name}\n\n${description}\n\n`
    + 'Projeto criado com [SpecLoop](https://github.com/schussler/specloop). O agente segue o `CLAUDE.md` '
    + 'e o contexto em `docs/agents/`.\n\n'
    + 'Pipeline: `spec-create` → `spec-implement` → `spec-archive` → `pr`. '
    + 'Atualize o framework com `npx @k0d3r/specloop@latest update`.\n';
}

const git = (target, ...args) => execFileSync('git', ['-C', target, ...args], { stdio: 'pipe' });

function copyAgentModels(target) {
  for (const rel of listFiles(PACKAGE_ROOT, AGENT_MODELS)) {
    const destination = join(target, 'docs/agents', rel.slice(AGENT_MODELS.length + 1));
    writeFile(destination, readText(join(PACKAGE_ROOT, rel)));
  }
}

function writeProject(target, name, rules, options) {
  const source = packageManifest();
  copyFromPackage(target, [...managedEntries(source.managed, rules), ...SEED].flatMap((entry) => listFiles(PACKAGE_ROOT, entry)));
  copyAgentModels(target);
  renewProjectId(join(target, '.harness-project.json'));
  writeFile(join(target, '.gitignore'), '.harness-local/\n');
  for (const dir of EMPTY_DIRS) mkdirSync(join(target, dir), { recursive: true });
  writeFile(join(target, 'template.json'), toJson(projectManifest(source, name, rules, options)));
  const claudeMd = readText(join(target, 'CLAUDE.md')).split('\n');
  writeFile(join(target, 'CLAUDE.md'), [`# ${name}`, ...claudeMd.slice(1)].join('\n'));
  writeFile(join(target, 'README.md'), readmeStub(name, options.description ?? name));
}

function firstCommit(target, name) {
  git(target, 'add', '-A');
  try {
    git(target, 'commit', '-q', '-m', `chore: inicializa ${name} com SpecLoop`);
  } catch (err) {
    throw new CliError(`projeto criado em ${target}, mas o commit inicial falhou (configure user.name e user.email do git): ${err.stderr?.toString().trim()}`);
  }
}

export async function init(cwd, options, positional) {
  const target = resolveTarget(cwd, options, positional);
  const languages = languagesOf(options.languages);
  assertLanguages(languages);
  const name = options.name ?? basename(target);
  const rules = ['common', ...languages];
  console.log(`Projeto: ${name}\nDestino: ${target}\nRules: ${rules.join(', ')}`);
  if (!(await confirm('Criar o projeto e fazer o primeiro commit?', options))) {
    console.log('Nada foi escrito.');
    return;
  }
  mkdirSync(target, { recursive: true });
  git(target, 'init', '-q', '-b', 'main');
  writeProject(target, name, rules, options);
  firstCommit(target, name);
  console.log(`Projeto ${name} criado em ${target}. Preencha os campos TBD de docs/agents/ e os checks vazios de template.json.`);
}
