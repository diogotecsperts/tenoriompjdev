
## Plano: Split Automático com pdf-lib + Mistral OCR como Fallback Elite

---

## Resumo Executivo

Implementar uma solução em **2 camadas** para processar PDFs de qualquer tamanho:

1. **Split Automático com pdf-lib:** Para PDFs > 45MB, dividir automaticamente em partes menores e processar cada parte via Gemini
2. **Mistral OCR como Fallback/Alternativa:** Adicionar Mistral OCR como provedor de extração elite para casos onde o Gemini falhar

---

## Por Que pdf-lib é Seguro para Split

A pesquisa confirmou que `pdf-lib` é **absolutamente seguro** para dividir PDFs:

- Usa o método `copyPages()` que preserva todas as referências internas (imagens, fontes, objetos compartilhados)
- Amplamente usado em produção (11M+ downloads/mês)
- Compatível com Deno/Edge Functions
- Zero custo (processamento local)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO COM SPLIT AUTOMÁTICO                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PDF 68MB ──> Split (pdf-lib) ──> Parte 1 (34MB) ──> Gemini    │
│                                   Parte 2 (34MB) ──> Gemini    │
│                                                                 │
│                          └─────────┬─────────┘                  │
│                                    ▼                            │
│                          ┌───────────────────┐                  │
│                          │ Merge dos Textos  │                  │
│                          └───────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquitetura Proposta

### Camada 1: Split Automático (pdf-lib)

```text
┌─────────────────────────────────────────────────────────────────┐
│                         DECISÃO DE TAMANHO                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        PDF Recebido                             │
│                             │                                   │
│               ┌─────────────┴─────────────┐                     │
│               │      Tamanho > 45MB?      │                     │
│               └─────────────┬─────────────┘                     │
│                    SIM │         │ NÃO                          │
│                        ▼         ▼                              │
│              ┌────────────┐  ┌────────────┐                     │
│              │ Download   │  │ Streaming  │                     │
│              │ + Split    │  │ Direto     │                     │
│              │ (pdf-lib)  │  │ (Gemini)   │                     │
│              └─────┬──────┘  └─────┬──────┘                     │
│                    │               │                            │
│              ┌─────▼──────┐        │                            │
│              │ Processar  │        │                            │
│              │ cada parte │        │                            │
│              │ via Gemini │        │                            │
│              └─────┬──────┘        │                            │
│                    │               │                            │
│              ┌─────▼──────┐        │                            │
│              │ Merge      │        │                            │
│              │ Resultados │        │                            │
│              └─────┬──────┘        │                            │
│                    └───────┬───────┘                            │
│                            ▼                                    │
│                   ┌────────────────┐                            │
│                   │ Texto Extraído │                            │
│                   └────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Camada 2: Mistral OCR como Fallback Elite

Se o Gemini falhar por qualquer motivo, usar Mistral OCR:

- Precisão: ~94.9% (superior ao Gemini em tabelas/fórmulas)
- Custo: $1.00 por 1.000 páginas (~$0.001/página)
- Limite: 50MB por arquivo (após split, todas as partes ficam < 45MB)
- Output: Markdown estruturado (ideal para extração)

---

## Arquivos a Criar/Modificar

### 1. CRIAR: `supabase/functions/_shared/pdf-splitter.ts`

Utilitário para dividir PDFs em partes menores:

```typescript
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

export interface SplitResult {
  parts: Uint8Array[];
  pageRanges: { start: number; end: number }[];
  totalPages: number;
}

/**
 * Divide um PDF em partes menores
 * @param pdfBytes - Bytes do PDF original
 * @param maxSizeBytes - Tamanho máximo por parte (default: 40MB)
 * @returns Array de partes do PDF
 */
