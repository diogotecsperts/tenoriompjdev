

## Plano: Corrigir Memory Limit Exceeded para PDFs Grandes em Single-Pass

---

## Diagnóstico Confirmado (Logs)

```text
[processar-autos] Downloaded PDF: ME IMPORTE 4.pdf, size: 68.44MB
[processar-autos] Using SINGLE-PASS extraction...
Memory limit exceeded
```

**Causa Raiz:** O modo SINGLE-PASS converte o PDF inteiro para base64 na memória antes de enviar para a API:

```typescript
// Linha 974 - PROBLEMA
const pdfBase64 = base64FromBytes();  // 68MB → ~91MB string
visionResult = await callPDFProvider(pdfBase64, systemPrompt, ...);
```

**Resultado:** 68MB (Uint8Array) + 91MB (base64 string) = ~160MB em memória simultânea → WORKER_LIMIT

---

## Solução: Usar Files API para PDFs Grandes em Single-Pass

A solução é reutilizar a lógica já existente no modo TWO-PHASE (linha 796-811) que usa a Gemini Files API para PDFs grandes, evitando a conversão base64 em memória.

### Alterações no `processar-autos/index.ts`

**SINGLE-PASS (linha 957-1011):**

```text
ANTES:
1. Baixa PDF como bytes ✅
2. Converte TUDO para base64 ❌ (estoura memória)
3. Envia base64 para callPDFProvider ❌

DEPOIS:
1. Baixa PDF como bytes ✅
2. Se PDF > 20MB → usar Files API (upload bytes direto) ✅
3. Se PDF ≤ 20MB → usar base64 inline (rápido) ✅
4. Libera bytes imediatamente após upload ✅
```

### Código Atualizado (Single-Pass)

```typescript
// === SINGLE PASS EXTRACTION (linha ~957) ===
console.log('[processar-autos] Using SINGLE-PASS extraction...');

// ... update progress ...

timings.pdfExtraction.start = Date.now();

// NOVO: Decidir estratégia baseado no tamanho
const LARGE_PDF_THRESHOLD = 20_000_000; // 20MB
const isLargePDF = pdfSizeBytes > LARGE_PDF_THRESHOLD;

if (isLargePDF) {
  console.log(`[processar-autos] Large PDF detected (${(pdfSizeBytes / 1024 / 1024).toFixed(2)}MB), using Files API...`);
  
  // Usar extractVisualContent que já suporta Files API com bytes
  const extracted = await extractVisualContent(pdfBytes!, { 
    useFilesAPI: true,
    model: 'gemini-2.5-flash'  // ou buscar da config
  });
  
  // Limpar bytes imediatamente
  pdfBytes = null;
  console.log('[processar-autos] MEMORY: Cleared PDF bytes after Files API upload');
  
  // O texto extraído serve como entrada para o parsing
  const fillResult = await callAI(
    await getAIConfig(),
    systemPrompt,
    `Analise o seguinte texto extraído e retorne JSON estruturado:\n\n${extracted.rawText}`,
    { promptType: 'single_pass_large', userId, maxOutputTokens: 65536, jsonMode: true }
  );
  
  visionResult = {
    provider: 'gemini-files-api',
    model: extracted.model,
    text: fillResult.text,
    finishReason: 'STOP',
    usedFallback: false
  };

} else {
  // PDFs pequenos: usar base64 inline (original)
  const pdfBase64 = base64FromBytes();
  pdfBytes = null; // Limpar bytes após conversão
  
  visionResult = await callPDFProvider(pdfBase64, systemPrompt, {
    promptType: 'pdf_extraction',
    userId: userId
  });
}

timings.pdfExtraction.end = Date.now();
```

---

## Por Que Isso Vai Funcionar

| Cenário | Antes | Depois |
|---------|-------|--------|
| PDF 68MB (grande) | ❌ base64 = 91MB extra → crash | ✅ Files API = upload direto, sem base64 |
| PDF 5MB (pequeno) | ✅ base64 inline rápido | ✅ base64 inline rápido (sem mudança) |
| Memória máxima | ~160MB (bytes + base64) | ~68MB (apenas bytes durante upload) |

---

## Fluxo Atualizado (Single-Pass)

```text
┌─────────────────────────────────────────────────┐
│            PDF RECEBIDO                         │
└─────────────────────────────────────────────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │   Tamanho > 20MB?      │
       └────────────────────────┘
              │            │
         SIM  │            │  NÃO
              ▼            ▼
   ┌──────────────┐  ┌──────────────┐
   │ Files API    │  │ Base64       │
   │ (bytes)      │  │ (inline)     │
   └──────────────┘  └──────────────┘
              │            │
              └─────┬──────┘
                    ▼
       ┌────────────────────────┐
       │  Limpar bytes IMEDIATO │
       └────────────────────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │  Parse JSON + Resumos  │
       └────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/processar-autos/index.ts` | Adicionar detecção de tamanho e uso de Files API no modo single-pass |

---

## Resultado Esperado

- **PDF 68MB:** Processa via Files API sem crash
- **PDF 5MB:** Continua usando base64 inline (rápido)
- **Memória:** Nunca excede ~70MB para qualquer tamanho de PDF

