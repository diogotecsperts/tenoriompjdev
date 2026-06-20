# Plano: Toggle Paginado ↔ Scroll Infinito no Pré-Laudo Previdenciário

## Entendimento

Replicar no `PrelaudoEditor` exatamente o mesmo mecanismo de alternância de visualização já existente no `LaudoEditor` (Trabalhista):

- Botão único `variant="outline" size="icon"` com tooltip.
- Ícones: `Scroll` quando está em modo paginado (sugere alternar p/ infinito) e `LayoutGrid` quando está em infinito.
- Hook `useScrollSpy` reutilizado (já é genérico, vive em `src/hooks/` — não viola isolamento).
- Persistência da escolha em `localStorage` por chave dedicada do módulo.

## Padrão a replicar (extraído do Trabalhista)

| Elemento | Origem (LaudoEditor.tsx) |
|---|---|
| Tipo | `type ViewMode = "paginated" \| "infinite"` |
| Estado | `useState<ViewMode>` inicializado de `localStorage` |
| Persistência | `useEffect` salvando em `localStorage` |
| Hook | `useScrollSpy({ sectionIds, enabled: viewMode==="infinite", scrollContainerRef })` |
| Sync | quando `scrollSpyActiveId` muda → atualiza `currentStep` |
| Click step | em modo infinito, `scrollToSection("step-<id>")`; em paginado, troca `currentStep` |
| Render | paginado = só etapa atual + nav prev/next; infinito = todas com `space-y-8` |
| Botão | `Tooltip` + `Button outline icon` com `Scroll`/`LayoutGrid` no header |

## Mudanças (escopo cirúrgico)

### 1. `src/modules/previdenciario/pages/PrelaudoEditor.tsx`
- Adicionar `ViewMode`, `viewMode`, `setViewMode`, `VIEW_MODE_STORAGE_KEY = "prev-prelaudo-view-mode"`.
- `mainContentRef` no `<div className="flex-1 overflow-y-auto …">` central.
- `sectionIds = PRELAUDO_STEPS.filter(s=>s.implemented).map(s=>`step-${s.id}`)` (memo).
- `useScrollSpy({ sectionIds, offset: 100, enabled: viewMode==="infinite", scrollContainerRef: mainContentRef })`.
- `useEffect` sincronizando `scrollSpyActiveId` → `setCurrentStep`.
- `useEffect` persistindo `viewMode` no localStorage.
- Função `handleStepSelect(id)`: se infinito, `scrollToSection("step-"+id)`; senão `setCurrentStep(id)`. Passar para `<StepNav onSelect>`.
- No header (ao lado direito do "Salvo …" e antes do botão de exportar), inserir o mesmo botão de toggle (ícone `Scroll`/`LayoutGrid` + Tooltip).
- No corpo, condicional:
  - **paginado** (atual): `renderStep(currentStep, …)` + footer Prev/Próxima.
  - **infinito**: `PRELAUDO_STEPS.filter(s=>s.implemented).map(s => <section id={`step-${s.id}`} key={s.id} className="scroll-mt-24 space-y-3"><h2 className="text-lg font-semibold text-foreground">{s.ordem}. {s.label}</h2>{renderStep(s.id, data, setData)}</section>)` dentro de `<div className="space-y-10 pb-12">`.

### 2. `src/modules/previdenciario/components/StepNav.tsx`
- Adicionar prop opcional `mode?: "paginated" | "infinite"` apenas para destacar visualmente o item ativo via scroll-spy (a destaque já vem do `current` que será sincronizado pelo spy). Nenhuma outra mudança.

## Garantias

- **Isolamento**: nenhuma importação de `src/pages/LaudoEditor`, `src/components/laudo/*` ou `src/contexts/LaudoContext`. Só reutiliza `useScrollSpy` (hook genérico, sem regra de negócio do Trabalhista) e shadcn UI.
- **Sem regressão**: módulo Trabalhista intacto. Edge functions, schema, prompts e export PDF/DOCX intactos.
- **Robustez**:
  - `enabled: viewMode === "infinite"` evita listener desnecessário em modo paginado.
  - `setCurrentStep` só dispara se id realmente mudou.
  - `scroll-mt-24` em cada seção evita que o topo fique escondido sob o header sticky.
  - Persistência por chave própria (`prev-prelaudo-view-mode`) sem conflitar com a chave do Trabalhista.

## Como validar depois

1. Abrir uma perícia, clicar no botão `Scroll` → todas as 10 etapas aparecem empilhadas; rolar e ver o item ativo no `StepNav` mudando.
2. Clicar em um item do `StepNav` em modo infinito → rola suavemente até a seção.
3. Clicar de novo no botão (agora `LayoutGrid`) → volta para a visão paginada na etapa atual.
4. Recarregar a página → modo escolhido é preservado.
5. Conferir que o LaudoEditor (Trabalhista) continua funcionando idêntico.

## Fora do escopo

- Mudar paleta/cores do módulo.
- Refatorar `StepNav` ou `renderStep`.
- Mexer no Trabalhista ou em qualquer função de exportação.
