// Simulador de árvore de processos (RC-043, D25). Não é o modelo: o processo raiz e um
// filho ignoram SIGTERM, para provar que o encerramento usa SIGKILL no grupo inteiro.
// Os dois se encerram sozinhos após FAKE_TREE_LIFETIME_MS, para não sobrar processo órfão.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const LIFETIME_MS = Number(process.env.FAKE_TREE_LIFETIME_MS ?? 4000);
const IGNORE_TERM = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), " + LIFETIME_MS + '); setInterval(() => {}, 1000);';

process.on('SIGTERM', () => {});
const child = spawn(process.execPath, ['-e', IGNORE_TERM], { stdio: 'ignore' });
writeFileSync(process.env.FAKE_CHILD_PID_FILE, String(child.pid));
setTimeout(() => process.exit(0), LIFETIME_MS);
setInterval(() => {}, 1000);
