
## Objetivo

No painel **DevPanel → Controle de uso (Previdenciário)**, permitir baixar em lote os arquivos das perícias listadas dentro de cada pauta: **PDF original**, **DOCX processado** e **PDF processado**. Seleção via checkbox por linha + "marcar todos" no cabeçalho, e um dropdown de download que aparece somente quando há itens marcados, posicionado à esquerda do badge "xx perícias".

Downloads em lote são entregues como **um único arquivo ZIP** gerado no cliente (JSZip via dynamic import). Zero mudança em backend, RLS, edge functions, OCR ou fluxo de processamento.

## Comportamento

- Seleção **por pauta** (não global) — o dropdown é contextual à pauta.
- Checkbox em cada linha da tabela de perícias (nova coluna à esquerda do "#").
- Checkbox "marcar todos" no `TableHead` (marca/desmarca apenas as perícias visíveis daquela pauta após filtros).
- No cabeçalho da pauta (dentro do `AccordionTrigger`), à esquerda dos badges existentes, aparece — apenas quando `selectedCount > 0` — um botão dropdown **"Baixar N selecionadas ▾"** com três opções:
  - **PDF original** — habilitado se ≥1 selecionada tem `pdf_path`.
  - **DOCX processado** — habilitado se ≥1 selecionada tem `pdf_processado`.
  - **PDF processado** — idem.
- Tipos são baixados **um por vez** (não misturados em um mesmo ZIP), garantindo nomes previsíveis e um clique = um ZIP.
- Clicks nos checkboxes e no dropdown usam `e.stopPropagation()` para não abrir/fechar o accordion.
- Ao trocar de usuário, aplicar filtros ou dar reload, a seleção da pauta é limpa.

## Empacotamento (ZIP)

- **1 arquivo selecionado** → download direto (sem ZIP, evita fricção).
- **2+ arquivos** → gera `pericias-<YYYY-MM-DD>-<local>-<tipo>.zip` (nome saneado).
- JSZip carregado via **dynamic import** (`await import("jszip")`) — não impacta o bundle inicial.
- Compressão `STORE` (PDF/DOCX praticamente não comprimem; STORE é mais rápido e economiza CPU).
- Nomes internos: `${safeName}.pdf|docx`, com sufixo `-${ordem}` em caso de colisão.
- Falhas por item **não interrompem** o lote: as que falharem entram num `_erros.txt` dentro do ZIP listando `ordem`, `periciado_nome` e mensagem.
- Aviso de confirmação quando `soma(pdf_size_bytes) > 300MB` (para PDFs originais) — evita OOM em browsers modestos.
- Progresso no rótulo do botão: **"Empacotando 3/8…"** e botão `disabled` durante o lote.

## Fontes dos blobs (sem novos endpoints, sem novas policies)

- **PDF original**: `supabase.storage.from("prev-pdfs").download(pdf_path)` (já autorizado pela policy atual do dev que baixa PDFs individualmente) → retorna `Blob` → adiciona ao ZIP.
- **DOCX/PDF processado**: hoje `downloadPrelaudoDocx` e `downloadPrelaudoPdf` disparam download direto. Criaremos variantes que retornam `Blob`:
  - `buildPrelaudoDocxBlob(periciaId): Promise<Blob>`
  - `buildPrelaudoPdfBlob(periciaId): Promise<Blob>`
  - As funções `downloadPrelaudoDocx` / `downloadPrelaudoPdf` são reescritas como wrappers finos que chamam a variante blob + `saveAs` — **comportamento observável idêntico** ao atual, garantindo não-regressão nos botões individuais.

## Detalhes técnicos

- Novo dep: `jszip` (MIT). Nada além disso.
- Novo state em `PrevUsagePanel`:
  - `selectedByPauta: Record<string, Set<string>>`
  - `batchProgress: { pautaId: string; done: number; total: number; kind: "orig"|"docx"|"pdf" } | null`
- Helpers locais: `toggleSelect`, `toggleSelectAll`, `clearSelection(pautaId)` chamado em: troca de `filters.userId`, mudanças relevantes de filtros, e após término/erro do lote.
- `<Checkbox>` de `@/components/ui/checkbox` (já existente no projeto shadcn).
- Sequencial dentro do ZIP (`for … await`) para não estourar memória; append de cada blob logo após o fetch, e `URL.revokeObjectURL` no final.

## Arquivos alterados

- `src/components/dev-panel/usage/PrevUsagePanel.tsx` — UI de seleção, dropdown, orquestração do ZIP.
- `src/modules/previdenciario/lib/export/prelaudo-docx.ts` — extrair `buildPrelaudoDocxBlob`; `downloadPrelaudoDocx` vira wrapper.
- `src/modules/previdenciario/lib/export/prelaudo-pdf.ts` — extrair `buildPrelaudoPdfBlob`; `downloadPrelaudoPdf` vira wrapper.
- `package.json` — adicionar `jszip`.

## Fora de escopo (garantias de não-regressão)

- Sem mudanças em: RLS, edge functions, `dev-save-pericia-pdf-meta`, `processar.ts`, upload em lote, geração de laudo, prompts, IA, storage buckets, tipos gerados.
- Botões individuais de download por linha continuam funcionando idênticos.
- Badges "xx perícias / xx PDFs / xx proc." permanecem inalterados.
- Pipeline de geração de DOCX/PDF processado é preservada — apenas exposta uma variante que retorna `Blob`.
