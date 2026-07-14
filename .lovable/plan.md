
## Confirmação da regra

**Nenhum provider de OCR — em especial Mistral — pode ser chamado sem sua escolha explícita no DevPanel.** Isso vale tanto para a IA principal quanto para o fallback. Defaults do rollout são seguros por construção: o sistema **nunca invoca Mistral** até você entrar no DevPanel e selecioná-lo explicitamente (como principal ou como fallback).

Além disso, o plano preserva 100% os fluxos de processamento do Trabalhista e do Previdenciário — só troca *quem decide* qual provider de OCR usar, sem mexer em prompts, split, chunking, preenchimento de campos, exports ou RLS.

---

## Bloco A — Fallback de OCR vira feature controlada pelo DevPanel

### 1. Novas linhas em `system_config` (migração aditiva)

```
ocr_fallback_enabled           boolean   default: false     -- MASTER OFF por padrão
ocr_fallback_provider          text      default: "none"    -- nenhum provider pré-definido
ocr_fallback_on_size_exceeded  boolean   default: false     -- não pular Mistral automaticamente
```

Consequência dos defaults:
- Se o provider principal (definido em `phase1_ocr_provider`) falhar, o job **falha explicitamente** — nenhum outro provider é chamado.
- O "shouldSkipMistral" hardcoded some. Se você escolher Mistral e o arquivo for grande, o Mistral erra naturalmente (413), e o job falha — não cai em Gemini sem sua ordem.
- Para ter fallback, você precisa entrar no DevPanel, ligar o toggle e escolher qual provider é o fallback. Ponto.

### 2. Novo helper `_shared/ocr-fallback.ts`

```ts
getOcrFallbackConfig(): Promise<{
  enabled: boolean;
  fallbackProvider: OcrProvider | "none";
  fallbackOnSizeExceeded: boolean;
}>;

resolveOcrFallback(primaryProvider, error, ctx): Promise<
  | { action: "propagate" }                          // sempre que enabled=false OU provider="none" OU provider===primary
  | { action: "fallback"; provider: OcrProvider }    // só quando você configurou explicitamente
>;
```

Regra dura: **se `enabled=false` ou `fallbackProvider="none"` ou `fallbackProvider===primaryProvider` → sempre `propagate`.** Nenhuma condição implícita liga fallback. Zero branches "se der erro X, tenta provider Y".

### 3. Refatoração cirúrgica em `processar-autos/index.ts` (Trabalhista)

**Não reescrevo blocos. Só troco o critério de decisão dentro dos try/catch que já existem.** Cada ponto abaixo vira uma consulta a `resolveOcrFallback`:

- **Linha ~1142** (Gemini falhou → tentava Mistral): passa a consultar `resolveOcrFallback`. Com defaults, propaga o erro. Se você configurar `fallback=mistral` no DevPanel, comporta-se como hoje.
- **Linha ~2427** (MiniMax indisponível → caía em Gemini): mesma consulta. Com defaults, propaga (o Prev já faz assim com `MINIMAX_CLIENT_RASTERIZE_ERROR`).
- **Linha ~2436** (`shouldSkipMistral` por >45 MB): só executa se `ocr_fallback_on_size_exceeded=true`. Com default `false`, deixa Mistral tentar — se você o escolheu explicitamente, respeita sua ordem.
- **Linhas ~2456-2600** (Mistral falhou → caía em Gemini via `pdfBytesBackup`): mesma consulta. Com defaults, propaga.
- **Linhas 1689-1701** (chunked com Mistral hardcoded): substituo por `runOcrWithConfiguredProvider(...)` — o chunked continua chunked, mas passa a respeitar o `phase1_ocr_provider` do DevPanel. Este é o único hardcode "cego" que sai. Sem ele, o chunked seguirá sua escolha do DevPanel; se você escolheu Gemini, chunked usa Gemini.

**Escopo real da mudança no arquivo:** ~5 pontos, cada um trocando 2-3 linhas por uma chamada ao helper. Nenhum bloco reescrito. Nenhum import removido. Nenhum comportamento novo — só decisão migrada para config.

### 4. `_shared/ocr-router.ts` (usado pelo Previdenciário)

O `runOcrWithConfiguredProvider` **já respeita 100% o DevPanel** hoje. Adição única: quando `runOcrWithConfiguredProvider` recebe um erro final, consulta `resolveOcrFallback` antes de propagar — mesmo padrão do Trabalhista. Com defaults `enabled=false`, comportamento idêntico ao atual do Prev (propaga).

### 5. UI no DevPanel (`DevSettings.tsx`, seção OCR existente)

Adiciono abaixo do "Provedor de OCR", com aviso visual claro:

- Toggle **"Habilitar fallback de OCR"** (`ocr_fallback_enabled`) — default OFF.
- Select **"Provider de fallback"** (`ocr_fallback_provider`) — opções: `Nenhum`, `Gemini`, `Mistral`, `GLM` (após Bloco C), `MiniMax`. Default `Nenhum`. Desabilitado quando o toggle master está OFF.
- Toggle **"Trocar por fallback quando arquivo excede o limite do provider principal"** (`ocr_fallback_on_size_exceeded`) — default OFF, com nota: "Só relevante se Mistral for o principal (rejeita >50 MB) e você tiver fallback configurado."
- Banner informativo: "Por segurança, nenhum fallback é acionado automaticamente. Se o provider principal falhar, o processamento falha, exceto se você tiver explicitamente configurado um fallback aqui."

