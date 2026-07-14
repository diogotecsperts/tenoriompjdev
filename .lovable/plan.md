# Bloco C — GLM-OCR (Z.AI) como provider adicional

Sim, este é o **último bloco**. Depois dele, o pipeline OCR está completo: Gemini, Mistral, MiniMax e GLM, todos controlados exclusivamente pelo DevPanel, sem qualquer fallback hardcoded (garantido pelos Blocos A/B já aplicados).

## Objetivo

Adicionar GLM-OCR como um novo provider selecionável no DevPanel (principal ou fallback), seguindo o mesmo padrão da Mistral. **Nenhuma alteração de fluxo, prompts, Fase 2, chunking, ou lógica de preenchimento de campos.** Feature 100% aditiva.

## Escopo

### 1. Secret
- Solicitar `GLM_API_KEY` via `add_secret` (chave da Z.AI, obtida em https://z.ai/manage-apikey/apikey-list).

### 2. Edge function nova: `supabase/functions/glm-ocr-chunk/index.ts`
Espelha o padrão de `mistral-ocr-chunk` e `minimax-ocr-chunk`:
- CORS + validação JWT em código
- Aceita `{ pdfBase64, filename, pageStart?, pageEnd? }`
- Limites Z.AI: **50MB / 30 páginas por request** — se exceder, retorna erro estruturado (`{ error: "GLM_LIMIT_EXCEEDED", ... }`) para o router decidir (respeitando `resolveOcrFallback`)
- Endpoint: `POST https://api.z.ai/api/paas/v4/layout_parsing`
- Header: `Authorization: Bearer ${GLM_API_KEY}`
- Body: `{ model: "glm-4.5v", file: <base64>, mode: "layout" }` (ajustado conforme doc oficial)
- Retry: 3× com backoff exponencial (250ms, 750ms, 2s) apenas para 5xx/timeout — nunca para 4xx
- Parse: concatena `md_results[].content` em string única
- Retorna `{ text, pageCount, provider: "glm" }`
- Registrar no `supabase/config.toml` com `verify_jwt = false` (padrão do projeto)

### 3. Router: `supabase/functions/_shared/ocr-router.ts`
- Adicionar `"glm"` ao tipo `OcrProvider`
- Adicionar branch `case "glm":` em `runOcrWithConfiguredProvider` que invoca `glm-ocr-chunk` via `supabase.functions.invoke`
- Nenhuma outra mudança — reaproveita toda a lógica de resolução de config já centralizada

### 4. DevPanel UI: `src/components/dev-panel/DevSettings.tsx`
- Adicionar `<SelectItem value="glm">GLM-4.5V (Z.AI)</SelectItem>` em **dois** selects:
  - Provider principal de OCR
  - Provider de fallback de OCR (seção criada no Bloco A)
- Adicionar label descritivo: "GLM-4.5V — 50MB / 30 páginas por chunk, ótimo custo-benefício"

### 5. Smoke test: `src/components/dev-panel/DevSmokeTest.tsx`
- Reaproveitar fixture existente (`smoke-generico.pdf`)
- Adicionar botão/opção "Testar GLM-OCR" que dispara pipeline completo com provider forçado a `glm` só naquela chamada de teste (sem persistir override)

### 6. Memória
- Criar `mem/architecture/glm-ocr-integration.md` no formato de `minimax-ocr-execution-strategy.md`: endpoint, limites, formato de resposta, tratamento de erros, referência ao router
- Atualizar `mem://index.md` adicionando a nova entrada em "Import & OCR"

## O que NÃO muda

- Fase 2 (preenchimento de campos via IA geral) — intocada
- Prompts, `laudo-structure.ts`, chunking, JSON repair, retry de summary — intocados
- Mistral, Gemini, MiniMax — intocados
- Módulo Trabalhista (`processar-autos`) — nenhuma nova linha; ele já usa `runOcrWithConfiguredProvider` após Bloco A, então GLM fica disponível automaticamente pela adição no router
- Módulo Previdenciário (`prev-pre-processar` + `ocr-router`) — só ganha o novo case no router
- Fallback: continua controlado 100% pelo DevPanel; GLM só é usado se o usuário selecionar explicitamente

## Detalhes técnicos

**Estrutura de resposta da Z.AI (`layout_parsing`):**
```json
{
  "md_results": [
    { "page_number": 1, "content": "# Título\n\ntexto..." },
    { "page_number": 2, "content": "..." }
  ]
}
```

**Tratamento de limites (>50MB ou >30 páginas):**
- `glm-ocr-chunk` retorna erro estruturado
- Router propaga via `resolveOcrFallback` (Bloco A) — se DevPanel tiver fallback ligado, cai no provider escolhido; senão, falha explicitamente. **Nenhum fallback silencioso.**

**Ordem de arquivos criados/editados:**
1. `supabase/functions/glm-ocr-chunk/index.ts` (novo)
2. `supabase/functions/_shared/ocr-router.ts` (adiciona case)
3. `src/components/dev-panel/DevSettings.tsx` (adiciona SelectItems)
4. `src/components/dev-panel/DevSmokeTest.tsx` (adiciona teste)
5. `mem/architecture/glm-ocr-integration.md` (nova memória)
6. `mem://index.md` (referência)
7. `add_secret GLM_API_KEY` no fim do fluxo

## Riscos

- **Baixíssimos.** Adição pura. Se o secret não estiver configurado, `glm-ocr-chunk` retorna erro claro e o comportamento cai no `resolveOcrFallback` já testado.
- Reversibilidade total: basta o usuário não selecionar `glm` no DevPanel para o provider ficar inerte.

Confirma e eu executo o Bloco C.
