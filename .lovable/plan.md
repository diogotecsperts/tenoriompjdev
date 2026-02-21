

# Plano — Remover Duplicacao de Secoes + Esclarecimento sobre Acentos

## Bug 1: Duplicacao de Conteudo (Secao 14 e 16 identicas)

**Causa raiz**: Na ultima correcao, mapeamos `resumos_ia?.incapacidade` para DOIS campos:
- `analise_incapacidade_laboral` (Secao 14 - Analise da Incapacidade) -- CORRETO
- `conclusao_analise` (Secao 16 - Discussao e Analise) -- ERRADO, causa duplicacao

**Fix**: Em `src/components/tools/ImportarAutosDialog.tsx`, linha 1077, reverter `conclusao_analise` para string vazia. O `isFieldEmpty` no DOCX/PDF ja oculta a Secao 16 automaticamente quando vazia.

```
Antes:  conclusao_analise: extractedData.resumos_ia?.incapacidade || '',
Depois: conclusao_analise: '',
```

## Bug 2: Acentos nas Secoes 12 e 13

**Diagnostico**: A regra de acentuacao JA ESTA implementada no `processar-autos/index.ts` (linha 902 do `summarySystemPrompt`) E no `gerar-resumos/index.ts` (constante `REGRA_IDIOMA`). O problema NAO e de codigo — e de dados antigos.

Os campos `descricao_tecnica_doencas` e `nexo_causal_justificativa` do laudo atual foram gerados ANTES da regra ser aplicada. Como o sistema nao sobrescreve dados existentes, o texto sem acentos permanece no banco.

**Solucao para laudos existentes**: O usuario precisa usar o botao "Regerar" em cada campo afetado (Descricao de Doencas e Nexo Causal) na interface do editor. Novos laudos importados ja virao com acentuacao correta.

Nao ha alteracao de codigo necessaria para este item — apenas a regeneracao manual dos campos antigos.

## Operacao Tecnica (1 arquivo)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `src/components/tools/ImportarAutosDialog.tsx` | Linha 1077: `conclusao_analise: ''` em vez de `extractedData.resumos_ia?.incapacidade` |

## Resultado esperado

- Secao 16 (Discussao e Analise) desaparece do DOCX/PDF (campo vazio = secao oculta)
- Secao 14 (Analise da Incapacidade) mantem o texto completo e unico
- Novas importacoes de PDF ja terao acentuacao correta em todas as secoes
- Laudos antigos precisam de "Regerar" nos campos afetados (unica vez)
