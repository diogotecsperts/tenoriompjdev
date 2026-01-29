

## Plano: Streaming Direto para Gemini Files API (Sem Carregar 67MB na RAM)

---

## O Problema Identificado

Você está **absolutamente certo** - a API Gemini oficial suporta arquivos até **2GB**. O problema não é o Gemini, é a **memória do Edge Function Worker** (~150MB limite).

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO ATUAL (CRASH)                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Download PDF do Storage → 67MB na RAM                       │
│  2. Converter para ArrayBuffer → +67MB (cópia)                  │
│  3. Enviar para Files API...                                    │
│                                                                 │
│  >>> 67MB + 67MB + overhead = ~150MB → WORKER_LIMIT <<<        │
└─────────────────────────────────────────────────────────────────┘
```

---

## A Solução: Streaming

O Deno/Supabase suporta **streaming de arquivos** - em vez de carregar tudo na memória, passamos um `ReadableStream` diretamente do Storage para a Files API do Gemini:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO NOVO (STREAMING)                       │
├─────────────────────────────────────────────────────────────────┤
│  Storage ──(stream)──> Files API                                │
│                                                                 │
│  Memória usada: ~1MB (buffer de streaming)                      │
│  Tamanho do arquivo: irrelevante (até 2GB)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Técnicas

### 1. Nova Função: `uploadToGeminiFilesAPIStream`

```typescript
// Em gemini-files-api.ts
export async function uploadToGeminiFilesAPIStream(
  stream: ReadableStream<Uint8Array>,
  fileSize: number,
  apiKey: string
): Promise<string> {
  console.log(`[gemini-files-api] Starting STREAMING upload, size: ${(fileSize / (1024 * 1024)).toFixed(2)}MB`);

  // Step 1: Initialize resumable upload
  const initResponse = await fetch(
    `${FILES_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { displayName: `import_${Date.now()}.pdf` }
      })
    }
  );

  const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');

  // Step 2: Stream upload (SEM carregar na memória)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': fileSize.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: stream  // Deno passa o stream direto, sem buffering
  });

  // ... processar resposta e retornar URI
}
```

### 2. Atualizar `processar-autos/index.ts`

```typescript
// Em vez de:
const { data: fileData } = await supabaseAdmin.storage
  .from('processos-pdf')
  .download(filePath);
const pdfBytes = new Uint8Array(await fileData.arrayBuffer()); // ❌ 67MB na RAM

// Usar:
const { data: fileData } = await supabaseAdmin.storage
  .from('processos-pdf')
  .download(filePath);

// Obter tamanho sem carregar na memória
const fileSizeBytes = fileData.size;

// Criar stream do Blob
const pdfStream = fileData.stream(); // ✅ Stream, não carrega tudo

// Upload via streaming
const fileUri = await uploadToGeminiFilesAPIStream(pdfStream, fileSizeBytes, apiKey);

// Agora temos o fileUri para usar no generateContent
```

### 3. Atualizar `extractVisualContent`

Nova assinatura que aceita stream:

```typescript
export async function extractVisualContent(
  pdfInput: string | Uint8Array | { stream: ReadableStream; size: number },
  options: { useFilesAPI?: boolean; model?: string; geminiApiKey?: string }
): Promise<ExtractedContent>
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/_shared/gemini-files-api.ts` | Adicionar `uploadToGeminiFilesAPIStream` |
| `supabase/functions/_shared/pdf-visual-extractor.ts` | Suportar input como stream |
| `supabase/functions/processar-autos/index.ts` | Usar streaming em vez de carregar bytes |

---

## Comparação de Memória

| Abordagem | PDF 67MB | PDF 200MB | PDF 500MB |
|-----------|----------|-----------|-----------|
| Atual (bytes) | ❌ Crash | ❌ Crash | ❌ Crash |
| **Streaming** | ✅ ~5MB | ✅ ~5MB | ✅ ~5MB |

---

## Fluxo Final

```text
┌──────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│  Supabase        │     │  Edge Function    │     │  Gemini Files   │
│  Storage         │     │  (memória baixa)  │     │  API            │
│                  │     │                   │     │                 │
│  PDF 67MB ───────┼─────┼──► Stream ────────┼─────┼──► Upload       │
│                  │     │   (~1MB buffer)   │     │                 │
└──────────────────┘     └───────────────────┘     └─────────────────┘
                                  │
                                  ▼
                         ┌───────────────────┐
                         │  fileUri recebido │
                         │  (sem PDF na RAM) │
                         └───────────────────┘
                                  │
                                  ▼
                         ┌───────────────────┐
                         │  generateContent  │
                         │  usando fileUri   │
                         └───────────────────┘
```

---

## Resultado Esperado

- **PDF 67MB:** Processa via streaming sem usar mais que ~10MB de RAM
- **PDF 200MB:** Funciona igual (streaming é independente do tamanho)
- **Limite teórico:** 2GB (limite da Files API do Gemini)
- **Erro WORKER_LIMIT:** Eliminado para arquivos grandes

