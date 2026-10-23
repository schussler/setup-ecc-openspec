// Headless invocation of Claude Code for the benchmark.
//
// Permissions come from the project's .claude/settings.json (permissions.allow)
// and are passed explicitly with --allowedTools: Claude Code ignores a project's
// allow rules until the workspace is trusted, and the runner must not edit the
// user's global config to trust every scratch directory. --permission-mode
// dontAsk denies anything else instead of waiting for an answer. The runner
// never passes --dangerously-skip-permissions, and never --bare, so the ECC
// hooks stay active.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_TIMEOUT_MS = 25 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 10 * 1000;

export function buildStepPrompt(skill, taskArgument = '') {
  return `/${skill} ${taskArgument}`.trim();
}

export function readAllowedTools(projectDir) {
  const path = join(projectDir, '.claude', 'settings.json');
  if (!existsSync(path)) throw new Error(`${path} não existe: o modo headless precisa de permissions.allow em .claude/settings.json`);
  const allow = JSON.parse(readFileSync(path, 'utf8')).permissions?.allow;
  if (!Array.isArray(allow) || allow.length === 0) throw new Error(`${path} não tem permissions.allow`);
  return allow;
}

export function buildClaudeArgs({ prompt, allowedTools, model, addDirs = [] }) {
  if (!allowedTools?.length) throw new Error('allowedTools vazio: o modo headless só roda com permissões explícitas');
  return [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    ...addDirs.flatMap((dir) => ['--add-dir', dir]),
    ...(model ? ['--model', model] : []),
    '--allowedTools', ...allowedTools,
  ];
}

function parseResult(stdout) {
  try {
    return JSON.parse(stdout.trim().split('\n').at(-1));
  } catch {
    return null;
  }
}

export function invokeClaude({
  bin = ['claude'], cwd, prompt, allowedTools, model, addDirs, env = {},
  timeoutMs = DEFAULT_TIMEOUT_MS, killGraceMs = DEFAULT_KILL_GRACE_MS,
}) {
  const args = buildClaudeArgs({ prompt, allowedTools, model, addDirs });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(bin[0], [...bin.slice(1), ...args], {
      cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), killGraceMs).unref();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    // A missing binary (seen when `claude` was replaced mid-round) must fail
    // this step, not crash the whole round and lose the report.
    // 'close' is not emitted after a failed spawn, so resolve here.
    let spawnFailed = false;
    child.on('error', (error) => {
      spawnFailed = true;
      clearTimeout(timer);
      resolve({ status: 'error', reason: `spawn: ${error.code ?? error.message}`, duration_ms: Date.now() - started, cost_usd: null, stderr: '' });
    });
    child.on('close', (code) => {
      if (spawnFailed) return;
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const stderr = Buffer.concat(err).toString('utf8').slice(-2000);
      if (timedOut) {
        resolve({ status: 'timeout', reason: 'timeout', duration_ms: durationMs, cost_usd: null, stderr });
        return;
      }
      const json = parseResult(Buffer.concat(out).toString('utf8'));
      if (!json) {
        resolve({ status: 'error', reason: `saída sem JSON (exit ${code})`, duration_ms: durationMs, cost_usd: null, stderr });
        return;
      }
      resolve({
        status: json.is_error || code !== 0 ? 'error' : 'ok',
        reason: json.is_error ? json.subtype : null,
        duration_ms: durationMs,
        cost_usd: json.total_cost_usd ?? null,
        num_turns: json.num_turns ?? null,
        permission_denials: json.permission_denials ?? [],
        result: typeof json.result === 'string' ? json.result.slice(-2000) : null,
        session_id: json.session_id ?? null,
        stderr,
      });
    });
  });
}
