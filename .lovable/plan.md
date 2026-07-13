
# Continuação: PDF grande + Observabilidade + Smoke Test

Divido em 3 blocos independentes, aprovados/executados na ordem. Nada aqui toca `laudo-structure.ts`, prompts, RLS de tabelas de domínio, ou o MiniMax M3 como IA principal.

---

## Bloco 1 — Restaurar caminho estável (PDFs ≤ 20MB) e paralelizar PDFs grandes

**Diagnóstico:** as últimas iterações no PDF grande introduziram lógica que também passou a rodar no caminho pequeno. Precisamos separar de novo os dois caminhos e só então mexer no grande.

1. **`ImportarAutosDialog.tsx`** — reintroduzir *fast path* explícito:
   - `file.size ≤ 20MB` → upload direto para `processar-autos` com `strategy: single_pass`, sem chunking, sem rasterização client-side. Este é o caminho que funcionava.
   - `file.size > 20MB` → caminho de PDF grande (client-side split + MiniMax rasterizado).
   - Decisão gravada em `import_jobs.result.route` (`fast_small` vs `chunked_large`) para inspeção.

2. **Paralelismo real na rasterização MiniMax (PDF grande)**:
   - Hoje as páginas são rasterizadas em série no browser. Trocar por pool com concorrência configurável (default 4, expor no DevPanel como `minimax_render_concurrency`).
   - Cada página vira uma chamada isolada a `minimax-ocr-chunk`; se uma falhar, é retentada 2× com backoff antes de propagar erro visível (não é fallback cross-provider — é retry na mesma página/mesmo provider, coerente com sua regra).
   - Sem trocar provider automaticamente. MiniMax é a escolha; se cair, o job fica em `failed` com erro por página.

3. **Preservar o modo `two_phase` do Trabalhista** — nada muda nele, só garantir que ele continua roteando por `text_fill_*` como hoje.

---

## Bloco 2 — Job status e logs ponta a ponta (OCR → preenchimento → exportação) ✅ IMPLEMENTADO

Aproveita `import_jobs` + `backend_logs` que já existem. Sem tabela nova.

1. **Padronizar etapas em `import_jobs.result.steps[]`** — cada etapa grava:
   ```json
   {
     "step": "upload" | "split" | "ocr" | "fill" | "export",
     "provider": "minimax|openrouter|lovable|null",
     "model": "MiniMax-M3|...",
     "started_at": "...",
     "finished_at": "...",
     "duration_ms": 1234,
     "status": "ok|error",
     "error": null | "mensagem",
     "meta": { "pages": 114, "tokens_in": ..., "tokens_out": ... }
   }
   ```

2. **Instrumentação nas edge functions** (helper `logStep(jobId, step, fn)` em `_shared/`):
   - `processar-autos` — envolve OCR (por chunk), preenchimento por campo modular, e o dispatch final.
   - `minimax-ocr-chunk` / `gemini-ocr-chunk` — cada chunk grava `ocr.chunk` com página, provider, tempo.
   - `gerar-resumos`, `regerar-campo-pdf`, `gerar-quesitos` — cada um empurra sua etapa.
   - Exportação DOCX/PDF (client-side) — o `LaudoEditor` envia POST a um endpoint fino `log-step` (nova edge function trivial) ou insere direto em `backend_logs` via RLS já existente. Prefiro **insert direto do client** (RLS permite ao dono do job); evita edge function nova.

3. **DevPanel — aba "Job Timeline"**:
   - Nova aba (`src/components/dev-panel/DevJobTimeline.tsx`) listando os últimos N `import_jobs` do dev + timeline de cada job (etapas, tempo, provider, erro).
   - Filtro por status (`processing|ok|failed`) e por usuário (via edge function `dev-list-jobs` com service-role + `is_developer()`, seguindo a regra de isolamento).
   - Botão "Baixar JSON" do job (dump `import_jobs.result` + `backend_logs` filtrados).

