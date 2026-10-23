import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
