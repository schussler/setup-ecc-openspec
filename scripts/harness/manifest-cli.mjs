#!/usr/bin/env node
// CLI do manifesto de aceitação (A.3, item G, D28). Dois comandos, e nenhum deles aprova nada:
//   generate <changeDir> --tests <lista> [--helpers <lista>] [--replace --auth <id>]
//     Gera o manifesto CANDIDATO (status "proposto") a partir das tags [ID] dos testes listados. Não grava
//     autorização. Se o manifesto já existe, recusa e mostra a diferença. Com --replace, exige um registro
//     revision humano de finalidade test_adequacy que cubra todos os casos do novo manifesto.
//   validate <changeDir>
//     Confere schema, identidades, file_hash, helpers, vínculos e revisões. Não altera nenhum arquivo.
// Evidência válida não é sobrescrita em silêncio: a diferença é sempre listada antes da substituição.
// Limitação da geração: os nomes de teste são lidos do código-fonte com um padrão de uma linha (test('nome')).
// Uso: node scripts/harness/manifest-cli.mjs generate|validate <changeDir> [opções]
// Exit: 0 ok, 1 recusado ou com problemas, 3 uso.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_FILE, MANIFEST_SCHEMA_VERSION, caseIdOf, fileHash, helperDigestOf, loadAcceptanceManifest, normalizeName, tagsOf,
} from './acceptance.mjs';
import { loadAuthorizations, parseScenarios, specFiles } from './contract.mjs';
import { ConfigError } from './policy.mjs';
import { writeFileAtomic } from './state.mjs';

