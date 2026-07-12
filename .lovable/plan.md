## Objetivo
Liberar o email `diogotecinove@gmail.com` para uma nova solicitação de cadastro pelo fluxo público, cancelando a solicitação atual travada em `awaiting_finalization`.

## Ações

1. **Cancelar a solicitação atual** no banco:
   - Registro alvo: `id = 72b96fb1-ec39-47c7-868b-6b033cc83f68` (email `diogotecinove@gmail.com`, Ruane Teste Silva).
   - Atualizar `status` → `cancelled` e `review_notes` → "Cancelado a pedido do dev para reiniciar teste do fluxo público".
   - Não mexer no usuário criado em `auth.users` pelo convite (ele fica órfão inofensivo; se você preferir, posso remover também — me diga).

2. **Confirmar liberação**: rodar `SELECT` para garantir que não há mais nenhum registro ativo (`pending` / `approved` / `awaiting_finalization`) para esse email.

3. **Instruções para você**: após o cancelamento, entrar em `/solicitar-cadastro` com o mesmo email `diogotecinove@gmail.com` e refazer a solicitação do zero — deve aparecer normalmente no DevPanel em `pending`.

## Observação
Nenhuma alteração de código nesta etapa — apenas operação de dados. Se durante o novo teste algo falhar, aí sim voltamos para ajustes.