# Plano Combinado — DevPanel "Arquivos Originais" + Correção dos Quesitos

Dois ajustes **totalmente isolados** do pipeline de produção. Nada do que existe hoje (importação, IA, geração de laudo, exportação) muda comportamento. Cumpre a diretriz de **Isolamento Total**.

---

## PARTE 1 — Aba "Arquivos Originais" no DevPanel

### Objetivo
Permitir que você (developer) acesse, sem solicitar manualmente, qualquer PDF original já enviado por qualquer usuário, organizados por perito e espelhando o histórico de laudos.

### Avaliação de viabilidade e segurança
- **Dados já existem**: bucket `processos-pdf` (privado) tem ~379 arquivos, todos preservados (nenhum auto-delete). Tabela `import_jobs` mantém `file_path` ligado ao `user_id`.
- **Acesso restrito**: a função usará `is_developer()` (RPC já existente) + `SUPABASE_SERVICE_ROLE_KEY` para gerar **signed URLs temporárias (1h)**. O bucket continua privado.
- **Risco zero ao app**: nenhuma alteração em `processar-autos`, `extrair-texto-pdf`, `LaudoContext`, RLS de tabelas de produção, schema, prompts ou pipelines de IA. É uma "leitura paralela".
- **Reflexão automática dos PDFs pré-existentes**: sim, basta listar `import_jobs` (todos os 151 registros já estão lá com `file_path`).

### Arquivos a criar

| Arquivo | Função |
|---|---|
| `supabase/functions/dev-list-pdfs/index.ts` | Lista `import_jobs` agrupados por usuário (com filtro opcional `user_id`). Valida JWT + `is_developer()` server-side. Retorna metadados (path, criado_em, status, laudo vinculado se houver). |
| `supabase/functions/dev-download-pdf/index.ts` | Recebe `{ file_path }`, valida developer, gera signed URL de 1h via service_role e retorna `{ url, expires_at }`. |
| `src/components/dev-panel/DevOriginalFiles.tsx` | UI da aba. Tela 1: grid de usuários (nome, email, MED###, total de PDFs). Tela 2 (ao clicar): tabela espelhando o histórico — data de upload, nome do arquivo, processo (se vinculado a laudo), status do job, badge "✓ Laudo gerado", botão **Baixar** (chama `dev-download-pdf` e abre em nova aba). |

### Arquivos a editar (mínimo, cirúrgico)

| Arquivo | Alteração |
|---|---|
| `src/pages/DevPanel.tsx` | Adicionar 1 item ao array `navItems` ("Arquivos Originais", ícone `FileArchive`), 1 case no `switch`, 1 entrada no type `DevTab`. ~4 linhas. |
| `supabase/config.toml` | Adicionar `[functions.dev-list-pdfs]` e `[functions.dev-download-pdf]` com `verify_jwt = true`. |

### Arquivos NÃO tocados
`LaudoContext.tsx`, `processar-autos`, `extrair-texto-pdf`, `regerar-campo-pdf`, `gerar-quesitos`, prompts, schema do banco, RLS de qualquer tabela de produção, exportadores DOCX/PDF, `ImportarAutosDialog`, todas as seções do laudo.

### Segurança
- Validação dupla: JWT do Supabase + `is_developer()` em **toda** request das duas functions (rejeita 403 caso contrário).
- Bucket permanece **privado**.
- Signed URLs expiram em 1h (não são públicas, não ficam em log).
- Sem RPC nova, sem mudança em policies existentes.
- Auditável: cada chamada loga em `backend_logs` (tabela já existente).

### Reflexão dos PDFs pré-existentes
Automática — a UI lê `import_jobs` direto. Os 120 PDFs do Diogo + 31 do Bruno aparecem imediatamente após deploy, agrupados.

---

## PARTE 2 — Correção dos Quesitos no DOCX/PDF (pendente da rodada anterior)

### Diagnóstico confirmado
Em `src/utils/generateLaudoDOCX.ts` e `src/utils/generateLaudoPDF.ts`, o regex `/\[.{3,}\]/` dentro de `PLACEHOLDER_PATTERNS` marca como "vazio" qualquer campo que contenha colchetes em qualquer posição (ex.: `[CID-10]`, `[anotação do perito]`), suprimindo o conteúdo inteiro. É por isso que "Quesitos da Reclamada" some completamente do DOCX do laudo do VALDEMIR (mais de 14k caracteres válidos sendo escondidos).

### Correção cirúrgica
Trocar **uma linha** em cada um dos dois arquivos:
- **De:** `/\[.{3,}\]/`
- **Para:** `/^\s*\[.{3,}\]\s*$/` (só suprime se o campo INTEIRO for um placeholder isolado)

Mantém `/\[INSERIR/i` para continuar pegando placeholders explícitos da IA.

### Arquivos a editar
- `src/utils/generateLaudoDOCX.ts` — 1 linha
- `src/utils/generateLaudoPDF.ts` — 1 linha

### Arquivos NÃO tocados
Prompts, edge functions, `LaudoContext`, schema, seções, IA.

### Impacto esperado
- "Quesitos da Reclamada" passa a aparecer no DOCX/PDF do VALDEMIR e dos outros 5 laudos afetados.
- "Quesitos do Reclamante" continuará exibindo "Quesitos do Reclamante não identificados nos autos" quando o PDF realmente não trouxer perguntas — esse texto vem da IA, é resposta legítima, não bug.

---

## Resumo de risco

| Item | Risco para produção |
|---|---|
| Aba Arquivos Originais | **Zero** — funções novas isoladas, bucket continua privado, sem mudança em tabelas de produção. |
| Correção Quesitos DOCX/PDF | **Mínimo** — regex mais restritiva, só deixa de suprimir conteúdo válido. Comportamento de placeholders explícitos preservado. |

Aprove para eu executar as duas partes na mesma rodada, ou diga se prefere uma de cada vez.
