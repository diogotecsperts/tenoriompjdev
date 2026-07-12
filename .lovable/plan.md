## Diagnóstico

Estado atual no banco para `diogotecinove@gmail.com`:
- Solicitação `dd3d8b0c-...` em `awaiting_finalization`, `finalized_at` vazio.
- Usuário `69c43682-...` criado, com profile `MED003`, role `user`, módulo `trabalhista`.
- Nenhum evento de login pela Ruane — ninguém consumiu ainda um link válido com sucesso.

Sintoma reportado: ao abrir o link e clicar em "Finalizar cadastro", a página exibe "Sua sessão expirou. Cada link de acesso é de uso único...". Isto vem do bloco em `FinalizarCadastro.tsx` que checa `getSession()` antes do `updateUser`. Ou seja, a sessão criada pelo link é perdida entre a validação (`verifyOtp` OK → estado `ready`) e o clique no botão.

Causa mais provável: o `AuthProvider` global roda em paralelo na mesma aba. Ao detectar sessão, ele carrega o profile e aplica o gate de "signup_request pendente" — que dá signOut mesmo com bypass em `/finalizar-cadastro`, dependendo da ordem entre `getSession` inicial e o `verifyOtp` da página. Também há o risco do `verifyOtp` sobre um link `invite` já consumido por uma pré-visualização de email antes do usuário clicar.

Não há garantia hoje de que cada aprovação gera link novo auditável, e não existe caminho de auto-recuperação para o usuário: quando o link falha, ele tem que voltar em `/solicitar-cadastro` e depender do dev aprovar de novo.

## Plano de correção

### 1. Limpeza da tentativa atual da Ruane
- Apagar a solicitação `dd3d8b0c-...` e a linha em `access_logs` associada.
- Apagar o usuário `69c43682-...` no auth, o profile `MED003`, `user_roles`, `user_modules`, `user_settings` e qualquer dependência de domínio criada por essa tentativa.
- Dev `diogomixcds@gmail.com` (MED002) permanece intocado.

### 2. Isolar a rota de finalização do AuthProvider global
- No `AuthContext`, quando o pathname atual for `/finalizar-cadastro`, não executar `loadUserData` nem o gate de `signup_requests` pendentes.
- Apenas hidratar a sessão para permitir `updateUser({ password })`, sem carregar profile nem chamar toasts de erro que assustam o usuário.
- Gate de "cadastro não finalizado" continua aplicado em qualquer outra rota: usuário em `awaiting_finalization` que tentar acessar o app fora da finalização é deslogado.

### 3. Endurecer a página `FinalizarCadastro`
- Aceitar `type=invite` e `type=recovery` explicitamente.
- Se `verifyOtp` ou `setSession` falhar, mostrar mensagem específica ("link já utilizado" vs. "link inválido") e liberar as duas ações de recuperação da seção 5.
- Após `verifyOtp` bem-sucedido, guardar imediatamente o email da sessão em estado local e não chamar `getSession()` novamente antes do submit — trocar a checagem por uma tentativa direta de `updateUser`, tratando `AuthSessionMissingError` de forma explícita.
- Se `updateUser` funcionar mas `signup-request-finalize` falhar, alertar em vez de fingir sucesso.

### 4. Garantir e auditar link novo em cada aprovação
- No `signup-request-approve`, além de gerar `hashed_token`, registrar em `access_logs` um evento `signup_link_generated` com: `request_id`, tipo (`invite`/`recovery`), timestamp e um fingerprint curto (ex.: primeiros 8 caracteres do hash de SHA-256 do `hashed_token`). Token completo nunca é logado.
- Manter fallback `invite → recovery` só quando `email_exists`. Após a limpeza da seção 1, próximo envio para Ruane deve voltar a `invite`.

### 5. Botão "Reenviar link" na tela de finalização
Nova ação disponível quando a página entra em estado de erro. Não depende do dev.

Fluxo:
1. Botão "Reenviar link" ao lado do "Solicitar novo cadastro" no bloco de erro.
2. Requer o email da tentativa (`sessionEmail` quando existir; senão, campo de texto para o usuário digitar).
3. Chama uma nova edge function pública `signup-request-resend`:
   - Valida email com regex e existência de uma solicitação recente para esse email.
   - Se houver `awaiting_finalization` ou `approved` já registrada para o email: **reaproveita a solicitação existente** e apenas gera um novo link (`invite` para usuário novo, `recovery` se auth user já existir) e reenvia via Resend com o mesmo template usado na aprovação. Atualiza `invite_sent_at`. Não muda `status`.
   - Se houver apenas `pending` (dev ainda não aprovou): responde genericamente "Se houver solicitação, você receberá um novo email" e não envia nada — dev ainda precisa aprovar.
   - Se não houver solicitação nenhuma para esse email: mesma resposta genérica; não cria solicitação silenciosamente para não permitir cadastro sem passar pela aprovação.
   - Rate limit: no máximo 1 reenvio a cada 5 minutos por email; auditar em `access_logs` como `signup_link_resent`.
4. Front recebe resposta genérica de sucesso ("Se este email tiver uma aprovação ativa, enviamos um novo link em instantes.") em todos os casos válidos, para não vazar se o email existe ou não.
5. Enquanto a chamada acontece, botão desabilitado com loader; ao completar, mostra o toast e mantém o usuário na tela para checar o email.

Casos de segurança:
- Nunca cria nova aprovação por conta própria; apenas reemite link para uma aprovação já feita pelo dev.
- Nunca revela se o email existe no sistema.
- Mesmo rate limit se aplica quando o botão é usado por atacante em série.

### 6. Validação end-to-end depois da correção
- Após código pronto, reaprovar Ruane pelo DevPanel.
- Conferir no banco: uma solicitação ativa, `access_logs` com `signup_link_generated` e fingerprint novo.
- Abrir o link uma vez em aba anônima: página deve chegar em "Defina sua senha" sem deslogar.
- Definir senha: `signup_requests.status = completed`, `finalized_at` preenchido, sessão encerrada, redirecionamento para `/`.
- Antes de finalizar, tentar acessar `/hub` diretamente pela sessão do link → deve continuar bloqueado.
- Após finalização, login normal com email/senha funciona.
- Simular link expirado (aprovar, esperar até estourar TTL do Supabase ou consumir uma vez): botão "Reenviar link" gera novo email; segundo clique dentro de 5 min responde sucesso genérico mas não envia.

### Detalhes técnicos
- Nova edge function: `supabase/functions/signup-request-resend/index.ts`, pública (`verify_jwt = false` por padrão), com validação de payload, Resend com o mesmo remetente `acesso@mpjpericias.tecsperts.com`, mesmo HTML da aprovação.
- Reaproveita helper para gerar link direto: `${redirect}/finalizar-cadastro?token_hash=...&type=...`.
- Novo evento em `access_logs`: `signup_link_resent { request_id, target_email, link_type, fingerprint }`.
- Frontend: no `FinalizarCadastro`, componente pequeno com input opcional de email + botão + estado de loading + mensagem genérica.
- Ajuste do `AuthContext`: early return no `useEffect` de inicialização quando `pathname === "/finalizar-cadastro"`, mantendo apenas o `setSession/setUser` e evitando o gate.
- Nenhuma alteração nas policies existentes.