// Utilitários compartilhados pelos comandos do CLI `specloop` (design.md D1 a D4).
// A fonte dos arquivos é sempre a raiz do pacote instalado, resolvida a partir deste módulo.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PACKAGE_NAME = 'specloop';
const BOOLEAN_FLAGS = new Set(['yes', 'non-interactive', 'help', 'version']);
const AFFIRMATIVE = new Set(['s', 'sim', 'y', 'yes']);

// Recusa com motivo (saída 1) e uso inválido (saída 2), conforme design.md "Interfaces".
export class CliError extends Error {}
export class UsageError extends Error {}

export const readJson = (path, fallback = null) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
export const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
export const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      options[key] = true;
      continue;
    }
    if (i + 1 >= argv.length) throw new UsageError(`${arg} precisa de um valor`);
    options[key] = argv[i + 1];
    i += 1;
  }
  if (options['non-interactive']) options.yes = true;
  return { positional, options };
}

export const languagesOf = (value) => (value ?? '').split(/[\s,]+/).filter((lang) => lang && lang !== 'common');

export function packageManifest() {
  return readJson(join(PACKAGE_ROOT, 'template.json'));
}

export function packageVersion() {
  return readJson(join(PACKAGE_ROOT, 'package.json')).version;
}

export const frameworkField = () => ({ package: PACKAGE_NAME, version: packageVersion() });

// Caminhos managed de um projeto: a lista do manifesto mais as rules das linguagens escolhidas.
export function managedEntries(managed, rules = []) {
  return [...managed, ...languagesOf(rules.join(' ')).map((lang) => `.claude/rules/${lang}`)];
}

export function listFiles(root, rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [rel];
  return readdirSync(path).flatMap((name) => listFiles(root, `${rel}/${name}`));
}

export const sameContent = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

// Arquivos do pacote que diferem do projeto, separados entre novos e alterados.
export function pendingCopies(project, entries) {
  const added = [];
  const updated = [];
  for (const rel of entries.flatMap((entry) => listFiles(PACKAGE_ROOT, entry))) {
    const target = join(project, rel);
    if (!existsSync(target)) added.push(rel);
    else if (!sameContent(join(PACKAGE_ROOT, rel), target)) updated.push(rel);
  }
  return { added, updated };
}

export function copyFromPackage(project, files) {
  for (const rel of files) {
    const target = join(project, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(PACKAGE_ROOT, rel), target);
  }
}

export function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function assertGitRepo(project) {
  if (!existsSync(join(project, '.git'))) throw new CliError(`${project} não é um repositório git: rode git init antes`);
}

// Leitor de linhas único para todas as perguntas: com respostas por pipe, nenhuma se perde
// entre uma confirmação e a seguinte. closeInput libera a entrada ao fim do comando.
let reader = null;
let inputClosed = false;
const buffered = [];
const waiting = [];

function nextLine(input) {
  if (!reader) {
    reader = createInterface({ input, terminal: false });
    reader.on('line', (line) => (waiting.length > 0 ? waiting.shift()(line) : buffered.push(line)));
    reader.on('close', () => {
      inputClosed = true;
      while (waiting.length > 0) waiting.shift()(null);
    });
  }
  if (buffered.length > 0) return Promise.resolve(buffered.shift());
  if (inputClosed) return Promise.resolve(null);
  return new Promise((done) => waiting.push(done));
}

export function closeInput() {
  reader?.close();
}

// Confirmação: --yes dispensa; sem resposta afirmativa (ou sem entrada), nada é escrito.
export async function confirm(question, { yes = false, input = process.stdin } = {}) {
  if (yes) return true;
  process.stdout.write(`${question} [s/N] `);
  const answer = await nextLine(input);
  process.stdout.write('\n');
  return AFFIRMATIVE.has((answer ?? '').trim().toLowerCase());
}

export function printList(title, files) {
  if (files.length === 0) return;
  console.log(`${title} (${files.length}):`);
  for (const file of files) console.log(`  ${file}`);
}
