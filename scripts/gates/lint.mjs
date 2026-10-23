#!/usr/bin/env node
// Dependency-free lint: JSON manifests parse, and every skill has frontmatter
// whose `name` matches its directory and a non-empty `description`.
// Usage: node scripts/gates/lint.mjs [root]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const JSON_FILES = ['template.json', '.claude/settings.json'];

function lintJson(root) {
  const errors = [];
  for (const rel of JSON_FILES) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    try {
      JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push(`error: ${rel}: JSON inválido (${err.message})`);
    }
  }
  return errors;
}

function frontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end === -1 ? null : lines.slice(1, end);
}

function fieldValue(lines, key) {
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return null;
  const inline = lines[index].slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  if (inline && !/^[|>][-+]?$/.test(inline)) return inline;
  const continuation = lines.slice(index + 1).find((line) => /^\s+\S/.test(line));
  return continuation ? continuation.trim() : '';
}

function lintSkills(root) {
  const dir = join(root, '.claude/skills');
  if (!existsSync(dir)) return [];
  const errors = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `.claude/skills/${entry.name}/SKILL.md`;
    const path = join(root, rel);
    if (!existsSync(path)) {
      errors.push(`error: ${rel}: arquivo ausente`);
      continue;
    }
    const lines = frontmatter(readFileSync(path, 'utf8'));
    if (!lines) {
      errors.push(`error: ${rel}: sem frontmatter`);
      continue;
    }
    const name = fieldValue(lines, 'name');
    if (name !== entry.name) errors.push(`error: ${rel}: name "${name ?? ''}" difere do diretório "${entry.name}"`);
    if (!fieldValue(lines, 'description')) errors.push(`error: ${rel}: description vazia`);
  }
  return errors;
}

const root = process.argv[2] ?? process.cwd();
const errors = [...lintJson(root), ...lintSkills(root)];
for (const error of errors) console.log(error);
console.log(`lint: ${errors.length} erro(s)`);
process.exit(errors.length === 0 ? 0 : 1);
