#!/usr/bin/env node
// Decisão de publicar o pacote (design.md D2): compara a versão do package.json com as versões
// publicadas no npm. Grava publish=true|false em $GITHUB_OUTPUT e sai 0; em erro do npm que não
// seja E404, sai 1 sem gravar decisão: falha de consulta nunca vira "não publicar".
// Uso: node scripts/ci/should-publish.mjs (no diretório do pacote)
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NOT_FOUND = /\bE404\b/;

export class RegistryError extends Error {}

// view: resultado de `npm view <pacote> versions --json` ({ code, stdout, stderr }).
export function decide({ version, view }) {
  if (view.code !== 0) {
    if (NOT_FOUND.test(view.stderr)) {
      return { publish: false, reason: 'pacote não existe no npm: a primeira publicação é manual (ver README → Publicação)' };
    }
    throw new RegistryError(`npm view falhou (código ${view.code}): ${view.stderr.trim()}`);
  }
  // Com uma única versão publicada, o npm responde a string em vez da lista.
  const published = [JSON.parse(view.stdout)].flat();
  if (published.includes(version)) return { publish: false, reason: `versão já publicada: ${version}` };
  return { publish: true, reason: `versão nova: ${version}` };
}

function viewVersions(name) {
  const result = spawnSync('npm', ['view', name, 'versions', '--json'], { encoding: 'utf8' });
  if (result.error) throw new RegistryError(`npm não executou: ${result.error.message}`);
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function main() {
  const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
  try {
    const { publish, reason } = decide({ version, view: viewVersions(name) });
    console.log(reason);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof RegistryError)) throw err;
    console.error(err.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
