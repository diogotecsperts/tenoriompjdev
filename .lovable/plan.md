
## Diagnóstico

- O edge function `prev-pre-processar` já extrai corretamente `comorbidades_fixas` a partir do processo (mapeamento por sinônimos e CIDs) e normaliza os 12 campos sempre presentes como booleanos.
- O frontend aplica esse resultado em `src/modules/previdenciario/lib/prelaudo-structure.ts` (linhas 491–501), mas o merge só grava quando `cur[k] === undefined`.
- Depois da primeira aplicação (ou de qualquer save que já tenha materializado os 12 booleanos como `false`), todos os campos deixam de ser `undefined`. A partir daí, um novo processamento **nunca** consegue marcar um checkbox — mesmo que a IA retorne `true`. É por isso que "nada aconteceu" ao gerar novamente.

## Correção proposta (mínima e cirúrgica)

Somente em `src/modules/previdenciario/lib/prelaudo-structure.ts`, no bloco de merge de `comorbidades_fixas`:

Nova regra por chave `k`:
- Se o usuário já marcou (`cur[k] === true`) → mantém `true` (nunca desmarca por reprocessamento).
- Senão, se a IA marcou (`com[k] === true`) → passa a `true`.
- Caso contrário → mantém o valor atual (ou `false` se ainda não existir).

## O que NÃO muda

- Não altero prompt, DB, edge functions, DevPanel, exportações DOCX/PDF nem outras seções.
- Não altero o comportamento de `comorbidades_extras` (lista livre digitada pelo usuário).
- Não mexo no módulo Trabalhista nem em nenhum outro fluxo.

## Verificação

- Reprocessar a perícia atual: comorbidades citadas no processo devem aparecer marcadas em "Informa demais comorbidades".
- Marcar manualmente uma comorbidade adicional e reprocessar: a marcação manual deve permanecer.
