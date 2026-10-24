#!/usr/bin/env node
// Classificação proporcional ao risco (change-flow). Função pura: o agente declara fatos com valor e
// evidência, e classifyRequest devolve o caminho. O tamanho do diff não é entrada.
// Uso da CLI: node .claude/skills/change-flow/change-flow.mjs conflict <CLAUDE.md>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SIM = 'sim';
const NAO = 'não';
const DESCONHECIDO = 'desconhecido';
const OLD_RULE = 'Zero código sem spec';
const REFERENCE = 'change-flow';

export const FACTS = Object.freeze([
  'ambiguidadeEscopo',
  'apenasAparencia',
  'impactoAcessibilidade',
  'comportamentoLocal',
  'contratoExterno',
  'regraNegocio',
  'areaSensivel',
  'arquitetural',
]);
const PATH3_FACTS = ['contratoExterno', 'regraNegocio', 'areaSensivel', 'arquitetural'];
const PATH2_FACTS = ['impactoAcessibilidade', 'comportamentoLocal'];
const DOWNWARD_FACTS = FACTS.slice(2);

// Fato sem valor sim/não ou sem evidência textual é desconhecido (CF-013, CF-014).
function readFact(facts, name) {
  const fact = facts?.[name];
  const evidence = typeof fact?.evidence === 'string' ? fact.evidence.trim() : '';
  if ((fact?.value === SIM || fact?.value === NAO) && evidence !== '') return { value: fact.value, evidence };
  return { value: DESCONHECIDO, evidence: null };
}

function evidenceOf(read, names) {
  return Object.fromEntries(names.filter((name) => read[name].value === SIM).map((name) => [name, read[name].evidence]));
}

function decision(path, reason, evidence = {}) {
  return { path, reason, evidence };
}

// R1 a R5 de design.md, D1. Desconhecido nunca desce de caminho.
export function classifyRequest(facts = {}) {
  const read = Object.fromEntries(FACTS.map((name) => [name, readFact(facts, name)]));
  if (read.ambiguidadeEscopo.value === SIM) {
    return decision('esclarecer', 'dúvida muda escopo, comportamento, compatibilidade ou aceite', evidenceOf(read, ['ambiguidadeEscopo']));
  }
  if (PATH3_FACTS.some((name) => read[name].value === SIM)) {
    return decision(3, 'fato de caminho 3 confirmado', evidenceOf(read, PATH3_FACTS));
  }
  const pathThreeClear = PATH3_FACTS.every((name) => read[name].value === NAO);
  if (pathThreeClear && PATH2_FACTS.some((name) => read[name].value === SIM)) {
    return decision(2, 'comportamento ou acessibilidade localizados, sem fato de caminho 3', evidenceOf(read, PATH2_FACTS));
  }
  const allDownwardClear = DOWNWARD_FACTS.every((name) => read[name].value === NAO);
  if (read.apenasAparencia.value === SIM && allDownwardClear) {
    return decision(1, 'só aparência ou texto, com os fatos de risco confirmados como não', evidenceOf(read, ['apenasAparencia']));
  }
  if (DOWNWARD_FACTS.some((name) => read[name].value === DESCONHECIDO)) {
    return decision('investigar', 'fato de risco desconhecido: investigar ou perguntar antes de classificar');
  }
  return decision('esclarecer', 'sem fato de risco confirmado e sem aparência confirmada');
}

// CF-010, CF-011: a regra antiga conflita quando aparece sem referência à change-flow.
export function detectRuleConflict(claudeMdText) {
  if (!claudeMdText.includes(OLD_RULE) || claudeMdText.includes(REFERENCE)) return { conflict: false };
  const line = claudeMdText.split('\n').findIndex((text) => text.includes(OLD_RULE)) + 1;
  return { conflict: true, line };
}

function main([command, file]) {
  if (command !== 'conflict' || !file) {
    process.stderr.write('uso: change-flow.mjs conflict <CLAUDE.md>\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(detectRuleConflict(readFileSync(file, 'utf8')))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
