#!/usr/bin/env node
// Gera um project_id novo em .harness-project.json (RS-019): o projeto SpecLoop não herda
// o id do template. Preserva as outras chaves do arquivo.
// Uso: node .claude/skills/new-project/renew-id.mjs <caminho do .harness-project.json>
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function renewProjectId(file) {
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const next = { ...current, project_id: randomUUID() };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next.project_id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.log(JSON.stringify({ error: 'uso: renew-id.mjs <caminho do .harness-project.json>' }));
    process.exit(1);
  }
  try {
    console.log(JSON.stringify({ project_id: renewProjectId(file) }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}
