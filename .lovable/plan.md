# Plano — Filtro de Módulo no DevPrompts

## Objetivo
Adicionar um seletor de **Módulo** no topo do DevPrompts. Ao escolher um módulo, toda a página (navegação lateral, cards/seções, agrupamento de prompts, busca, checklist de cobertura, "Verificar atualizações", export PDF) passa a refletir **apenas** o módulo selecionado — mantendo exatamente o mesmo layout e recursos que já existem hoje para o Trabalhista. O módulo Trabalhista continua **100% intocado** em comportamento e dados.

## Como vai funcionar (UX)

- Novo segmented control no header do DevPrompts: **`[ Trabalhista ]  [ Previdenciário ]`** (default = Trabalhista, persistido em `localStorage`).
- Ao trocar de módulo:
  - A sidebar de navegação re-renderiza com os cards/seções daquele módulo.
  - O conteúdo central mostra os mesmos componentes (cards expansíveis, badges Gerar/Regerar/Importar, editor de prompt, scroll-spy, busca, "Não classificados") — só que filtrados.
  - "Verificar atualizações", "Sincronizar metadados", "Carregar padrões" e "Exportar PDF" passam a operar apenas no escopo do módulo selecionado.
- Layout, cores, ícones e fluxo: idênticos ao atual. Nada muda visualmente para quem usa só Trabalhista.

## Arquitetura (separação segura)

### 1. Definir estrutura do módulo Previdenciário (novo arquivo)
`src/modules/previdenciario/lib/prev-prompts-structure.ts` — espelha o formato de `LAUDO_CARDS_STRUCTURE`:

- Cards correspondentes aos 10 steps do `PRELAUDO_STEPS` (Identificação, Queixa, Medicação, …, Conclusão), agrupados em ~3 cards lógicos (Anamnese, Exame, Diagnóstico) ou 1 card por step — definir no detalhe técnico abaixo.
- Cada seção mapeia para um `prompt_prev_*` esperado.
- Exporta também `PREV_EXPECTED_PROMPT_TYPES` (análogo a `EXPECTED_PROMPT_TYPES`).

Hoje existem dois prompts registrados em runtime (`prompt_prev_extracao_processo`, `prompt_prev_queixa_unificada`); a estrutura já prevê os campos futuros, e prompts ainda não criados aparecem como "faltando" no checklist de cobertura — mesmo padrão do Trabalhista.

### 2. Registry de módulos (novo arquivo)
`src/lib/prompts-modules-registry.ts`:

```ts
export type PromptModule = "trabalhista" | "previdenciario";

export const PROMPT_MODULES = {
  trabalhista: {
    label: "Trabalhista",
    cards: LAUDO_CARDS_STRUCTURE,
    promptCards: PROMPT_ONLY_CARDS,
    expectedTypes: EXPECTED_PROMPT_TYPES,
    fixedConfig: FIXED_CONFIG_SECTIONS,
    promptIdPrefixes: ["prompt_gen_", "prompt_regen_", "prompt_import_", "prompt_system_", "prompt_aprimorar"],
    // qualquer prompt que NÃO comece com "prompt_prev_"
    matchPromptId: (id) => !id.startsWith("prompt_prev_"),
    icons: cardIconsTrabalhista,
  },
  previdenciario: {
    label: "Previdenciário",
    cards: PREV_CARDS_STRUCTURE,
    promptCards: [],
    expectedTypes: PREV_EXPECTED_PROMPT_TYPES,
    fixedConfig: {},
    promptIdPrefixes: ["prompt_prev_"],
    matchPromptId: (id) => id.startsWith("prompt_prev_"),
    icons: cardIconsPrev,
  },
};
```

O filtro por módulo é **puramente client-side** sobre o resultado já carregado de `system_config` — nenhuma mudança de schema, RLS, edge function ou contrato de dados.

