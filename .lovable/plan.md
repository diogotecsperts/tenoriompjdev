## Diagnóstico confirmado

O erro do print é real e recorrente nos logs:

- `prev-pre-processar` baixou um PDF de **8,08 MB**.
- O upload para Gemini Files API terminou rápido.
- A chamada seguinte ficou presa em `generateContent` por **105s** com `gemini-3.1-flash-lite` e foi abortada pelo nosso timeout interno.
- A UI recebeu `504` e exibiu: “Tempo excedido no OCR Gemini”.

Importante: você está correto. **`gemini-3.1-flash-lite` e `gemini-3.5-flash` existem**. A documentação atual do Google confirma:

- `gemini-3.1-flash-lite`: suporta **Text, Image, Video, Audio e PDF**, saída Text, janela 1M/64k, modelo barato para alto volume.
- `gemini-3.5-flash`: suporta **Text, Image, Video, Audio e PDF**, saída Text, janela 1M/64k.
- A própria documentação recomenda a **Interactions API** como API atual para modelos novos; `generateContent` é tratado como legado, embora ainda suportado.
- Para tarefas longas, a documentação do Google recomenda `background: true`, porque requisições HTTP síncronas podem fechar por timeout antes do modelo terminar.

## Causa provável

Não é saldo nem chave, porque não aparece 401/403/429/402. Também não é “modelo inexistente”, porque a chamada não retorna 400; ela fica aguardando até nosso abort de 105s.

A causa é arquitetural:

- O app tenta fazer OCR visual de PDF dentro de uma chamada síncrona de Edge Function.
- O OCR Gemini atual usa `generateContent` legado + Files API e espera a resposta completa antes de retornar.
- Para PDFs escaneados/visuais, mesmo com apenas 8 MB, a leitura pode passar de 105s dependendo do número de páginas, imagens, compressão e carga do provider.
- Esse tipo de job não deveria depender de uma única requisição HTTP síncrona.

## Objetivo da correção

Manter os modelos econômicos (`gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-3.5-flash`) e fazer o pipeline usar a forma correta:

1. **Gemini moderno via Interactions API** para modelos Gemini 3.x.
2. **Execução assíncrona/background** quando o OCR do PDF puder demorar.
3. **Polling de status** no frontend, em vez de travar a tela esperando uma Edge Function única.
4. Erros objetivos: quota, chave, modelo, timeout real, falha provider, JSON truncado.

## Plano de implementação

### 1. Atualizar o extrator Gemini para distinguir API por modelo

Arquivo principal: `supabase/functions/_shared/pdf-visual-extractor.ts`

Criar roteamento interno:

- Modelos Gemini 3.x e 3.5:
  - `gemini-3.1-flash-lite`
  - `gemini-3.1-flash-lite-preview`
  - `gemini-3.5-flash`
  - `gemini-3-flash-preview`
  - `gemini-3-pro-preview`
  - `gemini-3.1-pro-preview`
  
  Usar **Interactions API**:

  ```text
  POST https://generativelanguage.googleapis.com/v1beta/interactions
  x-goog-api-key: GEMINI_API_KEY
  Api-Revision: 2026-05-20
  ```

- Modelos 2.5/2.0/1.5:
  - manter `generateContent`, porque já funciona e é compatível com o fluxo atual.

### 2. Implementar `interactions.create` com arquivo PDF

Após upload na Files API, chamar:

```json
{
  "model": "gemini-3.1-flash-lite",
  "input": [
    { "type": "document", "uri": "<fileUri>", "mime_type": "application/pdf" },
    { "type": "text", "text": "<EXTRACTION_PROMPT>" }
  ],
  "system_instruction": "Você é um sistema de OCR especializado...",
  "generation_config": {
    "temperature": 0.1,
    "max_output_tokens": 65536,
    "response_mime_type": "application/json"
  },
  "background": true,
  "store": false
}
```

Observação técnica: se o formato exato aceito pela REST API vier com `mimeType` em vez de `mime_type` para algum endpoint, será validado no teste real e ajustado. O ponto central é: para Gemini 3.x, não insistir em `contents[].parts[].fileData` do fluxo legado quando ele está demorando no OCR.

### 3. Criar helper de polling Gemini

No mesmo shared file ou em novo helper `_shared/gemini-interactions.ts`:

- `createGeminiBackgroundInteraction(...)`
- `pollGeminiInteraction(...)`
- `extractInteractionOutputText(...)`
- `classifyGeminiInteractionError(...)`

Polling:

```text
GET https://generativelanguage.googleapis.com/v1beta/interactions/{id}
headers:
  x-goog-api-key: GEMINI_API_KEY
  Api-Revision: 2026-05-20
```

Estados tratados:

- `completed`: extrair texto de `steps[].content[].text`.
- `failed`: retornar erro com corpo real do provider.
- `cancelled`: erro controlado.
- `in_progress`: continuar polling.
- timeout do nosso polling: retornar mensagem clara com `interactionId` para auditoria.

### 4. Resolver o limite da Edge Function: tornar o fluxo previdenciário assíncrono

Hoje `prev-pre-processar` tenta fazer OCR + extração estruturada + subpassadas em uma única chamada. Isso é o que causa 504.

