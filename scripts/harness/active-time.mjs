// Tempo ativo por categoria (F6, RC-036, D23). Conta só a execução que o runner faz:
// invocações, gates, diagnósticos, ferramentas e a validação final. Espera humana e períodos sem execução ficam fora.
import { loadState, saveState } from './state.mjs';

export const ACTIVE_CATEGORIES = Object.freeze(['invocacao', 'gate', 'diagnostico', 'ferramenta', 'validacao']);

export function emptyActiveBook() {
  return Object.fromEntries(ACTIVE_CATEGORIES.map((category) => [category, 0]));
}

// Soma uma duração à categoria e ao total. Devolve um livro novo; categoria desconhecida falha.
export function addActive(book, category, ms) {
  if (!ACTIVE_CATEGORIES.includes(category)) throw new Error(`categoria de tempo ativo desconhecida: "${category}"`);
  return { ...emptyActiveBook(), ...book, [category]: (book?.[category] ?? 0) + ms };
}

// Grava uma duração medida fora de uma etapa do runner (gate, diagnóstico, ferramenta).
// Sem estado da change, não há o que acumular: devolve null.
export function recordActiveTime(root, change, category, ms) {
  const current = loadState(root, change);
  if (current === null) return null;
  const book = addActive(current.active_ms_by_category, category, ms);
  return saveState(root, change, { ...current, active_ms: (current.active_ms ?? 0) + ms, active_ms_by_category: book });
}
