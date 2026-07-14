# DevAIStatus: refletir dinamicamente OCR + IA generalista reais

A página **DevPanel → Inteligência Artificial** (`src/components/dev-panel/DevAIStatus.tsx`) tem 5 problemas que fazem o quadro "não bater com o que está ativo".

## Diagnóstico (confirmado com leitura do DB e do código)

Estado atual em `system_config`:
- `phase1_ocr_provider = "glm"` ✓
- `phase1_gemini_model = "gemini-3-flash-preview"` (resíduo antigo, só faria sentido se OCR fosse Gemini)
- `default_ai_provider = "minimax"`, `default_ai_model = "MiniMax-M3"` ✓

Bugs em `DevAIStatus.tsx`:

1. **`pdfModel` sempre lê `phase1_gemini_model`** (L142). Quando o OCR é GLM/Mistral/MiniMax, o modelo é fixo (`glm-ocr`, `mistral-ocr-latest`, `MiniMax-OCR`), e `phase1_gemini_model` só serve para o caminho Gemini. Resultado atual na tela: "OCR = GLM + gemini-3-flash-preview", que parece o Gemini rodando. **Este é o problema reportado.**

2. **`PROVIDER_NAMES` incompleto** (L42-50): sem `glm`, `mistral`, `minimax`. Mostra id cru para esses.

3. **Fallback OCR aponta para chave errada**: L144-145 lê `pdf_fallback_provider` / `pdf_fallback_model` — chave legada do fluxo single-pass do Trabalhista. O DevSettings hoje configura fallback OCR em `ocr_fallback_provider` (ver DevSettings L2039). São coisas diferentes; a linha "Fallback PDF (Vision)" mostra o provider errado.

4. **`AI_OPERATIONS` desatualizada** (L52-60): lista fixa de operações do Trabalhista antigo (Resumo Petição/Contestação/Descrição Doenças/Nexo/Incapacidade). Nada do Previdenciário. Todas apontam para a IA Principal, o que é correto conceitualmente, mas a lista de nomes não reflete o pipeline real.

5. **Estatísticas de fallback só olham `import_jobs`** (L179): ignora `prev_processing_jobs`. Um usuário que só usa Previdenciário vê "0 jobs processados" mesmo tendo rodado dezenas de perícias.

## Correções

**1. Modelo do OCR conforme o provider (fix do bug reportado):**
```ts
const pdfProvider = configMap.phase1_ocr_provider?.replace(/"/g, '') || 'gemini';
const pdfModel =
  pdfProvider === 'glm' ? 'glm-ocr'
  : pdfProvider === 'mistral' ? 'mistral-ocr-latest'
  : pdfProvider === 'minimax' ? 'MiniMax-OCR'
  : configMap.phase1_gemini_model?.replace(/"/g, '') || 'gemini-2.5-flash';
```
A chave da API muda por provider: `glm` → verifica `glm`, `mistral` → `mistral-ocr`, `minimax` → `minimax`, `gemini` → env `GEMINI_API_KEY` (não fica em `global_api_keys`, tratar como sempre disponível se o backend tem env).

**2. `PROVIDER_NAMES` ampliado:**
```ts
glm: 'GLM-OCR (Z.AI)',
mistral: 'Mistral OCR',
minimax: 'MiniMax',
'mistral-ocr': 'Mistral OCR',
```

**3. Fallback OCR aponta para `ocr_fallback_provider`:**
Trocar leitura de `pdf_fallback_provider`/`pdf_fallback_model` por `ocr_fallback_provider` + modelo derivado do mesmo mapa acima. Se `ocr_fallback_provider === 'none'` (default), a linha "Fallback OCR" mostra "Nenhum configurado" em vez de um provider fantasma.

**4. Reorganizar `AI_OPERATIONS` em duas seções claras:**
- **OCR (Fase 1)** — 1 linha "Leitura de PDF (OCR)" apontando para o `phase1_ocr_provider`, 1 linha "Fallback OCR" apontando para o `ocr_fallback_provider`.
- **IA Generalista (Fase 2)** — 1 linha consolidada "Extração/geração de laudos e perícias" apontando para `default_ai_provider`, com nota "Usada por Trabalhista, Previdenciário e Impugnação".

Fim das linhas com nomes hardcoded do Trabalhista antigo — que hoje passam informação incorreta (todas mostram sempre o mesmo provider, dando falsa sensação de granularidade).

**5. Estatísticas cobrindo os dois módulos:**
Além de `import_jobs`, buscar `prev_processing_jobs` dos últimos 30 dias e somar `totalJobs`. Para `fallbackCount`/motivos, `import_jobs` já grava em `result.aiUsage.pdfExtraction.usedFallback`; `prev_processing_jobs` guarda o `provider` efetivo em `result.provider` e o `ocr_fallback_provider` no DevPanel decide o fallback — para MVP, contar como "fallback usado" quando `result.provider` termina em `-fallback` (padrão emitido por `ocr-router.ts`).

## Escopo

- Arquivo único: `src/components/dev-panel/DevAIStatus.tsx`.
- Nenhuma migração, nenhum toque em backend, ai-config, ocr-router, DevSettings ou nos módulos.
- Realtime subscription (`system_config` + `global_api_keys`) mantém tudo dinâmico: trocar OCR no DevSettings passa a refletir na hora.

## Efeito visual esperado (com o estado atual do DB)

- IA Principal: **MiniMax** · `MiniMax-M3` · Chave configurada
- OCR (Fase 1): **GLM-OCR (Z.AI)** · `glm-ocr` · Chave configurada
- Fallback OCR: **Nenhum configurado**
- IA Generalista (Fase 2): **MiniMax** · `MiniMax-M3` · usada por Trabalhista, Previdenciário e Impugnação
