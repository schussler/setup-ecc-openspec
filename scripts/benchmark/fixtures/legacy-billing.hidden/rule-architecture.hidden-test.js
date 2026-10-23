import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test('billing so importa de billing e nao le o relogio', () => {
  for (const file of files('src/billing').filter((path) => /\.[cm]?js$/.test(path))) {
    const source = readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith('./') && !specifier.includes('..'), `${file} importa ${specifier}`);
    }
    assert.doesNotMatch(source, /Date\.now\s*\(|new\s+Date\s*\(/, `${file} lê o relógio`);
  }
});
