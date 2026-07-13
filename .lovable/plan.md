# OCR de PDFs grandes (>30 MB) via split automático em partes

## Resposta às suas perguntas

**Gemini processa 63 MB direto?** Tecnicamente sim — a Files API do Gemini aceita até 2 GB / 1000 páginas. Mas na prática temos dois gargalos nossos:
1. **Hard-limit atual de 50 MB** em `prev-pre-processar/index.ts` (linha 875) → arquivos maiores são rejeitados antes de tocar o Gemini.
2. **Memória da edge function (150 MB)** — segurar 63 MB em `Uint8Array` + upload multipart deixa muito pouca folga; risco de OOM em picos.

Sem correção, o cliente vai bater no erro "PDF muito grande" já no upload de 63 MB. E, mesmo se removêssemos o limite, o Gemini começaria a perder qualidade em PDFs muito longos por causa do teto de tokens de saída (65k tokens ≈ ~200 páginas de texto denso). Split é a solução certa.

**Chunk mantém a qualidade?** Para **OCR (Fase 1)** o chunk **é neutro-a-positivo**, não perde nada:
- OCR é transcrição por página; cada página é auto-contida. Não há "raciocínio" a preservar entre páginas — é só copiar o texto.
- Ao concatenar `rawText` das partes na ordem correta, o texto final é idêntico ao que seria em um único request.
- Contextos menores costumam **melhorar** a fidelidade do Gemini (menos "lost-in-the-middle").
- A **Fase 2** (MiniMax M3 extraindo campos) recebe o texto final já mergeado — ela vê o documento inteiro, então nenhum raciocínio é fragmentado.

O caso em que chunk *poderia* perder qualidade é análise semântica com dependência entre chunks (ex.: MiniMax M3 fazendo Fase 2 em pedaços), e é exatamente por isso que o MiniMax OCR client-side usa `cross-chunk context`. Para Gemini OCR, isso não se aplica.

**Threshold de 30 MB é razoável?** Sim, com folga. Aciona split cedo, mantém margem contra picos de memória, e não penaliza a maioria (a mediana dos seus PDFs até hoje é bem < 30 MB pelos logs).

## O que já existe no projeto
- `supabase/functions/_shared/pdf-splitter.ts` — helper com `splitPDF()` usando `pdf-lib`, preserva imagens/fontes/refs internas. **Está pronto e não é usado por ninguém ainda.**
- `pdf-visual-extractor.ts` — sabe rodar Gemini Files API para uma parte de qualquer tamanho.

## Arquitetura proposta

### 1. Novo helper `runGeminiOcrChunked` em `_shared/ocr-router.ts`
- Recebe `pdfBytes` + `geminiModel`.
- Se `pdfBytes.byteLength <= 30 MB` → caminho single-shot atual (sem regressão).
- Se `> 30 MB` → chama `splitPDF()` com `maxSizeBytes: 25 MB` (folga vs. 30 MB para absorver overhead do pdf-lib) e `maxParts: 6` (permite até ~150 MB de PDF; acima disso, negar com erro claro).
- Libera `pdfBytes` original imediatamente após split (`pdfBytes = null`) para reduzir picos de memória.
- Processa partes **sequencialmente** (não paralelo — evita 3× uso de memória simultâneo na Files API e mantém dentro dos 150 MB do worker).
- Cada parte:
  - `extractVisualContent(partBytes, { model: geminiModel })` (usa Files API porque > 4 MB).
  - Guarda `rawText`, `pageCount`.
  - Descarta bytes da parte antes de processar a próxima.
- Ao final: concatena `rawText` das partes com separador `\n\n=== PARTE X (páginas Y–Z) ===\n\n` e soma `pageCount`.
- Retorna `OcrRouterResult` com `provider: "gemini-visual-chunked"` e `model: <modelo>`.

### 2. Integração em `runOcrWithConfiguredProvider`
- Só o ramo `gemini` chama o novo helper.
- Ramo `mistral` mantém erro > 50 MB (limite real do provider).
- Ramo `minimax` inalterado (já é chunked client-side).

### 3. Remover hard-limit de 50 MB em `prev-pre-processar/index.ts`
- Trocar por limite mais generoso (e realista): **150 MB**.
- Acima disso, erro claro: "PDF acima de 150 MB — divida manualmente antes do upload."

### 4. Timeouts e progresso
- O timeout hoje da edge é dominado pelo Gemini (~105 s por chamada). Para PDF de 63 MB em 3 partes, teto teórico 3× 105 s = 315 s — acima do gateway (150 s).
- Mitigação: mesmo padrão async job que já existe (`prev_pre_processar_jobs` + polling). Como já é async, o wall time longo não trava a UI.
- Logar progresso por parte no worker: `[ocr-router] parte 2/3 concluída (páginas 21–40)` — aparece nos logs da edge.

### 5. Instrumentação
- Log claro de decisão: `[ocr-router] PDF 63.2MB > 30MB → split em 3 partes de ~21MB`.
- Log de conclusão: `[ocr-router] merge concluído: 3 partes, 158 páginas, 412k chars`.
- No caso de falha de uma parte, propagar erro com contexto (`Falha na parte 2/3, páginas 21–40`).

## Escopo
**Arquivos afetados:**
- `supabase/functions/_shared/ocr-router.ts` — adicionar helper chunked + integrar
- `supabase/functions/prev-pre-processar/index.ts` — subir hard-limit para 150 MB

**Não afeta:**
- `pdf-visual-extractor.ts` (o extrator não precisa saber de chunk — recebe bytes já cortados)
- `pdf-splitter.ts` (usar como está)
- Fase 2 (MiniMax M3), DevPanel, `user_settings`, dados salvos
- Fluxos MiniMax client-side e Mistral

## Trade-offs assumidos
- **Custo Gemini**: N requisições em vez de 1. Cada uma tem input próprio (páginas) → custo total ≈ igual (é cobrado por token de input, não por request). Sem regressão de custo relevante.
- **Latência**: PDFs > 30 MB ficam ~N× mais lentos (linear no número de partes). Aceitável porque roda em background job com polling.
- **Memória do worker**: pico agora é `size(parte)` ≈ 25 MB durante processamento sequencial, ao invés de 63 MB inteiros → **menor pressão de memória**, não maior.

## Validação
1. Reprocessar o PDF de 63 MB do cliente: deve dividir em ~3 partes, concluir sem erro, retornar texto completo.
2. Reprocessar PDF < 30 MB (ex.: 14 MB do Bruno): deve ir pelo single-shot (sem regressão, logs confirmam "no split needed").
3. Simular PDF acima do teto (>150 MB): erro claro na UI, sem tentativa muda.
4. Conferir logs: zero requisições saindo para Mistral (garantia do fix anterior continua valendo).
