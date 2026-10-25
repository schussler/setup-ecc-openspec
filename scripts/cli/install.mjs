// specloop install: copia só os caminhos managed do pacote para o repositório atual (design.md D3).
// Não escreve em owned; cria um template.json mínimo só quando o projeto ainda não tem um.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertGitRepo, confirm, copyFromPackage, frameworkField, languagesOf, managedEntries, packageManifest,
  pendingCopies, printList, readJson, toJson, writeFile,
} from './common.mjs';

function initialManifest(source, rules) {
  return {
    framework: frameworkField(),
    upstreams: source.upstreams,
    managed: source.managed,
    owned: source.owned,
    rules,
    checks: { test: '', lint: '', typecheck: '' },
  };
}

export async function install(project, options) {
  assertGitRepo(project);
  const source = packageManifest();
  const manifestPath = join(project, 'template.json');
  const current = readJson(manifestPath);
  const rules = ['common', ...languagesOf(options.languages ?? (current?.rules ?? []).join(' '))];
  const { added, updated } = pendingCopies(project, managedEntries(source.managed, rules));
  const writesManifest = !existsSync(manifestPath);
  if (added.length + updated.length === 0 && !writesManifest) {
    console.log('Nada a instalar: o toolset já está igual ao do pacote.');
    return;
  }
  printList('Arquivos novos', added);
  printList('Arquivos que mudam', updated);
  if (writesManifest) console.log('template.json será criado com framework, managed, owned e checks vazios.');
  if (!(await confirm('Instalar o toolset do SpecLoop?', options))) {
    console.log('Nada foi escrito.');
    return;
  }
  copyFromPackage(project, [...added, ...updated]);
  if (writesManifest) writeFile(manifestPath, toJson(initialManifest(source, rules)));
  console.log(`Toolset instalado (${added.length + updated.length} arquivos). Para o pipeline completo, rode npx @k0d3r/specloop adopt.`);
}
