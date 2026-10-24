// Simulador local do binário `claude` para os testes do harness. Não é o modelo:
// imita só a saída JSON de `claude -p` e registra cada chamada.
// Variáveis: FAKE_CLAUDE_OUTPUT (JSON impresso), FAKE_CLAUDE_EXIT (código de saída),
// FAKE_CLAUDE_HANG=1 (não responde, para testar timeout) e FAKE_CLAUDE_LOG
// (arquivo onde cada chamada vira uma linha JSON com os argumentos).
// FAKE_CLAUDE_TOUCH com FAKE_CLAUDE_TOUCH_ON_CALL=<n>: na n-ésima chamada registrada no log,
// cria o arquivo FAKE_CLAUDE_TOUCH no diretório atual (a "correção" simulada).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_OUTPUT = { type: 'result', subtype: 'success', is_error: false, result: 'ok' };
const logPath = process.env.FAKE_CLAUDE_LOG;
if (logPath) appendFileSync(logPath, `${JSON.stringify({ args: process.argv.slice(2) })}\n`);

const touch = process.env.FAKE_CLAUDE_TOUCH;
if (touch && logPath) {
  const calls = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).length;
  if (calls === Number(process.env.FAKE_CLAUDE_TOUCH_ON_CALL)) writeFileSync(touch, '');
}

if (process.env.FAKE_CLAUDE_HANG === '1') {
  setInterval(() => {}, 1000);
  // Encerra sozinho depois de FAKE_CLAUDE_HANG_MS (padrão 60 s), para não sobrar processo
  // órfão quando o runner pai é morto antes de matá-lo (teste de interrupção).
  setTimeout(() => process.exit(0), Number(process.env.FAKE_CLAUDE_HANG_MS ?? 60000));
} else {
  const output = process.env.FAKE_CLAUDE_OUTPUT ?? JSON.stringify(DEFAULT_OUTPUT);
  process.stdout.write(`${output}\n`);
  process.exitCode = Number(process.env.FAKE_CLAUDE_EXIT ?? 0);
}
