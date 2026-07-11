## Diagnóstico

Dois problemas separados, mesma raiz arquitetural.

### Problema 1 — Transições lentas / tela branca entre páginas

Em `src/App.tsx`, cada rota protegida é declarada assim:

```tsx
<Route path="/dashboard" element={<ProtectedWithLayout><Dashboard/></ProtectedWithLayout>} />
<Route path="/historico"  element={<ProtectedWithLayout><Historico/></ProtectedWithLayout>} />
...
```

`ProtectedWithLayout` é um componente inline diferente por rota. Ao mudar de `/dashboard` para `/historico` o React vê elementos distintos e **desmonta e remonta o `AppLayout` inteiro a cada navegação**. Consequências, todas medidas nas linhas de código atuais:

- `AppLayout` roda `useEffect(checkDevRole)` → chama `supabase.rpc("is_developer")` **a cada navegação** (`src/components/layout/AppLayout.tsx:57-65`).
- `usePresenceHeartbeat` reinicializa (`src/hooks/usePresenceHeartbeat.ts`): dispara `checkAndNotifyLogin` (SELECT em `user_presence`), depois um `upsert` em `user_presence`, e um `supabase.auth.getSession()` extra — tudo antes do próximo frame útil.
- O `<ImportarAutosDialog/>` é remontado (código pesado, imports grandes) mesmo quando o usuário nunca abre o diálogo.
- Todo o estado local do sidebar (`collapsed`, `mobileOpen`, `isDeveloper`) é perdido.

Efeito visível: cada troca de rota fica presa em "loading/tela branca" até o RPC + o upsert de presence responderem. Sob rede instável, isso pode passar de 1-2s.

### Problema 2 — Toast esporádico "Erro ao carregar perfil"

Em `src/contexts/AuthContext.tsx` (`loadUserData`, linhas 116-146):

- A consulta usa `.single()` na tabela `profiles`. Em qualquer transiente (JWT ainda sendo hidratado no cliente, RLS retornando 401 momentâneo, falha de rede) o Supabase devolve um erro **cujo `code` não é `PGRST301` nem `42501`** (pode ser `PGRST116`, `PGRST000`, string vazia, ou apenas um `AuthApiError`).
- O bloco `isTransientError` só reconhece dois códigos específicos, então em qualquer outro erro cai adiante em `if (!profileResult.data)` e entra no ramo **"conta sem perfil válido → signOut()"**. Como você viu depois de reload deu certo, isso confirma transiente, não perfil ausente.
- Quando reproduzido no evento `INITIAL_SESSION` (RLS ainda sem `auth.uid()`), gera exatamente o comportamento relatado: toast de erro seguido de sucesso ao recarregar.

## Correção — cirúrgica, sem tocar em lógica de negócios

### 1. Route layout único (fim das remontagens)

Refatorar `src/App.tsx` para usar rota de layout com `<Outlet/>`:

```tsx
<Route element={<ProtectedRoute><AppLayout><Outlet/></AppLayout></ProtectedRoute>}>
  <Route path="/dashboard"   element={<Dashboard/>}/>
  <Route path="/historico"   element={<Historico/>}/>
  <Route path="/laudo/new"   element={<LaudoEditor/>}/>
  <Route path="/laudo/:id"   element={<LaudoEditor/>}/>
  <Route path="/impugnacao"  element={<Impugnacao/>}/>
  <Route path="/financeiro"  element={<Financeiro/>}/>
  <Route path="/configuracoes" element={<Configuracoes/>}/>
  <Route path="/profile"       element={<Configuracoes/>}/>
</Route>
```

Remove o wrapper `ProtectedWithLayout`. Rotas fora do layout (`/`, `/hub`, `/impersonate`, `/previdenciario/*`, `/dev-panel`, `*`) ficam como estão. Nenhuma mudança em Dashboard, LaudoEditor, LaudoContext, etc.

**Ganho direto:** o `AppLayout` monta uma vez por sessão → `usePresenceHeartbeat`, `is_developer` RPC, `ImportarAutosDialog` param de re-inicializar em toda navegação. As transições ficam instantâneas.

### 2. Tornar `AuthContext.loadUserData` robusto a transientes

Duas mudanças pequenas em `src/contexts/AuthContext.tsx`, apenas dentro da função `loadUserData`:

- Trocar `.single()` por `.maybeSingle()` — separa "sem linha" de "erro real".
- Ampliar o conceito de transiente: **qualquer `profileResult.error` sem `profileResult.data` é tratado como transiente** (log + toast informativo, mantém sessão, não desloga). O ramo de "conta sem perfil válido → signOut" só dispara quando `error === null && data === null` (o único caso em que temos certeza de que a linha realmente não existe). Isso elimina o falso "conta inválida" causado por hiccups de rede/JWT.
- Manter o timeout de 10s como está.

Sem mudança na interface pública do contexto, sem mudança em componentes consumidores.

### 3. (Opcional, só se sobrar folga) Consolidar re-render do `AuthProvider`

Não é necessário para o bug, mas se quisermos aproveitar, envolver o `value={{…}}` do `AuthContext.Provider` em `useMemo`. Deixo isso fora do escopo desta correção para manter o patch mínimo.

## Escopo do patch

Arquivos tocados: **2**.

- `src/App.tsx` — refatoração de rotas para layout único com `<Outlet/>`; remove `ProtectedWithLayout`.
- `src/contexts/AuthContext.tsx` — `.maybeSingle()` + reclassificação de erros transientes dentro de `loadUserData`.

Nenhum arquivo de UI, de conteúdo do laudo, de OCR, de DevPanel, ou de edge function é alterado.

## Validação

1. Build passa.
2. Playwright: login → navegar Dashboard ↔ Histórico ↔ Configurações ↔ Impugnação em sequência e conferir que não há flash de "Carregando…" entre rotas e que `AppLayout` não remonta (contar chamadas a `is_developer` no console → deve aparecer 1× por sessão, não 1× por navegação).
3. Simular erro transitório de perfil injetando um erro no `.maybeSingle()` via DevTools (ou temporariamente forçando um `throw`) e confirmar que o toast diz "problema de conexão" e a sessão permanece — não desloga.
