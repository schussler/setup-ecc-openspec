// Hidden acceptance tests: copied into the run directory only after the
// pipeline and the scope check, so the agent never sees them. Each
// `*.hidden-test.js` file is one rule.
import { cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../../gates/checks.mjs';

const HIDDEN_DIR = '.hidden-tests';
const RULE_FILE = /\.hidden-test\.js$/;

export async function runHiddenTests({ dir, hiddenDir }) {
  cpSync(hiddenDir, join(dir, HIDDEN_DIR), { recursive: true });
  const rules = {};
  for (const file of readdirSync(hiddenDir).filter((name) => RULE_FILE.test(name)).sort()) {
    const result = await runCommand(`node --test '${HIDDEN_DIR}/${file}'`, { cwd: dir });
    rules[file.replace(RULE_FILE, '')] = result.code === 0;
  }
  return { passed: Object.values(rules).every(Boolean), rules };
}
