# Correção do erro 400 no OCR de PDFs grandes (Gemini)

## O que aconteceu no PDF de 63 MB

Fluxo executado (logs `prev-pre-processar`):

1. Upload streaming para o Gemini Files API → ✅ 200, arquivo `files/wucww8ccwy3l` ficou `ACTIVE`.
2. Chamada para gerar o OCR → ❌ **400 invalid_argument** em:

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
→ { "error": { "message": "Request contains an invalid argument." } }
```

O toast genérico ("Falha no provider backend/processamento") apareceu porque o erro cru do provider foi engolido e substituído por uma mensagem padronizada.

## Causa raiz

Em `supabase/functions/_shared/pdf-visual-extractor.ts` existe um roteador `shouldUseGeminiInteractionsAPI(apiModel)` que, para qualquer modelo `gemini-3.x` (inclui `gemini-3.1-flash-lite`), envia a chamada de OCR para o endpoint **Interactions API** (`/v1beta/interactions`) com este payload:

```
input: [
  { type: 'document', uri: fileUri, mime_type: 'application/pdf' },
  { type: 'text',     text: prompt },
]
```

Esse payload é rejeitado pelo Google com 400 invalid_argument (o shape suportado hoje pelo Files API é `file_data.file_uri` dentro de `contents.parts` via `models/{model}:generateContent`, não `type:'document'` no Interactions). A função irmã `callGeminiGenerateContentWithFile` já implementa a chamada correta, com variantes de URI e retry, e funcionou nos PDFs pequenos (que caem no path inline base64 e não passam pelo mesmo endpoint).

Ou seja: **não é problema do arquivo de 63 MB nem do streaming** — o upload deu certo. É o endpoint escolhido para o passo seguinte que é o errado para OCR com Files API.

## Correção proposta

**Regra nova:** sempre que o OCR usar Files API (fileUri já existente no servidor Gemini), usar `generateContent`, independente do modelo. O `Interactions API` deixa de ser roteado para OCR — não há benefício e o payload atual quebra.

### Arquivos a alterar

1. **`supabase/functions/_shared/pdf-visual-extractor.ts`**
   - Nos três pontos onde há `shouldUseGeminiInteractionsAPI(apiModel) ? callGeminiInteractionsWithFile(...) : callGeminiGenerateContentWithFile(...)` (linhas ~467, ~513, ~614), remover o ternário e chamar sempre `callGeminiGenerateContentWithFile`.
   - Ajustar os rótulos `provider` para `gemini-files-api` / `gemini-streaming` (remover as variantes `-interactions-*`).
   - Manter `callGeminiInteractionsWithFile` e `shouldUseGeminiInteractionsAPI` no arquivo por ora (não usados), com comentário explicando que o payload precisa ser revisto antes de reativar.

2. **`supabase/functions/prev-pre-processar/index.ts`**
   - Melhorar a propagação do erro real do provider para o toast: quando o provider Gemini falhar, incluir `error.message` (já sanitizado por `sanitizeGeminiError`) no campo `error_message` do job, para que o front mostre algo como *"Gemini Files API generateContent 400: …"* em vez de "Falha no provider backend/processamento".

3. **`src/modules/previdenciario/api/processar.ts`** (só ajuste de UX)
   - No toast de erro, dar preferência a `job.error_message` do backend quando existir, e cair no genérico só se estiver vazio.

### Job travado do Bruno

Marcar `d4e4c935-b9f4-4c17-a866-45dc2fb916bf` como `failed` na tabela `prev_processing_jobs` com mensagem clara (`Gemini generateContent 400 — payload legacy Interactions API`) para liberar o botão "Tentar novamente".

## Validação

1. Reprocessar o PDF de 63 MB do Bruno com `phase1_ocr_provider=gemini` + `gemini-3.1-flash-lite`:
   - Deve subir via streaming ao Files API (já funciona), gerar OCR via `generateContent`, e retornar `provider=gemini-streaming` com 200.
2. Reprocessar o PDF de 14 MB para garantir que o path inline não foi afetado.
3. Forçar um 400 artificial (ex.: apiKey inválida) e conferir que o toast mostra a mensagem sanitizada do Gemini, não mais "Falha no provider backend/processamento".

## Fora de escopo

- Nenhuma mudança no DevPanel, prompts, chunking, watchdog ou frontend do laudo.
- Não trocamos o modelo padrão nem alteramos regras de OCR globais.
