
# Correção: 3 Bugs — Retry 500/3700 + Preservação de Bytes + Dead Code

## Contexto do incidente

O job `32e70bd5` falhou porque o Mistral retornou `500: Service unavailable (code 3700)`. O sistema não tentou de novo, não preservou os bytes para o Gemini usar como fallback, e ainda tem um bloco `else if` morto que nunca executa.

---

## Correção A — `mistral-ocr.ts` linhas 134–142

**O problema**: o retry só verifica `status 404` + código `3001`. Um `500` cai diretamente no `throw` na linha 142, sem nenhuma tentativa de recuperação.

**O que muda** (exatamente nas linhas 134–142):

```
// ANTES:
if (ocrResponse.status === 404 && errorText.includes('3001') && attempt < maxRetries) {
  console.log(`[mistral-ocr] File not ready yet, retry ${attempt}/${maxRetries}...`);
  await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
  continue;
}
// Other errors - don't retry
throw new Error(`Mistral OCR failed (${ocrResponse.status}): ${errorText}`);

// DEPOIS:
const isFileNotReady = ocrResponse.status === 404 && errorText.includes('3001');
const isServerError  = ocrResponse.status === 500 || ocrResponse.status === 503
                       || errorText.includes('3700');

if ((isFileNotReady || isServerError) && attempt < maxRetries) {
  const waitMs = 2000 * attempt; // 2s → 4s → 6s
  const reason = isFileNotReady ? 'file-not-ready(3001)' : 'server-error(3700)';
  console.log(`[mistral-ocr] Transient error (${reason}), retry ${attempt}/${maxRetries} in ${waitMs}ms...`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
  continue;
}
throw new Error(`Mistral OCR failed (${ocrResponse.status}): ${errorText}`);
```

Nenhuma outra linha do arquivo é tocada.

---

## Correção B — `processar-autos/index.ts` linhas 2039–2065 (preservar bytes)

**O problema**: após converter `pdfStream` em `bytesForMistral`, o stream se torna `null`. Se o Mistral falhar, o bloco `catch` cai em `if (!extractedData)` mais abaixo, que tenta usar `pdfStream` ou `pdfBytes` — ambos `null`. Resultado: `'No PDF input available'` e nenhum fallback funciona.

**O que muda**: logo após montar `bytesForMistral` (linha ~2059), salvar uma referência de backup:

```typescript
// Adicionar logo após o bloco if/else if/else que constrói bytesForMistral:
const pdfBytesBackup = bytesForMistral; // preservado para fallback Gemini
```

E no `catch` do bloco Mistral (linhas ~2180–2192), restaurar antes de "fall through":

```typescript
} catch (mistralError) {
  console.error('[processar-autos] Mistral OCR failed:', mistralError);
  await logWarn('processar-autos', `Mistral OCR falhou: ${mistralError instanceof Error ? mistralError.message : 'Erro'}`, jobId);
  
  // Restaurar bytes para que o fallback Gemini tenha dados
  if (!pdfBytes && pdfBytesBackup) {
    pdfBytes = pdfBytesBackup;
    console.log('[processar-autos] PDF bytes restored for Gemini fallback');
  }
  // Fall through para if (!extractedData) abaixo
}
```

---

## Correção C — `processar-autos/index.ts` linhas 2185–2189 (dead code)

**O problema**: as condições do `if` e do `else if` são **idênticas** (`pdfFallbackProvider === 'mistral-ocr'`), então o `else if` nunca executa — é código morto.

```typescript
// ANTES (bugado):
if (pdfFallbackProvider === 'mistral-ocr') {
  console.log('[processar-autos] Fallback is also Mistral OCR, using Gemini as final fallback...');
} else if (pdfFallbackProvider === 'mistral-ocr') {   // ← nunca executa
  throw mistralError;
}

// DEPOIS (corrigido):
if (pdfFallbackProvider === 'mistral-ocr') {
  console.log('[processar-autos] Fallback is also Mistral OCR, falling through to Gemini...');
} else {
  console.log('[processar-autos] Falling through to Gemini fallback flow...');
}
```

---

## Resultado esperado no próximo incidente 500/3700

```text
[mistral-ocr] Transient error (server-error/3700), retry 1/3 in 2000ms...
[mistral-ocr] Transient error (server-error/3700), retry 2/3 in 4000ms...
[mistral-ocr] OCR complete: 47 pages extracted   ← recuperado na 3ª tentativa
```

Se as 3 tentativas falharem:
```text
[processar-autos] Mistral OCR failed: Mistral OCR failed (500): ...
[processar-autos] PDF bytes restored for Gemini fallback
[processar-autos] Falling through to Gemini fallback flow...
← Gemini processa normalmente
```

---

## Arquivos e linhas

| Arquivo | Linhas | Mudança |
|---------|--------|---------|
| `supabase/functions/_shared/mistral-ocr.ts` | 134–142 | Adicionar `isServerError` (500/503/3700) ao retry |
| `supabase/functions/processar-autos/index.ts` | ~2062 | Salvar `pdfBytesBackup` após montar `bytesForMistral` |
| `supabase/functions/processar-autos/index.ts` | 2180–2192 | Restaurar `pdfBytes` no catch |
| `supabase/functions/processar-autos/index.ts` | 2185–2189 | Substituir `else if` duplicado por `else` |
