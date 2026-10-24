// Conclusão supervisionada (simplify-approval-and-execution, capacidade supervised-completion).
// Grava em openspec/changes/<change>/supervised-completion.json a evidência atual de uma change
// implementada fora do runner: suíte, lint, sintaxe, validate --strict e contrato. Não altera
// gates.json nem o veredito do gate de implementação. Só vale para o hash atual do contrato.
// Não usa TTY: a evidência é recalculada na hora, e o agente não grava resultado declarado.
// Usage: node scripts/harness/supervised-completion.mjs --change <nome> [--root <dir>]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChecks, runCommand } from '../gates/checks.mjs';
import { checkContract } from './contract.mjs';
import { calculateContractHash } from './identification.mjs';
import { assertChangeName, changeDir } from './identity.mjs';
import { ConfigError } from './policy.mjs';
import { writeFileAtomic } from './state.mjs';

export const FILE = 'supervised-completion.json';
const PASS = 'pass';
const FAIL = 'fail';
export const REQUIRED_EVIDENCE = Object.freeze(['suite', 'lint', 'syntax', 'validate_strict', 'contract']);

const invalid = (reason) => ({ valid: false, reason });

// Roda cada verificação agora. `run` é injetável só para teste; o real é runCommand.
async function collectEvidence(root, change, dir, run) {
  const checks = loadChecks(root);
  const commands = [
    ['suite', checks.test],
    ['lint', checks.lint],
    ['syntax', checks.typecheck],
    ['validate_strict', `openspec validate ${change} --strict`],
  ];
  const evidence = [];
  for (const [name, command] of commands) {
    const outcome = await run(command, { cwd: root });
    evidence.push({ name, command, result: outcome.code === 0 ? PASS : FAIL });
  }
  const contractErrors = checkContract(dir);
  evidence.push({
    name: 'contract',
    command: `checkContract(openspec/changes/${change})`,
    result: contractErrors.length === 0 ? PASS : FAIL,
  });
  return evidence;
}

// Grava o registro só com todas as evidências em pass. Qualquer falha recusa e não grava nada.
export async function recordSupervisedCompletion(root, change, { run = runCommand, now = new Date() } = {}) {
  assertChangeName(change);
  const dir = changeDir(root, change);
  if (!existsSync(dir)) throw new ConfigError(`change ${change} não existe em openspec/changes; nada foi gravado`);
  const evidence = await collectEvidence(root, change, dir, run);
  const failing = evidence.filter((item) => item.result !== PASS).map((item) => item.name);
  if (failing.length > 0) {
    throw new ConfigError(`conclusão supervisionada recusada: evidência sem pass (${failing.join(', ')}); nada foi gravado`);
  }
  const record = { change, recorded_at: now.toISOString(), contract_hash: calculateContractHash(dir), evidence };
  writeFileAtomic(join(dir, FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// Vale somente com todas as evidências obrigatórias em pass e o hash igual ao contrato atual.
export function readSupervisedCompletion(dir) {
  const path = join(dir, FILE);
  if (!existsSync(path)) return invalid('sem registro de conclusão supervisionada');
  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return invalid(`registro de conclusão ilegível: ${err.message}`);
  }
  const results = new Map((record.evidence ?? []).map((item) => [item.name, item.result]));
  const missing = REQUIRED_EVIDENCE.filter((name) => !results.has(name));
  if (missing.length > 0) return invalid(`evidência faltante: ${missing.join(', ')}`);
  const notPassing = REQUIRED_EVIDENCE.filter((name) => results.get(name) !== PASS);
  if (notPassing.length > 0) return invalid(`evidência sem pass: ${notPassing.join(', ')}`);
  let current;
  try {
    current = calculateContractHash(dir);
  } catch (err) {
    return invalid(`contrato incompleto: ${err.message}`);
  }
  if (record.contract_hash !== current) return invalid('hash diferente do contrato atual; registre a conclusão de novo');
  return { valid: true, reason: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };
  const change = flag('change');
  if (!change) {
    process.stderr.write('uso: supervised-completion.mjs --change <nome> [--root <dir>]\n');
    process.exitCode = 2;
  } else {
    recordSupervisedCompletion(flag('root') ?? process.cwd(), change)
      .then((record) => process.stdout.write(`conclusão supervisionada gravada: ${record.change} (hash ${record.contract_hash})\n`))
      .catch((err) => {
        process.stderr.write(`${err.message}\n`);
        process.exitCode = 1;
      });
  }
}