export const CANDIDATE_STATUS = 'proposto';
const TEST_PURPOSE = 'test_adequacy';
const REVISION_KIND = 'revision';
const HUMAN = 'human';
const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 3;
// test('nome', ...) em uma linha, com aspas simples, duplas ou crase. Nomes com aspas escapadas não são lidos.
const TEST_NAME = /\btest\(\s*(['"`])(.+?)\1/g;
const USAGE = [
  'uso: manifest-cli.mjs generate <changeDir> --tests <a.test.mjs,b.test.mjs> [--helpers <h.mjs>] [--replace --auth <id>]',
  '     manifest-cli.mjs validate <changeDir>',
  'generate não registra aprovação: a aprovação segue por validate.mjs e por autorização humana (D29).',
].join('\n');

// Divide uma lista separada por vírgula, sem vazios, com caminhos relativos e barras normalizadas.
const listOf = (value) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  .map((item) => posix.normalize(item.split(sep).join('/')));

// Nomes de teste de um código-fonte, na ordem em que aparecem.
export function testNamesOf(source) {
  return [...source.matchAll(TEST_NAME)].map((match) => match[2]);
}

// Cenários declarados na change: id -> revisão atual.
function declaredScenarios(dir) {
  const scenarios = specFiles(join(dir, 'specs')).flatMap((path) => parseScenarios(readFileSync(path, 'utf8')));
  return new Map(scenarios.filter((scenario) => scenario.fields.ID)
    .map((scenario) => [scenario.fields.ID, Number(scenario.fields['Revisão'])]));
}

function readRequired(root, file, label) {
  const path = join(root, file);
  if (!existsSync(path)) throw new ConfigError(`${label} ausente: ${file}`);
  return path;
}

// Casos candidatos: cada teste com tag [ID] vira um caso. Tag sem cenário declarado é vínculo ambíguo.
function candidateEntries(root, dir, files, helpers) {
  const declared = declaredScenarios(dir);
  const helperHashes = Object.fromEntries(helpers.map((helper) => {
    readRequired(root, helper, 'helper');
    return [helper, helperDigestOf(root, helper)];
  }));
  return files.flatMap((file) => {
    const source = readFileSync(readRequired(root, file, 'arquivo de teste'), 'utf8');
    return testNamesOf(source).filter((name) => tagsOf(name).length > 0).map((name) => {
      const ids = tagsOf(name);
      const undeclared = ids.filter((id) => !declared.has(id));
      if (undeclared.length > 0) {
        throw new ConfigError(`vínculo ambíguo: o caso "${normalizeName(name)}" cita [${undeclared.join('], [')}], que não é cenário declarado nesta change`);
      }
      return {
        case_id: caseIdOf(file, name),
        file,
        test_name: normalizeName(name),
        scenario_ids: ids,
        scenario_revisions: Object.fromEntries(ids.map((id) => [id, declared.get(id)])),
        file_hash: fileHash(root, file, helpers),
        helpers: [...helpers].sort(),
        helper_hashes: helperHashes,
      };
    });
  });
}

const serialize = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

// Diferença entre o manifesto atual e o candidato, por case_id: acrescentado, removido ou alterado.
export function diffEntries(current, next) {
  const currentById = new Map(current.map((entry) => [entry.case_id, entry]));
  const nextById = new Map(next.map((entry) => [entry.case_id, entry]));
  const lines = [];
  for (const entry of next) {
    const before = currentById.get(entry.case_id);
    if (!before) lines.push(`+ acrescentado: ${entry.case_id}`);
    else if (JSON.stringify([before.file_hash, before.scenario_revisions, before.helpers]) !== JSON.stringify([entry.file_hash, entry.scenario_revisions, entry.helpers])) {
      lines.push(`~ alterado: ${entry.case_id} (file_hash, revisões ou helpers)`);
    }
  }
  for (const entry of current) if (!nextById.has(entry.case_id)) lines.push(`- removido: ${entry.case_id}`);
  return lines;
}

// Autorização humana revision de finalidade test_adequacy, não revogada, com o id dado, que cobre os casos listados.
export function coversCases(records, change, caseIds, id) {
  const revoked = new Set(records.map((record) => record?.revokes).filter(Boolean));
  return records.some((record) => record?.id === id && record.kind === REVISION_KIND && record.origin === HUMAN
    && !revoked.has(record.id) && record.purpose === TEST_PURPOSE && record.scope?.change === change
    && caseIds.every((caseId) => (record.scope?.cases ?? []).includes(caseId)));
}

function generate({ root, dir, change, files, helpers, replace, auth }) {
  if (files.length === 0) throw new ConfigError('--tests exige pelo menos um arquivo de teste');
  if (auth !== null && !replace) throw new ConfigError('--auth só vale com --replace');
  if (replace && auth === null) throw new ConfigError('--replace exige --auth <id> de autorização revision com finalidade test_adequacy');
  const next = candidateEntries(root, dir, files, helpers);
  if (next.length === 0) throw new ConfigError('nenhum teste com tag [ID] nos arquivos listados: nada a gerar');
  const path = join(dir, MANIFEST_FILE);
  const candidate = { schema_version: MANIFEST_SCHEMA_VERSION, status: CANDIDATE_STATUS, entries: next };
  if (existsSync(path)) {
    const diff = diffEntries(loadAcceptanceManifest(dir).entries, next);
    if (diff.length === 0) return { status: EXIT_OK, lines: ['manifesto já corresponde aos testes listados: nada gravado'] };
    if (!replace) {
      return {
        status: EXIT_REFUSED,
        lines: ['manifesto existente: recusado sem --replace. Diferença:', ...diff,
          'Para substituir: --replace --auth <id> com autorização revision de finalidade test_adequacy que cubra os casos.'],
      };
    }
    const { records } = loadAuthorizations(dir);
    const caseIds = next.map((entry) => entry.case_id);
    const authorized = coversCases(records, change, caseIds, auth);
    if (!authorized) {
      return { status: EXIT_REFUSED, lines: [`--replace recusado: auth:${auth} não é revision humana de finalidade test_adequacy que cubra os ${caseIds.length} caso(s)`] };
    }
  }
  writeFileAtomic(path, serialize(candidate));
  return {
    status: EXIT_OK,
    lines: [`manifesto candidato gravado com status ${CANDIDATE_STATUS}: ${next.length} caso(s)`,
      'nenhuma aprovação foi registrada: a aprovação exige validate.mjs e autorização humana (D29)'],
  };
}

function validateManifest({ root, dir }) {
  const path = join(dir, MANIFEST_FILE);
  if (!existsSync(path)) return { status: EXIT_REFUSED, lines: [`erro: ${MANIFEST_FILE} ausente`] };
  const manifest = loadAcceptanceManifest(dir);
  const declared = declaredScenarios(dir);
  const problems = manifest.entries.flatMap((entry) => {
    const found = [];
    if (!existsSync(join(root, entry.file))) found.push(`erro: arquivo de teste ausente: ${entry.file} (${entry.case_id})`);
    else if (fileHash(root, entry.file, entry.helpers) !== entry.file_hash) {
      found.push(`erro: file_hash divergente em ${entry.case_id}: arquivo ou helper alterado depois da geração`);
    }
    for (const helper of entry.helpers) {
      if (!existsSync(join(root, helper))) found.push(`erro: helper ausente: ${helper} (${entry.case_id})`);
      else if (helperDigestOf(root, helper) !== entry.helper_hashes[helper]) found.push(`erro: helper ${helper} alterado em ${entry.case_id}`);
    }
    for (const id of entry.scenario_ids) {
      if (!declared.has(id)) found.push(`erro: vínculo ambíguo: ${entry.case_id} cita ${id}, que não é cenário declarado nesta change`);
      else if (entry.scenario_revisions[id] !== declared.get(id)) {
        found.push(`erro: revisão de ${id} no manifesto (${entry.scenario_revisions[id]}) difere da revisão atual (${declared.get(id)})`);
      }
    }
    return found;
  });
  const header = `status: ${manifest.status ?? 'sem status'}; ${manifest.entries.length} caso(s) conferidos`;
  if (problems.length > 0) return { status: EXIT_REFUSED, lines: [header, ...problems] };
  return { status: EXIT_OK, lines: [header, 'ok: schema, identidades, file_hash, helpers, vínculos e revisões conferem'] };
}

// Resolve a change a partir do diretório openspec/changes/<change>, e a raiz do repositório acima dele.
export function changeContext(changeDirArg) {
  const dir = resolve(changeDirArg);
  const change = basename(dir);
  const root = resolve(dir, '..', '..', '..');
  if (basename(dirname(dir)) !== 'changes' || basename(dirname(dirname(dir))) !== 'openspec') {
    throw new ConfigError(`caminho de change inválido: ${changeDirArg} (esperado openspec/changes/<change>)`);
  }
  return { root, dir, change };
}

// Lê as opções depois do comando e do diretório. Opção desconhecida ou sem valor é erro de uso.
export function parseArgs(argv) {
  const [command, changeDirArg, ...rest] = argv;
  if (!command || !changeDirArg || !['generate', 'validate'].includes(command)) throw new ConfigError(USAGE);
  const options = { tests: null, helpers: null, replace: false, auth: null };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--replace') {
      options.replace = true;
    } else if (flag === '--tests' || flag === '--helpers' || flag === '--auth') {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) throw new ConfigError(`${flag} exige valor\n${USAGE}`);
      options[flag.slice(2)] = value;
      index += 1;
    } else {
      throw new ConfigError(`opção desconhecida: ${flag}\n${USAGE}`);
    }
  }
  return { command, changeDirArg, options };
}

// Executa um comando e devolve { status, lines }. Não lança para erro de configuração.
export function run(argv) {
  try {
    const { command, changeDirArg, options } = parseArgs(argv);
    const { root, dir, change } = changeContext(changeDirArg);
    if (command === 'validate') return validateManifest({ root, dir });
    return generate({
      root,
      dir,
      change,
      files: listOf(options.tests),
      helpers: listOf(options.helpers),
      replace: options.replace,
      auth: options.auth,
    });
  } catch (err) {
    if (err instanceof ConfigError) return { status: err.message.startsWith('uso:') ? EXIT_USAGE : EXIT_REFUSED, lines: [`erro: ${err.message}`] };
    throw err;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = run(process.argv.slice(2));
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  process.exitCode = result.status;
}