4. **Nada é logado com PII de conteúdo do laudo** — só metadados: tempos, provider, tamanho, contagem de páginas, mensagens de erro. Regra de compliance mantida.

---

## Bloco 3 — Smoke test no DevPanel (PDF pequeno + Trabalhista)

Objetivo: 1 clique valida OCR → preenchimento → export.

1. **Fixtures**: 2 PDFs pequenos versionados em `public/dev-fixtures/`:
   - `smoke-generico.pdf` (~1 pág, texto simples)
   - `smoke-trabalhista.pdf` (~2 págs, com quesitos e dados básicos)
   Servidos como assets estáticos — não vão pro storage do backend.

2. **Nova aba DevPanel — "Smoke Test"** (`DevSmokeTest.tsx`):
   - Botão "Rodar smoke test" → executa em sequência, com barra de progresso:
     1. Baixa fixture → chama fluxo real de `ImportarAutosDialog` em modo headless (mesma função de upload).
     2. Aguarda `import_jobs` chegar em `ok`.
     3. Valida `laudos.<campos-chave>` preenchidos: `nome_periciando`, `numero_processo`, `quesitos_juizo`, `cid_principal`, `metodologia_pericial`, `conclusao`. Cada campo tem regra mínima (não-vazio, ≥ N chars ou match regex).
     4. Chama export DOCX + PDF em memória e confere: arquivo gerado, tamanho > 10KB, contém string âncora esperada ("LAUDO PERICIAL").
     5. Repete para trabalhista, validando adicionalmente `posto_trabalho` e `nexo_causal`.

3. **Relatório na tela**: matriz verde/vermelha por etapa e por campo. Cada linha exporta o `job_id` para inspecionar na aba Job Timeline. Nada é salvo como laudo definitivo — cria-se laudo com flag `is_smoke_test = true` e uma migração adiciona essa coluna + policy pra dev deletar em massa.

4. **Botão "Limpar smoke tests"** — chama edge function `dev-cleanup-smoke-tests` (service-role, `is_developer()`) que apaga `laudos` com essa flag e seus `import_jobs`. Zero risco de bagunçar dados reais de usuários.

---

## Detalhes técnicos

- **Ordem de execução**: Bloco 1 → validação manual sua com 1 PDF pequeno + 1 grande → Bloco 2 → Bloco 3.
- **Migração necessária**: `laudos.is_smoke_test boolean default false` + índice parcial. Nada mais no schema.
- **Concorrência MiniMax**: variável `minimax_render_concurrency` em `system_config`, default 4, editável no DevSettings.
- **Sem retry cross-provider** em lugar nenhum (regra sua). Retry só na mesma página/mesmo provider, no máximo 2×, antes de erro visível.
- **RLS**: `backend_logs` já tem policies suficientes. `laudos` policy nova só cobre delete pelo dev via edge function.
- **Não toca**: prompts, `laudo-structure.ts`, exports (formato), OCR provider selection (segue DevPanel), `two_phase` do Trabalhista.

## Diagrama do fluxo instrumentado

```text
[Upload]──log(upload)──▶[Split? size>20MB]──log(split)──▶[OCR por chunk]──log(ocr.chunk × N)
                                                                │
                                                                ▼
                                    [Preenchimento por campo]──log(fill.<campo> × M)
                                                                │
                                                                ▼
                                          [Export DOCX/PDF]──log(export.docx / export.pdf)
                                                                │
                                                                ▼
                                                    import_jobs.status = ok|failed
```

## Perguntas antes de executar

1. **Concorrência MiniMax default 4 está OK?** Se seu plano MiniMax tem rate-limit apertado, começamos em 2.
2. **Fixture do smoke test trabalhista** — posso gerar um PDF sintético (nome/processo/quesitos fictícios) ou você prefere fornecer um real anonimizado?
3. **Bloco 1 primeiro isolado, ou posso mandar Bloco 1 + migração da coluna `is_smoke_test` juntos** (a coluna não afeta nada até o Bloco 3)?
