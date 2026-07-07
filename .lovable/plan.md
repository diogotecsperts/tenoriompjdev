
## Objetivo

Adicionar, ao lado do botão "Etapas do export" no editor de Pré-Laudo Previdenciário, um novo botão compacto (apenas ícone) que abre um popover permitindo marcar/desmarcar **Cabeçalho** e **Rodapé** timbrados. A escolha vale simultaneamente para PDF e DOCX e é lembrada entre laudos (localStorage), sem alterar nada de lógica de negócio.

## Ícone

Usar `LayoutTemplate` do lucide-react — remete visualmente a "página com cabeçalho e rodapé" e é intuitivo mesmo sem rótulo. Tooltip: "Cabeçalho e rodapé". Só o ícone no botão para não poluir a linha no mobile.

## Arquivos a criar/editar

### 1. Novo componente `src/modules/previdenciario/components/ExportChromeSelector.tsx`
- Popover no mesmo padrão visual de `ExportStepsSelector`.
- Trigger: `Button variant="outline" size="sm"` com apenas `<LayoutTemplate className="h-4 w-4" />`, `title="Cabeçalho e rodapé"`.
- Conteúdo: título "Cabeçalho e rodapé no export", texto curto de ajuda, e dois checkboxes: "Cabeçalho timbrado" e "Rodapé timbrado" (com numeração de página).
- Props: `value: { header: boolean; footer: boolean }`, `onChange`, `disabled?`.

### 2. `src/modules/previdenciario/pages/PrelaudoEditor.tsx`
- Novo state `exportChrome` inicializado do localStorage (`prev:prelaudo:export-chrome`, default `{ header: true, footer: true }`) com persistência via `useEffect`.
- Renderizar `<ExportChromeSelector>` imediatamente após `<ExportStepsSelector>` no header.
- Passar `exportChrome` para `downloadPrelaudoPdf` e `downloadPrelaudoDocx` como quarto argumento.

### 3. `src/modules/previdenciario/lib/export/prelaudo-pdf.ts`
- Nova opção `chrome?: { header?: boolean; footer?: boolean }` em `generatePrelaudoPdf` e `downloadPrelaudoPdf` (default `{ header: true, footer: true }`).
- Se `header === false`: não carregar/aplicar `headerB64` (passar `null` em `calculateDynamicLayout` e pular `addHeaderToPages`). Layout usa `contentStartY` padrão (margem topo simples).
- Se `footer === false`: idem para o rodapé, pular `addFooterToPages` (some também a numeração "Página X de Y", que hoje é desenhada em branco sobre o timbrado).

### 4. `src/modules/previdenciario/lib/export/prelaudo-docx.ts`
- Mesma opção `chrome` no `generatePrelaudoDocx`/`downloadPrelaudoDocx`.
- Se `header === false`: não incluir o `ImageRun` do cabeçalho e reduzir `page.margin.top` para `"20mm"` (valor padrão sem timbrado).
- Se `footer === false`: não incluir `ImageRun` do rodapé nem o parágrafo "Página X de Y" (sem timbrado, o número em branco ficaria invisível), e reduzir `page.margin.bottom` para `"20mm"`.
- Se ambos ativos: comportamento atual preservado.

## O que não muda

- Nada de business logic, nada em `laudo-structure`, nada em prompts/IA, nada nas outras exportações (laudo assistencial, impugnação). Apenas presença visual do cabeçalho/rodapé nos exports do pré-laudo previdenciário.
- `ExportStepsSelector` permanece intacto.
