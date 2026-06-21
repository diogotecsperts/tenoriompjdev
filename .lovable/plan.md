## Objetivo

Adicionar ao editor do Pré-Laudo (módulo Previdenciário) uma forma de **escolher quais etapas (1 a 10) serão incluídas no PDF/DOCX exportado**, sem afetar o que fica salvo no app. A escolha é lembrada entre laudos.

## Como vai funcionar (UX)

1. **Novo botão** no cabeçalho do `PrelaudoEditor`, ao lado do botão "Baixar em PDF/DOCX": ícone de filtro/lista com rótulo curto, ex.: `Etapas no export (8/10)`.
2. Ao clicar, abre um **Popover** com:
   - Lista das 10 etapas (ordem + nome), cada uma com um `Checkbox`.
   - Atalhos: **Marcar todas** / **Desmarcar todas** / **Restaurar padrão (todas)**.
   - Texto auxiliar: "As etapas desmarcadas ficam salvas no app, mas não aparecem no PDF/DOCX."
3. A escolha é **persistida em `localStorage`** com a chave `prev:prelaudo:export-steps` (array de `StepId`). Vale para qualquer laudo que o usuário abrir depois — exatamente o comportamento pedido.
4. Default (quando nunca foi configurado): **todas as 10 marcadas** — comportamento atual preservado.
5. Se o usuário tentar exportar com **zero etapas marcadas**, mostramos um `toast` de aviso e cancelamos a exportação.

## Como vai funcionar (técnico)

Mudanças mínimas, isoladas ao módulo previdenciário. **Nada de backend, schema, RLS, prompts, IA, OCR ou outros módulos.**

### 1. `src/modules/previdenciario/lib/prelaudo-structure.ts`
- Exportar uma constante `ALL_STEP_IDS: StepId[]` derivada de `PRELAUDO_STEPS`.
- Adicionar helper puro `filterPrelaudoForExport(data, includedSteps)` que devolve um clone de `PrelaudoData` com as seções **não incluídas zeradas** (objetos vazios / arrays vazios), preservando a tipagem.
  - Por que zerar em vez de remover: os exporters atuais (`prelaudo-pdf.ts` e `prelaudo-docx.ts`) iteram pelas 10 seções fixas e já tratam seção vazia chamando `emptyNote(...)`. Para ocultar de verdade, precisamos da próxima mudança ⬇.

### 2. `src/modules/previdenciario/lib/export/prelaudo-pdf.ts` e `prelaudo-docx.ts`
- Acrescentar um parâmetro opcional `includedSteps?: StepId[]` em `generatePrelaudoPdf`, `downloadPrelaudoPdf`, `generatePrelaudoDocx`, `downloadPrelaudoDocx`.
- Quando informado, **pular completamente** a renderização das seções não incluídas (não imprime título, não imprime "Não informado"). A numeração visível dos títulos passa a ser sequencial só entre as incluídas (1, 2, 3…), o que evita "buracos" como `1. … 3. … 7. …`.
- Quando omitido, comportamento idêntico ao atual (todas as 10) — garantia de retrocompatibilidade.

### 3. Novo componente: `src/modules/previdenciario/components/ExportStepsSelector.tsx`
- Popover com `Checkbox` por etapa (usando `PRELAUDO_STEPS`).
- Props: `value: StepId[]`, `onChange(next: StepId[])`, `disabled?: boolean`.
- Botões "Todas", "Nenhuma", "Padrão".

### 4. `src/modules/previdenciario/pages/PrelaudoEditor.tsx`
- Novo estado `exportSteps: StepId[]` inicializado de `localStorage` (`prev:prelaudo:export-steps`), com fallback = `ALL_STEP_IDS`.
- `useEffect` grava no `localStorage` a cada alteração.
- Renderiza `<ExportStepsSelector />` no header, à esquerda do grupo do botão "Baixar em …".
- `handleExport` passa `exportSteps` para `downloadPrelaudoPdf` / `downloadPrelaudoDocx`.
- Validação: se `exportSteps.length === 0`, `toast` "Selecione ao menos uma etapa" e não exporta.

## O que NÃO muda
- Autosave, status da perícia, dados salvos no banco.
- Editor: todas as 10 etapas continuam visíveis e editáveis normalmente.
- Painel lateral, módulo Trabalhista, DevPrompts, edge functions, schema, RLS, buckets, secrets.
- Comportamento padrão da exportação para usuários que nunca tocarem no seletor (continua exportando tudo).

## Riscos
Praticamente nulos: a mudança é local ao módulo `previdenciario`, sem dependências cruzadas. O parâmetro novo nos exporters é opcional, preservando qualquer call site existente. A persistência via `localStorage` segue o mesmo padrão já usado em `VIEW_MODE_STORAGE_KEY` neste arquivo e em `prev:pautas:sort` na `PautaList`.

## Arquivos afetados
- `src/modules/previdenciario/lib/prelaudo-structure.ts` (adições)
- `src/modules/previdenciario/lib/export/prelaudo-pdf.ts` (parâmetro opcional + skip)
- `src/modules/previdenciario/lib/export/prelaudo-docx.ts` (idem)
- `src/modules/previdenciario/components/ExportStepsSelector.tsx` (novo)
- `src/modules/previdenciario/pages/PrelaudoEditor.tsx` (estado + UI + integração)