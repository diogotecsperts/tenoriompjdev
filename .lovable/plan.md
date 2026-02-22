

# Correção Arquitetural: Head + Tail do Texto Bruto para Sub-rotina de Quesitos

## Diagnóstico Confirmado

O bug está confirmado: nas 2 pipelines (chunked e regular), o texto bruto do PDF é liberado da memória ANTES de `gerarResumosIA` ser chamada. A sub-rotina de quesitos recebe `extractedData.quesitos` (frequentemente vazio por Task Overload) e não tem o texto do PDF para fazer a busca agressiva.

A correção do cliente (Head + Tail) está 100% aplicável e é superior ao `slice(-80000)` original.

## Alterações (1 arquivo, 1 deploy)

**Arquivo:** `supabase/functions/processar-autos/index.ts`

### Mudança 1: Pipeline Chunked — Capturar Head+Tail antes de liberar memória (antes da linha 1645)

Antes de `textForFilling = null` (linha 1645), inserir:

```typescript
// Preservar head+tail do texto bruto para busca agressiva de quesitos
const _head = textForFilling.slice(0, 60000);
const _tail = textForFilling.slice(-60000);
extractedData._rawTextTail = _head + "\n\n...[CONTEÚDO INTERMEDIÁRIO OMITIDO PELO SISTEMA]...\n\n" + _tail;
```

### Mudança 2: Pipeline Regular — Capturar Head+Tail antes de liberar memória (antes da linha 2861)

Antes de `visionResult = null` (linha 2861), inserir a mesma lógica. Aqui o texto bruto não está mais em variável separada (foi consumido em vários sub-caminhos: Duas Fases, Mistral, Streaming, base64). A solução é capturar o texto DENTRO de cada sub-caminho, logo após `extractedData` ser definido.

Pontos concretos:

- **Duas Fases** (após linha 2194, `extractedData = ensureValidStructure(parsedResult)`): Capturar de `textForFilling` (que ainda existe nesse escopo)
- **Passagem Única - Mistral** (após `extractedData` ser definido ~linha 2460): Capturar de `mistralRawText`
- **Passagem Única - Streaming** (após `extractedData` ser definido ~linha 2560): Capturar de `extracted.rawText`
- **Passagem Única - base64/Small** (após linha 2843): Não tem rawText separado disponível — pular (neste caso `extractedData.quesitos` tende a funcionar pois PDFs pequenos não sofrem Task Overload)
- **Fallback do Two-Phase** (após linha 2250): Idem ao base64

**Abordagem simplificada**: Para evitar tocar 5+ sub-caminhos, a alternativa mais robusta é inserir um único ponto de captura ANTES de `visionResult = null` (linha 2858). Se `extractedData._rawTextTail` ainda não foi definido por nenhum sub-caminho, usar os dados já disponíveis no `extractedData` como fallback (concatenar `textos_brutos.peticao_inicial` + `textos_brutos.contestacao` + quesitos).

**Solução escolhida**: Dois pontos de captura diretos (um no chunked, um no regular) + fallback.

### Mudança 3: Expandir `contexto` em `gerarResumosIA` (linha 1162)

Adicionar no objeto `contexto`:

```typescript
textoProcesso: extractedData._rawTextTail || ''
```

### Mudança 4: Alterar os 3 DEFAULT_PROMPTS de quesitos (linhas 827, 857, 889)

Em cada um, após o bloco `QUESITOS BRUTOS DO [JUÍZO/RECLAMANTE/RECLAMADA]`, adicionar:

```
TEXTO BRUTO DO PROCESSO (para busca agressiva — use se os quesitos acima estiverem vazios ou incompletos):
${textoProcesso}
```

### Mudança 5: Relaxar `shouldGenerate` para quesitos (linhas 1230-1232)

De:
```typescript
shouldGenerate: !!contexto.quesitosJuizo && contexto.quesitosJuizo.length > 30
```

Para:
```typescript
shouldGenerate: (!!contexto.quesitosJuizo && contexto.quesitosJuizo.length > 30) || contexto.textoProcesso.length > 500
```

Mesma lógica para reclamante e reclamada.

### Mudança 6: Log de debug para `textoProcesso` (linha 1198)

Adicionar ao log de contexto:
```typescript
textoProcesso: contexto.textoProcesso ? `${contexto.textoProcesso.length} chars` : 'VAZIO'
```

## Resumo de Operações

| # | Local no arquivo | Mudança |
|---|------------------|---------|
| 1 | Linha 1643 (antes de `textForFilling = null`) | Capturar head(60k) + tail(60k) em `extractedData._rawTextTail` |
| 2 | Linha 2194 (após `extractedData` no Duas Fases) | Capturar head+tail de `textForFilling` |
| 3 | Linha 2858 (antes de `visionResult = null`) | Fallback: se `_rawTextTail` não existe, montar a partir de `extractedData.textos_brutos` |
| 4 | Linha 1162 (contexto) | Adicionar `textoProcesso` |
| 5 | Linhas 827, 857, 889 (DEFAULT_PROMPTS) | Adicionar `${textoProcesso}` aos prompts de quesitos |
| 6 | Linhas 1230-1232 (shouldGenerate) | Relaxar condição para incluir `textoProcesso.length > 500` |
| 7 | Linha 1198 (log) | Adicionar log de `textoProcesso` |

**Deploy**: `processar-autos`

## Resultado Esperado

Mesmo quando a extração inicial JSON falha nos quesitos (Task Overload), a sub-rotina receberá ~120k chars do texto bruto (60k do início + 60k do final), cobrindo tanto a Petição Inicial (quesitos do Reclamante) quanto os despachos finais (quesitos do Juízo e Reclamada). A busca agressiva terá dados reais para funcionar.
