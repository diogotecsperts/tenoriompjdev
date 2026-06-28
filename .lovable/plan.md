
## Contexto

Hoje, quando o upload na Mistral falha, a edge function `prev-pre-processar` repassa uma mensagem genérica ("Edge Function returned a non-2xx status code"). Os logs já mostram que a Mistral retorna informações úteis no corpo (`status` HTTP + JSON com `detail`/`message`/`type`), mas não estamos interpretando esses campos. Sim — com o que já recebemos da API dá pra distinguir com clareza: cota esgotada, chave inválida/revogada, arquivo grande demais, rate-limit momentâneo, indisponibilidade do provedor, etc.

Este plano implementa essa diferenciação **somente no módulo Previdenciário**, sem tocar no Trabalhista.

## O que muda

### 1. Classificador de erros Mistral (novo helper, isolado)
Criar `supabase/functions/prev-pre-processar/_mistral-errors.ts` com uma função `classifyMistralError(status, bodyText)` que retorna:
- `code`: `quota_exceeded` | `invalid_key` | `rate_limited` | `file_too_large` | `unsupported_file` | `provider_unavailable` | `unknown`
- `userMessage`: texto pt-BR amigável, sem jargão técnico, sem expor chaves
- `httpStatus`: status HTTP a devolver ao front (402 cota, 401 chave, 413 arquivo, 429 rate, 503 indisponível, 500 desconhecido)

Regras de classificação (baseadas em status + parsing leve do JSON):
- `401` + corpo contendo `unauthorized`/`invalid api key` → `invalid_key`
- `402` ou `403` com `quota`/`exceeded`/`payment`/`billing` → `quota_exceeded`
- `429` → `rate_limited`
- `413` ou mensagem `too large`/`size limit` → `file_too_large`
- `415` ou `unsupported` → `unsupported_file`
- `5xx` → `provider_unavailable`
- demais → `unknown` (mantém mensagem genérica + status original no log)

Importante: o classificador **só lê o corpo retornado pelo provedor**; nunca registra/retorna a API key.

### 2. Integração na função `prev-pre-processar`
Nos pontos onde hoje fazemos `throw new Error("Mistral upload failed (...)")` / `Mistral OCR failed (...)`:
- capturar `status` e `body` da resposta
- chamar `classifyMistralError`
- logar `[prev-pre-processar] mistral_error code=<code> status=<status>` (sem corpo bruto que possa vazar dados)
- responder com `Response(JSON.stringify({ error: userMessage, code, stage: 'ocr' }), { status: httpStatus, headers: corsHeaders })`

Aplicar nas 2 chamadas Mistral existentes: upload do arquivo e chamada de OCR. Nenhuma outra lógica de processamento é alterada.

### 3. Exibição amigável no front (apenas Previdenciário)
Atualizar o ponto que invoca `prev-pre-processar` (botão "Processar" em `PautaDetalhe.tsx` e fluxo de lote) para:
- ler `error.context?.body` / response JSON
- exibir `toast.error(userMessage)` quando vier `code` conhecido
- manter fallback atual quando não houver `code`

Mensagens pt-BR propostas:
- `quota_exceeded`: "Cota mensal da IA de OCR esgotada. O processamento será retomado automaticamente quando a cota for renovada."
- `invalid_key`: "Credencial da IA de OCR inválida ou revogada. Avise o administrador."
- `rate_limited`: "Muitas requisições simultâneas à IA de OCR. Aguarde alguns segundos e tente novamente."
- `file_too_large`: "PDF excede o tamanho máximo aceito pela IA de OCR (50MB)."
- `unsupported_file`: "Formato de arquivo não suportado pela IA de OCR."
- `provider_unavailable`: "Serviço de OCR temporariamente indisponível. Tente novamente em instantes."

## Garantias de segurança

- Alterações restritas a: `supabase/functions/prev-pre-processar/` e o(s) componente(s) do módulo previdenciário que invocam essa função.
- Zero alteração em: `supabase/functions/processar-autos`, `mistral-ocr` compartilhado (não é importado pelo Previdenciário), Trabalhista, prompts, banco, schema, RLS.
- Nenhum segredo é lido, logado ou retornado — apenas o status HTTP e o corpo já enviado pela Mistral.
- Compatível com o estado atual de cota esgotada: o próximo upload mostrará a mensagem de `quota_exceeded` em vez do erro genérico, sem mudar comportamento de retry.

## Trabalhista (fora deste plano)
A mesma estratégia é replicável em `processar-autos` / helper `mistral-ocr` compartilhado, mas exige revisar mais pontos de chamada e a UI de importação. Fica registrado como passo futuro, **não implementado agora**.
