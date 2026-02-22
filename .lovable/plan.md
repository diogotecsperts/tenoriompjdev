

# Atualização de UX e Blindagem de Prompts (Quesitos e Conclusão)

## Ação 1: Espelhar "Tipo de Nexo" na Seção CONCLUSÃO (DOCX e PDF)

Atualmente, a seção CONCLUSÃO exibe: CID-10, Tipo(s) de Incapacidade, Destino Sugerido e Justificativa. O "Tipo de Nexo" está ausente.

### DOCX (`src/utils/generateLaudoDOCX.ts`, linhas 800-801)

Após a linha que imprime o CID (`createLabeledField("CID-10 Sugerido", ...)`), inserir:

```
if (!isFieldEmpty(laudo.nexoCausalTipo)) {
  const nexoMap: Record<string, string> = {
    "direto": "Nexo Causal Direto",
    "concausa": "Concausa",
    "agravamento": "Agravamento",
    "inexistente": "Nexo Causal Inexistente",
  };
  paragraphs.push(createLabeledField("Tipo de Nexo", nexoMap[laudo.nexoCausalTipo!] || laudo.nexoCausalTipo!));
}
```

O `nexoMap` já existe na seção 15 (NEXO CAUSAL, linha 745) — será replicado na seção 19.

A variável `laudo.nexoCausalTipo` existe e está mapeada corretamente no `LaudoContext.tsx` (linha 60) a partir do campo `nexo_causal_tipo` do banco de dados. Também precisa ser adicionada à condição `hasConclusao` (linha 796).

### PDF (`src/utils/generateLaudoPDF.ts`, linhas 941-942)

Mesma lógica: após `addLabeledField("CID-10 Sugerido", ...)`, inserir o bloco de Tipo de Nexo com o mesmo `nexoMap`. Também adicionar `!isFieldEmpty(laudo.nexoCausalTipo)` à condição `hasConclusao` (linha 931) e ao cálculo de `sectionHeight` (linha 934).

**Saída esperada no documento:**
```
CID-10 Sugerido: M54.4; M51.1
Tipo de Nexo: Concausa
Tipo(s) de Incapacidade: Incapacidade Total Temporária
Destino Sugerido: Alta Médica
```

---

## Ação 2: Blindagem Anti-Conversa e Busca Agressiva nos Prompts (Backend)

### Arquivos afetados:

1. **`supabase/functions/_shared/build-import-prompt.ts`** (linha 400-423) — Prompt de extração inicial (`prompt_import_quesitos`)
2. **`supabase/functions/seed-prompts/index.ts`** (linhas 477-550) — Prompts de regeneração (`prompt_regen_quesitosJuizo/Reclamante/Reclamada`)
3. **`supabase/functions/processar-autos/index.ts`** (linhas 827-911) — Fallback prompts da sub-rotina automática (`DEFAULT_PROMPTS.quesitos_juizo/reclamante/reclamada`)

### Regras a injetar em TODOS os prompts de quesitos (extração e regeneração):

**Regra 1 — BUSCA AGRESSIVA OBRIGATÓRIA:**
```
ATENÇÃO: É GARANTIDO que os quesitos (perguntas direcionadas ao perito) EXISTEM neste documento.
Você DEVE realizar uma busca agressiva. Não procure apenas por títulos óbvios como "Quesitos".
Procure ativamente por: pontos de interrogação (?), listas numeradas no meio ou fim das petições,
e termos como 'diga o perito', 'informe', 'esclareça', 'requer a perícia'.
Extraia todas as perguntas que encontrar.
```

**Regra 2 — SILÊNCIO ABSOLUTO (Anti-Conversa):**
```
REGRA DE INEXISTÊNCIA (RISCO LEGAL): Se, e SOMENTE SE, após uma busca exaustiva você confirmar
que houve falha no OCR e não há texto legível de perguntas, é ESTRITAMENTE PROIBIDO justificar,
explicar, pedir desculpas ou conversar. Você DEVE retornar ÚNICA E EXCLUSIVAMENTE a string exata:
'Quesitos do [Juízo/Reclamante/Reclamada] não identificados nos autos.'
Qualquer palavra adicional além desta frase exata causará quebra crítica no sistema do tribunal.
```

### Pontos de inserção concretos:

1. **`build-import-prompt.ts`** (prompt_import_quesitos, linha 403): Adicionar as duas regras antes de "NÃO invente quesitos" (linha 423)

2. **`seed-prompts/index.ts`** (3 prompts, linhas 482, 507, 532): Adicionar as duas regras dentro do bloco "SUA TAREFA", antes da linha "Se não encontrar quesitos..."

3. **`processar-autos/index.ts`** (3 DEFAULT_PROMPTS, linhas 827, 857, 885): Adicionar as duas regras dentro de "INSTRUÇÕES OBRIGATÓRIAS", substituindo a regra 4 atual ("Se não houver dados suficientes...") pela regra de SILÊNCIO ABSOLUTO para o caso de inexistência total

---

## Resumo de Operações (4 arquivos, 1 deploy)

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `src/utils/generateLaudoDOCX.ts` | Adicionar "Tipo de Nexo" na seção CONCLUSÃO (entre CID e Incapacidade) |
| 2 | `src/utils/generateLaudoPDF.ts` | Adicionar "Tipo de Nexo" na seção CONCLUSÃO (entre CID e Incapacidade) |
| 3 | `supabase/functions/_shared/build-import-prompt.ts` | Regras de busca agressiva + anti-conversa no prompt_import_quesitos |
| 4 | `supabase/functions/seed-prompts/index.ts` | Regras de busca agressiva + anti-conversa nos 3 prompts de regeneração |
| 5 | `supabase/functions/processar-autos/index.ts` | Regras de busca agressiva + anti-conversa nos 3 DEFAULT_PROMPTS da sub-rotina |

**Deploy**: `processar-autos` e `seed-prompts`

## Validação de compatibilidade

- A variável `laudo.nexoCausalTipo` existe no `LaudoContext` (linha 60) e mapeia para `nexo_causal_tipo` no banco
- O `nexoMap` com 4 valores (direto, concausa, agravamento, inexistente) já é usado na seção 15 de ambos os geradores
- O `isFieldEmpty` já está disponível em ambos os geradores
- Os prompts de extração e regeneração já seguem o padrão de formatação `QUESITO X: / RESPOSTA:` — as novas regras são aditivas e não quebram a estrutura existente
- O filtro de inexistência no frontend (`/não identificados nos autos/i`) continua compatível com a frase exata da regra de SILÊNCIO ABSOLUTO

