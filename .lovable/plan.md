# Correção do OCR — bug do Gemini 3.1 Files API + eliminar fallback silencioso pra Mistral

## Causa raiz
`pdf-visual-extractor.ts` envia `response_mime_type` no body da **Files API do Gemini** (ramo usado para PDF > 4 MB). A família **Gemini 3.x rejeita** esse parâmetro com HTTP 400. Todo PDF grande falha no Gemini e cai no fallback interno oculto (`ocr-router.ts`: escolhido → gemini → **mistral** → minimax), gerando cobrança inesperada da Mistral. Só o Bruno viu o erro porque ele enviou PDF de 14 MB; nos testes internos os PDFs eram < 4 MB e usavam o ramo inline, que não tem o bug.

## Escopo do que roda no DevPanel (não muda)
- **Fase 1 — OCR:** `phase1_ocr_provider = gemini` + `phase1_gemini_model = gemini-3.1-flash-lite`.
- **Fase 2 — Geração de texto:** `provider = minimax` + `MiniMax-M3`.
- Tudo continua controlado pelo DevPanel; nada de hardcode novo.

## Correções

### 1. Corrigir body do Gemini Files API
`supabase/functions/_shared/pdf-visual-extractor.ts`:
- Para modelos `gemini-3.*`, **não** enviar `response_mime_type` / `responseMimeType` em `generationConfig`/`generation_config`. Manter apenas prompt + instrução JSON no texto.
- Aplicar tanto no ramo inline (< 4 MB) quanto no ramo Files API (> 4 MB), para garantir compatibilidade em qualquer tamanho de PDF.
- Manter o parâmetro apenas para `gemini-2.*`, que aceita.

Efeito: Gemini 3.1-flash-lite volta a funcionar em qualquer tamanho de PDF. Cliente pode mandar PDF pequeno ou grande sem diferença de comportamento.

### 2. Eliminar fallback silencioso pra Mistral
`supabase/functions/_shared/ocr-router.ts`:
- Remover Mistral e Gemini da cadeia automática. Só rodar o provider que o DevPanel escolheu.
- Se o provider escolhido falhar, propagar o erro real para o frontend (sem trocar de provider por baixo).
- MiniMax continua sinalizando `MINIMAX_CLIENT_RASTERIZE_ERROR` para o Previdenciário chamar o pipeline client-side (`runMinimaxClientOcr`) — esse fluxo é intencional e não é fallback pago.

Efeito: DevPanel vira fonte única da verdade. Fim das cobranças Mistral inesperadas. A chave Mistral pode ficar bloqueada indefinidamente.

### 3. Mensagem de erro útil
`src/modules/previdenciario/api/processar.ts` + `src/modules/previdenciario/pages/PautaDetalhe.tsx`:
- Detectar 400 do Gemini e mostrar motivo real ("Gemini rejeitou o modelo/parâmetro — verificar DevPanel"), em vez do genérico "Falha no provider backend/processamento".
- Manter tratamento de `ocr_requires_client_rasterize` (já existe) e `session_expired` (fix anterior).

### 4. Verificação
- Reprocessar o PDF de 14 MB do Bruno com `phase1_ocr_provider=gemini` + `gemini-3.1-flash-lite` e confirmar 200 direto no Gemini (Fase 1). Depois disso, a Fase 2 (MiniMax M3) roda normalmente sobre o texto extraído.
- Conferir logs pós-deploy: zero requisições saindo pra `api.mistral.ai`.
- Testar PDF pequeno (~2 MB) e grande (~15 MB) do mesmo user para confirmar que o comportamento é idêntico independentemente do tamanho.

## Arquivos afetados
- `supabase/functions/_shared/pdf-visual-extractor.ts`
- `supabase/functions/_shared/ocr-router.ts`
- `src/modules/previdenciario/api/processar.ts`
- `src/modules/previdenciario/pages/PautaDetalhe.tsx`

## Não afeta
- `user_settings`, `global_api_keys`, `system_config`.
- Fase 2 (MiniMax M3 continua padrão intocado).
- Pipeline MiniMax client-side (`runMinimaxClientOcr` + `minimax-ocr-chunk`).
- Dados salvos, AuthContext, edge functions `dev-*`.
