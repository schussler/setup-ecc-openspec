// Apoio aos testes do CLI `specloop`: roda o bin do repositório (a raiz do pacote) num
// diretório temporário e fotografa os arquivos para comparar antes e depois.
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { REPO_ROOT, makeTempDir, readManifest, writeTree } from '../helpers.mjs';

export const BIN = join(REPO_ROOT, 'bin', 'specloop.mjs');
const PACKAGE = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
export const PACKAGE_NAME = PACKAGE.name;
export const PACKAGE_VERSION = PACKAGE.version;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'teste', GIT_AUTHOR_EMAIL: 'teste@example.com',
  GIT_COMMITTER_NAME: 'teste', GIT_COMMITTER_EMAIL: 'teste@example.com',
};

export function runCli(args, { cwd, input = '' } = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd, input, encoding: 'utf8', env: { ...process.env, ...GIT_ENV },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function gitRepo(files = {}) {
  const root = makeTempDir('specloop-cli-');
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  return writeTree(root, files);
}

// Caminho relativo → { hash, mtime } de todos os arquivos, fora de .git.
export function snapshot(root, rel = '.') {
  const path = join(root, rel);
  if (!existsSync(path)) return {};
  if (statSync(path).isFile()) {
    return { [rel]: { hash: createHash('sha256').update(readFileSync(path)).digest('hex'), mtime: statSync(path).mtimeMs } };
  }
  return Object.assign({}, ...readdirSync(path)
    .filter((name) => !(rel === '.' && name === '.git'))
    .map((name) => snapshot(root, rel === '.' ? name : `${rel}/${name}`)));
}

export const contents = (snap) => Object.fromEntries(Object.entries(snap).map(([file, { hash }]) => [file, hash]));

// Projeto que já usa o framework, no formato antigo (`template.repo`), com os managed do pacote.
export function legacyProject(owned = {}) {
  const manifest = readManifest();
  const root = gitRepo({
    'template.json': {
      template: { repo: 'https://github.com/exemplo/antigo.git', branch: 'main' },
      upstreams: manifest.upstreams,
      managed: manifest.managed,
      owned: manifest.owned,
      checks: { test: 'npm test', lint: 'npm run lint', typecheck: 'npm run typecheck' },
    },
    ...owned,
  });
  for (const entry of manifest.managed) cpSync(join(REPO_ROOT, entry), join(root, entry), { recursive: true });
  return root;
}
