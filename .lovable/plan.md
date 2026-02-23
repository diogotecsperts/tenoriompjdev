

# Correção: Captura Head+Tail na Pipeline Mistral OCR Single-Pass

## Causa Raiz Confirmada (Logs do Supabase)

Os logs provam exatamente o que aconteceu:

1. Mistral OCR extraiu **195.376 caracteres** (105 paginas) com sucesso
2. O Gemini estruturou o JSON, mas retornou quesitos como "nao identificados" (Task Overload na extracao)
3. O `_rawTextTail` **NUNCA foi capturado** na pipeline Mistral OCR -- "Preserved head+tail" nao aparece nos logs
4. O fallback da linha 2920 montou apenas **2.461 chars** a partir dos campos ja extraidos (que ja continham "nao identificados")
5. O Gemini foi chamado com 2.461 chars de contexto praticamente inutil -- e corretamente retornou "nao identificados" porque nao havia texto real para buscar

O problema: as capturas Head+Tail foram inseridas apenas na pipeline **chunked** (linha 1690) e **two-phase** (linha 2251), mas a pipeline **Mistral OCR single-pass** (linhas 2480-2524) ficou sem captura. E essa e exatamente a pipeline que esta sendo usada!

## Correcao (1 arquivo, 1 deploy)

### Arquivo: `supabase/functions/processar-autos/index.ts`

### Mudanca unica: Inserir captura Head+Tail apos linha 2521

Apos `extractedData = ensureValidStructure(parsed);` (linha 2521), e ANTES do log de conclusao (linha 2524), inserir:

```typescript
// Capturar head+tail do texto OCR para busca agressiva de quesitos
if (mistralRawText && mistralRawText.length > 1000) {
  const _head = mistralRawText.slice(0, 60000);
  const _tail = mistralRawText.slice(-60000);
  (extractedData as any)._rawTextTail = _head + 
    "\n\n...[CONTEUDO INTERMEDIARIO OMITIDO PELO SISTEMA]...\n\n" + _tail;
  console.log(`[processar-autos] Preserved head+tail for quesitos (mistral-ocr): ${(extractedData as any)._rawTextTail.length} chars`);
}
```

Isso captura os 195k chars ANTES de `mistralRawText` sair de escopo, criando o buffer Head+Tail de ~120k chars que a sub-rotina de quesitos precisa.

## O que NAO muda

- Nenhuma outra pipeline e alterada
- Os prompts suavizados permanecem
- O shouldGenerate: true permanece
- O fallback robusto permanece (agora como segunda linha de defesa)
- Os logs de debug permanecem

## Resultado Esperado

Na proxima importacao via Mistral OCR:
- Log "Preserved head+tail for quesitos (mistral-ocr): ~120000 chars" aparecera
- textoProcesso chegara com ~120k chars em vez de 2.461
- O Gemini tera o texto real do PDF para encontrar os quesitos
- O fallback de 2.461 chars so sera usado se mistralRawText falhar completamente

## Deploy

`processar-autos`

