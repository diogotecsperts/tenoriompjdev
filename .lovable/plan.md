## Ajuste do prompt da Queixa Principal (PREV)

**Arquivo:** `supabase/functions/prev-pre-processar/index.ts` — constante `DEFAULT_QUEIXA_PROMPT` (e re-seed via Prompt Manager para o `prompt_prev_queixa_unificada`).

### O que entendi do pedido

1. O **tempo de evolução** nunca deve ser inventado pela IA nem extraído do PDF para esse campo específico.
2. Quando o tempo **não** estiver explícito no processo, a IA deve inserir um **underline `_`** no lugar do número, para o perito preencher na consulta.
3. Quando o tempo **estiver** explícito, a IA usa o valor informado normalmente.
4. A frase segue uma **ordem fixa obrigatória**:
   1. Queixa principal
   2. Irradiação / parestesia (quando houver)
   3. Tempo de evolução (`há aproximadamente X anos` ou `há aproximadamente _ anos`)
   4. Encerramento padrão (episódios recorrentes de exacerbação álgica + repercussão funcional)
5. O tempo **sempre** vem **depois** da irradiação e **antes** do encerramento. Nunca no início, nunca depois do encerramento.

### Mudanças no prompt

- **Reescrever a Regra 10** (que hoje fala de "evolução crônica e recorrente") para fixar o template oficial:

  > "A parte pericianda refere quadro de [queixa], com irradiação e parestesia para [membros], com início há aproximadamente [tempo ou _] anos, relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais."

- **Reescrever a Regra 14** (hoje "tempo vinculado à queixa principal, nunca após queixa de outro sistema") para a nova regra de **posição fixa**: o tempo entra **sempre após a irradiação e antes do encerramento**, nunca no início, nunca depois do encerramento.

- **Substituir a Regra 20** ("Se faltar tempo de evolução, não inventar. Omitir.") por:
  - Se o tempo **não** estiver no processo, **não inventar** e **não omitir**: usar o placeholder `_` exatamente nessa posição → `"com início há aproximadamente _ anos"`.
  - Se o tempo estiver no processo, usar o valor informado (ex.: `"há aproximadamente 5 anos"`).
  - Proibido extrapolar/estimar tempo a partir de datas de exames, afastamentos ou laudos.

- **Ajustar a Regra 11** para deixar claro que a irradiação/parestesia, quando houver, vem **antes** do tempo (apenas reforço de ordem; conteúdo mantido).

- **Manter intactas** todas as demais regras (sujeito "A parte pericianda", verbo "refere", proibição de markdown/IA, parágrafo único, etc.).

- **Sem mudança** no pós-processamento (`sanitizeQueixa`): o `_` é caractere normal e passa pelos filtros atuais sem rejeição.

### Exemplos que o prompt vai produzir

- **Com tempo informado, com irradiação:**
  > "A parte pericianda refere quadro de lombalgia, com irradiação e parestesia para membros inferiores, com início há aproximadamente 5 anos, relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais."

- **Sem tempo informado, com irradiação:**
  > "A parte pericianda refere quadro de cervicalgia, com irradiação e parestesia para membros superiores, com início há aproximadamente _ anos, relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais."

- **Sem irradiação, sem tempo:** o trecho de irradiação é omitido, o de tempo permanece com `_`:
  > "A parte pericianda refere quadro de gonalgia bilateral, com início há aproximadamente _ anos, relatando episódios recorrentes de exacerbação álgica e repercussão funcional nas atividades habituais."

### Out of scope

- Não alterar o prompt de extração estruturada (`DEFAULT_EXTRACTION_PROMPT`) — `queixa_principal` segue sendo extraída do PDF normalmente para os outros campos.
- Não alterar UI, exports (PDF/DOCX) nem estrutura do laudo.
- Não alterar o fluxo de fallback/sanitização da função.
- Como o prompt vive no Prompt Manager (banco), o usuário precisará usar **"Restaurar de fábrica"** desse prompt no DevPanel para puxar a nova versão (ou eu posso versionar via metadata — confirmar se quer que eu force resync no deploy).
