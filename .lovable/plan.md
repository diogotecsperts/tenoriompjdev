## Problemas

1. **Out of Memory** ao clicar "Carregar tamanho/páginas": baixamos o PDF inteiro em `arrayBuffer` e passamos para `pdf-lib` — com 4 downloads paralelos de PDFs de 20–150 MB, o navegador estoura memória.
2. **Dados não persistem**: cache é só em memória. Mudar de aba, trocar de usuário ou recarregar apaga tudo.

## Solução

### 1. Persistência real no banco (resolve #2 de vez)

Adicionar duas colunas em `prev_pericias`:
- `pdf_size_bytes bigint`
- `pdf_pages integer`

Assim os valores ficam gravados por perícia, aparecem instantaneamente em qualquer sessão/dispositivo, e só é preciso "carregar" uma vez por PDF na vida.

O carregamento automático da lista em `PrevUsagePanel` já traz esses campos (via edge function `dev-list-prev-usage`), então os badges renderizam de cara sem nenhum fetch extra.

Quando o `pdf_path` muda (realtime UPDATE), zeramos `pdf_size_bytes` e `pdf_pages` para forçar recontagem sob demanda.

### 2. Evitar OOM (resolve #1)

Reescrever `loadOneMeta` para ser bem mais leve:

- **Concorrência 1** (uma perícia por vez). PDFs de perícia são pesados; paralelismo aqui não vale o risco.
- **HEAD primeiro** para obter tamanho. Grava `pdf_size_bytes` no banco imediatamente — se o navegador travar depois, pelo menos o tamanho ficou salvo.
- **Skip de contagem de páginas para PDFs > 80 MB**: badge exibe só o tamanho (`150 MB`). Evita baixar arquivos gigantes só para contar páginas.
- **Streaming controlado**: `fetch → arrayBuffer → PDFDocument.load(bytes, { updateMetadata: false }) → getPageCount()` e imediatamente descartamos a referência (`bytes = null`) antes do próximo item. Sem `Promise.all` acumulando buffers.
- **Import lazy** do `pdf-lib` mantido (`await import("pdf-lib")`), fora do laço para não reimportar.
- **Try/catch por item**: falha de um PDF não aborta o lote. Registra `pdf_pages = null` e segue.
- **Botão "Cancelar"** aparece durante o loading para o dev interromper se algo travar.

### 3. Ajustes de UI

- Badge continua igual: `18 MB · 150 pgs`, ou `18 MB` quando páginas não puderam ser contadas (arquivo muito grande / erro).
- Se a perícia já tem `pdf_size_bytes` no banco, o badge aparece direto — sem precisar clicar em nada.
- Botão global vira `↻ Atualizar detalhes faltantes` e só processa perícias visíveis **sem** dados salvos ainda.
- Progresso: `Analisando 12/53...`.

## Detalhes técnicos

**Migration** (`prev_pericias`):
```sql
ALTER TABLE public.prev_pericias
  ADD COLUMN IF NOT EXISTS pdf_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS pdf_pages integer;
```
Sem mudança de RLS/GRANTs (colunas novas em tabela existente).

**Edge function `dev-list-prev-usage`**: adicionar `pdf_size_bytes` e `pdf_pages` no `select` e no objeto `periciasSlim`.

**`PrevUsagePanel.tsx`**:
- Estado `pdfMeta` passa a hidratar a partir dos campos das perícias no primeiro load, e sincroniza gravações pontuais.
- `loadOneMeta` grava resultado via `supabase.from("prev_pericias").update({ pdf_size_bytes, pdf_pages }).eq("id", periciaId)` (política dev/admin já permite).
- `loadAllVisibleMeta` roda em série (`for...of await`), com `abortRef` para cancelamento.
- Constante `MAX_PDF_BYTES_FOR_PAGECOUNT = 80 * 1024 * 1024`.
- Realtime `UPDATE`: se `pdf_path` mudou, disparar `update` zerando `pdf_size_bytes`/`pdf_pages` (opcional; se já vier zerado pelo UPDATE original, apenas remove do `pdfMeta`).
- Ao trocar de usuário, `pdfMeta` é reconstruído do banco — nada de `new Map()` vazio.

## Fora de escopo

- Nenhuma mudança em downloads, filtros, KPIs, `DevOriginalFiles`, exports, ou fluxo do usuário final.
- Não vamos calcular páginas server-side (evita rodar pdf-lib em edge function; custo/complexidade não justifica).

## Verificação

1. Migration roda; colunas aparecem.
2. Abrir Controle de uso → Bruno (MED001): perícias já processadas antes ainda aparecem sem badge (colunas vazias).
3. Clicar "Carregar detalhes" → badges preenchem uma por vez, sem OOM.
4. Mudar de aba, voltar → badges continuam lá.
5. Recarregar página → badges continuam lá.
6. Fazer novo upload de PDF numa perícia → badge some (invalidação) até próximo clique.
7. Testar com PDF > 80 MB: badge mostra só o tamanho, sem travar.
