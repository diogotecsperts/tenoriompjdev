## Diagnóstico

O erro "Failed to send a request to the Edge Function" acontece porque a função `send-tracking-email` **não está publicada** no backend. Confirmado por dois sinais:

- Logs da função: vazios (nenhuma requisição chegou).
- Chamada direta via API: `404 NOT_FOUND — Requested function was not found`.

Ou seja: o código existe no projeto, mas o deploy da função nova não ocorreu no ciclo anterior. Sem deploy, nem o botão de teste nem os disparos reais (login, erro de PDF, resumo diário) funcionam.

## O que vou fazer

1. **Publicar a função `send-tracking-email`** explicitamente via ferramenta de deploy (`deploy_edge_functions`).
2. **Testar o envio real** logo em seguida chamando a função pelo backend com `type: "test"` e conferindo:
   - resposta 200 do endpoint,
   - ID retornado pela Resend,
   - linha nova em `email_tracking_log` com `status: "sent"`.
3. **Se a Resend recusar** (401/403/domínio), a mensagem exata é gravada no log e retornada para a UI — usarei isso para corrigir (chave inválida, domínio não verificado, from address, etc.) antes de encerrar.
4. **Endurecer o handler** contra o modo de falha silenciosa que gerou este bug:
   - garantir que qualquer exceção não capturada retorna `{ error }` com `corsHeaders` (evita 500 sem CORS que aparece no cliente como "Failed to send a request");
   - validar `overrideRecipients` no path de teste e permitir enviar teste mesmo com `enabled=false` (já é `force: true`, só confirmar);
   - registrar no `email_tracking_log` mesmo quando o envio falha antes da Resend (config ausente, chave ausente).

Nenhuma tabela nova, nenhuma migração. Só deploy + pequenos ajustes de robustez no `index.ts` da função.

## Arquivos afetados

- `supabase/functions/send-tracking-email/index.ts` — envelope de try/catch no handler e logging de falhas pré-Resend.
- Deploy: `send-tracking-email`.

## Validação

- `curl_edge_functions` POST `/send-tracking-email` com `{"type":"test","force":true}` → esperado 200 + id Resend.
- Conferir `email_tracking_log` (última linha `status='sent'`).
- Reproduzir o botão "Enviar email de teste" na UI.
