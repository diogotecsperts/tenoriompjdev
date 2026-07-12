## Diagnóstico

Nos logs de auth, o link do email funcionou: `GET /verify` retornou 303 e criou sessão válida (`user_signedup` + `Login` para `fcd13787-…` / `diogotecinove@outlook.com`, `GET /user` 200). Logo em seguida veio um `POST /logout` — disparado pelo meu próprio código.

Causa: o gate que adicionei no `AuthContext.loadUserData` faz `signOut` sempre que encontra um `signup_requests` do usuário atual com `status IN ('approved','awaiting_finalization')` e `finalized_at IS NULL`. Esse é exatamente o estado durante a finalização, então o gate se auto-sabota:

1. Ruane clica no link → Supabase cria sessão → `onAuthStateChange` dispara.
2. `AuthContext.loadUserData` roda, vê `awaiting_finalization`, faz `signOut`.
3. `FinalizarCadastro` valida o link em paralelo, mas na próxima checagem `getSession()` já retorna null → cai em `error` com "Link inválido".

Sobre a sessão de dev aberta: contribuiu para a confusão (o `setSession` do link substituiu sua sessão de dev no localStorage da aba), mas não é a causa. O bug aconteceria em aba anônima também. Para futuros testes, aba anônima evita esse acoplamento.

## Correção

**`src/contexts/AuthContext.tsx`**
- No trecho do gate de `signup_requests`, adicionar exceção para a rota `/finalizar-cadastro`: se `window.location.pathname` começar com `/finalizar-cadastro`, pular o `signOut` e deixar o fluxo normal seguir. Em qualquer outra rota, o comportamento atual é mantido (usuário com `awaiting_finalization` é deslogado ao tentar entrar em `/`, `/dashboard`, etc.).
- Nada mais muda no `AuthContext` (loadUserData, profile fetch, roles, modules seguem iguais).

## Limpeza da Ruane travada

O clique no link deixou:
- `auth.users` `fcd13787-ff48-4b0b-860a-4d2213617db1` (Ruane / `diogotecinove@outlook.com`) confirmado mas provavelmente sem senha definida.
- Provavelmente `profiles` + `user_modules` + `user_roles` + `user_settings` criados pelos triggers `handle_new_user*`.
- `signup_requests` da Ruane em `awaiting_finalization`.

Antes de deletar, rodo `read_query` para confirmar exatamente o que existe. Depois, na mesma ordem da limpeza anterior (via `insert` tool), delete direcionado ao id `fcd13787-…`:

1. `access_logs` where `user_id = 'fcd13787-…'`
2. `user_presence` where `user_id = 'fcd13787-…'`
3. `user_modules` where `user_id = 'fcd13787-…'`
4. `user_settings` where `user_id = 'fcd13787-…'`
5. `user_roles` where `user_id = 'fcd13787-…'`
6. `profiles` where `id = 'fcd13787-…'`
7. `signup_requests` where `invite_user_id = 'fcd13787-…'` (remove a linha travada)
8. `auth.users` where `id = 'fcd13787-…'`

Seu usuário dev `diogomixcds@gmail.com` (`bec…` — MED002, Diogo Silva) **não é tocado**. Nenhuma solicitação `pending` sua é afetada.

## Verificação pós-correção

1. Você refaz a solicitação de cadastro para `diogotecinove@outlook.com` (ou outro email).
2. Aprovar no DevPanel → email chega (agora do domínio verificado, sem o bug do onboarding).
3. **Abrir o link em aba anônima** para não misturar com sua sessão de dev.
4. Página abre em "Finalizando cadastro" → "Validando seu link…" → formulário de senha aparece.
5. Definir senha → `updateUser` → `signup-request-finalize` → `signOut` → redirect para `/`.
6. No painel do dev, a linha da solicitação passa de `awaiting_finalization` para `completed`.
7. Testar segurança do gate: em outra aba, tentar acessar `/dashboard` com uma solicitação em `awaiting_finalization` (antes de definir senha) → app desloga e mostra toast — comportamento preservado fora de `/finalizar-cadastro`.

## Fora de escopo

Sem mexer em `signup-request-approve` (corrigido no turno anterior), `FinalizarCadastro`, migrations, RLS, `config.toml`, outras edge functions ou telas.
