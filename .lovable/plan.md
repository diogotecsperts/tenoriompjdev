## Diagnóstico

O erro **"Auth session missing!"** ao definir a senha vem da ausência de perfil (`profiles`) para o usuário recém-criado via `generateLink({type:'invite'})`.

Sequência real:
1. Aprovar → `admin.auth.admin.generateLink` cria o `auth.users`.
2. Ruane clica no link → `verifyOtp` cria sessão.
3. `AuthContext.loadUserData` roda → `profiles` retorna `data === null` sem erro.
4. Cai no ramo "Usuário autenticado sem perfil válido" → chama `supabase.auth.signOut()`.
5. Sessão vai embora antes do submit.
6. `updateUser({password})` → **Auth session missing!**.

**Raiz:** o bloco `<db-triggers>` confirma **"There are no triggers in the database"**. As funções `handle_new_user`, `handle_new_user_role`, `handle_new_user_settings`, `handle_developer_email` existem, mas nenhum trigger em `auth.users` está ativo. Como a regra do projeto proíbe criar trigger no schema `auth`, a inserção precisa ser feita explicitamente no fluxo de aprovação via service role.

## Escopo

### 1. `supabase/functions/signup-request-approve/index.ts`
Depois do `generateLink` bem-sucedido (ramos `invite` e fallback `recovery`), com `userId` em mãos, chamar `ensureUserBootstrap(admin, userId, email, fullName)` **antes** de disparar o email do Resend. A função é idempotente:

- Gera próximo `user_id` `MED{NNN}` (mesma lógica do `handle_new_user`: `MAX(SUBSTRING(user_id FROM 4)::int) + 1` em `profiles` com `user_id LIKE 'MED%'`).
- `INSERT ... ON CONFLICT (id) DO NOTHING` em `profiles(id, nome, email, user_id)`.
- `INSERT ... ON CONFLICT (user_id, role) DO NOTHING` em `user_roles` com `'user'`.
- `INSERT ... ON CONFLICT (user_id) DO NOTHING` em `user_settings`.
- `INSERT ... ON CONFLICT (user_id, module) DO NOTHING` em `user_modules` com `'trabalhista' = true`.
- Se `email === 'diogomixcds@gmail.com'`, também insere `user_roles` com `'developer'` (`ON CONFLICT DO NOTHING`).

Se qualquer insert falhar, aborta antes do email do Resend e devolve `{ error, hint }` traduzidos (ex.: `"Não foi possível criar o perfil do novo usuário"`).

### 2. `src/pages/FinalizarCadastro.tsx`
Blindagem + mensagem clara na etapa da senha:

- Antes do `updateUser({password})`, `const { data: { session } } = await supabase.auth.getSession()`. Se `!session`, ir para `status="error"` com mensagem: **"Sua sessão expirou. O link de acesso é de uso único — solicite um novo cadastro para receber outro link."** e mostrar o email da tentativa (extraído de `session?.user?.email` quando ainda havia sessão, ou capturado no estado logo após o `verifyOtp`/`setSession` para exibir mesmo depois do signOut). Botão "Solicitar novo cadastro" já existe.
- Se `updateUser` retornar `error.message === "Auth session missing!"` ou similar, traduzir para a mesma mensagem amigável (não expor o texto cru em toast).
- Também traduzir a mensagem "Link inválido" atual da fase de verificação: **"Link inválido ou já utilizado (cada link é de uso único). Solicite um novo cadastro."** — mantendo o botão de novo cadastro. Emitir `console.warn` com o motivo original (`type`, presença de `token_hash`/`access_token`, código de erro do `verifyOtp`) para facilitar diagnóstico futuro sem vazar dados sensíveis para o usuário.

### 3. `src/contexts/AuthContext.tsx` — logs de telemetria no gate
Sem alterar comportamento. Apenas adicionar `console.info` / `console.warn` marcados com prefixo `[auth-gate]` nos pontos:

- Detecção de perfil inexistente (antes do `signOut`), incluindo `pathname` e `session.user.id`.
- Detecção de `signup_requests` pendente (antes do `signOut`), incluindo `pathname`, `request.status` e `request.id`.
- Bypass do gate quando `isFinalizingCadastro === true` (para confirmar em produção que a exceção da rota está funcionando).

Logs só no cliente, sem PII sensível além do `user.id`, sem nova tabela.

## Fora do escopo
- Migrações no schema `auth`.
- Teste E2E automatizado — infra Playwright/Cypress inexistente no projeto e alto custo de mock (Resend/verifyOtp). Cobertura via teste manual descrito abaixo.
- `signup-request-finalize`, `signup-request-create`, `signup-request-list`, `signup-request-reject`, `signup-request-cancel`, `DevSignupRequests.tsx`, `SolicitarCadastro.tsx`, `Login.tsx`.

## Teste manual pós-implementação
1. Nova solicitação em `/solicitar-cadastro` com email novo.
2. Aprovar em `/dev` → conferir no banco que já existem linhas em `profiles`, `user_roles`, `user_settings`, `user_modules` para o novo `auth.users.id` (e `developer` extra se o email casar).
3. Abrir link do email em aba anônima → `/finalizar-cadastro` → definir senha → sucesso → redirect → login normal.
4. Repetir o clique no mesmo link já usado → deve ver "Link inválido ou já utilizado..." com botão de novo cadastro e `console.warn [auth-gate]` opcional se sessão residual.
5. Console do navegador durante o fluxo mostra `[auth-gate] bypass em /finalizar-cadastro` confirmando a exceção da rota.
