---
name: Dev impersonation architecture
description: How dev enters as a client without touching their password; how logs must always identify the dev, never the client
type: feature
---

## Fluxo

1. DevPanel → Usuários → botão "Entrar como" (`VenetianMask` amber) chama edge function `dev-impersonate-user` com `{ target_user_id }`.
2. Edge function (service-role + `is_developer()`, bloqueia alvo com role `developer`/`admin`) chama `auth.admin.generateLink({ type: 'magiclink', ... data: { impersonated_by, impersonated_by_name, impersonated_by_user_id, impersonated_at } })` e devolve `{ email, token_hash }`.
3. Também grava em `access_logs`: `event_type='impersonation_started'`, `user_id=<dev>`, `metadata.target_user_id=<alvo>` — audit trail server-side irremovível pelo cliente.
4. Client abre `/impersonate#token=...&email=...` em **nova aba** (`window.open(url, '_blank', 'noopener')`).
5. `/impersonate` seta `sessionStorage['lovable_impersonation_active']='1'` e recarrega. Após reload, `src/integrations/supabase/client.ts` detecta o flag e usa `sessionStorage` no lugar de `localStorage` → isolamento por aba (a aba original do dev permanece intacta).
6. `verifyOtp({ type: 'magiclink', token_hash, email })` consome o token uma vez → sessão desta aba autenticada como o cliente, com `user_metadata.impersonated_by` etc.
7. Navega para `/hub`.

## Regra dos logs — NUNCA confundir dev com cliente

- **`AuthContext.loadUserData`**: se `session.user.user_metadata.impersonated_by` estiver presente, insere em `access_logs` com `event_type='impersonation_login'` (nunca `'login'`) e metadata contendo `impersonated_by_user_id`, `impersonated_by_name`, `impersonated_by_user_id_code`.
- **`usePresenceHeartbeat`**: em sessão impersonada, **NÃO** faz `upsert` em `user_presence` (não marca cliente online), e envia `send-tracking-email` com `type='impersonation_login'` — nunca `'login'`. Também grava `email_login_events` com `impersonated_by=<dev>` preenchido.
- **`send-tracking-email`**: `type='impersonation_login'` usa `buildImpersonationLoginEmail` (assunto "🎭 [DEV] Sessão impersonada iniciada", corpo âmbar que separa "Quem entrou (dev)" de "Conta acessada"). Ignora `notify_on_login` (sempre envia, respeitando só `enabled`).
- **`DevAccessHistory`**: linhas com `event_type` começando com `impersonation_` renderizam com fundo âmbar, badge "Impersonation", e label "<dev> entrou como <cliente>".

## Regra da segurança

- Senha do alvo nunca é lida nem alterada — `generateLink` só emite token de uso único.
- Alvo `developer`/`admin` é bloqueado no server-side (evita escalonamento).
- Impersonation nunca via RLS permissiva; sempre via edge function service-role (segue `mem/architecture/dev-access-isolation.md`).
- `logout()` numa aba impersonada: pula update de `user_presence` do cliente, limpa `sessionStorage['lovable_impersonation_active']`, tenta `window.close()`.

## Arquivos-chave

- `supabase/functions/dev-impersonate-user/index.ts` (edge function).
- `supabase/config.toml` (`verify_jwt = true` para essa função).
- `src/pages/Impersonate.tsx` (rota `/impersonate`, pública).
- `src/integrations/supabase/client.ts` (chaveia sessionStorage vs localStorage).
- `src/contexts/AuthContext.tsx` (`isImpersonating`, `impersonatedBy`, insere `impersonation_login`).
- `src/hooks/usePresenceHeartbeat.ts` (desvia comportamento).
- `src/components/ImpersonationBanner.tsx` (banner âmbar global, montado em `App.tsx`).
- `src/components/dev-panel/DevUsersList.tsx` (botão + dialog).
- `src/components/dev-panel/DevAccessHistory.tsx` (renderização diferenciada).
- Migração `email_login_events.impersonated_by uuid nullable`.
