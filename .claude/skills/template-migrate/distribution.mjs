// Distribuição dos gates: scripts/gates importa módulos de scripts/harness, e o projeto
// precisa recebê-los junto. Este módulo fica em .claude/skills para funcionar também em
// projetos que ainda não têm scripts/harness (é exatamente o caso que ele recusa).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';

export const GATES_DIR = 'scripts/gates';
export const REQUIRED_PATHS = Object.freeze(['scripts/harness', '.claude/harness']);
// Entradas que o estágio copia: o suficiente para resolver os imports dos gates.
const STAGED = Object.freeze(['scripts', '.claude', 'template.json']);
// Captura `from '...'`, `import '...'` e `import('...')` com caminho relativo.
const RELATIVE_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

export function isCovered(rel, managed = []) {
  return managed.some((entry) => rel === entry || rel.startsWith(`${entry}/`));
}

function gateRoots(root) {
  const dir = join(root, GATES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.mjs')).map((name) => `${GATES_DIR}/${name}`);
}

function relativeImportsOf(root, rel) {
  const text = readFileSync(join(root, rel), 'utf8');
  return [...text.matchAll(RELATIVE_IMPORT)].map((match) => posix.normalize(posix.join(posix.dirname(rel), match[1])));
}

// Lacunas da distribuição de `root` para a lista `managed`.
// kind: missing (caminho obrigatório ausente), missing-import (import que não existe),
// unmanaged-import (import que existe mas está fora de managed, logo não é atualizado).
export function distributionGaps(root, managed = []) {
  const gaps = [];
  const roots = gateRoots(root);
  if (roots.length > 0) {
    for (const path of REQUIRED_PATHS) {
      if (!existsSync(join(root, path))) gaps.push({ kind: 'missing', path });
    }
  }
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const target of relativeImportsOf(root, rel)) {
      if (!existsSync(join(root, target))) {
        gaps.push({ kind: 'missing-import', path: target, from: rel });
      } else if (!isCovered(target, managed)) {
        gaps.push({ kind: 'unmanaged-import', path: target, from: rel });
      } else if (target.endsWith('.mjs')) {
        queue.push(target);
      }
    }
  }
  return gaps;
}

// Mensagem de recusa: nomeia os caminhos faltantes e o comando para completar.
export function describeGaps(gaps) {
  const missing = [...new Set(gaps.filter((gap) => gap.kind === 'missing').map((gap) => gap.path))];
  const imports = gaps
    .filter((gap) => gap.kind !== 'missing')
    .map((gap) => `${gap.from} importa ${gap.path} (${gap.kind === 'missing-import' ? 'não existe' : 'fora de managed'})`);
  const parts = [];
  if (missing.length > 0) {
    parts.push(`scripts/gates está no projeto, mas faltam: ${missing.join(', ')}`);
  }
  if (imports.length > 0) parts.push(imports.join('; '));
  return `distribuição incompleta: ${parts.join('. ')}. Os gates precisam de scripts/harness e .claude/harness. `
    + 'Para completar, rode node .claude/skills/template-migrate/migrate.mjs apply --template <clone> --items managed '
    + '(ou /template-migrate). Se o template não distribui esses caminhos, corrija o template antes.';
}

export function assertDistribution(root, managed = []) {
  const gaps = distributionGaps(root, managed);
  if (gaps.length > 0) throw new Error(describeGaps(gaps));
  return gaps;
}

// Roda `change` em uma cópia temporária do projeto e devolve as lacunas do resultado.
// O projeto real não é tocado: a recusa acontece antes de qualquer escrita.
export function stagedGaps(project, change) {
  const stage = mkdtempSync(join(tmpdir(), 'distribution-stage-'));
  try {
    for (const entry of STAGED) {
      const source = join(project, entry);
      if (existsSync(source)) cpSync(source, join(stage, entry), { recursive: true });
    }
    change(stage);
    const manifestPath = join(stage, 'template.json');
    const managed = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).managed ?? [] : [];
    return distributionGaps(stage, managed);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export function copyOver(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}
