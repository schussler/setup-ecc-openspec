import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestCases } from '../../gates/checks.mjs';

test('[AC-017] TAP do node reconhece ok, not ok, SKIP e TODO por caso', () => {
  const output = [
    'TAP version 13',
    '# Subtest: test/a.test.mjs',
    '    ok 1 - [SOMA-1] soma dois numeros',
    '    not ok 2 - falha',
    '    ok 3 - pula # SKIP motivo',
    '    not ok 4 - pendente # TODO',
    'ok 1 - test/a.test.mjs',
    '1..1',
    '# tests 4',
    '# pass 1',
    '# fail 1',
    '',
  ].join('\n');
  assert.deepEqual(parseTestCases(output), [
    { name: '[SOMA-1] soma dois numeros', status: 'pass', source: 'tap' },
    { name: 'falha', status: 'fail', source: 'tap' },
    { name: 'pula', status: 'skip', source: 'tap' },
    { name: 'pendente', status: 'skip', source: 'tap' },
    { name: 'test/a.test.mjs', status: 'pass', source: 'tap' },
  ]);
});

test('[AC-005] caso do reporter spec com skip e todo nao conta como pass', () => {
  const output = [
    '✔ soma dois numeros (0.4ms)',
    '﹣ pula (0.05ms) # SKIP',
    '⚠ pendente (0.1ms) # TODO',
    '✖ quebra (0.5ms)',
    'ℹ tests 4',
    'ℹ pass 1',
  ].join('\n');
  assert.deepEqual(parseTestCases(output).map((c) => [c.name, c.status]), [
    ['soma dois numeros', 'pass'],
    ['pula', 'skip'],
    ['pendente', 'skip'],
    ['quebra', 'fail'],
  ]);
});

test('[SG-005] linhas de resumo nao viram casos', () => {
  assert.deepEqual(parseTestCases('# pass 3\n# fail 0\nℹ pass 3\n'), []);
});
