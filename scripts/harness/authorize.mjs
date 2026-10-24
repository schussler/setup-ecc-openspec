// Registro de autorizações do harness (F5, D4 camada 3, D32, RC-029, RC-030, RC-039, RC-047 a RC-050).
// É o único código que grava authorizations.json, e só a partir de decisão humana digitada em terminal
// interativo. Skills e runner não importam este módulo.
// A regra de somente acréscimo é procedimental: a mesma conta pode editar o arquivo.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTHORIZATIONS_STAMP, assertChangeName, changeDir, localDir, projectId } from './identity.mjs';
import { authorizationIdentityIssues, calculateContractHash } from './identification.mjs';
import { ConfigError, loadPolicy } from './policy.mjs';
import { writeFileAtomic } from './state.mjs';

export { authorizationIdentityIssues, calculateContractHash };

export const AUTHORIZATION_KINDS = ['budget', 'round', 'reconciliation', 'revision', 'probe', 'probe_result', 'lock_release', 'revocation'];
const FILE = 'authorizations.json';
const PROBE_KIND = 'probe';
const PROBE_RESULT_KIND = 'probe_result';
const REVOCATION_KIND = 'revocation';
const REVISION_KIND = 'revision';
const PROBE_RESULTS = ['enforced', 'not_enforced', 'inconclusive'];
const SHA256_HEX = /^[0-9a-f]{64}$/;
const CONTRACT_APPROVAL = 'contract_approval';
const EXCEPTION = 'exception';
// Aprovação pela conversa (simplify-approval-and-execution): procedimento gravado em `procedure` e
// frase que o usuário precisa dizer por caminho. O caminho 1 não grava registro (o pedido explícito basta).
const CONVERSATION_PROCEDURE = 'conversa';
// Intenções de aprovação aceitas por caminho (normalizadas: sem acento, minúsculas). Negação ("não aprovo") não conta.
const CONVERSATION_PHRASES = Object.freeze({
  2: ['pode fazer', 'pode implementar', 'aprovo', 'aprovado'],
  3: ['aprovado', 'aprovo', 'pode implementar'],
});

// Finalidades de autorização "revision" (D32, lista fechada). Cada uma permite só o que está descrito.
// O escopo exigido e as recusas são conferidos em assertPurposeScope; a conferência contra o item
// aprovado é feita por contract.mjs (APPROVAL_RULES) e por validate.mjs.
//
// contract_approval: aprova o contrato na versão exata. Registra contract_hash (sha256 de proposal.md,
//   design.md e dos arquivos de specs/, em ordem) e contract_version (sobe a cada aprovação). Escopo:
//   scope.contract_approval verdadeiro, sem cenário nem casos.
//   PERMITE: validar que a aprovação corresponde ao hash e à versão atuais.
//   NÃO PERMITE: valer para outro hash ou outra versão (qualquer alteração exige nova aprovação); comprovar
//   execução de testes; aprovar cenário, check, não aplicável ou comportamento novo isoladamente.
// scenario_change: aprova alteração semântica de um cenário (D15, D29a). Escopo: scenario e revision.
//   PERMITE: exigir reexecução e reaceitação do cenário (EV-014).
//   NÃO PERMITE: aprovar teste, check, não aplicável nem comportamento novo; dispensar execução.
// test_adequacy: registra decisão humana de que os casos listados são adequados ao cenário (D29a).
//   Escopo: scenario, revision e cases.
//   PERMITE: abrir a reaceitação do cenário.
//   NÃO PERMITE: dispensar a execução dos testes (D29c: exige pass no estado atual); aprovar check,
//   não aplicável ou comportamento novo.
// sufficiency: registra a justificativa humana de que teste com hash inalterado prova o requisito alterado
//   (D13, D29b). Escopo: scenario, revision e cases.
//   PERMITE: aceitar teste inalterado como prova do requisito alterado, com justificativa.
//   NÃO PERMITE: dispensar a execução dos testes; aprovar outro item; aprovar check, não aplicável ou
//   comportamento novo.
// exception: dispensa um cenário obrigatório (D30) somente quando a chave está em allowed_exceptions de
//   .claude/harness/policy.json (campo policy_key do registro). Escopo: scenario.
//   PERMITE: tornar não obrigatório o cenário da chave prevista, com motivo.
//   NÃO PERMITE: dispensar regra genérica; tornar cenário não aplicável fora de D30; valer sem chave prevista.
//   Hoje allowed_exceptions é lista vazia: nenhuma exceção é aceita.
export const PURPOSES = Object.freeze([CONTRACT_APPROVAL, 'scenario_change', 'test_adequacy', 'sufficiency', EXCEPTION]);
const CASE_PURPOSES = ['test_adequacy', 'sufficiency'];
const SCENARIO_PURPOSES = ['scenario_change', 'test_adequacy', 'sufficiency', EXCEPTION];