### 3. Refactor mínimo do `DevPrompts.tsx`
- Adicionar `const [activeModule, setActiveModule] = useState<PromptModule>(localStorage…)`.
- Substituir as referências diretas a `LAUDO_CARDS_STRUCTURE`, `PROMPT_ONLY_CARDS`, `EXPECTED_PROMPT_TYPES`, `FIXED_CONFIG_SECTIONS`, `cardIcons` por leitura via `PROMPT_MODULES[activeModule]`.
- Em `classifiedPrompts` / `unclassifiedPrompts`, filtrar antes pelo `matchPromptId(p.id)` do módulo ativo. Prompts do outro módulo ficam **invisíveis** mas permanecem no estado — sem qualquer escrita/exclusão.
- Renderizar o segmented control no header (ao lado do botão "Verificar atualizações").
- `expandedCards`, `scrollSpy`, `searchTerm` resetam ao trocar de módulo.
- Export PDF, seed, sync metadata: passar `module` no body para que `seed-prompts` opere só no escopo correto (ver passo 4). Se preferir conservador, manter sem alteração e apenas avisar no toast qual módulo foi afetado — discutir no detalhe técnico.

### 4. Edge function `seed-prompts` (opcional, conservador)
Aceitar `module?: "trabalhista" | "previdenciario"` no body de `check_updates` / `sync_metadata` / `seed`. Default = `trabalhista` (preserva comportamento atual). Quando ausente: comportamento idêntico ao de hoje. Isso é o que garante "não afetar trabalhista".

> Se preferirmos zero risco no backend nesta passagem, podemos deixar o filtro só no frontend agora e o Previdenciário usa as mesmas ações em escopo global — porém isso pode misturar contagens. Recomendo incluir o filtro em `seed-prompts`.

### 5. Métodos / configs fixas
`FIXED_CONFIG_SECTIONS` é só do Trabalhista hoje. Para Previdenciário fica vazio (sem botão "Metodologia"). Trabalhista continua mostrando o modal e o card como hoje.

## Resultados esperados
- Trabalhista: **nenhuma diferença visual ou funcional** com filtro em "Trabalhista".
- Previdenciário: mesma página, mesma rica funcionalidade, com seus próprios cards/seções e prompts `prompt_prev_*`.
- Sem alterações em RLS, schema, buckets, edição/execução de prompts no runtime de cada módulo.

## Detalhes técnicos

### Estrutura proposta para `PREV_CARDS_STRUCTURE`
```
preliminares-prev    → Identificação, Processo (extração)         [import: prompt_prev_extracao_processo]
anamnese-prev        → Queixa, Medicação, Acompanhamento,
                       Comorbidades                                [import: prompt_prev_queixa_unificada, + futuros]
exame-prev           → Estado mental, Ectoscopia, Ortopédico       [futuros]
diagnostico-prev     → CID-10, Conclusão                           [futuros]
```
Cada seção tem `id` = step id (`identificacao`, `queixa`, …). `EXPECTED_PROMPT_TYPES` para cada seção marca `['import']` onde já há prompt, e fica vazio onde ainda não há — checklist mostrará "faltando" sem quebrar nada.

### Mapeamento de prompts → seções
`prompt_prev_extracao_processo` → card `preliminares-prev` / seção `identificacao` (ou seção dedicada `processo`).
`prompt_prev_queixa_unificada` → card `anamnese-prev` / seção `queixa`.
Mapeamento feito via `cardId`/`sectionId` salvos pelo próprio `getPrompt()` ao registrar — exatamente como o Trabalhista faz hoje. Os prompts já gravados (sem `cardId`) caem em "Não classificados" do módulo Previdenciário até serem reclassificados (mesma UX já existente).

### Persistência da seleção
`localStorage.devPromptsModule` (com fallback "trabalhista"). Não persistir em DB para não introduzir nova tabela.

## Arquivos afetados
- **Novo:** `src/modules/previdenciario/lib/prev-prompts-structure.ts`
- **Novo:** `src/lib/prompts-modules-registry.ts`
- **Editar:** `src/components/dev-panel/DevPrompts.tsx` (refactor para ler do registry + segmented control)
- **Editar (opcional, recomendado):** `supabase/functions/seed-prompts/index.ts` (aceitar `module` no body, default = trabalhista)

## Fora de escopo
- Não mexer em prompts/edge functions de runtime do Trabalhista.
- Não migrar prompts existentes nem alterar tabela `system_config`.
- Não criar cards/seções inexistentes do Previdenciário antes de existirem prompts reais — manter o checklist "faltando" é a forma honesta de mostrar cobertura.
- Não tocar em `DevOriginalFiles`, `DevUserSettings`, etc.
