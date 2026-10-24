// Hidden acceptance tests: copied into the run directory only after the
// pipeline and the scope check, so the agent never sees them. Each
// `*.hidden-test.js` file is one rule.
//
// "Oculto" é visibilidade, não obrigatoriedade (requisito "Testes ocultos"):
// cada regra tem classificação declarada na tarefa (`hidden_rules`),
// `obrigatória` ou `informativa`. Regra sem classificação é obrigatória.
import { cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../../gates/checks.mjs';

const HIDDEN_DIR = '.hidden-tests';
const RULE_FILE = /\.hidden-test\.js$/;

export const MANDATORY = 'obrigatória';
export const INFORMATIVE = 'informativa';
const CLASSIFICATIONS = new Set([MANDATORY, INFORMATIVE]);

// Classificação efetiva de uma regra: a declarada, ou obrigatória quando ausente.
export const classificationOf = (classification, rule) => classification?.[rule] ?? MANDATORY;

function listRules(hiddenDir) {
  return readdirSync(hiddenDir).filter((name) => RULE_FILE.test(name)).sort()
    .map((file) => ({ file, rule: file.replace(RULE_FILE, '') }));
}

// Falha cedo com classificação inválida ou declarada para regra que não existe.
function checkClassification(classification, rules) {
  const known = new Set(rules.map(({ rule }) => rule));
  for (const [rule, value] of Object.entries(classification)) {
    if (!known.has(rule)) throw new Error(`hidden_rules: a regra ${rule} não existe nos testes ocultos`);
    if (!CLASSIFICATIONS.has(value)) {
      throw new Error(`hidden_rules: classificação inválida para ${rule} (${value}); use ${MANDATORY} ou ${INFORMATIVE}`);
    }
  }
}

export async function runHiddenTests({ dir, hiddenDir, classification = {} }) {
  const rules = listRules(hiddenDir);
  checkClassification(classification, rules);
  cpSync(hiddenDir, join(dir, HIDDEN_DIR), { recursive: true });
  const results = [];
  for (const { file, rule } of rules) {
    const result = await runCommand(`node --test '${HIDDEN_DIR}/${file}'`, { cwd: dir });
    results.push({ rule, passed: result.code === 0, classification: classificationOf(classification, rule) });
  }
  const failed = results.filter((result) => !result.passed);
  return {
    // O gate reprova com qualquer regra reprovada; quem decide a aceitação é a classificação.
    passed: failed.length === 0,
    rules: Object.fromEntries(results.map(({ rule, passed }) => [rule, passed])),
    classification: Object.fromEntries(results.map(({ rule, classification: value }) => [rule, value])),
    results,
    failed_mandatory: failed.filter((result) => result.classification === MANDATORY).map(({ rule }) => rule),
    failed_informative: failed.filter((result) => result.classification === INFORMATIVE).map(({ rule }) => rule),
  };
}