const RESERVED_FIELDS = [
  'id', 'kind', 'origin', 'purpose', 'scope', 'reason', 'approver', 'author', 'recorded_at', 'project_id', 'revokes', 'supersedes',
  'amount_usd', 'total_usd', 'per_call_usd', 'quantity', 'result', 'contract_hash', 'contract_version', 'policy_key',
];
const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;
const isCaseList = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);

// Escopo exigido por finalidade (PURPOSES). Campo ausente ou com tipo errado é recusado com a finalidade citada.
function assertPurposeScope(purpose, scope) {
  if (!PURPOSES.includes(purpose)) throw new ConfigError(`purpose inválido: "${purpose}" (use ${PURPOSES.join(', ')})`);
  if (purpose === CONTRACT_APPROVAL) {
    if (scope.contract_approval !== true) throw new ConfigError('contract_approval exige scope.contract_approval verdadeiro');
    if (scope.scenario !== undefined || scope.cases !== undefined) throw new ConfigError('contract_approval não aceita cenário nem casos no escopo');
    return;
  }
  if (scope.contract_approval !== undefined) throw new ConfigError(`${purpose} não aceita scope.contract_approval`);
  if (SCENARIO_PURPOSES.includes(purpose) && !nonEmpty(scope.scenario)) throw new ConfigError(`${purpose} exige cenário no escopo (scope.scenario)`);
  if (purpose === 'scenario_change' && !isPositiveInteger(scope.revision)) throw new ConfigError('scenario_change exige revision inteira no escopo');
  if (CASE_PURPOSES.includes(purpose)) {
    if (!isCaseList(scope.cases)) throw new ConfigError(`${purpose} exige cases no escopo: lista não vazia de case_id`);
    if (!isPositiveInteger(scope.revision)) throw new ConfigError(`${purpose} exige revision inteira no escopo`);
  }
}

// Exceção só vale com chave prevista em allowed_exceptions (D32, RC-049). Sem chave, recusa.
function assertExceptionKey(policyKey, allowedExceptions) {
  if (!nonEmpty(policyKey)) throw new ConfigError(`exception exige policy_key prevista em allowed_exceptions (${allowedExceptions.length === 0 ? 'lista vazia' : allowedExceptions.join(', ')})`);
  if (!allowedExceptions.includes(policyKey)) {
    throw new ConfigError(`policy_key "${policyKey}" não está em allowed_exceptions de .claude/harness/policy.json; exceção recusada`);
  }
}

// purpose é obrigatório em revision e não existe nos demais tipos (A.3, item E). policy_key só existe em exception.
function assertPurposeForKind(kind, purpose, scope, policyKey) {
  if (kind === REVISION_KIND) {
    if (purpose === undefined) throw new ConfigError(`revision exige purpose obrigatório (finalidade: ${PURPOSES.join(', ')})`);
    assertPurposeScope(purpose, scope);
    if (purpose !== EXCEPTION && policyKey !== undefined) throw new ConfigError(`policy_key só existe em exception (recebido em ${purpose})`);
    return;
  }
  if (purpose !== undefined) throw new ConfigError(`purpose só existe em autorização revision (recebido em ${kind})`);
  if (policyKey !== undefined) throw new ConfigError('policy_key só existe em autorização revision do tipo exception');
}

