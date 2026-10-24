// Visões derivadas do estado (F2, D3). Funções puras: não gravam arquivos.
// Cada visão carrega derived_from_revision; visão com revisão diferente é
// regenerada antes do uso (RS-002). Quem grava é o chamador.

function identityFields(state) {
  return { project_id: state.project_id, change: state.change, execution_id: state.execution_id };
}

export function deriveGatesView(state) {
  return {
    derived_from_revision: state.revision,
    ...identityFields(state),
    gates: state.gates ?? {},
  };
}

export function deriveSummary(state) {
  const lines = [
    `# Resumo da change ${state.change}`,
    '',
    `Revisão de origem: revisão ${state.revision}`,
    `Estado: ${state.state}`,
    `Motivo de parada: ${state.stop_reason ?? 'nenhum'}`,
    `Execução: ${state.execution_id}`,
  ];
  return { derived_from_revision: state.revision, markdown: `${lines.join('\n')}\n` };
}

// Devolve a visão existente se ela é da revisão atual; senão, deriva outra.
export function ensureCurrentView(state, existing, derive) {
  if (existing && existing.derived_from_revision === state.revision) {
    return { view: existing, regenerated: false };
  }
  return { view: derive(state), regenerated: true };
}
