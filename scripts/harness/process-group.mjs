// Grupo de processos por comando (F6, D25, RC-043, RC-044). Cada comando lançado pelo runner
// ou pelos gates roda como líder do próprio grupo; no encerramento, o sinal vai ao grupo
// inteiro (-pid), e não só ao processo direto. Ao fim, o encerramento é confirmado só se
// nenhum processo do grupo continuar vivo.
import { spawn } from 'node:child_process';

export const DEFAULT_KILL_GRACE_MS = 10 * 1000;
export const KILL_CONFIRM_MS = 2000;
const POLL_MS = 50;
const SIGTERM = 'SIGTERM';
const SIGKILL = 'SIGKILL';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lança o comando como líder de um grupo novo (detached). Sem isso, -pid não existe.
export function spawnInGroup(command, args, options = {}) {
  return spawn(command, args, { ...options, detached: true });
}

// Verdadeiro enquanto houver processo vivo no grupo. EPERM também indica processo vivo.
export function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function signalGroup(pid, signal, send) {
  try {
    send(-pid, signal);
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
}

async function waitGone(pid, limitMs, alive) {
  const deadline = Date.now() + limitMs;
  while (alive(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

// Encerra o grupo: SIGTERM, carência, depois SIGKILL. `send` e `alive` são injetáveis
// só para teste. confirmed false significa término não confirmado (RC-043).
export async function terminateGroup(pid, {
  graceMs = DEFAULT_KILL_GRACE_MS, confirmMs = KILL_CONFIRM_MS, send = process.kill, alive = groupAlive,
} = {}) {
  signalGroup(pid, SIGTERM, send);
  if (await waitGone(pid, graceMs, alive)) return { confirmed: true, signals: [SIGTERM] };
  signalGroup(pid, SIGKILL, send);
  const confirmed = await waitGone(pid, confirmMs, alive);
  return { confirmed, signals: [SIGTERM, SIGKILL] };
}
