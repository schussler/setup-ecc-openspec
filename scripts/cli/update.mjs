// specloop update: compara os managed do projeto com o pacote, aplica após confirmação e
// grava template.json → framework (design.md D3 e D4). Arquivos removidos no pacote são só listados.
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { checkUpdate } from '../../.claude/skills/template-migrate/migrate.mjs';
import {
  CliError, PACKAGE_ROOT, confirm, copyFromPackage, frameworkField, listFiles, managedEntries, packageManifest,
  pendingCopies, printList, readJson, toJson, writeFile,
} from './common.mjs';

const SKILLS = '.claude/skills';

function loadProjectManifest(project) {
  const manifest = readJson(join(project, 'template.json'));
  if (!manifest) throw new CliError(`${join(project, 'template.json')} não existe: use npx specloop adopt ou install`);
  if (manifest.template_only || realpathSync(project) === realpathSync(PACKAGE_ROOT)) {
    throw new CliError('este é o repositório do próprio framework: use /upstream-sync-check');
  }
  return manifest;
}

// Arquivos do projeto que o pacote não tem mais. Em .claude/skills, só nas skills que o pacote tem:
// uma skill que só existe no projeto é do projeto.
function removedFiles(project, entries) {
  return entries.flatMap((entry) => listFiles(project, entry))
    .filter((rel) => !existsSync(join(PACKAGE_ROOT, rel)))
    .filter((rel) => !rel.startsWith(`${SKILLS}/`) || existsSync(join(PACKAGE_ROOT, rel.split('/').slice(0, 3).join('/'))));
}

function nextManifest(manifest) {
  const { template: _legacySource, ...rest } = manifest;
  return { ...rest, framework: frameworkField(), upstreams: packageManifest().upstreams };
}

export async function update(project, options) {
  const manifest = loadProjectManifest(project);
  const entries = managedEntries(manifest.managed ?? [], manifest.rules ?? []);
  const { added, updated } = pendingCopies(project, entries);
  const removed = removedFiles(project, entries);
  try {
    checkUpdate({ template: PACKAGE_ROOT, project });
  } catch (err) {
    throw new CliError(`${err.message} Rode npx specloop adopt (item managed).`);
  }
  const next = nextManifest(manifest);
  const manifestChanges = toJson(next) !== toJson(manifest);
  if (added.length + updated.length === 0 && !manifestChanges) {
    console.log(`Já atualizado: ${next.framework.package}@${next.framework.version}.`);
    return;
  }
  console.log(`Versão: ${manifest.framework?.version ?? 'desconhecida'} → ${next.framework.version}`);
  printList('Arquivos que mudam', updated);
  printList('Arquivos novos', added);
  printList('Removidos no pacote (não serão apagados)', removed);
  if (!(await confirm('Aplicar a atualização?', options))) {
    console.log('Nada foi escrito.');
    return;
  }
  copyFromPackage(project, [...updated, ...added]);
  writeFile(join(project, 'template.json'), toJson(next));
  console.log(`Atualizado para ${next.framework.package}@${next.framework.version}.`);
}
