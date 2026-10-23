#!/usr/bin/env node
// Explicit migration of a derived project to the current template: the owned
// paths `/template-update` never writes, plus managed paths added to the
// template after the project was created. `plan` only reads; `apply` writes
// only the items it is given. Every item only adds: nothing in the project is
// removed or overwritten.
// Usage:
//   node .claude/skills/template-migrate/migrate.mjs plan --template <clone> [--project <dir>]
//   node .claude/skills/template-migrate/migrate.mjs apply --template <clone> --items managed,docs-agents,checks,settings,claude-md
//     [--checks-test "<cmd>"] [--checks-test-file "<cmd>"] [--checks-lint "<cmd>"] [--checks-typecheck "<cmd>"] [--checks-coverage "<cmd>"]
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ITEMS = Object.freeze(['managed', 'docs-agents', 'checks', 'settings', 'claude-md']);
const REQUIRED_CHECKS = ['test', 'lint', 'typecheck'];
const OPTIONAL_CHECKS = ['test_file', 'coverage'];
const BLOCK = /<!-- template:([a-z-]+):start -->\n[\s\S]*?<!-- template:\1:end -->\n?/g;

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function manifests(template, project) {
  const projectManifest = join(project, 'template.json');
  if (!existsSync(projectManifest)) throw new Error(`${projectManifest} não existe: o projeto não é derivado do template`);
  return { t: readJson(join(template, 'template.json')), p: readJson(projectManifest) };
}

function listFiles(root, rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [rel];
  return readdirSync(path).flatMap((name) => listFiles(root, `${rel}/${name}`));
}

// --- preservation checks (also used by the tests and the skill's report) ---

export function isPreservedText(original, result) {
  const lines = result.split('\n');
  let index = 0;
  for (const line of original.split('\n')) {
    while (index < lines.length && lines[index] !== line) index += 1;
    if (index === lines.length) return false;
    index += 1;
  }
  return true;
}

export function isPreservedJson(original, result) {
  if (Array.isArray(original)) {
    if (!Array.isArray(result)) return false;
    let index = 0;
    for (const value of original) {
      while (index < result.length && !isPreservedJson(value, result[index])) index += 1;
      if (index === result.length) return false;
      index += 1;
    }
    return true;
  }
  if (original && typeof original === 'object') {
    if (!result || typeof result !== 'object') return false;
    return Object.keys(original).every((key) => key in result && isPreservedJson(original[key], result[key]));
  }
  return original === result;
}

// --- checks detection ---

