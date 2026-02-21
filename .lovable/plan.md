

# Plano — Corrigir Nexo Causal Desaparecido + Acentos na Descricao de Doencas

## Diagnostico Preciso

### ERRO 1: Texto do Nexo Causal Desaparecido

**Causa raiz confirmada no banco de dados**: O campo `nexo_causal_justificativa` do laudo `7147730b` tem **0 caracteres** (vazio). O codigo do DOCX esta correto (linhas 572-574 verificam e imprimem a justificativa) — o problema e que o dado nunca chega ao banco.

**Linha culpada**: `ImportarAutosDialog.tsx`, linha 1074:
```typescript
// IMPORTANT: Justificativas should NOT be auto-filled - left empty for manual input
nexo_causal_justificativa: '',
```

A IA gera o texto de nexo causal com sucesso (tipo `nexo_causal` no pipeline de resumos, linha 1100 do processar-autos), mas na hora de mapear para o banco, o resultado e descartado e o campo fica vazio.

Enquanto isso, o campo `analise_incapacidade_laboral` (linha 1075) tambem e deixado vazio, mas a `conclusao_analise` (linha 1077) recebe o resumo de incapacidade corretamente. Essa inconsistencia de mapeamento e a causa direta.

**Fix**: Mapear `resumos_ia.nexo_causal` para `nexo_causal_justificativa` e `resumos_ia.incapacidade` para `analise_incapacidade_laboral`.

---

### ERRO 2: Acentos Ausentes na Descricao de Doencas

**Causa raiz confirmada**: A correcao de acentuacao foi aplicada apenas no system prompt do `processar-autos/index.ts`. Porem, a secao "Descricao Tecnica das Doencas" tambem pode ser gerada pelo botao "Gerar Descricao" na UI, que chama a edge function `gerar-resumos` (tipo `descricao_cid`).

A funcao `gerar-resumos` tem seu proprio system prompt (linha 386) e a regra de plain text (linha 392), mas **nenhuma regra de acentuacao**. Como o GLM-5 frequentemente omite diacriticos, o texto sai sem acentos.

**Fix**: Injetar a regra de idioma no system prompt do `gerar-resumos`, identica a que foi adicionada no `processar-autos`.

---

## Operacoes Tecnicas (2 arquivos)

### Operacao 1 — Mapear nexo_causal e incapacidade para os campos corretos

Em `src/components/tools/ImportarAutosDialog.tsx`, linhas 1073-1077:

**Antes:**
```typescript
descricao_tecnica_doencas: extractedData.resumos_ia?.descricao_doencas || '',
// IMPORTANT: Justificativas should NOT be auto-filled - left empty for manual input
nexo_causal_justificativa: '',
analise_incapacidade_laboral: '',
// Análise Conclusiva - mapear do resumo de incapacidade gerado pela IA
conclusao_analise: extractedData.resumos_ia?.incapacidade || '',
```

**Depois:**
```typescript
descricao_tecnica_doencas: extractedData.resumos_ia?.descricao_doencas || '',
// Mapear análises geradas pela IA para os campos corretos do laudo
nexo_causal_justificativa: extractedData.resumos_ia?.nexo_causal || '',
analise_incapacidade_laboral: extractedData.resumos_ia?.incapacidade || '',
// Análise Conclusiva - copia do resumo de incapacidade para o campo de conclusão
conclusao_analise: extractedData.resumos_ia?.incapacidade || '',
```

Isso garante que:
- O texto de nexo causal gerado pela IA aparece na Secao 15 do DOCX
- O texto de incapacidade aparece na Secao de Analise (alem de ja aparecer na Conclusao)

### Operacao 2 — Injetar regra de acentuacao no gerar-resumos

Em `supabase/functions/gerar-resumos/index.ts`, adicionar regra de idioma no system prompt. A regra sera injetada junto com a `REGRA_FORMATACAO_PLAIN_TEXT` (linha 392), criando uma nova constante:

```typescript
const REGRA_IDIOMA = ' REGRA DE IDIOMA: Todo o texto DEVE ser redigido em Português Brasileiro correto e formal, com TODOS os acentos, cedilhas e diacríticos adequados (á, é, í, ó, ú, â, ê, ô, ã, õ, ç). Texto sem acentuação será REJEITADO.';
```

E injetar no system prompt final (linha 478-480):
```typescript
const systemPrompt = TIPOS_COM_MARKDOWN_INTENCIONAL.has(tipo)
  ? baseSystemPrompt + REGRA_IDIOMA
  : baseSystemPrompt + REGRA_FORMATACAO_PLAIN_TEXT + REGRA_IDIOMA;
```

---

## Escopo

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `src/components/tools/ImportarAutosDialog.tsx` | Mapear `nexo_causal` e `incapacidade` para os campos corretos do banco |
| 2 | `supabase/functions/gerar-resumos/index.ts` | Injetar regra de idioma (acentuacao) no system prompt |

### Resultado esperado

- A Secao 15 (Nexo Causal) do DOCX/PDF exibira a justificativa completa com Schilling, Simonin e Bradford-Hill
- A Secao de Analise de Incapacidade tera o texto completo (redundancia proposital com Conclusao)
- Toda geracao de texto via `gerar-resumos` (incluindo descricao de doencas via botao CID) exigira acentuacao correta
- Zero impacto em laudos existentes (campos ja preenchidos nao sao sobrescritos)