### 6. Instrumentação (barato, aproveita `import_jobs.result.steps[]`)

Cada etapa OCR grava `provider_requested` e `provider_used`. Divergência dispara log de warning. Assim você tem prova em cada job de que nenhum provider foi chamado fora da sua escolha.

### O que NÃO muda (garantias explícitas)
- **Trabalhista**: fluxo de processamento, chunking, single-pass, two-phase, prompts, preenchimento, exports, RLS — todos intocados. Só as decisões "vamos cair em X provider" migram para config.
- **Previdenciário**: `ocr-router` já era config-driven. Ganha só o hook de fallback (default OFF).
- **IA de texto (Fase 2, resumos, regeneração de campo)**: intocada. `ai-config.ts` continua exatamente como está — a regra do fallback OCR não se aplica a IA generalista.
- **Retry interno de cada provider** (429/500/503 dentro dos módulos `mistral-ocr.ts`, `pdf-visual-extractor.ts`, `glm-ocr.ts`): intocado.
- **MiniMax rasterização client-side**: intocada.
- **Prompts, structure, tabelas, migrations de negócio, exports DOCX/PDF**: intocados.

---

## Bloco B — Auditoria e blindagem contra hardcodes futuros

1. Varredura em `supabase/functions/**` para confirmar que nenhum arquivo fora de `_shared/` importa `extractWithMistralOCR`, `extractVisualContent`, `getMistralAPIKey` ou `getMinimaxAPIKey` diretamente. Já sei que `extrair-texto-pdf` está limpo. Confirmar `prev-pre-processar`, `minimax-ocr-chunk`, `gemini-ocr-chunk`.
2. Qualquer import direto encontrado → troca por `runOcrWithConfiguredProvider` (escolha inicial) + `resolveOcrFallback` (recuperação). Mesma técnica cirúrgica.
3. Atualizar `mem://architecture/devpanel-ai-config-global-scope.md` com a nova regra dura:
   > **Fallback de OCR é decidido exclusivamente em `system_config.ocr_fallback_*`. Nenhum arquivo em `supabase/functions/*/index.ts` pode encadear providers de OCR hardcoded. Toda decisão passa por `resolveOcrFallback`. Defaults do sistema nunca invocam Mistral.**

---

## Bloco C — GLM-OCR (Z.AI) como 4º provider

Adição limpa, sem tocar em Mistral/Gemini/MiniMax:

1. **`_shared/glm-ocr.ts`** — endpoint `POST https://api.z.ai/api/paas/v4/layout_parsing`, upload via signed URL do bucket `processos-pdf`, validação 50 MB/30 páginas, retry 3× com backoff em 429/500/503, parse de `md_results[]` com separador `=== PÁGINA N ===`.
2. **`_shared/ocr-router.ts`**: `OcrProvider` recebe `"glm"`, `runOcrWithConfiguredProvider` ganha branch com split defensivo interno (target 38 MB, máx 26 págs/parte, re-halving se alguma parte estourar).
3. **`DevSettings.tsx`**: 4º `SelectItem value="glm"` com badge "Econômico" no bloco "Provedor de OCR"; entrada em `AI_PROVIDERS` para gerenciar `GLM_API_KEY`; passa a ser opção no select de fallback do Bloco A.
4. **`DevSmokeTest.tsx`**: 4ª fixture com `phase1_ocr_provider = "glm"`.
5. **`mem/architecture/glm-ocr-integration.md`** + entrada no `index.md`.
6. **Secret**: `GLM_API_KEY` solicitado via `add_secret` no início do Bloco C.

---

## Ordem, risco e reversibilidade

1. **Bloco A** primeiro. Sobe com defaults seguros (`enabled=false`, `provider=none`). Comportamento em produção fica idêntico à situação atual **exceto pelo fato de que nenhum fallback silencioso rodará mais**. Você valida Trabalhista e Prev, depois liga fallback no DevPanel se e quando quiser.
2. **Bloco B** em seguida — auditoria, ajustes pontuais se algum hardcode remanescente aparecer, memória atualizada.
3. **Bloco C** por último, aditivo.

**Risco de quebrar Trabalhista/Previdenciário:** baixíssimo. As mudanças no `processar-autos` são substituições cirúrgicas dentro de try/catch existentes — mesma estrutura, decisão diferente. Nenhum fluxo de processamento, extração ou preenchimento é tocado.

**Reversibilidade:** total. Um `UPDATE system_config SET value='true' WHERE id='ocr_fallback_enabled'` + configurar fallback devolve o comportamento antigo. Reversão de código: um único revert por bloco.

**Ganho estrutural:** você elimina de vez a possibilidade de qualquer provider de OCR ser chamado fora da sua escolha explícita. O incidente da Mistral vira impossível por construção.

Confirmando dessa forma para prosseguir?