export function detectChecks(project) {
  const found = {};
  const pkg = readJson(join(project, 'package.json'), null);
  if (pkg) {
    const scripts = pkg.scripts ?? {};
    if (scripts.test) found.test = 'npm test';
    if (scripts.lint) found.lint = 'npm run lint';
    const typecheck = ['typecheck', 'type-check', 'tsc'].find((name) => scripts[name]);
    if (typecheck) found.typecheck = `npm run ${typecheck}`;
    else if (existsSync(join(project, 'tsconfig.json'))) found.typecheck = 'npx tsc --noEmit';
  }
  const pyproject = readText(join(project, 'pyproject.toml'));
  if (pyproject !== null) {
    found.test ??= 'pytest';
    found.test_file ??= 'pytest {file}';
    if (/^\[tool\.ruff/m.test(pyproject)) found.lint ??= 'ruff check .';
    if (/^\[tool\.mypy/m.test(pyproject)) found.typecheck ??= 'mypy .';
  }
  if (existsSync(join(project, 'go.mod'))) {
    found.test ??= 'go test ./...';
    found.lint ??= 'go vet ./...';
    found.typecheck ??= 'go build ./...';
  }
  return found;
}

// --- items: each returns { status, details } and an apply function ---

function managedItem(template, project) {
  const { t, p } = manifests(template, project);
  const newManaged = t.managed.filter((path) => !p.managed.includes(path));
  const conflicts = newManaged.filter((path) => existsSync(join(project, path)));
  const copy = newManaged.filter((path) => !conflicts.includes(path) && existsSync(join(template, path)));
  const addOwned = (t.owned ?? []).filter((path) => !(p.owned ?? []).includes(path));
  const pending = copy.length + addOwned.length;
  return {
    status: pending > 0 ? 'needed' : conflicts.length > 0 ? 'conflict' : 'done',
    details: { add_managed: copy, add_owned: addOwned, conflicts },
    apply(write, copyTree) {
      for (const path of copy) copyTree(join(template, path), path);
      if (pending === 0) return;
      // Conflicting paths stay out of `managed`, so /template-update never overwrites them.
      write('template.json', toJson({ ...p, managed: [...p.managed, ...copy], owned: [...(p.owned ?? []), ...addOwned] }));
    },
  };
}

function docsAgentsItem(template, project) {
  const exists = existsSync(join(project, 'docs', 'agents'));
  return {
    status: exists ? 'done' : 'needed',
    details: { source: 'templates/docs/agents', target: 'docs/agents' },
    apply(_write, copyTree) {
      if (!exists) copyTree(join(template, 'templates', 'docs', 'agents'), 'docs/agents');
    },
  };
}

function checksItem(project, confirmed) {
  const manifest = readJson(join(project, 'template.json'));
  const current = manifest.checks ?? {};
  const filled = (key) => typeof current[key] === 'string' && current[key].trim() !== '';
  return {
    status: REQUIRED_CHECKS.every(filled) ? 'done' : 'needed',
    details: { current, detected: detectChecks(project) },
    apply(write) {
      const next = { ...current };
      for (const key of [...REQUIRED_CHECKS, ...OPTIONAL_CHECKS]) {
        if (filled(key)) continue;
        if (confirmed[key]) next[key] = confirmed[key];
        else if (REQUIRED_CHECKS.includes(key) && !(key in next)) next[key] = '';
      }
      write('template.json', toJson({ ...readJson(join(project, 'template.json')), checks: next }));
    },
  };
}

function settingsItem(template, project) {
  const path = join(project, '.claude', 'settings.json');
  const current = readJson(path, {});
  const allow = current.permissions?.allow ?? [];
  const missing = (readJson(join(template, '.claude', 'settings.json')).permissions?.allow ?? []).filter((rule) => !allow.includes(rule));
  return {
    status: missing.length > 0 || !existsSync(path) ? 'needed' : 'done',
    details: { add_allow: missing },
    apply(write) {
      write('.claude/settings.json', toJson({ ...current, permissions: { ...current.permissions, allow: [...allow, ...missing] } }));
    },
  };
}

export function templateBlocks(template) {
  const text = readFileSync(join(template, 'CLAUDE.md'), 'utf8');
  return Object.fromEntries([...text.matchAll(BLOCK)].map((match) => [match[1], match[0].endsWith('\n') ? match[0] : `${match[0]}\n`]));
}

function insertBlocks(text, blocks) {
  let result = text;
  for (const [id, block] of Object.entries(blocks)) {
    const marked = new RegExp(`<!-- template:${id}:start -->\\n[\\s\\S]*?<!-- template:${id}:end -->\\n?`);
    if (marked.test(result)) {
      result = result.replace(marked, block);
    } else if (id === 'agents-context') {
      const lines = result.split('\n');
      const title = lines.findIndex((line) => line.startsWith('# '));
      lines.splice(title + 1, 0, '', block.trimEnd());
      result = lines.join('\n');
    } else {
      result = `${result.replace(/\n*$/, '\n')}\n${block}`;
    }
  }
  return result;
}

function claudeMdItem(template, project) {
  const blocks = templateBlocks(template);
  const current = readText(join(project, 'CLAUDE.md'));
  const name = readJson(join(project, 'template.json')).project?.name ?? basename(project);
  const next = insertBlocks(current ?? `# ${name}\n`, blocks);
  return {
    status: current === next ? 'done' : 'needed',
    details: { blocks: Object.keys(blocks), creates: current === null },
    apply(write) {
      write('CLAUDE.md', next);
    },
  };
}

function buildItems(template, project, confirmed = {}) {
  return {
    managed: () => managedItem(template, project),
    'docs-agents': () => docsAgentsItem(template, project),
    checks: () => checksItem(project, confirmed),
    settings: () => settingsItem(template, project),
    'claude-md': () => claudeMdItem(template, project),
  };
}

export function plan({ template, project }) {
  const items = buildItems(template, project);
  return { items: ITEMS.map((id) => ({ id, ...pick(items[id]()) })) };
}

const pick = ({ status, details }) => ({ status, details });

export function apply({ template, project, items = [], checks = {} }) {
  const unknown = items.filter((id) => !ITEMS.includes(id));
  if (unknown.length > 0) throw new Error(`itens desconhecidos: ${unknown.join(', ')}`);
  const changed = new Set();
  const write = (rel, content) => {
    const path = join(project, rel);
    if (readText(path) === content) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    changed.add(rel);
  };
  const copyTree = (source, rel) => {
    for (const file of listFiles(source, '.')) {
      const target = join(project, rel, file);
      if (existsSync(target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(source, file), target);
      changed.add(relative(project, target));
    }
  };
  // Items are rebuilt one at a time: managed and checks both edit template.json.
  for (const id of ITEMS.filter((item) => items.includes(item))) {
    const item = buildItems(template, project, checks)[id]();
    if (item.status !== 'done') item.apply(write, copyTree);
  }
  return { applied: items, changed_files: [...changed].sort() };
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) options[rest[i].slice(2)] = rest[i + 1];
    i += 1;
  }
  return { command, options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { command, options } = parseCli(process.argv.slice(2));
  try {
    if (!options.template) throw new Error('--template <clone do template> é obrigatório');
    const project = options.project ?? process.cwd();
    let result;
    if (command === 'plan') result = plan({ template: options.template, project });
    else if (command === 'apply') {
      const checks = Object.fromEntries(['test', 'test_file', 'lint', 'typecheck', 'coverage']
        .map((key) => [key, options[`checks-${key.replace('_', '-')}`]])
        .filter(([, value]) => value));
      result = apply({ template: options.template, project, items: (options.items ?? '').split(',').filter(Boolean), checks });
    } else throw new Error('uso: migrate.mjs <plan|apply> --template <dir> [--project <dir>] [--items a,b] [--checks-* "<cmd>"]');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}
