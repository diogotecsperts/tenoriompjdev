

## Plano: Corrigir Formato do Payload Mistral OCR

---

## Problema

O endpoint OCR da Mistral está retornando erro 422 (Unprocessable Entity) porque o payload está no formato incorreto:

**Enviando:**
```json
{
  "document": {
    "type": "file_id",  ← ERRADO
    "file_id": "22bbc9e3-cc93-4d02-9f5b-e2a0c60a1c59"
  }
}
```

**Erro da API:**
```
Input should be <ChunkTypes.file: 'file'>
```

---

## Solução

Alterar o valor de `type` de `"file_id"` para `"file"` no payload OCR.

**Arquivo:** `supabase/functions/_shared/mistral-ocr.ts`  
**Linha:** 96

---

## Mudança

**Antes (linha 93-100):**
```typescript
const ocrPayload: Record<string, unknown> = {
  model: 'mistral-ocr-latest',
  document: {
    type: 'file_id',  // ← ERRADO
    file_id: fileId,
  },
  include_image_base64: options.includeImageBase64 ?? false,
};
```

**Depois:**
```typescript
const ocrPayload: Record<string, unknown> = {
  model: 'mistral-ocr-latest',
  document: {
    type: 'file',  // ← CORRETO
    file_id: fileId,
  },
  include_image_base64: options.includeImageBase64 ?? false,
};
```

---

## Análise Técnica

A Mistral OCR API aceita três tipos de documento no union type:

| Tipo | Campos | Uso |
|------|--------|-----|
| `document_url` | `document_url` | URL pública de documento |
| `image_url` | `image_url` | URL pública de imagem |
| `file` | `file_id` | Arquivo já uploadado via Files API |

Estávamos usando `type: "file_id"` que não existe na especificação. O correto é `type: "file"` com o campo `file_id`.

---

## Arquivo a Modificar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `supabase/functions/_shared/mistral-ocr.ts` | 96 | `'file_id'` → `'file'` |

---

## Resultado Esperado

Após a correção, o Mistral OCR deve processar PDFs corretamente retornando texto extraído em Markdown estruturado.

