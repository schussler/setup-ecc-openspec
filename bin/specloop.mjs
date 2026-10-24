#!/usr/bin/env node
// CLI do SpecLoop: npx specloop <install|init|adopt|update> [opções].
// Saída 0 em sucesso, 1 em recusa com motivo, 2 em uso inválido.
import { UsageError, closeInput, packageVersion, parseArgs } from '../scripts/cli/common.mjs';
import { adopt } from '../scripts/cli/adopt.mjs';
import { init } from '../scripts/cli/init.mjs';
import { install } from '../scripts/cli/install.mjs';
import { update } from '../scripts/cli/update.mjs';

const COMMANDS = { install, init, adopt, update };

const USAGE = `uso: npx specloop <comando> [opções]

  init <dir>   cria um projeto novo
  adopt        adota o pipeline num projeto existente
  install      instala só o toolset no repositório atual
  update       atualiza o toolset para a versão do pacote

  --yes        confirma sem perguntar`;

async function main(argv) {
  const { positional, options } = parseArgs(argv);
  if (options.version) return console.log(packageVersion());
  const [command, ...rest] = positional;
  if (options.help || !command) return console.log(USAGE);
  const run = COMMANDS[command];
  if (!run) throw new UsageError(`comando desconhecido: ${command}\n${USAGE}`);
  return run(process.cwd(), options, rest);
}

main(process.argv.slice(2))
  .catch((err) => {
    console.error(`specloop: ${err.message}`);
    process.exitCode = err instanceof UsageError ? 2 : 1;
  })
  .finally(closeInput);
