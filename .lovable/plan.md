
# Correção do fluxo Finalizar Cadastro + limpeza segura do teste Ruane

## Status atual (verificado no banco antes de mexer em qualquer coisa)

- Nada foi alterado no turno interrompido — nenhum código, migração ou delete rodou.
- Seu usuário dev `diogomixcds@gmail.com` (MED002, Diogo Silva) **não vai ser tocado**. Fica intacto com todos os 75 laudos, 12 pautas, 18 perícias etc.
- O usuário de teste é `diogotecinove@gmail.com` = `MED003 / Ruane Silva` (id `c6235453-ef3f-45c1-b79c-55524b451d92`). Tem zero laudos/pautas/perícias/financeiro/impugnações — é seguro apagar.
- Existe também a linha `signup_requests` id `2af7c84e-2080-403c-9260-8f4e951b2429` em `awaiting_finalization` referente a essa Ruane.

## Diagnóstico dos dois bugs reais

### Bug 1 — "Validando seu link..." trava e Ruane entrou no painel sem definir senha

Como o Supabase gera link do tipo `invite`/`recovery`, o fluxo é:

1. Ao clicar no link, o servidor Supabase faz `GET /verify` e responde **303** redirecionando para `…/finalizar-cadastro#access_token=…&refresh_token=…`.
2. A página chama `supabase.auth.setSession({access_token, refresh_token})`. **Isso cria uma sessão real e persistente** no localStorage antes de a senha ser definida.
3. O `handle_new_user` já criou o profile MED003 na hora em que `generateLink({type:'invite'})` gerou o `auth.users`. Ou seja, no instante em que o admin apertou "Aprovar", o usuário virou uma conta funcional. O link só serviu para logar.
4. Se algo trava no rendering do FinalizarCadastro (ex.: `onAuthStateChange` do AuthContext tenta hidratar profile e a página fica em `verifying`), o usuário sai da aba, e como a sessão persiste, ao abrir a raiz do site **entra direto no painel sem senha**. Foi exatamente o que você viu.

Isso é uma falha de segurança: o link do email dá acesso mesmo sem trocar a senha.

### Bug 2 — UX ruim da tela

Título errado ("Finalizar cadastro" em vez de "Finalizando cadastro") e o subtítulo "Defina uma senha para acessar o Tenório MPJ" aparece antes de o link ser validado, dando falsa impressão de campo pronto.

## Correções

### 1) Gate de acesso: sem senha finalizada, sem entrar no app

No `AuthContext.loadUserData`, logo após carregar o profile, consultar `signup_requests` pelo `invite_user_id = auth.uid()`:

- Se existir uma linha com `status IN ('approved','awaiting_finalization')` **e** `finalized_at IS NULL`, forçar `signOut` imediatamente e mostrar toast: "Você precisa concluir seu cadastro pelo link enviado no email antes de acessar o sistema." Redirecionar para `/`.
- Se `status = 'completed'` ou não houver linha, segue o fluxo normal.

Regra RLS: adicionar em `signup_requests` uma policy `SELECT` para `authenticated` restrita a `invite_user_id = auth.uid()`, para que o próprio usuário consiga se auto-checar (a policy atual só permite leitura via service-role).

Assim, mesmo se o link do email criar sessão persistente, o app impede o acesso enquanto `finalized_at` não estiver preenchido. O único caminho que preenche `finalized_at` é a edge function `signup-request-finalize`, que só é chamada após `updateUser({ password })` bem-sucedido em `/finalizar-cadastro`.

### 2) Robustez de `FinalizarCadastro.tsx`

- Renomear título para **"Finalizando cadastro"**.
- Mover o subtítulo "Defina uma senha para acessar o Tenório MPJ." para dentro do bloco `status === 'ready' | 'saving'`, junto do formulário. Nos estados `verifying` e `error`, o subtítulo some.
- Estado `verifying`: mostrar apenas o spinner + texto "Validando seu link..." (mensagem única e centralizada, sem outras instruções).
- Suportar os três formatos que o Supabase pode entregar: `token_hash` em query/hash (chama `verifyOtp`), fragmento `access_token+refresh_token` no hash (chama `setSession`), ou fallback com sessão já ativa. Isso já existe, mas vou adicionar timeout de 8s: se ainda estiver em `verifying`, cair em `error` com "Não conseguimos validar o link. Peça um novo cadastro."
- Após o `updateUser({ password })` de sucesso, chamar `signup-request-finalize` e **só depois** fazer `signOut`. Se o `signup-request-finalize` falhar, ainda assim faz `signOut` e mostra toast pedindo para tentar login manualmente (a senha já foi salva).
- Limpar o hash da URL após consumir os tokens (`window.history.replaceState`), para o link não ficar reutilizável ao dar refresh.

