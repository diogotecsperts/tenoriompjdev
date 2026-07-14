# Plano final (Blocos 1 + 2) — aprovado com correções

Sua dica está 100% correta e coerente com o padrão já existente. Confirmei que **`getMistralAPIKey()` é chamada em 5 lugares e `getGlmAPIKey()` em 1**, todos em edge functions:

- `supabase/functions/_shared/mistral-ocr.ts:225` (definição)
- `supabase/functions/_shared/glm-ocr.ts:37` (definição)
- `supabase/functions/_shared/ocr-router.ts:101, 104`
- `supabase/functions/processar-autos/index.ts:1158, 2135, 2470, 2788` (**4 call sites — todos precisam de `await`**)

Nenhum call site no frontend. `hasMistralAPIKey`/`hasGlmAPIKey` já são `async`, então só o `get*` muda de assinatura.

---

## BLOCO 2 — Seção "Provedores de OCR" no DevPanel

### Backend (helpers de chave)

1. **`supabase/functions/_shared/mistral-ocr.ts`**
   - `getMistralAPIKey()` vira `async`, retorna `Promise<string | null>`:
     ```ts
     const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
     const { data } = await supabase
       .from('global_api_keys')
       .select('api_key')
       .eq('id', 'mistral-ocr')
       .maybeSingle();
     return data?.api_key || Deno.env.get('MISTRAL_API_KEY') || null;
     ```
   - `hasMistralAPIKey()` já é `async`, só ajusta para `!!(await getMistralAPIKey())`.

2. **`supabase/functions/_shared/glm-ocr.ts`**
   - Mesma transformação em `getGlmAPIKey()`, consultando `id = 'glm'` e fallback `Deno.env.get('GLM_API_KEY')`.

3. **`supabase/functions/_shared/ocr-router.ts`**
   - Linhas 101 e 104: adicionar `await`.

4. **`supabase/functions/processar-autos/index.ts`**
   - Adicionar `await` nas 4 chamadas (1158, 2135, 2470, 2788). Todas já estão em contexto `async`.

RLS de `global_api_keys` já está restrita a `is_developer()` — não mexer.

### Frontend (nova tabela no DevPanel)

5. **`src/components/dev-panel/DevSettings.tsx`**
   - Extrair `renderProviderRow` para receber o array de providers via parâmetro (ou já usa via closure em `AI_PROVIDERS` — refatorar para aceitar lista arbitrária).
   - Criar `OCR_PROVIDERS` local (não incluído em `AI_PROVIDERS`, para não vazar na Fase 2):
     - `mistral-ocr` (já existe hoje no Provider Inventory — **movê-lo** para cá, removendo do `AI_PROVIDERS` principal)
     - `glm` (novo, modelo único `glm-ocr`)
   - Renderizar nova `<Card>` "Provedores de OCR" logo abaixo do Provider Inventory v2.0, com a mesma `<Table>` shadcn e mesmas colunas.
   - Nota curta acima: "Gemini e MiniMax também fazem OCR e têm sua chave gerenciada no Provider Inventory acima."
   - Confirmar que `getFilteredProviders()` (usado no select da Fase 2) não devolve os providers dessa nova lista — como eles saem de `AI_PROVIDERS`, ficam automaticamente fora.
   - Remover os blocos de aviso inline com bug (linhas ~2129 e ~2154), substituindo por atalho: "Configure a chave em **Provedores de OCR** ↓" com `scrollIntoView` para a nova seção.
   - `saveApiKey`/`deleteApiKey`/`testConnection` já funcionam para qualquer `id` gravado em `global_api_keys` — reutilizar. Só precisamos garantir que `test-ai-connection` reconhece `id = 'mistral-ocr'` e `id = 'glm'` (verificar durante implementação; caso não, adicionar branches simples).

### Teste de sanidade obrigatório após implementar

Antes de dar o Bloco 2 por fechado, executar manualmente:
- Salvar chave Mistral pela nova tabela → rodar um OCR real com Mistral → confirmar sucesso e ver a chave da DB sendo usada (log já existe em `ai-config.ts`).
- Mesmo teste com GLM.
- Remover a chave Mistral da nova tabela mas manter `MISTRAL_API_KEY` na env → OCR ainda deve funcionar (fallback env).

---

## BLOCO 1 — GLM-OCR: divisão por tamanho antes da paginação por página

Sem mudanças em relação ao plano anterior. Reafirmando:

1. **`src/components/tools/ImportarAutosDialog.tsx`**: quando `phase1_ocr_provider === 'glm'`, chamar `splitPDFClientSide(file, { maxPagesPerPart: 26, maxSizeBytes: 38_000_000 })` (trigger: `>26 páginas` OU `>38MB`).

2. **Verificação pós-split contra o bug do pdf-lib**: após split, para cada parte com `size > 38MB`, re-split recursivo (máx. 2 níveis) com `maxPagesPerPart` dividido por 2. `console.warn` cada ocorrência. Erro duro só se após 2º nível ainda passar.

3. **`supabase/functions/_shared/glm-ocr.ts`**: manter a paginação interna `start_page_id`/`end_page_id` como segunda camada; substituir o `throw` de 50MB (linha ~154) por erro estruturado que passe pelo `resolveOcrFallback` normal.

4. **Documentação**: `mem/architecture/glm-ocr-integration.md` — nova seção "Divisão em duas camadas".

---

## Arquivos alterados (resumo)

**Backend:**
- `supabase/functions/_shared/mistral-ocr.ts` (async + DB→env fallback)
- `supabase/functions/_shared/glm-ocr.ts` (async + DB→env fallback + erro estruturado 50MB)
- `supabase/functions/_shared/ocr-router.ts` (2 `await`)
- `supabase/functions/processar-autos/index.ts` (4 `await`)

**Frontend:**
- `src/components/dev-panel/DevSettings.tsx` (nova tabela + refactor `renderProviderRow` + remoção dos avisos bugados + atalho scroll)
- `src/components/tools/ImportarAutosDialog.tsx` (split condicional GLM + verificação pós-split)

**Memória:**
- `mem/architecture/glm-ocr-integration.md` (atualizar)
- `mem/architecture/ocr-key-management-devpanel.md` (novo)
- `mem/index.md` (referenciar novo arquivo)

**Sem migração de banco.** `global_api_keys` aceita `id` arbitrário; `mistral-ocr` já é usado, adicionamos `glm`.

## Ordem

1. Bloco 2 backend (helpers async + await em todos os call sites).
2. Bloco 2 frontend (nova tabela + limpeza dos avisos).
3. Bloco 1 (split client-side + erro estruturado no glm-ocr.ts).
4. Documentação em memória.

## Riscos

- Baixos. Só 6 pontos precisam de `await` (todos mapeados). Comportamento observável do OCR não muda se `global_api_keys` estiver vazio — o env fallback preserva o estado atual.
- Trabalhista e Previdenciário inalterados.

Se aprovado, implemento nessa ordem.