import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function makeTempDir(prefix = 'gates-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Writes { 'rel/path': 'content' } under root, creating parent directories.
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

export function readRepoFile(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

export function readManifest() {
  return JSON.parse(readRepoFile('template.json'));
}

// A committed copy of the current working tree (tracked and new files), so
// tests that clone the template see uncommitted work too. Cached per process.
let snapshot;
export function snapshotRepo() {
  if (snapshot) return snapshot;
  const root = join(makeTempDir('template-snapshot-'), 'repo');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && existsSync(join(REPO_ROOT, file)));
  for (const file of files) cpSync(join(REPO_ROOT, file), join(root, file));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'snapshot');
  snapshot = { source: root, branch: 'main' };
  return snapshot;
}
