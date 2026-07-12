## Objetivo
Corrigir o 401 "Invalid token" ao abrir DevPanel → Controle de Uso e prevenir a mesma classe de erro em outras funções `dev-*`.

## Causa
`supabase/config.toml` marca `dev-list-prev-usage` (e outras `dev-*`) com `verify_jwt = true`. Com o sistema de signing keys em uso, essa verificação no gateway falha antes do código rodar — e a função já valida o JWT internamente via `getUser()` + `is_developer`. Resultado: 401 sem log de execução.

## Ações

1. **Ajustar `supabase/config.toml`** — alterar `verify_jwt` de `true` para `false` em todas as edge functions `dev-*` que fazem validação em código:
   - `dev-list-prev-usage` (causa reportada)
   - `dev-list-pdfs`
   - `dev-download-pdf`
   - `dev-get-pericia-data`
   - `dev-impersonate-user`
   - `dev-save-pericia-pdf-meta`
   
   (Confirmar caso a caso lendo cada `index.ts`; qualquer uma que já valide JWT em código entra na lista. Nenhuma delas é público-anônimo — todas checam `getUser()` + `is_developer()`.)

2. **Não alterar código das funções** — a validação em código (linhas 19‑46 de `dev-list-prev-usage/index.ts`) já é suficiente e é o padrão recomendado.

3. **Deploy** apenas das funções cujo `verify_jwt` mudou.

4. **Validação**:
   - Rechamar `dev-list-prev-usage` via `curl_edge_functions` autenticado como dev → deve retornar 200 com pautas/perícias.
   - Rechamar via preview após deploy (Controle de Uso deve carregar).
   - Rechamar sem token → deve retornar 401 do próprio código ("Missing auth"), confirmando que a validação in-code continua ativa.

## Fora de escopo
- Não alterar outras funções que não sejam `dev-*`.
- Não mexer em lógica de negócio nem no frontend.
- Não trocar `getUser()` por `getClaims()` neste momento (é uma otimização, não a causa).