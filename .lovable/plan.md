

# Correção de Pipeline: Forçar Execução e Fallback Robusto na Sub-rotina de Quesitos

## Diagnóstico Confirmado

O `_rawTextTail` não está sendo persistido em todas as pipelines (especialmente Mistral OCR e passagem única/base64), fazendo `textoProcesso` chegar vazio. O fallback existente (linha 2891) tenta montar a partir de `extractedData.textos_brutos`, mas se esses também estiverem vazios (Task Overload na extração), o `shouldGenerate` avalia como falso e a sub-rotina nem roda.

## Alterações (1 arquivo, 1 deploy)

### Arquivo: `supabase/functions/processar-autos/index.ts`

### Mudanca 1: Forcar shouldGenerate dos 3 quesitos (linhas 1246-1248)

Substituir as condicionais complexas por `shouldGenerate: true` nos 3 quesitos. A regra de inexistencia no prompt ja garante saida controlada se nao houver dados.

### Mudanca 2: Fallback robusto de contexto DENTRO do gerarResumosIA (apos linha 1201)

Logo apos definir `textoProcesso` na linha 1201, adicionar fallback agressivo:

```typescript
// Fallback robusto: se _rawTextTail se perdeu na memoria, reconstruir a partir dos campos ja extraidos
if (!contexto.textoProcesso || contexto.textoProcesso.length < 500) {
  const fallbackProcesso = [
    extractedData.textos_brutos?.peticao_inicial || '',
    extractedData.textos_brutos?.contestacao || '',
    extractedData.resumo_peticao_inicial || '',
    extractedData.quesitos?.juizo || '',
    extractedData.quesitos?.reclamante || '',
    extractedData.quesitos?.reclamada || ''
  ].filter(Boolean).join('\n\n');
  
  if (fallbackProcesso.length > 100) {
    contexto.textoProcesso = fallbackProcesso;
    console.log(`[gerarResumosIA] FALLBACK textoProcesso reconstruido: ${fallbackProcesso.length} chars`);
  } else {
    console.warn('[gerarResumosIA] ALERTA: textoProcesso vazio E fallback insuficiente');
  }
}
```

### Mudanca 3: Debug nos logs da Edge Function (NAO no prompt)

Dentro do loop de geracao (linha 1297), antes da chamada `callAI`, adicionar log especifico para quesitos mostrando o tamanho das variaveis injetadas:

```typescript
if (tipo.startsWith('quesitos_')) {
  console.log(`[gerarResumosIA] DEBUG QUESITOS ${tipo}:`, {
    quesitosTexto: contexto.quesitosTexto?.length || 0,
    textoProcesso: contexto.textoProcesso?.length || 0,
    nexoCausal: contexto.nexoCausalGerado?.length || 0,
    incapacidade: contexto.incapacidadeGerada?.length || 0
  });
}
```

Isso permite rastrear visualmente nos logs se o Gemini foi acionado e com quantos caracteres, sem contaminar o documento final.

## O que NAO muda

- Prompts dos quesitos (ja estao suavizados e com direcional posicional)
- Fluxo de dados e logica de salvamento
- Formato de saida (QUESITO/RESPOSTA)
- Frase de fallback de inexistencia (compativel com filtro do frontend)

## Por que a Acao 3 original foi ajustada

A sintaxe `${textoProcesso.length}` nao funciona nos DEFAULT_PROMPTS porque eles usam interpolacao tardia (`\${textoProcesso}` e substituido pela `fillPromptVariables`). O `.length` nao seria avaliado pelo JavaScript. Alem disso, injetar texto de debug na saida do LLM e arriscado -- poderia vazar para laudos exportados em DOCX/PDF.

## Deploy

`processar-autos`

## Resultado Esperado

1. Os 3 quesitos SEMPRE rodam (sem condicional de tamanho)
2. Se `_rawTextTail` se perdeu, o fallback reconstroi contexto a partir de `extractedData`
3. Logs da Edge Function mostram exatamente quantos caracteres cada variavel tem ao chamar o Gemini
4. Zero risco de contaminacao de documentos legais com texto de debug

