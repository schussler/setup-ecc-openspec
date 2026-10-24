#!/usr/bin/env node
// Scope check: lists every file changed, added, deleted or untracked since a
// git ref that is outside the allowed `scoped_paths`.
// Usage: node scripts/gates/scope-check.mjs --base <ref> --scoped "src/,test/" [--root <dir>]
// Without --scoped, reads `scoped_paths` from template.json.
// Exit: 0 pass, 1 fail, 3 error.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChecksError, readManifest } from './checks.mjs';
import { parseArgs, runCli, isMain } from './gate-store.mjs';

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

export function changedFiles(root, base) {
  const tracked = git(root, ['diff', '--name-only', base]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked, ...untracked])].sort();
}

function inScope(file, scoped) {
  return scoped.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path || file.startsWith(`${path}/`)));
}

// Arquivos operacionais (policy.json -> excluded_paths) não são escopo: nem entram na lista.
// Padrão com barra final vale para um segmento de diretório; padrão com barra interna vale para o
// caminho inteiro a partir da raiz (ex.: docs/agents/issue-tracker.md); padrão com * vale para o nome.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const globOf = (pattern) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);

export function readExcludedPaths(root) {
  const path = join(root, '.claude', 'harness', 'policy.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).excluded_paths ?? [];
}

export function isExcluded(file, patterns) {
  const segments = file.split('/');
  const name = segments.at(-1);
  return patterns.some((pattern) => {
    if (pattern.endsWith('/')) return segments.slice(0, -1).includes(pattern.slice(0, -1));
    if (pattern.includes('/')) return globOf(pattern).test(file);
    return globOf(pattern).test(name);
  });
}

export function outOfScope(files, scoped) {
  return files.filter((file) => !inScope(file, scoped));
}

export function checkScope({ root, base, scoped }) {
  if (!base) throw new ChecksError('scope-check precisa de --base <ref>');
  if (!scoped?.length) throw new ChecksError('scoped_paths vazio: passe --scoped ou defina scoped_paths em template.json');
  const excluded = readExcludedPaths(root);
  const files = changedFiles(root, base).filter((file) => !isExcluded(file, excluded));
  const outside = outOfScope(files, scoped);
  return { base, scoped_paths: scoped, changed: files.length, out_of_scope: outside, verdict: outside.length === 0 ? 'pass' : 'fail' };
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(['check', ...process.argv.slice(2)]);
  const root = options.root ?? process.cwd();
  runCli(() => {
    const scoped = typeof options.scoped === 'string'
      ? options.scoped.split(',').map((path) => path.trim()).filter(Boolean)
      : readManifest(root).scoped_paths;
    return checkScope({ root, base: options.base, scoped });
  });
}
