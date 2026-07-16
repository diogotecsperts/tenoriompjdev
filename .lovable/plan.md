
## Diagnóstico do Módulo Trabalhista (estado atual)

Fiz varredura em `supabase/functions/processar-autos/index.ts`, `_shared/ocr-router.ts` e `src/components/tools/ImportarAutosDialog.tsx`, cruzando com os logs da edge function que você mandou.

### 1. O GLM foi realmente usado?

**Sim.** O log confirma:
```
[processar-autos] Job … completed successfully with model: glm-ocr/glm-ocr
[processar-autos] Timing - PDF Extraction: 120947ms, Summaries: 9929ms
```

E o caminho single-pass pequeno (`<20MB`, `pdfBytes`) já chama `runOcrWithConfiguredProvider` (linha 3007), que lê `phase1_ocr_provider` do DevPanel e roteia para o GLM. O tempo (2 min) é normal para o GLM em PDF médio.

### 2. Split/Chunk client-side (>20MB) está integrado no Trabalhista?

**Sim, e respeita o DevPanel.** `processarChunkedPDFBackground` (linhas 1584–1712) baixa cada parte do storage e chama `runOcrWithConfiguredProvider(partBytes, …)` por parte. GLM/Mistral/Gemini funcionam igual. MiniMax não roda em edge (é canônico, precisa rasterizar no browser).

### 3. "1 de 2 resumos automáticos" com exclamação amarela

**Não é bug — é o PDF de teste que não tem contestação.** O log é explícito:
```
[gerarResumosIA] Pulando resumo_contestacao - dados insuficientes
[gerarResumosIA] Successfully generated resumo_peticao
```

`gerarResumosIA` pula os campos sem dados. O contador `summariesGenerated=1` bate contra a constante fixa `EXPECTED_AUTO_SUMMARIES=2` no dialog, e o amarelo dispara. É falso-positivo quando o pulo foi legítimo (`contestacao` vazia).

### 4. Pontos de risco encontrados (silent downgrade)

Existem 3 branches em `processar-autos/index.ts` que **NÃO** passam pelo `ocr-router` e portanto **ignoram silenciosamente** a escolha de GLM no DevPanel (caem em Gemini/Mistral hardcoded):

| # | Local | Comportamento hoje | Impacto p/ GLM |
|---|---|---|---|
| A | Two-phase, linha 2134 | `if (ocrProvider === 'mistral') else Gemini` | GLM → Gemini silencioso |
| B | Single-pass mapping, linha 2456-2457 | `raw === 'mistral' ? 'mistral-ocr' : 'gemini'` | GLM → Gemini silencioso |
| C | Single-pass PDF >45MB (linhas ~2700+) | Hardcoded Gemini Files API streaming | GLM → Gemini silencioso |

**Impacto real hoje:** como o toggle padrão no seu ambiente é `single_pass` e o PDF testado era ≤45MB, o caminho C/A/B não foi exercitado — por isso o GLM apareceu no log. Mas em PDF >45MB single-pass, ou two-phase, o GLM some silenciosamente. Isso viola a regra `mem://architecture/devpanel-ai-config-global-scope`.

### 5. Modal do Trabalhista — informação de OCR

O dialog já tem `current_step` dinâmico e `currentOCRProvider` no estado, e os backends emitem mensagens úteis (`Extraindo parte X/N (págs A-B)…`). Falta só uma linha secundária mostrando **detalhes técnicos do provedor em uso** (ex: GLM em chunks, Mistral single-shot, Gemini streaming).

---

## Plano de correção — mínimo invasivo, sem tocar no Previdenciário

**Regra:** nada muda em `prev-*`, `ocr-router.ts`, `glm-ocr.ts`, DevPanel, DB, storage, config.toml, Impugnação. Só o Trabalhista.

### Alteração 1 — Fechar os 3 buracos de silent downgrade (`processar-autos/index.ts`)

Substituir as chamadas hardcoded pelas do `runOcrWithConfiguredProvider`:

- **Branch A (two-phase, ~L2130-2245):** substituir o `if (ocrProvider === 'mistral') … else Gemini` por uma única chamada a `runOcrWithConfiguredProvider(bytes ou {blob,size}, …)`. O router já sabe streaming Gemini >30MB, Mistral, GLM. Deixar o try/catch existente para o fallback single-pass intocado.
- **Branch B (single-pass mapping, ~L2456-2463):** trocar o `pdfProvider = raw === 'mistral' ? 'mistral-ocr' : 'gemini'` por leitura direta do provider real. Se `raw === 'glm'`, ir direto para o mesmo caminho router-based que já existe para o path `< 20MB` (linhas 3007+) — extrair essa lógica de OCR-via-router para uma pequena helper local reutilizável.
- **Branch C (single-pass PDF >45MB, ~L2700+):** antes de cair no Gemini Files API hardcoded, verificar `phase1_ocr_provider`. Se for `glm`/`mistral`, tentar o `runOcrWithConfiguredProvider` primeiro (o router já streama pro Gemini nesse range também). Só cair no Gemini hardcoded se o provider escolhido não suportar o tamanho e o DevPanel autorizar via `resolveSizeExceededFallback` (mecanismo já existente).