export async function splitPDF(
  pdfBytes: Uint8Array,
  maxSizeBytes: number = 40_000_000
): Promise<SplitResult> {
  console.log(`[pdf-splitter] Loading PDF (${(pdfBytes.byteLength / 1024 / 1024).toFixed(2)}MB)...`);
  
  const originalPdf = await PDFDocument.load(pdfBytes);
  const totalPages = originalPdf.getPageCount();
  
  // Estimar páginas por parte baseado no tamanho
  const bytesPerPage = pdfBytes.byteLength / totalPages;
  const pagesPerPart = Math.floor(maxSizeBytes / bytesPerPage);
  
  console.log(`[pdf-splitter] Total pages: ${totalPages}, estimated ${pagesPerPart} pages per part`);
  
  const parts: Uint8Array[] = [];
  const pageRanges: { start: number; end: number }[] = [];
  
  for (let start = 0; start < totalPages; start += pagesPerPart) {
    const end = Math.min(start + pagesPerPart, totalPages);
    
    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await newPdf.copyPages(originalPdf, pageIndices);
    
    copiedPages.forEach(page => newPdf.addPage(page));
    
    const partBytes = await newPdf.save();
    parts.push(partBytes);
    pageRanges.push({ start: start + 1, end }); // 1-indexed for display
    
    console.log(`[pdf-splitter] Created part ${parts.length}: pages ${start + 1}-${end} (${(partBytes.byteLength / 1024 / 1024).toFixed(2)}MB)`);
  }
  
  return { parts, pageRanges, totalPages };
}
```

### 2. CRIAR: `supabase/functions/_shared/mistral-ocr.ts`

Cliente para Mistral OCR API:

```typescript
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/ocr';

export interface MistralOCRResult {
  text: string;
  pageCount: number;
  provider: 'mistral-ocr';
  model: 'mistral-ocr-latest';
}

/**
 * Extrai texto de um PDF usando Mistral OCR
 * Limite: 50MB, 1000 páginas
 * Precisão: ~94.9% (Elite para tabelas e fórmulas)
 */
export async function extractWithMistralOCR(
  pdfBytes: Uint8Array,
  apiKey: string
): Promise<MistralOCRResult> {
  console.log(`[mistral-ocr] Starting extraction (${(pdfBytes.byteLength / 1024 / 1024).toFixed(2)}MB)...`);
  
  // Step 1: Upload file to Mistral
  const formData = new FormData();
  formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'document.pdf');
  formData.append('purpose', 'ocr');
  
  const uploadResponse = await fetch('https://api.mistral.ai/v1/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });
  
  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Mistral upload failed (${uploadResponse.status}): ${error}`);
  }
  
  const uploadResult = await uploadResponse.json();
  const fileId = uploadResult.id;
  
  console.log(`[mistral-ocr] File uploaded: ${fileId}`);
  
  // Step 2: Call OCR endpoint
  const ocrResponse = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'file_id',
        file_id: fileId
      },
      include_image_base64: false
    })
  });
  
  if (!ocrResponse.ok) {
    const error = await ocrResponse.text();
    throw new Error(`Mistral OCR failed (${ocrResponse.status}): ${error}`);
  }
  
  const ocrResult = await ocrResponse.json();
  
  // Step 3: Combine page texts
  const combinedText = ocrResult.pages
    .map((page: any, i: number) => `=== PÁGINA ${i + 1} ===\n${page.markdown}`)
    .join('\n\n');
  
  console.log(`[mistral-ocr] Extracted ${ocrResult.pages.length} pages, ${combinedText.length} chars`);
  
  // Step 4: Delete uploaded file
  try {
    await fetch(`https://api.mistral.ai/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    console.log('[mistral-ocr] Temporary file deleted');
  } catch {
    console.warn('[mistral-ocr] Failed to delete temp file');
  }
  
  return {
    text: combinedText,
    pageCount: ocrResult.pages.length,
    provider: 'mistral-ocr',
    model: 'mistral-ocr-latest'
  };
}
```

### 3. MODIFICAR: `supabase/functions/processar-autos/index.ts`

Adicionar lógica de split para PDFs grandes:

```typescript
// Novos imports
import { splitPDF } from "../_shared/pdf-splitter.ts";
import { extractWithMistralOCR } from "../_shared/mistral-ocr.ts";

