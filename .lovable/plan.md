# Plano — Cadastro por solicitação + aprovação + limpeza MED003

## Visão geral

Substituir o cadastro público aberto por um fluxo de **solicitação → aprovação manual → finalização de senha**, com auditoria completa e sem expor a criação de usuários ao público. Também remover a conta MED003 (que está sem atividade).

## Segurança — como isso fica absolutamente seguro

1. **Signup público do Auth fica desligado** (`disable_signup=true`). Ninguém consegue criar conta direto pelo site — nem por dev tools, nem por chamada à API pública. É a única forma de fechar de verdade.
2. Nada na tabela de solicitações concede acesso ao app. Solicitação ≠ usuário. A conta em `auth.users` só nasce quando **você** aprovar, via edge function que roda com service-role e valida `is_developer()`.
3. Link de finalização é **token de uso único** emitido pelo próprio Auth (`generateLink` tipo `invite`), consumido uma única vez em `/finalizar-cadastro`. Expira automaticamente. Não é URL adivinhável — é um hash assinado pelo Auth.
4. A senha nunca passa por email nem por nenhuma tabela nossa. O convidado define a senha no navegador dele via `supabase.auth.updateUser({ password })` já com a sessão emitida pelo token de convite.
5. Toda a lógica sensível (criar auth user, gerar link, enviar email, cancelar/deletar solicitação) roda em edge functions dedicadas com `verify_jwt=true` + checagem de `is_developer()` no server-side. Nada disso é chamável por usuário comum.
6. RLS na tabela de solicitações: `INSERT` público (é o formulário), `SELECT`/`UPDATE`/`DELETE` **somente** via service-role em edge function (nunca policy `is_developer()` na tabela — seguindo a regra `mem/architecture/dev-access-isolation.md`).
7. Rate limit simples no INSERT (1 solicitação por email a cada 24h) para evitar flood do seu inbox.
8. Validação de input com Zod nas duas edge functions (formato de email, tamanho de campos, sanitização básica).
9. Você recebe email via Resend a cada nova solicitação, com todos os dados + link para o DevPanel — evita depender de você olhar o painel para descobrir que existe pedido.

## Mudanças de banco (via migração)

