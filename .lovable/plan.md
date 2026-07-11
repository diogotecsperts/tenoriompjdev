
# Plano — Melhorias seguras no Previdenciário

Escopo: **exclusivamente o módulo Previdenciário**. Nenhuma alteração em IAs, edge functions de OCR, prompts, provider inventory, ou fluxo de outros módulos (Trabalhista, Impugnação, Laudo). Zero risco arquitetural.

---

## 1. Triagem das sugestões do Lovable

| Sugestão | Veredito | Motivo |
|---|---|---|
| Logs/métricas detalhadas de OCR/Files API | **Descartar** | Já temos `ai_usage_logs`, `backend_logs`, `error_logs` + painéis Dev (DevAIUsageLogs, DevBackendLogs, DevErrorLogs, DevAIEfficiency, DevRetryStats). Redundante. |
| Testes de integração OCR | **Descartar** | Requer mocks caros de Gemini/Mistral/MiniMax e altera pipeline crítica. Alto risco de falso positivo/negativo travando build. Não é "altamente seguro". |
| Toast acionável com tamanho/provider/passo | **Parcial — Aceitar (item A)** | Já classificamos `code`, `stage`, `provider`, `model`. Falta só um bloco pequeno já-existente + sugestão de próxima ação. Pura UI. |
| Retry automático alternando estratégia | **Descartar** | O backend já faz cascading retry (`gemini-payload-cascading-retry-strategy`) e fallback entre providers via `ocr-router` / `ai-config`. Adicionar retry no frontend duplicaria custo e cota. |
| Painel de erros por etapa | **Descartar** | `DevBackendLogs` + `DevErrorLogs` + `prev_processing_jobs.technical_detail/stage/error_code` já cobrem. |
| requestId/correlation ID no toast + log | **Aceitar (item B)** | Baixíssimo risco. Já temos `jobId` no fluxo assíncrono; basta exibi-lo no toast de erro e no console (copiar). |
| Botão "Tentar novamente" | **Aceitar (item C)** | Trivial — reusa `handleProcessar`. Só UI. |
| Relatório de depuração em PDF | **Descartar** | Custo alto; dev já tem acesso completo via DevPanel. |
| Overlay de status progressivo | **Descartar** | Já existe `processandoDetalhes[p.id]` mostrando stage em tempo real linha a linha, mais `useFakeProgress`. Redundante. |

---

## 2. Correções pedidas

### A) Toast/erro mais acionáveis + Retry (itens A, B, C acima)

Arquivo: `src/modules/previdenciario/pages/PautaDetalhe.tsx`

- Adicionar `jobId` (quando presente na `PreProcessarError`) e uma linha "Sugestão:" no `description` conforme o `code`:
  - `provider_timeout` / `response_truncated` → "Tente novamente; o backend usará o fallback automático."
  - `file_too_large` → "PDF acima do limite — tente dividir manualmente."
  - `quota_exceeded` → "Verifique cota do provider no DevPanel."
- Persistir a última perícia falhada em state (`lastFailedId`) e mostrar um botão "Tentar novamente" no toast (via `action` do sonner/useToast) que chama `handleProcessar(pericia)` novamente.
- Propagar `jobId` em `PreProcessarError`:
  - `src/modules/previdenciario/api/processar.ts` — adicionar campo `jobId?: string` na classe e preencher a partir de `AsyncPreProcessarStart.jobId` durante o polling.

**Impacto**: só frontend `PautaDetalhe.tsx` + tipagem de erro em `processar.ts`. Nada de backend.

---

### B) Explicação/consistência do "Processar" vs "Processar pendentes"

Diagnóstico do código atual (`PautaDetalhe.tsx` linhas 138-238):

- **Processar (por perícia)**: chama `preProcessarPericia(id)`, que hoje devolve `async: true` + `jobId` — o backend roda em background e o frontend faz polling via `check-prev-processing-status`.
- **Processar pendentes**: itera `pendentes[]` em `for` **sequencial** (`await` dentro do loop). Uma por vez. Espera a anterior concluir antes de disparar a próxima.

**Ambos usam exatamente o mesmo pipeline** (`preProcessarPericia`). A única diferença é serialização.

Ação: **apenas documentar em UI** — adicionar tooltip no botão "Processar pendentes" explicando "Processa uma por vez, na ordem da lista. N pendentes." Nenhuma mudança de comportamento.

---

### C) DevPanel → Controle de uso → persistência de tamanho/páginas

Arquivo: `src/components/dev-panel/usage/PrevUsagePanel.tsx` (linha 469-484 `persistMeta`)

**Causa raiz do sumiço**: o `persistMeta` faz `supabase.from("prev_pericias").update(...)` diretamente pelo cliente. Como o dev está autenticado com sua própria sessão e os registros pertencem a outro usuário, a **RLS bloqueia o UPDATE silenciosamente** (o try/catch engole o erro). Isso viola a regra de memória `dev-access-isolation`: dev nunca deve escrever em tabelas de domínio via RLS.

