## Objetivo

Ao lado do botão **Baixar PDF original** em Controle de uso → Previdenciário, mostrar um badge discreto com **tamanho do arquivo** e **quantidade de páginas** (ex.: `18 MB · 150 pgs`).

## Por que sob demanda

Cada perícia é um PDF no bucket `prev-pdfs`. Para descobrir:

- **Tamanho** — 1 HEAD na signed URL (barato, alguns KB de headers).
- **Páginas** — precisa baixar o PDF e ler com `pdf-lib` (já instalado). PDFs de perícia costumam ter 20–150 MB. Para um usuário com 53 perícias (caso do Bruno), o carregamento automático faria dezenas de downloads em background — inaceitável.

Portanto, o carregamento é **opt-in** via botão.

## UX

### Botão global no topo da lista de pautas
Ao lado do título "Pautas & Perícias" (mesma linha do badge "ao vivo"), adicionar:

```
[ 📊 Carregar tamanho/páginas ]
```

- Estado idle → texto acima.
- Estado loading → spinner + `Carregando 12/53...`.
- Estado done → botão vira `↻ Atualizar` (discreto, `variant="ghost"`).
- Só habilitado se houver ≥1 perícia com `pdf_path` na visão filtrada.
- Ao clicar: processa apenas perícias visíveis (respeita filtros) e que ainda não tenham dados em cache. Concorrência limitada a **4 requisições em paralelo** para não travar o navegador nem estourar quota de signed URLs.

### Badge inline em cada linha
Na coluna "Ações", antes do botão de download do PDF original:

```
[ 18 MB · 150 pgs ]  [ ⬇ ]
```

- `variant="outline"`, `text-xs`, `text-muted-foreground`, sem cor forte — apenas informativo.
- Enquanto o item específico está sendo carregado: `[ ... ]` com Loader2 spin pequeno.
- Se só o tamanho voltou (falha ao contar páginas): `[ 18 MB ]`.
- Se o PDF ainda não foi carregado: **não renderiza nada** (linha fica limpa).
- Se `pdf_path` for null: nada muda (botão de download já fica desabilitado).

### Cache em memória
Estado local `Map<periciaId, { sizeBytes: number; pages: number | null }>`. Cache persiste enquanto o usuário está na aba; troca de usuário limpa o cache. Realtime `UPDATE` que troca o `pdf_path` invalida a entrada correspondente.

## Detalhes técnicos

Arquivo único afetado: `src/components/dev-panel/usage/PrevUsagePanel.tsx`.

1. Novo estado:
   ```ts
   const [pdfMeta, setPdfMeta] = useState<Map<string, { size: number; pages: number | null }>>(new Map());
   const [loadingMeta, setLoadingMeta] = useState<Set<string>>(new Set());
   const [metaProgress, setMetaProgress] = useState<{ done: number; total: number } | null>(null);
   ```

2. Helper `formatSize(bytes)` → `"18 MB"` / `"850 KB"`.

3. Função `loadOneMeta(periciaId, path)`:
   - `supabase.functions.invoke("dev-download-pdf", { body: { file_path: path, bucket: "prev-pdfs" } })` → signed URL.
   - `fetch(url, { method: "HEAD" })` → `size = Number(res.headers.get("content-length"))`. Salva parcial no cache já.
   - `fetch(url)` → `arrayBuffer` → `PDFDocument.load(bytes, { updateMetadata: false })` → `pages = doc.getPageCount()`. Falhas na contagem não bloqueiam: guarda `pages: null`.
   - Update no `pdfMeta` via functional setState.

4. Função `loadAllVisibleMeta()`:
   - Coleta `filteredPericias.filter(p => p.pdf_path && !pdfMeta.has(p.id))`.
   - Concorrência 4 (fila simples com Promise).
   - Atualiza `metaProgress` conforme completa.

5. Import: `import { PDFDocument } from "pdf-lib";` (lazy import dentro da função pra não pesar no bundle inicial: `const { PDFDocument } = await import("pdf-lib");`).

6. Realtime `UPDATE` de perícia: se `payload.new.pdf_path !== payload.old.pdf_path`, remover do cache.

7. Troca de `filters.userId` → `setPdfMeta(new Map()); setMetaProgress(null);`.

## Fora de escopo

- Não altera edge functions, migrations, KPIs, filtros, badge "ao vivo", downloads de pré-laudo, nem `DevOriginalFiles`.
- Nenhuma persistência de metadados no banco — cache é apenas em memória durante a sessão da aba.
- Nada muda para o usuário final (Bruno etc.); é exclusivo do dev panel.

## Verificação

1. Abrir Controle de uso → Previdenciário → selecionar Bruno (MED001).
2. Confirmar que a lista carrega instantaneamente (sem downloads automáticos).
3. Clicar "Carregar tamanho/páginas" → progresso incrementa e badges aparecem linha a linha.
4. Baixar um PDF conferindo que o tamanho bate.
5. Recarregar a página e confirmar que nada é buscado até novo clique.
