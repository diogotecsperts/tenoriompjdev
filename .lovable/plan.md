
## Diagnóstico honesto

### 1) Lote não atualiza status por item
Em `src/modules/previdenciario/pages/PautaDetalhe.tsx`, `handleProcessarLote` só chama `reload()` **depois** do `for` inteiro (linha 285). Enquanto o loop roda, o `Badge` de cada perícia continua com o status antigo. Só no fim ele lê o DB e todos aparecem processados de uma vez.

### 2) "Credencial inválida" para o Bruno — NÃO é mistura de credenciais
Depurei a cadeia inteira. As credenciais de IA no app são **100% globais**: `getAIConfig()` lê `system_config` + `global_api_keys` com service-role e não recebe nenhum `userId` no header do provider. Não há como "confundir" a chave do seu user com a do Bruno.

O que está acontecendo é uma **classificação enganosa** feita pelo próprio frontend:

- Em `supabase/functions/prev-pre-processar/index.ts` (linhas 933-939) quando `supabaseUser.auth.getUser()` falha (token expirado / sessão inválida), a função retorna `HTTP 401` com `{ "error": "Sessão inválida" }`.
- Em `src/modules/previdenciario/api/processar.ts` → `classifyInvokeError`, qualquer `status === 401` cai em `code = "invalid_key"`.
- Em `PautaDetalhe.tsx`, `code === "invalid_key"` vira o título **"Credencial inválida"** + descrição **"Sessão inválida · Status: 401 · Sugestão: revise a credencial do provider no DevPanel."**

Ou seja: o Bruno teve o **JWT dele expirado/renovação de refresh token quebrada** (confirmado no auth-log: `refresh_token_not_found` às 22:31:17Z antes do relogin). O frontend mascarou isso como se fosse chave de IA errada. No seu login o token estava válido → passa direto.

No lote, cada perícia consumia o mesmo JWT stale → 10/10 falharam com o mesmo 401 → "0 processadas(s) · 10 falha(s)". Consistente com o que ele viu.

## Plano de correção

### A) `src/modules/previdenciario/pages/PautaDetalhe.tsx`
Dentro do `for` de `handleProcessarLote`, após cada `await preProcessarPericia(...)` bem-sucedido:
1. Atualizar imediatamente o item no estado local: `setPericias(prev => prev.map(x => x.id === p.id ? { ...x, pdf_processado: true } : x))`.
2. Fazer `void reload()` sem `await` para reconciliar com o DB em background e trazer `periciado_nome`/`prev_extracao`.
3. Manter o `reload()` final para consolidação.

### B) `src/modules/previdenciario/api/processar.ts`
1. Adicionar novo `PreProcessarErrorCode` `"session_expired"`.
2. Em `classifyInvokeError`: se o body vier com `error === "Sessão inválida"` **ou** `error === "Não autenticado"` **ou** `code === "session_expired"`, mapear para `"session_expired"` (não mais `"invalid_key"`), com mensagem "Sua sessão expirou. Saia e entre novamente."
3. Antes de invocar `prev-pre-processar` (e no segundo invoke pós-OCR client-side), chamar `supabase.auth.getSession()` e, se `session` for `null` ou `expires_at` ≤ `now + 30s`, chamar `supabase.auth.refreshSession()`. Se refresh falhar, lançar `PreProcessarError("Sua sessão expirou...", "session_expired")` antes mesmo de tocar a edge function. Evita queimar tempo de processar num JWT morto.

### C) `supabase/functions/prev-pre-processar/index.ts`
No branch que retorna `{ error: "Sessão inválida" }` (linhas 934-939 e 909-914), incluir `code: "session_expired"` no body para a classificação frontend ser inequívoca.

### D) `src/modules/previdenciario/pages/PautaDetalhe.tsx` — UX do erro
Em `handleProcessar` e `handleProcessarLote`, tratar `err?.code === "session_expired"`:
- Título "Sessão expirada"
- Descrição "Sua sessão expirou. Saia e entre novamente para continuar."
- Sem "Tentar novamente" (não adianta insistir com JWT morto).
- Ideal: também parar o loop do lote no primeiro `session_expired` (não faz sentido tentar as próximas 9).

## Escopo e garantias

- Nada muda em `getAIConfig` / `global_api_keys` / configuração do DevPanel — não há problema real ali.
- Login e dados do Bruno (`MED001`) permanecem intactos; a correção é puramente de classificação e UX.
- Seu fluxo dev continua funcionando idêntico — a mudança só se manifesta quando o JWT está expirado (não é seu caso hoje).
- Não toca em `AuthContext`, impersonation, nem nos edge functions `dev-*` recentes.

## Como validar

1. **Lote incremental:** processar em lote e observar cada linha virar "processado" logo que termina, sem esperar o fim.
2. **Sessão expirada:** com DevTools, apagar `sb-*-auth-token` do localStorage e clicar Processar. Deve mostrar "Sessão expirada — saia e entre novamente" (não mais "Credencial inválida... revise DevPanel").
3. **Bruno:** após o deploy, pedir ao Bruno para deslogar → logar → processar. Se o problema retornar, o toast agora vai dizer explicitamente "Sessão expirada", o que confirma o diagnóstico e direciona ele para o fluxo certo (relogin), não para o DevPanel.