Cada alteração é <30 linhas, cirúrgica, com `withRetry` já existente onde aplicável, e mantém o fluxo antigo intacto quando `phase1_ocr_provider === 'gemini'` (default).

### Alteração 2 — Amenizar falso-positivo "1 de 2 resumos" (`ImportarAutosDialog.tsx`)

O backend já retorna `partialFailures.failedSummaries` (linhas 3167-3171). Ajustar a UI para:

- Se `summariesGenerated < EXPECTED` **E** `partialFailures?.failedSummaries?.length > 0` → mostrar aviso amarelo (erro real, com botão retry existente).
- Se `summariesGenerated < EXPECTED` **E não há** falhas registradas → mostrar linha neutra: "N resumos gerados (demais campos não tinham conteúdo suficiente no PDF)". Sem exclamação amarela.

Zero mudança no backend, só ~15 linhas no `renderPreview()` (L1454-1502).

### Alteração 3 — Sub-linha dinâmica de OCR no modal (`ImportarAutosDialog.tsx`)

Reaproveitar o bloco "analyzing" já existente (L2087+), sem redesenhar. Adicionar 1 linha secundária pequena logo abaixo do `current_step`, dirigida pelo provider ativo (`ocrConfig?.provider` + `currentOCRProvider`):

```text
Etapa atual: Extraindo parte 3/6 (págs 21-30)…
└─ GLM-OCR · página a página · rasterização em curso
```

Regras dinâmicas (sem info inconsistente):

- Se provedor for **GLM**: mostrar "GLM-OCR · página a página · rasterização em curso" quando o `current_step` contiver "parte" ou "extraindo".
- Se **Mistral**: "Mistral OCR · documento inteiro em uma chamada" ou "Mistral OCR · parte X/N" quando chunkado.
- Se **Gemini**: "Gemini Files API · streaming" (>30MB) ou "Gemini Vision · inline" (menor).
- Se **MiniMax**: fluxo canônico é client-side, então "MiniMax · rasterização no navegador" (só quando esse caminho ativar).
- Se provider desconhecido → não renderiza a sub-linha (nunca info falsa).

Implementação: helper puro `getOcrSubStepLabel(provider, currentStep, sizeBytes)` que retorna `string | null`, mais um `<p className="text-xs text-muted-foreground">…</p>` opcional. ~40 linhas, sem alterar layout, sem novos endpoints, sem impacto no Prev.

### Ordem de execução e validação

1. Alteração 2 (amenizar aviso) → mais barata, elimina o falso-positivo que motivou a dúvida.
2. Alteração 3 (sub-linha informativa) → só front-end, zero risco backend.
3. Alteração 1 (fechar silent downgrade) → cirúrgico, uma branch por vez, cada uma seguida de `tsgo --noEmit` e leitura de log para confirmar que o Prev não foi tocado.

Após tudo: testar 1 PDF pequeno (<20MB) com GLM configurado, 1 PDF médio (20-45MB) chunked com GLM, e 1 PDF grande (>50MB) para confirmar que o caminho Gemini-streaming ainda existe como opção quando o DevPanel manda.

### Detalhes técnicos (backend / expert only)

- Helper local em `processar-autos/index.ts`:
  ```ts
  async function ocrViaRouterWithFill(pdfInput, systemPrompt, promptType, userId) {
    const ocrResult = await runOcrWithConfiguredProvider(pdfInput, {...});
    const fillResult = await callAI(await getAIConfig(), systemPrompt, `…\n\n${ocrResult.text}`, {...});
    return { visionResult: {...ocrResult, text: fillResult.text}, modelUsed: `${ocrResult.provider}/${ocrResult.model}` };
  }
  ```
- Manter `MINIMAX_CLIENT_RASTERIZE_ERROR` handler já existente.
- Nenhuma migração DB. Nenhuma alteração em `config.toml`. Nenhuma alteração em `_shared/*` além dos imports já usados.
- `EXPECTED_AUTO_SUMMARIES=2` permanece; só muda a lógica de exibição do aviso.
