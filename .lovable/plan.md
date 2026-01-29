

## Correção: Adicionar Fallback Mistral com Divisão quando Gemini Streaming Falhar

### Problema Identificado

O código atual (linha 1459-1464) chama `extractVisualContent()` para PDFs grandes sem tratamento de erro:

```typescript
// ATUAL - SEM TRY/CATCH
const extracted = await extractVisualContent(
  { stream: pdfStream, size: pdfSizeBytes },
  { model: 'gemini-2.5-flash' }
);
```

Quando Gemini retorna `INVALID_ARGUMENT` (limite de tokens excedido), o erro **mata o job inteiro**. Não há fallback.

### Solução

Envolver as chamadas de `extractVisualContent` para PDFs grandes em try/catch e, quando Gemini falhar, executar fallback:

1. Fazer download dos bytes do storage
2. Dividir o PDF em partes de ~40MB
3. Processar cada parte com Mistral OCR
4. Combinar os resultados

### Mudanças Técnicas

#### `supabase/functions/processar-autos/index.ts`

**Trecho a modificar (linhas 1458-1521):**

Antes de chamar `extractVisualContent`, envolver em try/catch:

```typescript
try {
  // Tentar Gemini Streaming
  if (pdfStream) {
    const extracted = await extractVisualContent(...);
    // ... processamento normal
  }
} catch (geminiError) {
  const errorMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
  
  // Verificar se é erro de capacidade/limite do Gemini
  if (errorMsg.includes('INVALID_ARGUMENT') || 
      errorMsg.includes('exceeds') || 
      errorMsg.includes('All attempts failed')) {
    
    console.log('[processar-autos] Gemini falhou por limite, usando fallback Mistral OCR com divisão...');
    
    // Verificar se tem chave Mistral
    const mistralKey = getMistralAPIKey();
    if (!mistralKey) {
      throw new Error('PDF muito grande para Gemini. Mistral OCR não configurado. Divida o arquivo manualmente (<45MB).');
    }
    
    // Fazer download dos bytes do storage
    await supabaseAdmin.from('import_jobs').update({ 
      current_step: 'Fallback: Baixando PDF para divisão...',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    const { data: pdfData, error: dlError } = await supabaseAdmin.storage
      .from('processos-pdf')
      .download(storagePath);
    
    if (dlError || !pdfData) {
      throw new Error('Falha ao baixar PDF para fallback Mistral');
    }
    
    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    
    // Dividir em partes de 40MB
    await supabaseAdmin.from('import_jobs').update({ 
      current_step: 'Fallback: Dividindo PDF em partes...',
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    const { parts, pageRanges } = await splitPDF(pdfBytes, { maxSizeBytes: 40_000_000 });
    console.log(`[processar-autos] Fallback: Dividido em ${parts.length} partes`);
    
    // Processar cada parte com Mistral
    const partResults: string[] = [];
    let totalPages = 0;
    
    for (let i = 0; i < parts.length; i++) {
      await supabaseAdmin.from('import_jobs').update({ 
        current_step: `Fallback: Mistral OCR parte ${i + 1}/${parts.length}...`,
        progress: 15 + Math.floor((i / parts.length) * 30),
        updated_at: new Date().toISOString()
      }).eq('id', jobId);
      
      const partResult = await extractWithMistralOCR(parts[i], mistralKey);
      partResults.push(partResult.text);
      totalPages += partResult.pageCount;
    }
    
    const combinedText = partResults.join('\n\n--- PARTE DIVIDIDA ---\n\n');
    console.log(`[processar-autos] Fallback Mistral completo: ${totalPages} páginas`);
    
    // Estruturar dados
    await supabaseAdmin.from('import_jobs').update({ 
      current_step: 'Estruturando dados extraídos...',
      progress: 50,
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    const fillResult = await callAI(
      await getAIConfig(),
      systemPrompt,
      `Analise o texto extraído via Mistral OCR:\n\n${combinedText}`,
      { promptType: 'fallback_mistral', userId, maxOutputTokens: 65536, jsonMode: true }
    );
    
    visionResult = {
      provider: 'mistral-ocr-fallback',
      model: 'mistral-ocr-latest',
      text: fillResult.text,
      finishReason: 'STOP',
      usedFallback: true
    };
    
    modelUsed = 'mistral-ocr/fallback';
    
    const parsed = tryFixTruncatedJson(visionResult.text);
    if (!parsed) throw new Error('Falha ao processar resposta do fallback Mistral');
    extractedData = ensureValidStructure(parsed);
    timings.pdfExtraction.end = Date.now();
    
  } else {
    // Erro não relacionado a limite - propagar
    throw geminiError;
  }
}
```

### Arquivos Modificados

1. `supabase/functions/processar-autos/index.ts`
   - Adicionar try/catch nas linhas ~1458-1521 (streaming path)
   - Adicionar try/catch nas linhas ~1489-1518 (bytes path)
   - Implementar lógica de fallback Mistral com divisão

### Comportamento Esperado

| PDF | Fluxo |
|-----|-------|
| <20MB | callPDFProvider (sem mudança) |
| 20-45MB | extractVisualContent normal |
| 45-68MB | Gemini Streaming → se falhar → Fallback Mistral + Split |
| >68MB | Gemini Streaming → se falhar → Fallback Mistral + Split |

### Validação

1. Testar PDF de 68MB que está falhando
   - Deve ver nos logs: "Gemini falhou por limite, usando fallback Mistral OCR"
   - Deve ver: "Dividindo em X partes"
   - Deve completar com sucesso via Mistral

2. Testar PDF pequeno (<20MB)
   - Deve continuar funcionando normalmente (fluxo não afetado)

