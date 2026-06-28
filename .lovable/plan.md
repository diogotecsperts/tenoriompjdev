## Entendimento

Confirmado. Em todos os campos com opções fixas (Estado Civil, Escolaridade, Comorbidades), o **documento exportado (DOCX/PDF)** deve mostrar **a lista completa** no estilo "prova escolar":

```
Estado Civil:
(X) Casado(a)
( ) Solteiro(a)
( ) União Estável
...
```

A IA marca com **(X)** o(s) item(ns) pertinente(s); os demais saem com **( )** para o operador alterar manualmente no Word/PDF se quiser. Regras antigas preservadas: itens marcados saem **em vermelho** (#C00000), nada muda no editor do sistema (continua usando Select/Checkbox), e o texto continua corrido — apenas estes três blocos viram lista vertical de opções.

## Plano

### 1. Helper compartilhado em `_shared.ts`
Adicionar utilitário `buildOptionsList(opcoes, marcados)` que devolve uma estrutura `{ label, marcado }[]` consumível por PDF e DOCX. Centraliza a regra para evitar divergência entre exportadores.

### 2. Exportador DOCX (`prelaudo-docx.ts`)
- Nova função `optionsParagraphs(titulo, opcoes, marcados)` que emite:
  - 1 parágrafo com o título (ex.: "Estado civil:")
  - 1 parágrafo por opção: `(X) Texto` em **vermelho/negrito** se marcado, `( ) Texto` em cor padrão se não — usando `TextRun` separados (parêntese + espaço + label).
- Substituir, no bloco de Identificação:
  - `labeled("Estado civil", ...)` → `optionsParagraphs("Estado civil", ESTADO_CIVIL_OPCOES, [valor])`
  - `labeled("Escolaridade", ...)` → idem com `ESCOLARIDADE_OPCOES`
  - Quando o valor escolhido for "Outros" + texto livre, acrescentar uma linha extra `(X) Outros: <texto>` em vermelho ao final.
- Substituir `comorbidadesParagraph()` (que hoje gera uma frase corrida) por:
  - Título "Informa demais comorbidades:"
  - Lista das 12 comorbidades fixas com `(X)`/`( )` conforme `comorbidades_fixas`
  - Extras (campos livres) renderizadas como linhas adicionais; só aparece a linha se houver texto. Marcadas saem em vermelho.

### 3. Exportador PDF (`prelaudo-pdf.ts`)
Replicar mesma estrutura usando o helper de richParagraph já existente: cada opção como linha individual, com "(X) " em vermelho/negrito quando marcada. Mesmas três seções (Estado Civil, Escolaridade, Comorbidades).

### 4. Validação de extração da IA (comorbidades sem marcar)
- Conferir via `supabase--read_query` se o prompt em `system_config` (`prompt_prev_extracao_processo`) realmente contém o bloco `comorbidades_fixas` com as 12 chaves e a instrução "marque true SOMENTE quando…". Se não estiver sincronizado, fazer `UPDATE` para alinhar com o default do código.
- Reforçar no prompt: "É ESPERADO marcar como true ao menos as comorbidades EXPLICITAMENTE citadas em laudos, receitas ou anamnese do processo. Não marcar nenhuma quando o processo de fato não cita."
- Manter a normalização defensiva já existente no edge function (não muda).

### 5. Editor (UI do sistema)
Sem mudanças visuais. Selects e checkboxes seguem como hoje — o formato "prova" é exclusivo da exportação, como você pediu.

### 6. Isolamento
Tudo dentro de `src/modules/previdenciario/` e `supabase/functions/prev-pre-processar/`. Módulo Trabalhista e helpers compartilhados globais não são tocados.

## Arquivos afetados
- `src/modules/previdenciario/lib/export/_shared.ts` (novo helper)
- `src/modules/previdenciario/lib/export/prelaudo-docx.ts`
- `src/modules/previdenciario/lib/export/prelaudo-pdf.ts`
- `supabase/functions/prev-pre-processar/index.ts` (só reforço de prompt, se necessário)
- `system_config` (UPDATE SQL do prompt, se desincronizado)
