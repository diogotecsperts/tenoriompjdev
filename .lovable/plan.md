## Diagnóstico

- Solicitação atual: `diogotecinove@gmail.com` (Ruane) está em **awaiting_finalization** com `invite_user_id = fdc6caf5-...`, e o perfil MED003 já existe.
- Erro final vem do fato de a página `/finalizar-cadastro` receber uma URL sem `token_hash` e sem sessão válida — o link atual passa por uma etapa intermediária de auth que quebra os parâmetros antes de chegar na rota final.
- Solução robusta: gerar o link com destino direto para `/finalizar-cadastro?token_hash=...&type=invite`, e limpar antes cada tentativa falha para não travar em "email já registrado" ou estado inconsistente.

## Plano de correção

### 1. Limpeza da tentativa falha atual (Ruane / diogotecinove@gmail.com)

Antes de qualquer nova correção, apagar em cascata todos os vestígios dela para permitir uma nova aprovação limpa:

- Remover linhas em: `access_logs`, `ai_usage_logs`, `email_login_events`, `error_logs`, `financeiro`, `import_jobs`, `impugnacoes`, `laudos`, `modelos_laudo`, `prev_documentos`, `prev_pericias`, `prev_pautas`, `prev_processing_jobs`, `user_modules`, `user_presence`, `user_settings`, `user_roles` para o `user_id` `fdc6caf5-...`.
- Remover `signup_requests` por email.
- Remover `profiles` por id.
- Remover `auth.users` por id.
- Dev `diogomixcds@gmail.com` (MED002) NÃO é tocado.

### 2. Corrigir a geração do link de aprovação

- Na função de aprovação, extrair `token_hash` e `type` do link bruto retornado pelo provedor de auth.
- Montar o link final apontando direto para a app:
```text
/finalizar-cadastro?token_hash=...&type=invite
```
- Fallback quando email já existir: usar `type=recovery` no mesmo formato.
- Enviar esse link direto no email (não o link intermediário).

### 3. Blindar a página `/finalizar-cadastro`

- Aceitar explicitamente `type=invite` e `type=recovery`.
- Se `token_hash` ausente e sem sessão, mensagem clara: link incompleto/quebrado pelo cliente de email, com botão para nova solicitação.
- Manter o gate de segurança: só permite `updateUser({ password })` com sessão viva criada pelo próprio link, e não deixa entrar no app antes da senha ser definida.

### 4. Política de limpeza automática em cada tentativa

Adicionar rotina padrão de "reset" a ser executada sempre que uma tentativa falhar durante essa fase de implementação:

- Query de verificação: quais `signup_requests` do email estão em `pending`/`approved`/`awaiting_finalization` e quais `auth.users`/`profiles` órfãos existem.
- Cascade delete padrão nas mesmas tabelas listadas no item 1, parametrizada por email + user_id.
- Só então reaprovar / reenviar convite.

### 5. Validação final

- Reaprovar a solicitação da Ruane após limpeza.
- Confirmar que o email chega com link `/finalizar-cadastro?token_hash=...&type=invite`.
- Confirmar que a tela de senha abre, aceita a senha, marca solicitação como `completed`, desloga e força login normal.
- Confirmar que tentar login antes de finalizar continua bloqueado.

## Resultado esperado

- Cada iteração parte de estado limpo, sem "email_exists" nem sessão fantasma.
- O próximo link enviado abre direto na tela de senha e conclui o cadastro sem erro de sessão.