Nova tabela `signup_requests`:
- `id uuid pk`
- `nome_completo text not null`
- `login_desejado text` (informativo — o MED### real continua sendo gerado automaticamente pelo trigger `handle_new_user`, para não quebrar a numeração)
- `email text not null` (com índice único parcial em pendentes para evitar duas solicitações abertas do mesmo email)
- `medico_vinculado text not null`
- `informacoes_adicionais text not null` (obrigatório, min 20 chars)
- `status text not null default 'pending'` (`pending` | `approved` | `rejected` | `cancelled`)
- `created_at`, `reviewed_at`, `reviewed_by uuid`, `review_notes text`
- `invite_sent_at timestamptz`, `invite_user_id uuid` (referência ao `auth.users.id` criado quando aprovado)

GRANTs conforme regra: `INSERT` para `anon` e `authenticated` (formulário público), `SELECT/UPDATE/DELETE` apenas para `service_role`. RLS com policy `INSERT` liberada e nenhuma outra policy — leitura só via edge function.

## Auth — desligar signup público

Chamar `configure_auth` com `disable_signup=true` (mantendo o resto como está). Contas existentes continuam funcionando normalmente.

## Frontend

1. **`src/pages/Login.tsx`** — aba "Cadastrar" passa a chamar a nova tela/dialog de solicitação (não mais `signup()` direto). Remover/desabilitar o método `signup` do `AuthContext` (ou deixar mas sem uso — prefiro remover para não haver caminho oculto).
2. **Nova tela `/solicitar-cadastro`** com os 5 campos:
   - Nome completo (obrigatório)
   - Login desejado (obrigatório, informativo)
   - Email (obrigatório, validado)
   - Nome do médico vinculado (obrigatório)
   - Informações adicionais (obrigatório, textarea, placeholder: *"Deixe mais informações sobre sua autorização de uso do app — cliente vinculado, motivo do acesso, etc."*)
   - Botão "Solicitar novo cadastro"
   - Após submit bem-sucedido: tela de confirmação "Aguarde liberação e email com link para finalizar cadastro."
3. **Nova página `/finalizar-cadastro`** (pública, sem `ProtectedRoute`) — lê o `token_hash` da URL, chama `verifyOtp({ type: 'invite', token_hash })`, mostra dois campos (senha / confirmar senha) com validação (mínimo 8 chars, força), chama `updateUser({ password })`, dá `signOut` e redireciona para `/` com toast "Cadastro finalizado, faça login."
4. **DevPanel** — nova aba **"Solicitações de cadastro"** (ícone `UserPlus` ou `Mail`) adicionada a `src/pages/DevPanel.tsx` e novo componente `src/components/dev-panel/DevSignupRequests.tsx`. Lista pedidos com filtro (pendente / aprovado / rejeitado / cancelado), exibe todos os campos, mostra ações **Aprovar**, **Rejeitar** e **Cancelar**. Cada ação chama edge function dedicada e recarrega a lista.

## Edge functions (novas)

Todas com CORS, Zod, `verify_jwt=true` (exceto a de criar solicitação), e as de review chamam `is_developer()` antes de qualquer coisa.

1. **`signup-request-create`** (`verify_jwt=false`, pública) — recebe o formulário, valida com Zod, checa rate-limit por email (1 solicitação pendente e nenhuma outra nas últimas 24h para o mesmo email), insere em `signup_requests`, envia email pelo Resend para `diogomixcds@gmail.com` (e/ou o email que você definir) com resumo + link para o DevPanel. Retorna 200 sem revelar se o email já existia (evita enumeração).
2. **`signup-request-approve`** (`verify_jwt=true`) — valida `is_developer()`, carrega a solicitação, chama `supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })`, chama `supabase.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: '<origem>/finalizar-cadastro' } })`, envia email via Resend para o solicitante com o link. Atualiza `status='approved'`, `invite_sent_at`, `invite_user_id`, `reviewed_by`, `reviewed_at`. O trigger `handle_new_user` já cria `profiles` (com MED### auto) e `user_modules` default — nada muda aí.
3. **`signup-request-reject`** (`verify_jwt=true`) — valida `is_developer()`, marca `status='rejected'` com nota opcional. Não cria auth user, não envia email ao solicitante (ou envia um "não aprovado" curto, sob sua escolha — no plano inicial: **não envia**).
4. **`signup-request-list`** (`verify_jwt=true`) — valida `is_developer()`, retorna as solicitações com filtro por status/paginação. Mantém a regra de isolamento do dev: tabela sem policy `is_developer()`.
5. **`signup-request-cancel`** (`verify_jwt=true`) — valida `is_developer()`, marca `status='cancelled'` (equivalente a "descartar"). Se já havia sido aprovado, apenas marca a solicitação como cancelada sem tocar no auth user já criado (evita deletar por acidente uma conta que já esteja em uso). Um botão separado de "Excluir conta" pode ser oferecido depois, se quiser.

Todas registram em `access_logs` com `event_type='signup_request_*'` para auditoria.

`supabase/config.toml` recebe uma entrada para cada função nova (só `verify_jwt`).

## Emails (via Resend, integração já existente)

- **Email para você (admin)** quando surge nova solicitação: assunto "Nova solicitação de cadastro — <nome>", corpo com todos os campos e link para `/dev-panel` (aba Solicitações).
- **Email para o solicitante** quando aprovado: assunto "Seu acesso ao Tenório foi liberado", CTA "Definir minha senha" apontando para o link `token_hash` gerado. Template curto, marca visual do app, sem expor implementação. Uso do `RESEND_API_KEY` que já está configurado.

## Limpeza da conta MED003 (Anne Bianca)

Execução idempotente via SQL (nenhum dado de domínio existe para ela — checado: 0 laudos, 0 pautas, 0 perícias, 0 imports, 0 IA, 0 impugnações, 0 access_logs, só a linha default em `user_modules`):

1. `delete from public.user_modules where user_id = '07420590-8fb6-459d-9252-533d79e2edc9';`
2. `delete from public.user_roles where user_id = '07420590-8fb6-459d-9252-533d79e2edc9';` (se existir)
3. `delete from public.user_settings where user_id = '07420590-8fb6-459d-9252-533d79e2edc9';` (se existir)
4. `delete from public.profiles where id = '07420590-8fb6-459d-9252-533d79e2edc9';`
5. `delete from auth.users where id = '07420590-8fb6-459d-9252-533d79e2edc9';` — via chamada `supabase.auth.admin.deleteUser` na edge function `delete-user` já existente (não precisa mexer no schema `auth` diretamente).

Feito como último passo, depois que o signup público estiver bloqueado, para garantir que ela não recrie a conta.

## O que este plano NÃO faz

- Não altera nada em: laudos, pautas, perícias, impugnação, financeiro, OCR, IA, prompts, exports, DevPanel existente (só **adiciona** a aba nova), bundle/Vite, RLS de tabelas de domínio, edge functions de negócio, presença, impersonation, tracking de email já existente.
- Não expõe o cadastro real a nenhum caminho público — o único endpoint público é o de criar **solicitação**, que só grava uma linha auditada.
- Não altera Bruno (MED001) nem Diogo (MED002).

## Verificação final após implementar

1. Tentar `supabase.auth.signUp` direto pelo console → erro "signups not allowed".
2. Formulário público de solicitação → cria linha em `signup_requests` + email chega no seu inbox.
3. DevPanel → aba Solicitações → aprovar → email chega no solicitante → link abre `/finalizar-cadastro` → senha definida → login funciona.
4. Segundo clique no mesmo link → falha (token consumido).
5. Rejeitar / cancelar → status atualizado, sem criar auth user.
6. `select count(*) from auth.users` → volta a ser 2 depois da limpeza do MED003.

Confirma esse desenho para eu executar?
