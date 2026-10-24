// Suporte dos testes do adendo A (contrato de aceitação, D27 a D31). Os hashes do manifesto
// são calculados aqui pela fórmula de D28, sem importar a implementação: o teste não pode
// depender do código que ele verifica. Nenhum helper chama o modelo; os checks são comandos locais.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGE_DIR, EMPTY_TAP, PASS_AC011, RUNTIME, defaultTemplate, scenario, setupRepo, validate, codes, humanRecord, setAuthorizations, setSpec, setTap, readSummary, specText } from './f7-support.mjs';
import { CHANGE, makeRepo } from './fixture.mjs';
import { writeTree } from '../helpers.mjs';

export { CHANGE, CHANGE_DIR, PASS_AC011, EMPTY_TAP, RUNTIME, defaultTemplate, scenario, setupRepo, validate, codes, humanRecord, setAuthorizations, setSpec, setTap, readSummary, specText, writeTree, makeRepo };
export const MANIFEST = `${CHANGE_DIR}/acceptance-manifest.json`;
export const TAP_HEAD = 'TAP version 13\n';
export const tapOf = (lines) => `${TAP_HEAD}${lines.join('\n')}\n1..${lines.length}\n# pass ${lines.length}\n# fail 0\n`;

const sha = (text) => createHash('sha256').update(text).digest('hex');
const lf = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const read = (root, file) => readFileSync(join(root, file), 'utf8');

// Identidade do caso (D28): "<arquivo>::<nome normalizado>".
export const caseIdOf = (file, name) => `${file}::${name.trim().replace(/\s+/g, ' ')}`;

// case_body_hash (D28): arquivo normalizado, depois "<caminho>\n<hash do helper>\n" por helper em ordem.
export function bodyHashOf(root, file, helpers = []) {
  let body = lf(read(root, file));
  for (const helper of [...helpers].sort()) body += `${helper}\n${sha(lf(read(root, helper)))}\n`;
  return sha(body);
}

// Entrada do manifesto para um caso, com os hashes calculados sobre o conteúdo atual do disco.
export function caseEntry(root, { file, name, scenarios, revision = 1, helpers = [] }) {
  return {
    case_id: caseIdOf(file, name),
    file,
    test_name: name,
    scenario_ids: scenarios,
    scenario_revisions: Object.fromEntries(scenarios.map((id) => [id, revision])),
    file_hash: bodyHashOf(root, file, helpers),
    helpers,
    helper_hashes: Object.fromEntries(helpers.map((helper) => [helper, sha(lf(read(root, helper)))])),
  };
}

export function writeManifest(root, entries) {
  writeTree(root, { [MANIFEST]: { schema_version: 1, entries } });
}

// Registro humano de autorização com finalidade (purpose) e escopo de casos (D29).
export function purposeRecord(id, purpose, scope) {
  return humanRecord(id, 'revision', scope, { purpose });
}

// Exceção humana com chave (D32): policy_key precisa estar em allowed_exceptions da política do repositório.
export function exceptionRecord(id, scope, policyKey) {
  return humanRecord(id, 'revision', scope, { purpose: 'exception', policy_key: policyKey });
}

// Declara as chaves de exceção prevista na política do repositório de teste (cópia, não a política real).
export function allowExceptions(root, keys) {
  const path = join(root, '.claude', 'harness', 'policy.json');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify({ ...policy, allowed_exceptions: keys }, null, 2)}\n`);
}

export const readText = (root, file) => readFileSync(join(root, file), 'utf8');
export const writeText = (root, file, text) => writeFileSync(join(root, file), text);
