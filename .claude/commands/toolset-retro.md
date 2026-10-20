---
name: "Toolset: Retro"
description: "Retrospectiva do toolset .claude/ (agents, skills, commands, rules) ao fim de uma sessão. Responde três perguntas com base no que aconteceu, aplica os ajustes duráveis e registra o raciocínio no commit."
argument-hint: "[opcional: foco, ex.: 'rules' ou 'o agent de review']"
---

# Retrospectiva do toolset

**Entrada (foco opcional):** $ARGUMENTS

Uma revisão curta e honesta de como o toolset `.claude/` serviu *esta* sessão, para que ele melhore com o
tempo em vez de desandar. Rode ao fim de uma sessão substantiva. Ancore tudo no que aconteceu: cite
ferramentas e arquivos específicos. Não invente elogio.

## Responda três perguntas

1. **Você usou o toolset?** Quais agents, skills, commands e rules foram realmente usados (invocados de
   propósito vs. seguidos passivamente)? Seja honesto sobre o que foi **escrito mas não executável** neste
   ambiente (por exemplo, um agent citado que não pôde ser invocado e teve de ser aproximado).
2. **Ajudou ou atrapalhou?** Geralmente os dois. Dê ganhos **concretos** (ex.: "o critério do reviewer
   pegou 3 bugs reais") e atritos **concretos** (ruído, conteúdo desatualizado ou genérico, custo de
   tokens, mandato que não se executa).
3. **O que mudaria?** Em ordem de prioridade. Prefira mudanças que **impeçam a recorrência** de algo que
   mordeu nesta sessão.

## Depois: aja, não só registre

Não existe documento de log permanente. A saída se divide em dois destinos, e o raciocínio fica no commit:

1. **Aplicado agora → o próprio toolset.** Um ajuste pequeno e durável é feito na hora:
   - Uma lição de bug difícil vira **regra local do projeto** em `.claude/rules/` (ou uma nota no `CLAUDE.md`),
     para a próxima sessão ser avisada. Não edite regras de origem ECC: elas são sobrescritas quando o template
     é atualizado. Se a regra ECC está errada para este projeto, crie a regra local que a corrige.
2. **Adiado → nova mudança OpenSpec.** Algo maior (enxugar uma rule sempre carregada, corrigir conteúdo
   desatualizado, tornar um agent invocável) vira uma proposta com `/opsx:propose`, em
   `openspec/changes/<nome>/`. Segue a regra do projeto: nada de código sem spec.
3. **O raciocínio → a mensagem do commit.** Coloque as três respostas (usado / ajudou-atrapalhou / o que
   mudou) no corpo de um commit `chore(toolset): …` ou `docs(toolset): …`. O histórico do git é o log.
   Não crie um arquivo de log novo.
4. **Confirme antes de mudanças grandes.** Ajustes pequenos e propostas: faça direto. Remover regras,
   reclassificar ferramentas ou mexer em regras de origem ECC: proponha antes e aplique depois da aprovação.

## Guardrails

- É um exercício de **julgamento**, não uma checklist para cumprir. "Quase não atrapalhou; uma regra estava
  desatualizada" é um resultado perfeitamente bom: um commit e talvez uma linha de proposta.
- Se nada mudou desde a última retrospectiva, diga isso e pare.
- **Sessão sem trabalho?** Diga na primeira linha da resposta. As três perguntas são sobre experiência
  vivida, e você não tem nenhuma. Nesse caso, revise o **intervalo** desde a última retrospectiva:
  `git log --grep='chore(toolset)' -1` acha a última, e `<última>..HEAD` é o que falta revisar. Leia os
  corpos dos commits desse intervalo e `git log --format='%ce'`. Isso é **arqueologia**: enxerga uma classe
  de defeito no histórico, mas não enxerga o atrito que nunca virou commit.
