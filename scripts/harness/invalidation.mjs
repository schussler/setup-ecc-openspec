// Invalidação de dependentes (A.3, EV-007, EV-008, EV-014, HI-014, D15, D21b).
// A partir de "Depende de" dos cenários e da tabela de Fatias, calcula quais cenários e fatias perdem a
// evidência quando um cenário muda de revisão, quando uma interface (IF-) ou regra (RG-) muda, ou quando uma
// fatia muda. A propagação é transitiva e segue só as referências declaradas.
// A invalidação MARCA evidências por ID no resumo durável (campo "invalidated"). Não aprova nada: a
// aprovação volta só pela reaceitação de EV-014 e pela validação final completa, que reexecuta a suíte inteira.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependencyError, declarations, listOf } from './contract.mjs';
import { ConfigError } from './policy.mjs';
import { writeFileAtomic } from './state.mjs';

export const SUMMARY_FILE = 'evidence-summary.json';
export const INVALIDATED_FIELD = 'invalidated';
const DEPENDS_ON_FIELD = 'Depende de';
const REVISION_FIELD = 'Revisão';
const SLICE_FORM = /^F\d+$/;
const SHARED_FORM = /^(IF|RG)-/;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const revisionOf = (scenario) => Number(scenario.fields[REVISION_FIELD]);

// Texto de um cenário (nome e campos, em ordem estável). Mudança sem nova revisão é alteração não autorizada (EV-008).
export function scenarioText(scenario) {
  const fields = Object.fromEntries(Object.entries(scenario.fields).sort(([a], [b]) => a.localeCompare(b)));
  return sha256(JSON.stringify({ name: scenario.name, fields }));
}

// Digest de cada interface e regra (pela descrição) e de cada fatia (pela linha da tabela).
export function declarationDigests({ shared, slices }) {
  const digests = [...shared].map(([id, text]) => [id, sha256(text)]);
  const rows = [...slices].map(([id, slice]) => [id, sha256(slice.row)]);
  return Object.fromEntries([...digests, ...rows].sort(([a], [b]) => a.localeCompare(b)));
}

// Cenários cuja revisão subiu em relação ao último resumo aprovado (EV-007, EV-008).
export function revisionChanges(previous, scenarios) {
  if (!previous) return [];
  return scenarios.flatMap((scenario) => {
    const id = scenario.fields.ID;
    const prior = id ? previous.scenarios?.[id] : undefined;
    return prior && revisionOf(scenario) > prior.revision ? [{ id, from: prior.revision, to: revisionOf(scenario) }] : [];
  });
}

// Cenários cujo texto mudou sem nova revisão em relação ao último resumo aprovado (EV-008).
export function textChangesWithoutRevision(previous, scenarios) {
  if (!previous) return [];
  return scenarios.filter((scenario) => {
    const id = scenario.fields.ID;
    const prior = id ? previous.scenarios?.[id] : undefined;
    return Boolean(prior?.text_sha256) && prior.revision === revisionOf(scenario) && prior.text_sha256 !== scenarioText(scenario);
  }).map((scenario) => scenario.fields.ID);
}

// Grafo de dependentes: origem -> conjunto de nós que dependem dela. Referência não declarada é recusada
// com a própria referência na mensagem (HI-014), tanto em "Depende de" quanto na coluna "Depende de" das fatias.
export function dependentsGraph(scenarios, design) {
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.fields.ID).filter(Boolean));
  const declared = new Set([...design.shared.keys(), ...design.slices.keys()]);
  const dependents = new Map();
  const link = (from, to) => dependents.set(from, new Set([...(dependents.get(from) ?? []), to]));
  for (const scenario of scenarios) {
    const id = scenario.fields.ID;
    if (!id) continue;
    for (const item of listOf(scenario.fields[DEPENDS_ON_FIELD])) {
      const message = dependencyError(item, scenarioIds, declared);
      if (message) throw new ConfigError(`${id}: ${message}`);
      link(item, id);
    }
  }
  for (const [id, slice] of design.slices) {
    for (const item of slice.dependsOn) {
      if (!SLICE_FORM.test(item) || !design.slices.has(item)) {
        throw new ConfigError(`${id}: referência não declarada: ${item} não está na tabela de Fatias de design.md`);
      }
      link(item, id);
    }
  }
  return dependents;
}

// Nós alcançados a partir das raízes (sem as próprias raízes), com a origem imediata de cada um.
export function closureOf(roots, dependents) {
  const reached = new Map();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of dependents.get(current) ?? []) {
      if (roots.includes(next) || reached.has(next)) continue;
      reached.set(next, current);
      queue.push(next);
    }
  }
  return reached;
}

// Interfaces e regras cuja descrição mudou, e fatias cuja linha mudou, em relação ao último resumo aprovado.
// Sem contract_items no resumo (resumo anterior), nenhuma declaração é tomada como alterada.
function changedDeclarations(previous, digests) {
  const before = previous?.contract_items;
  if (!before) return [];
  const ids = new Set([...Object.keys(before), ...Object.keys(digests)]);
  return [...ids].filter((id) => before[id] !== digests[id]).sort();
}

// Calcula as marcas de invalidação. marks: id de cenário ou fatia -> { reason, by }.
// Raízes: revisão de cenário, e declaração de fatia, interface ou regra alterada. Interfaces e regras
// não são evidência, por isso só cenários e fatias entram nas marcas.
export function computeInvalidation({ scenarios, designText = '', previous = null }) {
  const design = declarations(designText);
  const dependents = dependentsGraph(scenarios, design);
  const digests = declarationDigests(design);
  const scenarioRoots = revisionChanges(previous, scenarios);
  const declarationRoots = changedDeclarations(previous, digests);
  const roots = [...scenarioRoots.map((item) => item.id), ...declarationRoots];
  const marks = new Map();
  for (const item of scenarioRoots) marks.set(item.id, { reason: `revisão ${item.from} → ${item.to}`, by: null });
  for (const id of declarationRoots) if (SLICE_FORM.test(id)) marks.set(id, { reason: 'fatia alterada', by: null });
  for (const [id, by] of closureOf(roots, dependents)) {
    if (SHARED_FORM.test(id)) continue;
    marks.set(id, { reason: `depende de ${by}`, by });
  }
  return {
    marks: Object.fromEntries([...marks].sort(([a], [b]) => a.localeCompare(b))),
    scenarioRoots,
    declarationRoots,
    invalidated: new Set([...marks.keys()].filter((id) => !SLICE_FORM.test(id))),
    digests,
  };
}

// Grava as marcas no resumo durável existente. Sem resumo não há evidência a marcar: devolve false.
// Marcar nunca altera veredito, impressão nem revisões do resumo.
export function markInvalidated(dir, marks) {
  const path = join(dir, SUMMARY_FILE);
  if (!existsSync(path)) return false;
  const summary = JSON.parse(readFileSync(path, 'utf8'));
  const next = { ...summary };
  if (Object.keys(marks).length > 0) next[INVALIDATED_FIELD] = marks;
  else delete next[INVALIDATED_FIELD];
  writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}