A correção robusta é transformar o pré-processamento previdenciário em job:

- Na primeira chamada, criar/atualizar status da própria `prev_pericias` ou uma tabela nova simples de jobs.
- Retornar imediatamente:

```json
{
  "ok": true,
  "async": true,
  "jobId": "...",
  "status": "processing"
}
```

- Rodar o processamento em background com `EdgeRuntime.waitUntil(...)`.
- O frontend faz polling até `pdf_processado=true` ou erro salvo.

Como `prev_pericias` hoje não tem campos de erro/progresso, há duas opções:

#### Opção recomendada: tabela nova `prev_processing_jobs`

Campos de domínio:

- `pericia_id`
- `user_id`
- `status`: `queued | processing | completed | failed`
- `stage`: `download | ocr_upload | ocr_processing | ai_extraction | saving`
- `progress`
- `provider`
- `model`
- `error_code`
- `error_message`
- `technical_detail`
- `result`

Com RLS por usuário e grants corretos.

#### Opção alternativa: adicionar campos em `prev_pericias`

Campos:

- `processing_status`
- `processing_stage`
- `processing_progress`
- `processing_error`
- `processing_detail`

É mais simples, mas mistura estado transitório com dados da perícia. Prefiro tabela separada.

### 5. Criar função de status/polling

Nova Edge Function ou extensão segura da atual:

- `check-prev-processing-status`

Ela retorna:

```json
{
  "status": "processing",
  "stage": "ocr_processing",
  "progress": 45,
  "provider": "gemini",
  "model": "gemini-3.1-flash-lite"
}
```

Ou, ao finalizar:

```json
{
  "status": "completed",
  "periciaId": "...",
  "pdfProcessado": true,
  "pages": 12,
  "documentosCriados": 8
}
```

Ou erro:

```json
{
  "status": "failed",
  "code": "provider_timeout|quota_exceeded|invalid_key|invalid_request|provider_unavailable",
  "message": "...",
  "technicalDetail": "..."
}
```

### 6. Adaptar frontend previdenciário

Arquivos principais:

- `src/modules/previdenciario/api/processar.ts`
- `src/modules/previdenciario/pages/PautaDetalhe.tsx`

Mudanças:

- `preProcessarPericia` passa a aceitar resposta síncrona ou assíncrona.
- Se receber `async: true`, iniciar polling.
- Mostrar etapa real no botão/status:
  - Enviando PDF
  - OCR Gemini: upload
  - OCR Gemini: leitura visual
  - Extraindo dados
  - Salvando resultado
- Se falhar, mostrar mensagem detalhada, sem esconder atrás de “Edge Function returned non-2xx”.

### 7. Manter Flash-Lite e custo baixo no DevPanel

Não remover os modelos baratos.

No DevPanel:

- Manter `gemini-3.1-flash-lite`.
- Manter `gemini-3.1-flash-lite-preview`.
- Manter `gemini-3.5-flash`.
- Ajustar descrição desses modelos como “Gemini moderno / Interactions API / econômico”.
- Para OCR, sugerir `gemini-3.1-flash-lite` como opção econômica padrão, mas com processamento assíncrono.

### 8. Melhorar classificação de erros

Atualizar a classificação para diferenciar:

- `quota_exceeded`: saldo/cota/billing/rate quota.
- `invalid_key`: chave inválida/sem permissão.
- `invalid_request`: modelo/parâmetros inválidos.
- `provider_timeout`: nosso polling excedeu limite, mas com `interactionId` salvo.
- `provider_unavailable`: 5xx/overloaded.
- `response_truncated`: JSON incompleto.

O toast não deve mais dizer apenas “Tempo excedido na IA”; deve dizer algo como:

```text
OCR Gemini ainda não concluiu dentro do tempo esperado.
Modelo: gemini-3.1-flash-lite
PDF: 8,08 MB
Status: processamento em background
Acompanhe o status; não é necessário reenviar o PDF.
```

Ou, em falha real:

```text
Falha no Gemini OCR: cota excedida no provider.
Modelo: gemini-3.1-flash-lite
Status upstream: 429
Detalhe: ...
```

## Validação obrigatória após implementar

1. Testar chamada mínima do Gemini Interactions API com `gemini-3.1-flash-lite`.
2. Testar upload Files API + Interactions API com PDF pequeno.
3. Testar o mesmo PDF de ~8 MB que está falhando.
4. Confirmar que a UI não recebe 504.
5. Confirmar que o job progride por polling.
6. Confirmar que `prev_extracao`, `pdf_processado` e `prev_documentos` são salvos como antes.
7. Confirmar que MiniMax M3 como modelo principal + Gemini OCR continua funcionando.
8. Confirmar que os modelos 2.5 continuam funcionando pelo fluxo antigo.

## Resultado esperado

- Flash-Lite permanece disponível para testar economia.
- PDFs demorados deixam de quebrar por timeout síncrono.
- O usuário acompanha status real.
- O app diferencia claramente se o problema é app, provider, quota, chave, modelo, ou demora real do OCR.
- O fluxo previdenciário fica mais robusto sem mexer nos dados já salvos.
