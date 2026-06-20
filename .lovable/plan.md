# Plano: Export DOCX + PDF do Pré-Laudo com paridade visual ao Trabalhista

## Entendimento (confirmação)

Sim, entendi perfeitamente. Hoje o módulo Previdenciário só exporta PDF, e com um visual próprio (faixa teal #2A9D8F) que destoa do resto do programa. O que você quer:

1. **Adicionar export DOCX** ao Pré-Laudo Previdenciário.
2. **Botão único com toggle** PDF ↔ DOCX, idêntico ao do Editor Trabalhista (split button + ícone `ArrowLeftRight`).
3. **Estrutura visual** (cabeçalho, rodapé, fonte, margens, numeração de página, estilos de título de seção) **rigorosamente igual** ao Trabalhista — o "esqueleto" do documento, não o conteúdo.
4. **Conteúdo permanece 100% previdenciário** (os 10 steps do `PrelaudoData`).
5. **Isolamento total**: nada novo no `src/utils/` nem em `src/lib/laudo-structure.ts`. Tudo dentro de `src/modules/previdenciario/`.

## Padrão estrutural a replicar (extraído do Trabalhista)

| Elemento | Origem | Reuso |
|---|---|---|
| Banner topo | `public/timbrado-cabecalho.png` (floating, full-width, borda superior) | mesmo asset |
| Banner rodapé | `public/timbrado-rodape.png` + "Página X de Y" branco centralizado sobre o banner | mesmo asset |
| Página | A4, margens **20 mm esq / 15 mm dir / 45 mm topo / dinâmico rodapé** | igual |
| Fonte | Arial, 10pt corpo, 12pt título, 11pt subtítulo, 8pt rodapé | igual |
| Cores | `#1B3665` primária (azul institucional) p/ títulos de seção, `#1F2937` texto, `#4B5563` muted | igual |
| Numeração páginas | `Página X de Y` rodapé centralizado | igual |
| Nome arquivo | `prelaudo-<processo>-<periciado>.{pdf|docx}` (mesmo padrão de slug) | adaptado |

> Observação importante: o teal #2A9D8F **deixa de aparecer no documento exportado** — ele continua sendo a cor de identidade da **UI** do módulo Previdenciário (sidebar, botões, steps). Só o documento final ganha o "esqueleto institucional" comum aos dois módulos. Isso resolve a sensação de "outro programa" no entregável final sem misturar as UIs dos módulos.

## Arquivos a criar / alterar (todos dentro de `src/modules/previdenciario/`)

### 1. `lib/export/_shared-export.ts` (novo)
Helpers compartilhados entre PDF e DOCX deste módulo:
- `loadImageAsBase64(url)` e `loadImageAsArrayBuffer(url)`
- `getImageDimensions(url)`
- `calculateDynamicLayout(headerB64, footerB64)` → devolve margens dinâmicas em mm
- `buildPeritoIdLine(meta)` (mesma formatação "Dr. Fulano — CRM/UF NNN")
- `slugifyName(s)` e `fmtDate(iso)`
- Constantes `COLORS`, `FONT`, `PAGE` idênticas às do Trabalhista

> **Nada disso é importado de `src/utils/`** — é uma cópia adaptada vivendo no namespace do módulo, preservando o isolamento.

### 2. `lib/export/prelaudo-pdf.ts` (refatorar)
Reescrever para usar a mesma "casca" do `generateLaudoPDF.ts`:
- Carrega `/timbrado-cabecalho.png` e `/timbrado-rodape.png`
- `addHeaderToPages` + `addFooterToPages` rodando em **todas** as páginas após o build
- Numeração `Página X de Y` em branco sobre o rodapé
- Linha "Perito Judicial: Dr. X — CRM/UF NNN" no topo da página 1
- Títulos de seção com a mesma tipografia/cor azul `#1B3665` do Trabalhista
- Conteúdo continua sendo os 10 steps do `PrelaudoData` (Identificação, Queixa, Medicação, …, Conclusão) — função de render por seção mantida, só muda o "chrome"

### 3. `lib/export/prelaudo-docx.ts` (novo)
Espelho do `generateLaudoDOCX.ts`:
- Mesmas `page.margin` (`top: 45mm`, `left: 20mm`, `right: 15mm`, rodapé dinâmico, `header: 0mm`, `footer: 0mm`)
- `Header`/`Footer` com `ImageRun` floating (PNG do timbrado), `behindDocument: false`
- Rodapé com `PageNumber.CURRENT` / `PageNumber.TOTAL_PAGES` em branco
- Render dos 10 steps em `Paragraph` + `TextRun` com Arial/tamanhos padrão
- `Packer.toBlob` + `saveAs` (já temos `file-saver` no projeto via Trabalhista)
- Export `downloadPrelaudoDocx(data, meta)`

### 4. `pages/PrelaudoEditor.tsx` (UI do toggle)
Substituir o botão atual `Exportar PDF` por exatamente o mesmo padrão do `LaudoEditor.tsx` (linhas 853–883):
- `useState<'pdf'|'docx'>('pdf')` para `exportFormat`
- Split button: `[Baixar em PDF/DOCX] [⇄]`
- `Tooltip` "Alternar para DOCX/PDF"
- `handleExport()` decide entre `downloadPrelaudoPdf` e `downloadPrelaudoDocx`

## Garantias de isolamento

- Zero import cruzado: o novo código **não** importa de `src/utils/generateLaudo*` nem de `src/lib/laudo-structure.ts` nem de `src/contexts/LaudoContext`.
- `LaudoData` (Trabalhista) **não** é tocado. `PrelaudoData` (Previdenciário) **não** muda.
- Os PNGs `/timbrado-*` em `public/` são assets estáticos compartilhados — usá-los nos dois módulos é o que cria a identidade visual única do programa, sem acoplar código.
- Edge functions, schema do banco e prompts: **nenhuma alteração**.

## Como verificar depois de aplicado

1. Abrir uma perícia previdenciária com dados preenchidos.
2. Clicar em "Baixar em PDF" → conferir banner topo/rodapé idênticos ao Trabalhista, fonte Arial, numeração de página.
3. Alternar com ⇄ → "Baixar em DOCX" → abrir no Word e conferir mesma estrutura.
4. Verificar que o módulo Trabalhista continua exportando sem qualquer alteração.

## Fora do escopo (não vou fazer agora)

- Mudar paleta da UI do Pré-Laudo (sidebar/steps continuam teal).
- Mexer no Trabalhista, em `src/utils/generateLaudo*`, ou no schema.
- Adicionar imagens/anexos novos ao documento.
- Tocar na edge function `prev-pre-processar` (a correção de truncamento já foi aplicada).

Confirma que posso seguir com esse plano?