Correção segura (padrão já usado por `dev-list-prev-usage`, `dev-download-pdf`, `dev-get-pericia-data`):

1. **Nova edge function** `supabase/functions/dev-save-pericia-pdf-meta/index.ts`
   - Autenticação via `Authorization` header
   - Verificação `is_developer()`
   - Cliente service-role faz o `update` em `prev_pericias` (só colunas `pdf_size_bytes` e `pdf_pages`)
   - Payload: `{ periciaId, sizeBytes, pages }`
   - Retorno: `{ ok: true }`
   - `verify_jwt = true` em `supabase/config.toml`

2. **Ajustar `PrevUsagePanel.tsx`**:
   - `persistMeta` passa a chamar `supabase.functions.invoke("dev-save-pericia-pdf-meta", { body })`
   - Também remover o `update` client-side em linha 366-368 (invalida cache ao trocar PDF) — mover para a mesma edge function ou simplesmente deixar o backfill sob demanda.

**Sem migração de banco** — colunas já existem. Sem mudança em RLS. Sem impacto em outros módulos.

---

### D) Upload de PDFs em lote dentro da pauta

Objetivo: cliente sobe N PDFs de uma vez; cada arquivo vira uma **nova perícia com PDF anexado** e status `aguardando`, **sem processar**.

Arquivos:

1. **Novo componente** `src/modules/previdenciario/components/UploadLotePdfsDialog.tsx`
   - Input `<input type="file" accept="application/pdf" multiple />` + área drag-and-drop
   - Lista dos arquivos escolhidos com nome/tamanho e botão remover
   - Validações client-side por arquivo:
     - MIME `application/pdf`
     - Tamanho ≤ 150 MB (limite prático do storage/OCR)
   - Botão "Enviar N arquivos" com progresso `feito/total` e barra por arquivo
   - Cada arquivo:
     1. Cria uma nova perícia via `createPericia({ pauta_id, ordem: proximaOrdem+i })` (API já existente em `pautas.ts`).
     2. `uploadPericiaPdf(user.id, pericia.id, file)` (já existente).
     3. `updatePericia(pericia.id, { pdf_path, pdf_processado: false, periciado_nome: nome_sugerido })`.
   - Nome sugerido do periciado = nome do arquivo sem extensão, truncado (pode ser editado depois).
   - Sequencial (uma perícia por vez) para não estourar o upload do storage nem criar buracos de `ordem`. Um erro isolado não trava o restante — coleta lista de falhas e mostra no fim.
   - Cancelável (flag `abortRef.current`).

2. **`PautaDetalhe.tsx`**:
   - Novo botão "Upload em lote" ao lado de "Nova perícia" que abre o dialog.
   - `onDone` → `reload()`.

3. **`pautas.ts`**: se `createPericia` não existir com essa assinatura, adicionar helper thin em cima do que já tem — sem tocar em schema.

**Nenhuma mudança no backend, RLS, OCR ou storage bucket.** Apenas encadeia chamadas já existentes.

---

## 3. O que NÃO será feito

- Não alterar `pdf-visual-extractor.ts`, `ocr-router.ts`, `ai-config.ts`, `prev-pre-processar/index.ts`, `check-prev-processing-status/index.ts`.
- Não alterar `DevSettings.tsx`, prompts, `prompt-manager`, ou lista de modelos.
- Não criar tabelas nem migrations.
- Não mexer em Trabalhista, Impugnação, Laudo, dashboards, ou auth.

---

## 4. Detalhes técnicos

```text
Arquivos criados:
  supabase/functions/dev-save-pericia-pdf-meta/index.ts
  src/modules/previdenciario/components/UploadLotePdfsDialog.tsx

Arquivos editados:
  supabase/config.toml                                      (bloco da nova função)
  src/modules/previdenciario/api/processar.ts               (jobId em PreProcessarError)
  src/modules/previdenciario/pages/PautaDetalhe.tsx         (toast+retry, tooltip, botão upload lote)
  src/components/dev-panel/usage/PrevUsagePanel.tsx         (persistMeta via edge function)
  src/modules/previdenciario/api/pautas.ts                  (helper createPericia se necessário)
```

Ordem de execução após aprovação:

1. Edge function + config.toml (deploy).
2. Ajuste `PrevUsagePanel.persistMeta` → validar que ao clicar "carregar tamanho/páginas" e sair, os badges permanecem.
3. `processar.ts` + `PautaDetalhe.tsx` toast/retry/tooltip.
4. Dialog de upload em lote + botão na pauta.

Validação: `tsgo`, abrir `/dev-panel` (controle de uso), carregar metas, trocar de aba e voltar; abrir uma pauta, upload em lote 3 PDFs pequenos, conferir 3 perícias criadas com PDF anexado e status `aguardando` (não processadas).
