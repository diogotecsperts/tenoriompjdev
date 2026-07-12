# Correção do fluxo de aprovação de cadastros

## Diagnóstico do bug (por que "Aprovar" não fazia nada)

Nos logs da edge function `signup-request-approve` aparece o erro real:

```
generateLink failed AuthApiError: A user with this email address has already been registered
status: 422, code: "email_exists"
```

Sequência atual da função:

1. `admin.auth.admin.createUser({ email, email_confirm: true })` → cria o usuário.
2. `admin.auth.admin.generateLink({ type: 'invite', email })` → **falha** porque `type: 'invite'` só funciona para email que ainda **não** existe em `auth.users`. Como acabamos de criar o usuário no passo 1, o passo 2 sempre estoura `email_exists` (422).
3. A função retorna 500, o frontend não mostra erro claro (ou o toast some), a solicitação permanece `pending`, nenhum email é disparado.

Ou seja: não é problema de Resend nem de RLS, é a combinação `createUser` + `generateLink(invite)` que é incompatível.

## Correção do approve

Trocar a estratégia de geração de link:

- **Não** pré-criar o usuário no passo 1.
- Chamar `admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name }, redirectTo: '<origem>/finalizar-cadastro' } })` diretamente — o próprio `generateLink('invite')` cria o `auth.users` já com email confirmado E devolve o `action_link` de uso único.
- Se o email já existir em `auth.users` (retentativa de aprovação, ou usuário criado numa tentativa anterior antes do fix), fazer fallback para `type: 'recovery'` no mesmo email, que também emite um link one-shot compatível com o `/finalizar-cadastro` (a página já usa `verifyOtp` genérico + `updateUser({ password })`, então serve para os dois tipos).
- Guardar o `invite_user_id` a partir do `linkData.user.id` retornado por `generateLink`.
- Continuar mandando o email via Resend com o `action_link`, como já está.

Nenhum outro passo (audit log, update de `signup_requests`, CORS, `is_developer()`) muda.

## Novos status e visão do DevPanel

Hoje só temos `pending / approved / rejected / cancelled`. Passa a ser:

| status                    | quando                                              | mostra no painel |
| ------------------------- | --------------------------------------------------- | ---------------- |
| `pending`                 | solicitação recém-criada                            | sim              |
| `awaiting_finalization`   | admin aprovou e email foi enviado, aguardando senha | sim              |
| `completed`               | usuário definiu a senha e finalizou o cadastro      | sim              |
| `rejected`                | admin recusou                                       | sim              |
| `cancelled`               | admin cancelou/descartou                            | sim              |

Migração adiciona os dois novos valores permitidos ao CHECK/enum de `status` (mantendo os antigos para não invalidar linhas existentes; `approved` legado é tratado como sinônimo visual de `awaiting_finalization` na lista, para não perder histórico).

Nenhuma solicitação sai da tela — só muda de coluna/badge. O componente `DevSignupRequests.tsx` passa a:

- Exibir todos os status com badges coloridos distintos (`awaiting_finalization` = âmbar "Aguardando finalização", `completed` = verde "Cadastro finalizado", `pending` = azul, `rejected`/`cancelled` = cinza/vermelho).
- Botões de ação (Aprovar / Rejeitar / Cancelar) só aparecem quando `status === 'pending'`. Nos demais status, mostra a data do último evento (`reviewed_at`, `invite_sent_at`, `finalized_at`).
- Filtro por status no topo (chips), com "Todos" como padrão.

## Marcar como finalizado ao definir a senha

Novo campo `finalized_at timestamptz` na tabela `signup_requests`.

Nova edge function **`signup-request-finalize`** (`verify_jwt=true`):

- Recebe a sessão do usuário recém-autenticado (que acabou de definir a senha em `/finalizar-cadastro`).
- Extrai `sub` (user id) do JWT via `getClaims`.
- Localiza a linha `signup_requests` com `invite_user_id = sub` e `status IN ('approved','awaiting_finalization')`.
- Atualiza `status = 'completed'`, `finalized_at = now()`.
- Grava `access_logs` com `event_type='signup_request_finalized'`.

Fluxo no frontend em `src/pages/FinalizarCadastro.tsx`: logo após `supabase.auth.updateUser({ password })` bem-sucedido e **antes** do `signOut`, chamar `supabase.functions.invoke('signup-request-finalize')`. Se falhar (não deveria, mas por segurança), apenas loga — o usuário já tem senha e consegue entrar; o status ficaria como `awaiting_finalization` visualmente e um botão "Marcar como finalizado" opcional no DevPanel pode ser adicionado depois se quiser (não incluso neste plano para manter escopo).

## Melhor tratamento de erro no botão Aprovar

No `DevSignupRequests.tsx`, quando `functions.invoke('signup-request-approve')` retorna erro, hoje o toast pode não mostrar a causa real. Passa a:

- Ler `error.context.text()` (padrão FunctionsHttpError) e exibir no toast a mensagem retornada pela edge function, para nunca mais "confirmar e não acontecer nada" silenciosamente.
- Adicionar `console.error` completo para depuração.

## Arquivos afetados

- `supabase/functions/signup-request-approve/index.ts` — trocar lógica de link (invite direto + fallback recovery), remover pré-createUser.
- `supabase/functions/signup-request-finalize/index.ts` — **novo**, marca `completed`.
- `supabase/config.toml` — registrar `verify_jwt=true` para a nova função.
- `supabase/migrations/*.sql` — nova migração: adicionar valores `awaiting_finalization` e `completed` ao check/enum de `status`, adicionar coluna `finalized_at`.
- `src/components/dev-panel/DevSignupRequests.tsx` — novos badges, filtros, condicional dos botões, melhor toast de erro.
- `src/pages/FinalizarCadastro.tsx` — chamar `signup-request-finalize` após `updateUser`.
- `src/integrations/supabase/types.ts` — refletir novo campo `finalized_at` e novos status (regenerado automaticamente pela migração).

## Fora do escopo

Nada é tocado em: laudos, pautas, perícias, impugnação, financeiro, OCR, IA, prompts, exports, DevPanel além da aba Solicitações, RLS de tabelas de domínio, presença, tracking de email, bundle/Vite, roteamento, Auth config (`disable_signup` continua `true`).

## Verificação após implementar

1. Aprovar uma solicitação `pending` → toast de sucesso, linha muda para `awaiting_finalization` no painel, email chega no solicitante.
2. Solicitante abre link, define senha em `/finalizar-cadastro` → linha muda para `completed` no painel; segundo clique no mesmo link falha (token consumido).
3. Aprovar solicitação cujo email já exista em `auth.users` → fallback `recovery` gera link, sem 422.
4. Rejeitar/Cancelar → status atualizado, sem enviar email, sem criar auth user.
5. Toast passa a mostrar o motivo real quando qualquer edge function falha.
