## Objetivo
Confirmar que o fluxo de aprovação → link de finalização → definição de senha → login funciona sem deslogar o usuário e sem deixar solicitações presas.

## Passos

1. **Limpeza preventiva**
   - Verificar se ainda existem resíduos da tentativa anterior (`diogotecinove@gmail.com`, `MED003`).
   - Remover usuário, perfil, solicitação e registros relacionados se ainda existirem, para partir de estado limpo.

2. **Nova solicitação e aprovação**
   - Criar uma nova solicitação de cadastro para `diogotecinove@gmail.com`.
   - Aprovar via DevPanel/edge function `signup-request-approve`.
   - Confirmar em `access_logs` o evento `signup_link_generated` com fingerprint do token.

3. **Captura do link**
   - Recuperar o link de finalização gerado (via logs de email ou banco, sem expor o token completo).

4. **Teste no navegador**
   - Abrir o link de finalização em nova sessão.
   - Verificar que a tela `Finalizar Cadastro` carrega sem a mensagem "Sua sessão expirou".
   - Definir uma senha e confirmar.
   - Validar que o usuário é redirecionado corretamente após salvar a senha.

5. **Verificação pós-finalização**
   - Confirmar que `signup_requests` ficou com status `completed` e `finalized_at` preenchido.
   - Verificar que o perfil (`MED003` ou próximo ID disponível), `user_roles` e `user_modules` foram criados.

6. **Teste de login**
   - Fazer login com o novo usuário usando email/senha definida.
   - Confirmar acesso ao dashboard sem erros.

7. **Teste do botão "Reenviar link"**
   - Simular uma nova solicitação aprovada e abrir o link.
   - Forçar uma situação de sessão inválida/expirada na tela `Finalizar Cadastro`.
   - Clicar em "Reenviar link" e confirmar que uma nova solicitação/link é gerado com sucesso.

## Resultado esperado
Fluxo completo sem bloqueios: aprovação gera link válido, link permite definir senha, conta é ativada e login funciona normalmente. O botão de reenvio funciona como fallback seguro.