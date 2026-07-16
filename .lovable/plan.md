## Depuração do travamento em "Extração de dados (Vision)" no Trabalhista

### Diagnóstico

O modal trava em "Extração de dados (Vision)" e, ao clicar em **Continuar**, nada evolui nem falha. Três causas independentes contribuem:

1. **Fase client-side do GLM não emite estado.** No branch `ocrConfig.provider === 'glm'` do `ImportarAutosDialog.processFile`, o dialog roda `rebuildPdfAsRasterClean` + `splitCleanPdfByPages` **antes de criar o `import_job`**. Enquanto isso o step `extraction` já ficou marcado como "processing", mas ainda não existe `jobId` para o polling puxar `updated_at`. Se um passo do raster crashar (OOM, worker do pdf.js, `toBlob` null), o `.catch()` externo pode não estar re-arremessando com mensagem clara.
2. **"Continuar esperando" apenas zera o contador stale.** Em `staleCheckCountRef.current = 0` (linha 2484) o app volta a esperar do zero por 5 minutos, sem verificar se o backend ainda está vivo. Se o edge function morreu (WORKER_LIMIT / OOM / crash silencioso), o dialog fica em loop eterno de "5 min sem update → clicar Continuar → 5 min sem update".
3. **A mensagem do GLM está mal formulada.** "GLM-OCR · enviando por partes (limite 100 págs / ~50MB por chamada)" sugere ao operador que PDFs >100 págs vão falhar, quando na verdade o pipeline raster+split **contorna** esse limite dividindo em partes.

### Correções propostas

Escopo restrito a `src/components/tools/ImportarAutosDialog.tsx`, sem tocar em edge functions nem no Previdenciário.

**1. Mensagem GLM mais precisa** (linhas 476-484 do dialog)

```
GLM-OCR · rasterizando PDF no navegador (raster+split)
GLM-OCR · enviando por partes (contornando limite de 100 págs / ~50 MB por chamada)
GLM-OCR · processando documento no servidor
```

**2. Envelopar o pipeline client-side do GLM com telemetria fina**

Dentro do branch GLM em `processFile`:

- Marcar sub-fases explícitas no `setStepsStatus`/`setAnalysisStep` antes de cada passo pesado: `probePdfPageCount` → `rebuildPdfAsRasterClean` (com `onPageProgress` já disponível) → `splitCleanPdfByPages` → upload das partes.
- Try/catch por sub-fase, cada catch reemite com prefixo (`[GLM raster]`, `[GLM split]`, `[GLM upload]`) para o `errorLogger` e para o toast do usuário.
- Timeout duro por sub-fase (ex.: 8 min para raster, 3 min para split); se estourar, aborta com mensagem "Rasterização do PDF excedeu 8 min — arquivo pode ser grande demais para o navegador. Tente PDF menor ou trocar o provider de OCR no DevPanel."

**3. Detecção robusta de trava em qualquer fase**

Substituir o comportamento atual do botão **Continuar esperando** (linhas ~2453-2490):

- Ao clicar, iniciar um "modo tolerante" que dá **mais 5 min** e nada além disso. Se `updated_at` não avançar nesse segundo intervalo, forçar `handleError` com mensagem final:
  > "Processamento parou de responder após 10 minutos sem sinais do servidor. Último passo: `<current_step>`. Provider ativo: `<currentOCRProvider>`. Sugestões: trocar provider no DevPanel ou reduzir o PDF."
- Manter o botão "Usar resumos parciais" que já existe.

Adicionar também um **teto absoluto** (25 min de wall-clock desde o `handleFileUpload`) que dispara `handleError` mesmo antes do stale contar, para eliminar espera infinita.

**4. Mostrar o último log de backend na tela de erro**

Já existe `backendLogs` (linha 239) sendo alimentado. Quando `handleError` for chamado por stale/timeout, incluir os 2-3 últimos `backendLogs` na mensagem/toast — isso dá ao operador contexto imediato (ex.: "OCR: enviando parte 4/12" cortado indica falha na parte 4).

### Fluxo pós-OCR — confirmação

**Nada muda.** Uma vez que o OCR entregou texto (via `preExtractedText` no MiniMax, ou via `runOcrWithConfiguredProvider` para GLM/Mistral/Gemini), o pipeline segue idêntico ao que já funcionava:

1. `callAI` lê `default_ai_provider`/`default_ai_model` do DevPanel.
2. Prompt montado por `prompt-manager` + `build-import-prompt` (ambos intocados).
3. JSON estruturado, validado por `ensureValidStructure`, gravado em `import_jobs.result`.
4. Polling do dialog puxa o resultado, mostra preview, e o botão "Criar Laudo" cria o registro em `laudos` com os mesmos mapeamentos do `laudo-structure.ts`.

Nenhum arquivo dessa cadeia é tocado neste patch. Os prompts, campos e comportamentos de IA por módulo (Trabalhista/Prev/Impugnação) continuam completamente isolados.

### Escopo técnico

- **Arquivo alterado:** `src/components/tools/ImportarAutosDialog.tsx` (mensagens, telemetria client-side GLM, política de stale/timeout, exibição de logs no erro).
- **Não alterado:** edge functions, `_shared/*`, Previdenciário, prompts, `laudo-structure.ts`.
- **Validação:** `tsgo --noEmit` + teste manual com PDF grande GLM (>100 págs), PDF pequeno Mistral, e simulação de crash (matar rede no meio da fase 1) para confirmar que o erro aparece com contexto ao invés de travar.

### Perguntas para confirmar antes de implementar

1. Tetos ok: 5 min stale → "Continuar" adiciona +5 min → 25 min absoluto máximo?
2. Quer que o toast de erro inclua os últimos logs de backend, ou prefere só o `current_step` + provider?