### 3) Melhoria defensiva no `signup-request-approve`

Continuar usando `generateLink({type:'invite'})` como está (o link é one-shot no Supabase), mas garantir que o `redirect_origin` recebido do frontend seja usado quando presente — hoje já é, apenas confirmar. Sem mudança de comportamento se você aprovar pelo painel publicado.

## Limpeza do teste Ruane / diogotecinove@gmail.com

Via `insert` tool (SQL de UPDATE/DELETE), na ordem correta para não violar FKs:

1. `DELETE FROM public.access_logs WHERE user_id = 'c6235453-…'` (logs do MED003, se houver — a tabela pertence a ele).
2. `DELETE FROM public.user_presence WHERE user_id = 'c6235453-…'`.
3. `DELETE FROM public.user_modules WHERE user_id = 'c6235453-…'`.
4. `DELETE FROM public.user_settings WHERE user_id = 'c6235453-…'`.
5. `DELETE FROM public.user_roles WHERE user_id = 'c6235453-…'`.
6. `DELETE FROM public.profiles WHERE id = 'c6235453-…'`.
7. `DELETE FROM public.signup_requests WHERE id = '2af7c84e-…'` (a solicitação de teste sai do painel, e não fica "órfã" apontando para um user_id inexistente).
8. `DELETE FROM auth.users WHERE id = 'c6235453-…'` — remove o usuário do Supabase Auth para que o email `diogotecinove@gmail.com` possa ser reaprovado do zero sem cair no fallback de `recovery`.

Seu usuário dev `diogomixcds@gmail.com` **não é tocado** — todos os DELETEs filtram exclusivamente pelo id `c6235453-ef3f-45c1-b79c-55524b451d92`.

Nenhuma solicitação `pending` sua sai do painel — só a `2af7c84e-…` (a de teste) é apagada.

## Verificação pós-implementação

1. Refazer solicitação usando `diogotecinove@gmail.com` na página pública → chega email para você aprovar.
2. Aprovar → email chega no endereço solicitante, linha vira `awaiting_finalization`.
3. Se o solicitante tentar ir direto para o painel/qualquer rota (sem ter setado senha), o app faz signOut na hora e mostra o aviso.
4. Solicitante abre o link do email → tela "Finalizando cadastro" com "Validando seu link..." → em <2s aparece o formulário de senha (agora com o subtítulo). Define senha → chamada `signup-request-finalize` → `signOut` → login normal.
5. Painel do dev: linha agora aparece como "Cadastro finalizado".
6. Refresh na URL do link já usado ou segundo clique → mostra estado de `error` com mensagem clara e botão de nova solicitação.

## Fora do escopo

Não são alterados: laudos, pautas, perícias, impugnação, financeiro, OCR, IA, prompts, exports, RLS de tabelas de domínio, presença, tracking de email, `disable_signup` (segue `true`), demais abas do DevPanel.

## Arquivos afetados

- `src/contexts/AuthContext.tsx` — gate `finalized_at` após loadUserData.
- `src/pages/FinalizarCadastro.tsx` — título/subtítulo, timeout, ordem finalize→signOut, replaceState do hash.
- `supabase/migrations/*.sql` — policy `SELECT` em `signup_requests` para `authenticated` filtrada por `invite_user_id = auth.uid()`.
- **Sem alterações** em `signup-request-approve`, `signup-request-finalize`, `signup-request-list`, `signup-request-create`, `signup-request-reject`, `signup-request-cancel`, `config.toml`.
- Limpeza via `insert` tool (DELETEs dirigidos ao id do MED003) — sem nova migração de schema.
