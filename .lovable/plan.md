## Diagnóstico

**Dados do Bruno (MED001) — íntegros e intactos:**
- `auth.users`: id `e48a06e4-43c7-4fa8-a467-80780b60cc77`
- `profiles`: `MED001`, nome "BRUNO VICTOR TENÓRIO CAVALCANTI PADILHA", email `brunomed@gmail.com`
- `user_roles`: apenas `user` (não é dev/admin, então é impersonável — passa nas validações da edge function)
- Login do Bruno segue funcional pelas correções anteriores no `AuthContext` (nada foi tocado no perfil dele).

**Causa real do "não abriu aba nem fez nada":**

O clique em "Entrar como este usuário" chama `handleImpersonate`, que executa:
1. `await supabase.auth.getSession()`
2. `await fetch(.../dev-impersonate-user)` (a edge function agora faz validação interna de token + `getUserById` + `generateLink` + audit log — leva centenas de ms)
3. Só **depois** chama `window.open(url, "_blank", "noopener")`

Todos os navegadores modernos (Chrome/Edge/Safari/Firefox) bloqueiam `window.open` chamado após `await` porque não é mais considerado gesto direto do usuário. `window.open` retorna `null` silenciosamente, e o código atual **não verifica o retorno** — por isso nenhum erro, nenhum toast, nenhuma aba. Antes das mudanças recentes a edge function respondia mais rápido e em algumas máquinas o Chrome ainda permitia; agora com a validação extra estourou o limite.

Confirmação indireta: nenhum request de `dev-impersonate-user` nos logs de rede desta sessão — se tivesse falhado no fetch, apareceria o toast de erro. Sem toast + sem aba = popup bloqueado antes do fetch retornar não é o caso; o comportamento clássico de popup pós-await é justamente esse silêncio.

## O que corrigir

**Único arquivo tocado:** `src/components/dev-panel/DevUsersList.tsx`, função `handleImpersonate`.

Padrão canônico "abrir cedo, navegar depois":

1. **Abrir a nova aba imediatamente** no início do handler, ainda dentro do gesto do usuário, com `about:blank`:
   ```ts
   const newTab = window.open("about:blank", "_blank", "noopener");
   ```
2. Se `newTab` for `null` → popup bloqueado pelo navegador. Mostrar toast destrutivo explicando "Permita popups para este site" e abortar (não deixar silencioso como está hoje).
3. Fazer `getSession` + `fetch` normalmente.
4. Em caso de sucesso, atribuir a URL final: `newTab.location.href = url;`
5. Em caso de erro no fetch/edge function, fechar a aba: `newTab.close();` e mostrar o toast de erro (mantém o comportamento atual de erro visível).

Mantém `noopener` (isolamento de `sessionStorage` para a nova aba continua garantido — o `AuthContext` já usa detecção por hash `#token=` na rota `/impersonate` para escopar a sessão só àquela aba).

## Fora do escopo (não mexer)

- Edge function `dev-impersonate-user`: já validada, retorna 200 com token válido. Sem alteração.
- `AuthContext`, `Impersonate.tsx`, `ImpersonationBanner`: sem alteração.
- Dados do Bruno e roles: sem alteração.
- Nenhum outro fluxo de `dev-*` é afetado.

## Validação

Após o fix, testar via Playwright:
1. Logar como dev, ir para `/dev-panel` → aba Usuários.
2. Clicar em "Entrar como este usuário" no card do Bruno (MED001).
3. Confirmar no diálogo.
4. Verificar que uma nova aba abre imediatamente e navega para `/impersonate#token=...`.
5. Verificar que a aba do dev permanece na sessão do dev.
6. Verificar `access_logs` que registrou `impersonation_started` com `target_user_id_code=MED001`.