// Constantes
const GEMINI_PROCESSING_LIMIT = 45_000_000; // 45MB
const MAX_SPLIT_PARTS = 4; // Limite de partes para evitar processamento excessivo

// Nova função para processar PDF grande com split
async function processLargePDFWithSplit(
  pdfBytes: Uint8Array,
  model: string,
  apiKey: string,
  jobId: string,
  supabaseAdmin: any
): Promise<{ rawText: string; pageCount: number; provider: string }> {
  
  console.log(`[processar-autos] PDF exceeds limit (${(pdfBytes.byteLength / 1024 / 1024).toFixed(2)}MB), splitting...`);
  
  // Update job status
  await supabaseAdmin.from('import_jobs').update({ 
    current_step: 'Dividindo PDF grande em partes...',
    updated_at: new Date().toISOString()
  }).eq('id', jobId);
  
  // Split PDF
  const { parts, pageRanges, totalPages } = await splitPDF(pdfBytes, 40_000_000);
  
  if (parts.length > MAX_SPLIT_PARTS) {
    throw new Error(`PDF muito grande: ${parts.length} partes necessárias (máximo: ${MAX_SPLIT_PARTS}). Considere dividir manualmente.`);
  }
  
  console.log(`[processar-autos] Split into ${parts.length} parts`);
  
  const extractedTexts: string[] = [];
  let totalPageCount = 0;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const range = pageRanges[i];
    
    await supabaseAdmin.from('import_jobs').update({ 
      current_step: `Processando parte ${i + 1}/${parts.length} (págs ${range.start}-${range.end})...`,
      progress: Math.round(10 + (i / parts.length) * 30),
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    console.log(`[processar-autos] Processing part ${i + 1}/${parts.length}...`);
    
    // Use extractVisualContent for each part
    const extracted = await extractVisualContent(part, { 
      useFilesAPI: true, 
      model, 
      geminiApiKey: apiKey 
    });
    
    extractedTexts.push(`\n=== PARTE ${i + 1} (Páginas ${range.start}-${range.end}) ===\n${extracted.rawText}`);
    totalPageCount += extracted.pageCount;
    
    // Free memory
    parts[i] = null!;
    
    console.log(`[processar-autos] Part ${i + 1} complete: ${extracted.rawText.length} chars`);
  }
  
  return {
    rawText: extractedTexts.join('\n\n'),
    pageCount: totalPageCount,
    provider: `gemini-split-${parts.length}`
  };
}
```

### 4. Atualização na Lógica Principal (processar-autos/index.ts)

Modificar o bloco de single-pass para usar split quando necessário:

```typescript
// No bloco SINGLE PASS (linha ~1006)
if (pdfStream) {
  // Check if file is too large for Gemini processing limit
  if (pdfSizeBytes > GEMINI_PROCESSING_LIMIT) {
    console.log(`[processar-autos] PDF (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds Gemini limit, downloading for split...`);
    
    // Download to bytes for splitting (unavoidable for large files)
    const chunks: Uint8Array[] = [];
    const reader = pdfStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    pdfStream = null;
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    pdfBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      pdfBytes.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Process with split
    const splitResult = await processLargePDFWithSplit(
      pdfBytes,
      'gemini-2.0-flash',
      geminiApiKey,
      jobId,
      supabaseAdmin
    );
    pdfBytes = null; // Free memory
    
    // Continue with structured extraction using the combined text
    const fillResult = await callAI(
      await getAIConfig(),
      systemPrompt,
      `Analise o seguinte texto extraído de um PDF de processo trabalhista...\n\n${splitResult.rawText}`,
      { promptType: 'single_pass_large', userId, maxOutputTokens: 65536, jsonMode: true }
    );
    
    visionResult = {
      provider: splitResult.provider,
      model: 'gemini-2.0-flash',
      text: fillResult.text,
      finishReason: 'STOP',
      usedFallback: false
    };
  } else {
    // Existing streaming flow for PDFs under limit
    // ...
  }
}
```

### 5. ADICIONAR: Secret para Mistral API Key

Será necessário adicionar a chave de API do Mistral como secret no Supabase:
- Nome: `MISTRAL_API_KEY`
- Uso: Fallback quando Gemini falhar

---

## Fluxo Completo com Fallback

```text
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO COMPLETO COM FALLBACK                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        PDF Recebido                             │
│                             │                                   │
│               ┌─────────────┴─────────────┐                     │
│               │      Tamanho > 45MB?      │                     │
│               └─────────────┬─────────────┘                     │
│                    SIM │         │ NÃO                          │
│                        ▼         ▼                              │
│              ┌────────────┐  ┌────────────┐                     │
│              │  Download  │  │  Streaming │                     │
│              │  + Split   │  │  Direto    │                     │
│              └─────┬──────┘  └─────┬──────┘                     │
│                    │               │                            │
│                    └───────┬───────┘                            │
│                            ▼                                    │
│               ┌────────────────────────┐                        │
│               │   Tentar Gemini OCR    │                        │
│               └────────────┬───────────┘                        │
│                            │                                    │
│               ┌────────────┴────────────┐                       │
│               │        Sucesso?         │                       │
│               └────────────┬────────────┘                       │
│                   SIM │         │ NÃO                           │
│                       ▼         ▼                               │
│              ┌────────────┐  ┌────────────────┐                 │
│              │ Continuar  │  │ Fallback para  │                 │
│              │ Processo   │  │ Mistral OCR    │                 │
│              └────────────┘  └───────┬────────┘                 │
│                       │              │                          │
│                       └──────┬───────┘                          │
│                              ▼                                  │
│                   ┌──────────────────┐                          │
│                   │ Preenchimento    │                          │
│                   │ Estruturado      │                          │
│                   └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comparação de Custos

| Cenário | Gemini | Mistral OCR | Total |
|---------|--------|-------------|-------|
| PDF 30MB (100 páginas) | ~$0.05 | - | ~$0.05 |
| PDF 68MB (300 páginas) split em 2 | ~$0.15 | - | ~$0.15 |
| PDF 68MB com fallback Mistral | - | ~$0.30 | ~$0.30 |

---

## Benefícios desta Abordagem

1. **Zero Intervenção Manual:** PDFs grandes são divididos automaticamente
2. **Preservação de Integridade:** pdf-lib usa `copyPages()` que mantém todas as referências
3. **Fallback Elite:** Se Gemini falhar, Mistral OCR tem precisão superior
4. **Custo Baixo:** Mistral OCR custa apenas $1/1000 páginas
5. **Escalável:** Suporta PDFs de até ~180MB (4 partes × 45MB)
6. **Transparente:** Usuário vê progresso "Processando parte 1/2..."

---

## Considerações de Memória

Para PDFs > 45MB, o sistema precisa fazer download para memória para dividir. Isso significa:
- PDF 68MB → ~68MB na RAM temporariamente
- Após split, cada parte é processada e liberada
- Limite prático: ~150MB (limite do Worker)

Para PDFs > 150MB, seria necessário:
- Limite no frontend com mensagem clara
- Ou integração com serviço externo (iLovePDF API) para split remoto

---

## Próximos Passos de Implementação

1. Criar `pdf-splitter.ts` com função `splitPDF`
2. Criar `mistral-ocr.ts` com cliente para Mistral OCR
3. Adicionar lógica de split em `processar-autos/index.ts`
4. Adicionar fallback para Mistral OCR
5. Solicitar adição do secret `MISTRAL_API_KEY`
6. Testar com PDF de 68MB
