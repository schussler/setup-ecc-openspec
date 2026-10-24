import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readManifest } from '../helpers.mjs';

test('[CF-012] CLAUDE.md segue owned', () => {
  const manifest = readManifest();
  assert.ok(manifest.owned.includes('CLAUDE.md'));
  assert.ok(!manifest.managed.includes('CLAUDE.md'));
});
