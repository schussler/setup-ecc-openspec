// Suporte das suítes F8 (RED, comportamento pré-existente, vínculo de aceitação). Roda testes
// reais do Node em pastas temporárias, para que a saída de falha seja a de verdade. Nenhum helper
// chama o modelo.
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree } from '../helpers.mjs';

// NODE_TEST_CONTEXT faz o filho reportar TAP ao pai e sair com 0: é removido do ambiente do filho.
function childEnv() {
  const { NODE_TEST_CONTEXT: _inherited, ...env } = process.env;
  return env;
}

// Executa `node --test` sobre os arquivos *.test.mjs dados, em uma pasta temporária, e devolve o código
// de saída e a saída (stdout e stderr). Os demais arquivos (módulos) são só gravados, não executados.
// Arquivo que falha ao importar aparece como falha do próprio arquivo de teste.
export function runNodeTests(files, reporter = 'tap') {
  const dir = makeTempDir('f8-');
  writeTree(dir, files);
  const tests = Object.keys(files).filter((file) => file.endsWith('.test.mjs'));
  try {
    const stdout = execFileSync(process.execPath, ['--test', `--test-reporter=${reporter}`, ...tests], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(),
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}
