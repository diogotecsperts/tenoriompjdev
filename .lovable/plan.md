## Objetivo
Sincronizar o registro `prompt_prev_queixa_unificada` em `public.system_config` com a versão nova do `DEFAULT_QUEIXA_PROMPT` (que já está no edge function `prev-pre-processar`), para que novas perícias rodem com o prompt atualizado sem depender de "Restaurar de fábrica" manual no DevPanel.

## O que será feito
Uma única migration `UPDATE` em `public.system_config` no registro `id = 'prompt_prev_queixa_unificada'`:

1. Substituir `value->>'prompt'` pelo texto exato do `DEFAULT_QUEIXA_PROMPT` (regras 1–22 da versão nova, incluindo a Regra 10 com o template oficial, a Regra 14 da posição fixa do tempo e a Regra 20 do placeholder `_`).
2. Atualizar `value->>'updatedAt'` para `now()` em ISO.
3. Manter inalterados todos os outros campos do JSON: `id`, `cardId` (`previdenciario`), `sectionId` (`queixa`), `description`, `isClassified`, `createdAt`, `variables` (`[textoSelecionado]`).
4. Atualizar a coluna `updated_at` da linha.

Tabela tocada: apenas `public.system_config` (1 linha). Nenhuma outra tabela, função, RLS, grant ou edge function será alterada.

## Verificação pós-migration
- `SELECT value->>'updatedAt', length(value->>'prompt') FROM system_config WHERE id='prompt_prev_queixa_unificada';` para confirmar `updatedAt` novo e tamanho do prompt (~3,9k chars vs 3,3k antigo).
- Conferir que o `value->'prompt'` contém as strings-chave da versão nova:
  - `"POSIÇÃO FIXA DO TEMPO"`
  - `"com início há aproximadamente _ anos"`
  - `"TEMPLATE OFICIAL da frase principal"`

## Fora de escopo
- Edge function `prev-pre-processar` (já deployada).
- `DEFAULT_EXTRACTION_PROMPT`, UI, exports, estrutura do laudo.
- Qualquer dado já salvo em perícias existentes (não há retroatividade — política Stale Data).