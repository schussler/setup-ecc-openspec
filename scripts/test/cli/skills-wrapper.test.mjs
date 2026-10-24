// Uma forma de instalar e atualizar (framework-cli): as skills delegam ao CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../helpers.mjs';

const WRAPPERS = { 'new-project': 'init', 'template-update': 'update', 'template-migrate': 'adopt' };

test('[SL-017] skills delegam ao CLI', () => {
  for (const [skill, command] of Object.entries(WRAPPERS)) {
    const text = readRepoFile(`.claude/skills/${skill}/SKILL.md`);
    assert.match(text, new RegExp(`specloop(@\\S+)? ${command}\\b`), `${skill} chama specloop ${command}`);
    assert.doesNotMatch(text, /git (-C \S+ )?(fetch|clone)\b/, `${skill} não busca o framework por git`);
    assert.doesNotMatch(text, /[Ss]hallow clone/, `${skill} não clona o framework`);
  }
});
