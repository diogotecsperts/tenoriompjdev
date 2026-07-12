## Diagnóstico

O erro do print vem do Resend em modo de teste. A função `signup-request-approve` envia com `from: "Tenório MPJ <onboarding@resend.dev>"` — remetente genérico do Resend que só entrega ao dono da conta Resend (`diogotecinove@gmail.com`, que é o email cadastrado na conta Resend, não o email da solicitação nem o seu email de dev). Qualquer outro destinatário (`diogotecinove@outlook.com`, clientes reais) é bloqueado com HTTP 403 `validation_error`.

O projeto já tem o domínio `mpjpericias.tecsperts.com` verificado no Resend e em uso pela `send-tracking-email` (constantes `FROM_REPORTS`, `FROM_ALERTS`). Basta usar esse mesmo domínio na função de aprovação.

## Mudanças

**1. `supabase/functions/signup-request-approve/index.ts`**
- Trocar o `from` de `Tenório MPJ <onboarding@resend.dev>` para `Tenório MPJ <acesso@mpjpericias.tecsperts.com>` (mesmo domínio verificado usado nos alertas).
- Adicionar um tradutor de erro que devolve `{ error, hint, raw }` em vez do JSON cru do Resend. Casos cobertos:
  - `validation_error` + "testing emails" → "Resend em modo de teste. O remetente precisa usar um domínio verificado."
  - HTTP 403 genérico do Resend → "Resend recusou o envio (403). Verifique se o domínio do remetente está ativo."
  - HTTP 401 / `invalid_api_key` → "Chave da API Resend inválida ou expirada. Atualize `RESEND_API_KEY` nos segredos."
  - `over_quota` / `rate_limit` → "Limite do Resend atingido. Aguarde alguns minutos e tente novamente."
  - `email_exists` (do `generateLink`) → "Já existe uma conta com este email. Peça ao usuário para usar 'Esqueci minha senha' ou remova o cadastro antigo antes de reaprovar."
  - Fallback → mensagem curta em PT + `raw` com o texto original para inspeção do dev.
- Idem para falhas de `generateLink` (invite/recovery): mesma estrutura de resposta.
- Deploy da função após a edição.

**2. `src/components/dev-panel/DevSignupRequests.tsx`**
- No handler do "Aprovar": quando a edge function retornar `{ error, hint }`, mostrar toast com título curto ("Não foi possível aprovar") e descrição = `hint ?? error`. Preservar comportamento atual em caso de sucesso. Nenhuma outra mudança visual.

## Por que o erro citou `diogotecinove@gmail.com`

Esse é o email do **dono da conta Resend**, não o email da solicitação nem o seu email de dev. No modo de teste (`onboarding@resend.dev` como remetente), o Resend só entrega para o dono da conta e cita esse endereço na mensagem de erro. Ao trocar para o domínio verificado, a restrição some.

## Fora de escopo

Sem mexer em `AuthContext`, `FinalizarCadastro`, RLS, migrations, `config.toml`, `send-tracking-email` ou outras edge functions.
