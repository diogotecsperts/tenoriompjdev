
## Contexto

Duas lacunas ficaram do plano anterior, ambas contra a regra de "Trabalhista = paridade com Prev":

1. **Card "Estratégia de Importação" ainda no DevPanel** e edge function ainda lendo `system_config.import_strategy`. O plano aprovado adiou isso — foi decisão minha e não deveria ter sido, já que você já tinha decidido "sempre two-phase".
2. **MiniMax no Trabalhista continua caindo em fallback para Lovable/Gemini** dentro da edge function. O Prev nunca teve esse problema porque rasteriza cada página no browser (`minimax-ocr-client.ts`) e manda página-por-página ao endpoint `minimax-ocr-chunk`. O Trabalhista nunca implantou esse mesmo caminho.

Este plano fecha os dois, sem tocar em nenhum arquivo do Previdenciário.

## Alterações

### 1. Remover o toggle "Estratégia de Importação"

**a) `src/components/dev-panel/DevSettings.tsx`** — remover o card do seletor, o estado local associado, o handler de save, e qualquer texto/badge/tooltip referente a "single-pass vs two-phase". Manter todos os outros controles do DevPanel (OCR provider, phase1 gemini model, provider inventory, etc.) intactos.

**b) `supabase/functions/processar-autos/index.ts`** — no início do processamento, remover a leitura de `import_strategy` do `system_config` e forçar `usesTwoPhase = true`. Excluir o ramo single-pass inteiro (`else if (pdfSizeBytes > GEMINI_PROCESSING_LIMIT)`, `else if (pdfStream)`, `else if (pdfBytes)` no bloco single-pass, incluindo o legacy `processLargePDFWithSplit`). Manter só o pipeline two-phase (`processarChunkedPDFBackground` para arquivos chunked + o fluxo two-phase normal para arquivo único). O fallback de two-phase-failure → single-pass também é removido porque não faz mais sentido.

**c) Migration SQL:** `DELETE FROM public.system_config WHERE id = 'import_strategy';` — idempotente.

**d) Memória `mem://import-autos/gerenciamento-de-estrategias-de-importacao`** — reescrever para dizer "two-phase é o único caminho; single-pass foi removido em [data]".

### 2. Paridade MiniMax no Trabalhista

**a) `src/components/tools/ImportarAutosDialog.tsx`** — adicionar branch para `ocrConfig.provider === 'minimax'` no `processFile()`, análogo ao que fiz para GLM:
- Importar `runMinimaxClientOcr` de `src/lib/minimax-ocr-client.ts` (mesmo módulo que o Prev usa; é agnóstico de domínio, verificar antes de importar).
- Rasterizar páginas no browser e chamar `minimax-ocr-chunk` (edge function que o Prev já usa) para cada página, coletando o texto.
- Subir apenas o **texto extraído** como um "pré-OCR" ao invocar `processar-autos`, ou subir o PDF original mais o texto e passar um flag `preExtractedText`. **Preferido:** adicionar campo `preExtractedText` no body de `processar-autos` (paralelo ao que `prev-pre-processar` já faz), pulando a fase 1 quando presente.

**b) `supabase/functions/processar-autos/index.ts`** — aceitar `preExtractedText?: string` no body. Quando presente, pular fase 1 (OCR) e alimentar direto o `callAI` de estruturação (fase 2). Log claro: `[processar-autos] Recebido preExtractedText (N chars) — pulando fase 1 OCR`.

**c) Verificação prévia (antes de escrever código):** confirmar que `src/lib/minimax-ocr-client.ts` e a edge function `minimax-ocr-chunk` são módulo-agnósticos (não têm `pericia_id`/`prev_*` hardcoded). Se tiverem acoplamento com Prev, duplicar o cliente em `src/lib/minimax-ocr-shared.ts` seguindo o mesmo princípio de "duplicação em vez de extração" que usei para `pdf-preprocess.ts`.

**d) Modal de progresso** — reusar os slots existentes (`splitMessage`/`splitProgress`) para mostrar "MiniMax · rasterizando página X/Y" e "MiniMax · OCR página X/Y". O `getOcrSubStepLabel` já cobre MiniMax; ajustar se necessário.

### 3. Fora de escopo (mantido intocado)

- Todo `src/modules/previdenciario/**`, `supabase/functions/prev-*`, `_shared/ocr-router.ts`, `_shared/glm-ocr.ts`, `_shared/mistral-ocr.ts`, `_shared/ai-config.ts`.
- Pipeline pós-OCR (estruturação em campos, preview, criação do laudo).
- Buckets, RLS, colunas.

## Validação

1. `tsgo --noEmit` passa.
2. **DevPanel:** card "Estratégia de Importação" some. Nenhum outro card se move. `SELECT * FROM system_config WHERE id='import_strategy'` retorna 0 linhas.
3. **Trabalhista + GLM (pequeno e grande):** sem regressão do plano anterior.
4. **Trabalhista + Mistral:** sem regressão.
5. **Trabalhista + Gemini:** sem 404; provider e modelo vindos do DevPanel.
6. **Trabalhista + MiniMax:** modal mostra "MiniMax · rasterizando página X/Y" e "MiniMax · OCR página X/Y". Nenhum log de fallback para Lovable/Gemini. Extração populando os campos do laudo corretamente.
7. **Previdenciário:** smoke test em pauta grande. Zero alteração de tempo/comportamento.

## Riscos

- **Risco:** `minimax-ocr-client.ts` pode ter alguma dependência de `pericia_id` ou tabela do Prev. **Mitigação:** verificação prévia (item 2c). Se houver, duplico o cliente em vez de compartilhar. Prev fica intocado nos dois cenários.
- **Risco:** remover o ramo single-pass da edge function é uma cirurgia grande (~400 linhas). **Mitigação:** o two-phase já é o caminho testado; remover código morto reduz superfície de bug. Uso `tsgo` + smoke test dos quatro providers antes de considerar pronto.
- **Risco a Prev:** nulo. Nenhum arquivo do Prev é editado. `minimax-ocr-chunk` é reutilizado como serviço, não modificado.

## Confirmações que preciso antes do build

1. **Confirma a remoção do card + toggle + código single-pass da edge function?** (Você já sinalizou "sempre two-phase" antes, mas quero confirmar explicitamente porque é destrutivo.)
2. **Confirma a paridade MiniMax via `preExtractedText`** (Trabalhista rasteriza no browser + manda texto pronto para a edge function)?