const TTY_NOTE = 'O terminal interativo é condição do procedimento e não prova sozinho a autoria humana (RC-039).';
const CODE_LENGTH = 8;
const TTY_PROCEDURE = 'tty';

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Formato canônico: lista JSON com indentação de 2 espaços e quebra final.
function serialize(records) {
  return `${JSON.stringify(records, null, 2)}\n`;
}

function readRaw(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// Lê os registros existentes. Recusa conteúdo que não esteja no formato canônico,
// porque a gravação regenera o arquivo e não pode alterar linhas existentes.
function readExisting(path) {
  const raw = readRaw(path);
  if (raw === '') return { raw, records: [] };
  let records;
  try {
    records = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${FILE} ilegível (${err.message}); nada foi gravado`);
  }
  if (!Array.isArray(records)) throw new ConfigError(`${FILE} deve ser uma lista JSON; nada foi gravado`);
  if (serialize(records) !== raw) {
    throw new ConfigError(`${FILE} fora do formato canônico (lista JSON com 2 espaços); nada foi gravado`);
  }
  return { raw, records };
}

function assertReference(value, label, records, change) {
  if (value === undefined) return;
  if (!nonEmpty(value)) throw new ConfigError(`${label} deve ser um id não vazio`);
  const target = records.find((record) => record?.id === value);
  if (!target) throw new ConfigError(`${label} "${value}" não existe em ${FILE}`);
  if (target.scope?.change !== change) throw new ConfigError(`${label} "${value}" pertence a outra change`);
}

// Orçamento (D23): total e por chamada positivos, e por chamada não maior que o total.
function assertBudgetValues({ totalUsd, perCallUsd }) {
  if (!positive(totalUsd)) throw new ConfigError('budget exige total_usd positivo');
  if (!positive(perCallUsd)) throw new ConfigError('budget exige per_call_usd positivo');
  if (perCallUsd > totalUsd) throw new ConfigError('per_call_usd não pode ser maior que total_usd');
}

// Regras por tipo: orçamento só em budget; revogação é registro próprio e não concede orçamento (RC-034).
function assertKindValues({ kind, totalUsd, perCallUsd, revokes, supersedes }) {
  const hasBudgetValues = totalUsd !== undefined || perCallUsd !== undefined;
  if (kind === REVOCATION_KIND) {
    if (revokes === undefined) throw new ConfigError('revogação exige revokes com o id revogado');
    if (supersedes !== undefined) throw new ConfigError('revogação não substitui registro: use supersedes em um budget novo');
    if (hasBudgetValues) throw new ConfigError('revogação não concede orçamento: não traz total_usd nem per_call_usd');
    return;
  }
  if (revokes !== undefined) throw new ConfigError('revokes exige kind revocation');
  if (kind === 'budget') assertBudgetValues({ totalUsd, perCallUsd });
  else if (hasBudgetValues) throw new ConfigError('total_usd e per_call_usd só existem em budget');
}

function assertValues(input) {
  const { kind, reason, approver, quantity, result, revokes, supersedes, data } = input;
  if (!AUTHORIZATION_KINDS.includes(kind)) throw new ConfigError(`tipo de autorização inválido: "${kind}"`);
  if (!nonEmpty(reason)) throw new ConfigError('motivo (reason) obrigatório');
  if (!nonEmpty(approver)) throw new ConfigError('aprovador (approver) obrigatório');
  assertKindValues(input);
  if (quantity !== undefined && !(Number.isInteger(quantity) && quantity >= 0)) throw new ConfigError('quantidade deve ser inteiro não negativo');
  if (kind === PROBE_RESULT_KIND && !PROBE_RESULTS.includes(result)) throw new ConfigError(`probe_result exige resultado: ${PROBE_RESULTS.join(', ')}`);
  if (revokes !== undefined && supersedes !== undefined) throw new ConfigError('use revokes ou supersedes, não os dois');
  if (data !== undefined && (data === null || typeof data !== 'object' || Array.isArray(data))) throw new ConfigError('dados extras devem ser um objeto JSON');
  const reserved = Object.keys(data ?? {}).filter((key) => RESERVED_FIELDS.includes(key));
  if (reserved.length > 0) throw new ConfigError(`campos reservados não podem vir dos dados extras: ${reserved.join(', ')}`);
}

// probe_result exige o id de uma autorização probe desta change e evidência com caminho e
// sha256 (PO-014). A sonda não é reexecutada aqui: a referência é verificada pelo registro.
function assertProbeResult(data, records, change) {
  const probe = records.find((record) => record?.id === data?.probe_id);
  if (!probe || probe.kind !== PROBE_KIND || probe.scope?.change !== change) {
    throw new ConfigError('probe_result exige probe_id de autorização probe existente nesta change');
  }
  const evidence = data.evidence;
  if (!evidence || !nonEmpty(evidence.path) || !SHA256_HEX.test(evidence.sha256 ?? '')) {
    throw new ConfigError('probe_result exige evidência com caminho e sha256 (64 caracteres hexadecimais)');
  }
}

// Versão do contrato: a próxima após a maior versão de aprovação já registrada nesta change (D32).
function nextContractVersion(records, change) {
  const versions = records
    .filter((record) => record?.kind === REVISION_KIND && record.purpose === CONTRACT_APPROVAL && record.scope?.change === change)
    .map((record) => record.contract_version)
    .filter(Number.isInteger);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

// Campos próprios de cada finalidade calculados no momento do registro (D32).
function purposeFields(root, change, purpose, records, policyKey) {
  if (purpose === CONTRACT_APPROVAL) {
    return {
      contract_hash: calculateContractHash(changeDir(root, change)),
      contract_version: nextContractVersion(records, change),
    };
  }
  if (purpose === EXCEPTION) return { policy_key: policyKey };
  return {};
}

// Monta o registro novo. Origem é sempre humana; revogação e substituição são registros novos.
// procedure descreve como a decisão foi registrada (RC-039): 'tty' quando veio do terminal interativo.
export function buildRecord(root, change, input, records, { now = new Date(), author = userInfo().username, procedure } = {}) {
  assertValues(input);
  const { kind, reason, approver, totalUsd, perCallUsd, quantity, result, revokes, supersedes, data, purpose, policyKey } = input;
  const scopeExtra = input.scope ?? {};
  if (scopeExtra.change !== undefined && scopeExtra.change !== change) throw new ConfigError(`scope.change "${scopeExtra.change}" não é a change ${change}`);
  assertPurposeForKind(kind, purpose, scopeExtra, policyKey);
  if (purpose === EXCEPTION) assertExceptionKey(policyKey, loadPolicy(root).allowed_exceptions);
  assertReference(revokes, 'revokes', records, change);
  assertReference(supersedes, 'supersedes', records, change);
  if (kind === PROBE_RESULT_KIND) assertProbeResult(data, records, change);
  return {
    id: randomUUID(),
    kind,
    origin: 'human',
    ...(procedure !== undefined ? { procedure } : {}),
    ...(purpose !== undefined ? { purpose } : {}),
    scope: { ...scopeExtra, change },
    ...(totalUsd !== undefined ? { total_usd: totalUsd, per_call_usd: perCallUsd } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(result !== undefined ? { result } : {}),
    reason,
    approver,
    author,
    recorded_at: now.toISOString(),
    project_id: projectId(root),
    ...(revokes !== undefined ? { revokes } : {}),
    ...(supersedes !== undefined ? { supersedes } : {}),
    ...(purpose !== undefined ? purposeFields(root, change, purpose, records, policyKey) : {}),
    ...(data ?? {}),
  };
}

// Resumo mostrado antes da confirmação. O código curto (8 hex do SHA-256 do resumo)
// é o que o humano digita para confirmar.
export function summarizeRecord(record) {
  return [
    `Registro de autorização: ${record.kind} (origem humana)`,
    `  change: ${record.scope.change}`,
    ...(record.purpose !== undefined ? [`  finalidade: ${record.purpose}`] : []),
    ...(record.contract_hash !== undefined ? [`  contrato: sha256 ${record.contract_hash}, versão ${record.contract_version}`] : []),
    ...(record.policy_key !== undefined ? [`  chave de exceção: ${record.policy_key}`] : []),
    ...(record.total_usd !== undefined ? [`  total: US$ ${record.total_usd}`, `  por chamada: US$ ${record.per_call_usd}`] : []),
    ...(record.probe_id !== undefined ? [`  probe: ${record.probe_id}`] : []),
    ...(record.evidence !== undefined ? [`  evidência: ${record.evidence.path} (sha256 ${record.evidence.sha256})`] : []),
    ...(record.quantity !== undefined ? [`  quantidade: ${record.quantity}`] : []),
    ...(record.result !== undefined ? [`  resultado: ${record.result}`] : []),
    ...(record.revokes !== undefined ? [`  revoga: ${record.revokes}`] : []),
    ...(record.supersedes !== undefined ? [`  substitui: ${record.supersedes}`] : []),
    `  motivo: ${record.reason}`,
    `  aprovador: ${record.approver}`,
    `  autor: ${record.author}`,
    `  data: ${record.recorded_at}`,
  ].join('\n');
}

export function shortCodeOf(summary) {
  return createHash('sha256').update(summary).digest('hex').slice(0, CODE_LENGTH);
}

function defaultInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function askInTerminal(summary, code) {
  process.stdout.write(`${summary}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(`Para gravar, digite o código ${code}: `);
  } finally {
    rl.close();
  }
}

// Grava um registro novo em authorizations.json. Recusa sem TTY antes de qualquer
// leitura; confere o conteúdo lido antes da confirmação e de novo antes da gravação.
// confirm e isInteractive são injetáveis apenas para teste.
export async function recordAuthorization(root, change, input, {
  confirm = askInTerminal, isInteractive = defaultInteractive, now, author,
} = {}) {
  if (!isInteractive()) throw new ConfigError('authorize record exige terminal interativo (stdin e stdout); nada foi gravado');
  assertChangeName(change);
  const dir = changeDir(root, change);
  if (!existsSync(dir)) throw new ConfigError(`change ${change} não existe em openspec/changes; nada foi gravado`);
  const path = join(dir, FILE);
  const before = readExisting(path);
  const record = buildRecord(root, change, input, before.records, { now, author, procedure: TTY_PROCEDURE });
  const summary = summarizeRecord(record);
  const code = shortCodeOf(summary);
  const answer = await confirm(summary, code);
  if (String(answer ?? '').trim() !== code) throw new ConfigError('confirmação não confere; nada foi gravado');
  if (readRaw(path) !== before.raw) throw new ConfigError(`${FILE} mudou durante a confirmação; nada foi gravado`);
  commitRecord(root, change, path, before, record);
  return record;
}

// Acrescenta o registro e confere a releitura: registros anteriores e o novo devem estar íntegros (RC-040).
function commitRecord(root, change, path, before, record) {
  const expected = serialize([...before.records, record]);
  writeFileAtomic(path, expected);
  if (serialize(readExisting(path).records) !== expected) {
    throw new ConfigError(`${FILE} gravado não confere com o registro esperado; verifique o arquivo antes de continuar`);
  }
  writeFileAtomic(join(localDir(root, change), AUTHORIZATIONS_STAMP), `${createHash('sha256').update(expected).digest('hex')}\n`);
}

const normalizePhrase = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Verdadeiro quando alguma intenção aparece sem "não" logo antes. Não lê o texto como autorização por si só:
// quem chama já garante que a instrução veio do usuário.
function expressesApproval(instruction, phrases) {
  const text = normalizePhrase(instruction);
  return phrases.some((phrase) => {
    let index = text.indexOf(phrase);
    while (index !== -1) {
      if (!text.slice(0, index).endsWith('nao ')) return true;
      index = text.indexOf(phrase, index + 1);
    }
    return false;
  });
}

// Registra a aprovação de contrato recebida na conversa (caminhos 2 e 3). Não usa TTY nem código de
// confirmação. A instrução do usuário precisa conter a frase do caminho: texto de arquivo ou de
// ferramenta não chega aqui. Uma change com aprovação de contrato já registrada não recebe outra.
export function recordConversationApproval(root, change, {
  path, instruction, approver, reason, now, author,
} = {}) {
  assertChangeName(change);
  const phrases = CONVERSATION_PHRASES[path];
  if (phrases === undefined) {
    throw new ConfigError('caminho 1 não grava aprovação: o pedido explícito já autoriza o ajuste; nada foi gravado');
  }
  if (!nonEmpty(instruction) || !expressesApproval(instruction, phrases)) {
    throw new ConfigError(`instrução do usuário precisa expressar aprovação (${phrases.join(', ')}) para o caminho ${path}; nada foi gravado`);
  }
  const dir = changeDir(root, change);
  if (!existsSync(dir)) throw new ConfigError(`change ${change} não existe em openspec/changes; nada foi gravado`);
  const file = join(dir, FILE);
  const before = readExisting(file);
  // Nova versão só com contrato alterado (AP-007, AP-010): o hash atual não pode ser o da última aprovação.
  const approvals = before.records.filter((record) => record?.purpose === CONTRACT_APPROVAL && record.scope?.change === change);
  if (approvals.length > 0) {
    const latest = approvals.reduce((best, record) => (record.contract_version > best.contract_version ? record : best));
    if (latest.contract_hash === calculateContractHash(dir)) {
      throw new ConfigError(`change ${change} já tem aprovação para o contrato atual (versão ${latest.contract_version}); nada foi alterado`);
    }
  }
  const record = buildRecord(root, change, {
    kind: REVISION_KIND, purpose: CONTRACT_APPROVAL, reason, approver, scope: { contract_approval: true, path }, data: { instruction },
  }, before.records, { now, author, procedure: CONVERSATION_PROCEDURE });
  commitRecord(root, change, file, before, record);
  return record;
}

const FLAG_TO_FIELD = {
  '--kind': 'kind', '--change': 'change', '--reason': 'reason', '--approver': 'approver',
  '--total-usd': 'totalUsd', '--per-call-usd': 'perCallUsd', '--quantity': 'quantity', '--result': 'result',
  '--revokes': 'revokes', '--supersedes': 'supersedes', '--data': 'dataFile',
  '--purpose': 'purpose', '--scope-file': 'scopeFile', '--policy-key': 'policyKey',
  '--path': 'path', '--instruction': 'instruction',
};
const NUMERIC_FIELDS = ['totalUsd', 'perCallUsd', 'quantity', 'path'];
const CONVERSATION_COMMAND = 'conversa';
const USAGE = [
  'uso: authorize.mjs record --kind <tipo> --change <change> --reason <texto> --approver <nome>',
  '  revision exige --purpose <finalidade> e --scope-file arquivo.json com o escopo (scenario, revision, cases, contract_approval)',
  '  exception exige --policy-key <chave listada em allowed_exceptions de policy.json>',
  '  contract_approval registra hash e versão do contrato atual automaticamente',
  '  [--total-usd N --per-call-usd N] [--quantity N] [--result r] [--revokes id | --supersedes id] [--data arquivo.json]',
  '  para probe_result, --data traz {"probe_id": "<id de probe>", "evidence": {"path": "...", "sha256": "..."}}',
  `  ${TTY_NOTE}`,
].join('\n');

export function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'record' && command !== CONVERSATION_COMMAND) throw new ConfigError(USAGE);
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const field = FLAG_TO_FIELD[rest[index]];
    if (!field || rest[index + 1] === undefined) throw new ConfigError(`opção inválida ou sem valor: ${rest[index]}\n${USAGE}`);
    values[field] = NUMERIC_FIELDS.includes(field) ? Number(rest[index + 1]) : rest[index + 1];
  }
  return values;
}

async function main(argv) {
  const { change, dataFile, scopeFile, ...fields } = parseCliArgs(argv);
  if (argv[0] === CONVERSATION_COMMAND) {
    const record = recordConversationApproval(process.cwd(), change, fields);
    process.stdout.write(`aprovação de conversa gravada: ${record.id} (caminho ${record.scope.path})\n`);
    return;
  }
  const data = dataFile ? JSON.parse(readFileSync(dataFile, 'utf8')) : undefined;
  const scope = scopeFile ? JSON.parse(readFileSync(scopeFile, 'utf8')) : undefined;
  const record = await recordAuthorization(process.cwd(), change, { ...fields, data, scope });
  process.stdout.write(`autorização gravada: ${record.id} (${record.kind})\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}
