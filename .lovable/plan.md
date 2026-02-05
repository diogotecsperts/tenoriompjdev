
## O que eu encontrei (por que está confuso hoje)

### 1) Os “nomes” que aparecem na coluna **Importar** não são nomes de campos — são “títulos internos” do catálogo de importação
- No seu caso, **o texto mostrado no card** vem do `description` salvo no banco (`system_config.description`), e **esse description é construído a partir de `DEFAULT_IMPORT_PROMPTS[...].section`** (arquivo `supabase/functions/_shared/build-import-prompt.ts`), via `seed-prompts`.
- Só que nesses defaults eu vi coisas como:
  - `section: 'ACIDENTE - EXTRAÇÃO DETALHADA OBRIGATÓRIA'`
  - `section: 'AFASTAMENTOS'`
  - `section: 'INFORMAÇÕES MÉDICAS - NEXO CAUSAL'`
- Isso é ótimo como “título de capítulo” do prompt monolítico, mas **péssimo como nome de campo na UI**, porque não bate com:
  - os labels do editor (`História do Acidente`, `Histórico Ocupacional`, etc.)
  - os nomes que você já vê em **Regerar** (que estão mais próximos do “nome do campo”).

Resultado: você vê “ACIDENTE - EXTRAÇÃO…” na Importação e “História do Acidente” no Regerar, parecendo que são coisas diferentes — quando na prática são o mesmo alvo.

---

### 2) A ordem na seção “Dados do Acidente” está invertida entre Importar e Regerar
Pelos dados atuais do banco:
- Importar:
  - `prompt_import_historiaAcidente` tem `order = 3`
  - `prompt_import_historicoOcupacional` tem `order = 4`
  -> portanto aparece primeiro “História do Acidente” (mesmo que com nome ruim), depois “Histórico Ocupacional”
- Regerar:
  - `prompt_regen_historicoOcupacional` tem `order = 1`
  - `prompt_regen_historiaAcidente` tem `order = 2`
  -> portanto aparece primeiro “Histórico Ocupacional”, depois “História do Acidente”

E no editor (componente `src/components/laudo/sections/DadosAcidente.tsx`) a ordem é:
1) Histórico Ocupacional  
2) História do Acidente

Ou seja: **Regerar está alinhado ao editor; Importar não**.

---

### 3) Existe um problema real de “classificação” (cardId/sectionId) em pelo menos 2 prompts de Importar
No `build-import-prompt.ts` e no `seed-prompts/index.ts`, os mapeamentos estão usando `sectionId` que **não existem** na `LAUDO_STRUCTURE`, por exemplo:
- `prompt_import_vitima` está indo para `preliminares/dados-vitima` (mas no laudo-structure o correto é `periciando/vitima`)
- `prompt_import_processo` está indo para `preliminares/dados-processo` (mas o correto é `preliminares/processo`)

Isso causa:
- prompt cair como “órfão” (unclassified/orphaned) ou aparecer em lugar errado
- perda de confiança na organização (com razão)

---

## Confirmação: quais campos “não terem Importar / Gerar / Regerar” está correto?

Vou te dar a lógica do sistema (por design), usando o que está hoje no banco + como o editor funciona:

### A) Seções/campos que normalmente terão **Importar**, mas podem NÃO ter **Regerar**
Motivo: o editor usa `Input/Select` simples sem botão “Regerar via PDF” (logo não existe prompt_regen para aquilo).
- **Dados da Vítima** (Inputs/Selects): faz sentido ter Importar; Regerar não existe hoje porque não há botão no UI para esses campos.
- **Dados do Processo** (Inputs): idem.
- **Dados Funcionais do Posto** (cargo/datas): idem (são Inputs; só o textão “Ambiente e Atividades” tem botão Regerar).

Isso é coerente; o que precisa é: a UI deixar isso “óbvio” e a nomenclatura ficar idêntica aos campos.

### B) Seções/campos que normalmente terão **Gerar**, mas podem NÃO ter **Importar**
Motivo: são textos analíticos/sintéticos criados a partir do conjunto de dados, não “copiados” do PDF.
- **Nexo Causal (Gerar)**: é análise; não é “extração literal”.
- **Incapacidade (Gerar)**: análise.
- **Referências Bibliográficas (Gerar)**: geração.
- **Resumos (Gerar)**: geração.

Também é coerente.

### C) Seções/campos que podem ter **Regerar**, mas não necessariamente terão **Importar** (ou terão Importar indireto)
Exemplo importante:
- **Conclusão (campo conclusao_analise)** hoje aparece com **Regerar** (porque você consegue reextrair/reharmonizar do PDF), mas a importação inicial dele acontece **via resumo/geração**, não por um prompt_import dedicado do mesmo “campo”.
Então: “não ter Importar” ali pode ser aceitável, mas também pode ser melhorado (opcional) criando um `prompt_gen_conclusao` ou mudando o pipeline. Isso é uma segunda etapa; primeiro vamos alinhar a organização.

---

## Melhor forma de alinhar nomes e ordem (o que vou ajustar)

### Objetivo prático
1) Na tela Prompts IA, dentro de cada seção, **Importar / Gerar / Regerar precisam listar os mesmos “nomes de campos”**, quando estiverem falando do mesmo campo.
2) A ordem dentro da seção deve acompanhar **a ordem do editor** (para você bater o olho e confiar).

### Mudanças propostas (sem alterar comportamento de extração, só “organização + consistência”)
1) **Renomear os “títulos” dos prompts de Importar** (as strings `DEFAULT_IMPORT_PROMPTS[...].section`) para virarem “nome do campo” (ex.: `História do Acidente`, `Histórico Ocupacional`, etc.).
   - As regras “EXTRAÇÃO DETALHADA OBRIGATÓRIA” continuam, mas **dentro do corpo do prompt** (não no nome).
2) **Trocar a ordem** de `prompt_import_historicoOcupacional` e `prompt_import_historiaAcidente` para ficar igual ao editor:
   - `historicoOcupacional` antes
   - `historiaAcidente` depois
   - Mantendo números únicos globais, para não bagunçar a montagem do prompt modular.
3) **Corrigir cardId/sectionId** (classificação) dos prompts de Importar para bater 100% com `src/lib/laudo-structure.ts`:
   - `prompt_import_vitima` -> `periciando / vitima`
   - `prompt_import_processo` -> `preliminares / processo`
   - e revisar os demais para garantir que nenhum usa sectionId inexistente.
4) **Ajustar descrições de Regerar** que estão genéricas e não refletem o label real do campo (ex.: no posto de trabalho, o Regen está como “Dados do Posto de Trabalho”, mas o campo é “Ambiente e Atividades Laborais”).
5) **Melhoria de UX no DevPrompts**: exibir também o `prompt.id` (ou “fieldKey”) no mini-card, porque:
   - mesmo com descrições alinhadas, o ID é o “identificador definitivo”
   - isso elimina 90% da confusão quando houver qualquer dúvida.

---

## Como vou “auditar” para garantir que não tem mais pontos cegos

Depois das correções, vou validar assim:
1) Rodar uma listagem (via app) para checar **prompts órfãos** (cardId/sectionId que não existem na estrutura).
2) Conferir seção por seção:
   - se a seção tem campo com botão “Regerar via PDF” no editor, tem que existir `prompt_regen_*` correspondente.
   - se a seção é preenchida no `ImportarAutosDialog` a partir do JSON extraído, tem que existir o `prompt_import_*` correspondente (quando aplicável).
   - se a seção é analítica (resumos, nexo, incapacidade, referências), tem que existir `prompt_gen_*`.
3) Confirmar que a ordem (campo `order`) dentro de cada tipo bate com o editor.

---

## Implementação (passo a passo)
1) Atualizar `supabase/functions/_shared/build-import-prompt.ts`
   - trocar nomes `section` dos defaults para “nome de campo” (UI-friendly)
   - ajustar orders no bloco de defaults (especialmente “Dados do Acidente”)
   - corrigir `getCardIdForPrompt` e `getSectionIdForPrompt` para usar IDs reais do `laudo-structure`
2) Atualizar `supabase/functions/seed-prompts/index.ts`
   - corrigir `cardMapping` de import prompts (vitima/processo e quaisquer outros)
   - ajustar `description` dos prompts import/regen para ficarem equivalentes aos labels do editor
3) Atualizar `src/components/dev-panel/DevPrompts.tsx`
   - no `PromptMiniCard`, mostrar também o `prompt.id` (em fonte monoespaçada), para garantir identificação inequívoca
4) Você executa “Sincronizar Metadados” no DevPanel (isso atualiza description/cardId/sectionId/order no banco preservando o texto que você já editou).
5) Checklist final:
   - Conferir “Dados do Acidente”: Importar e Regerar com mesmos nomes e mesma ordem
   - Conferir “Dados da Vítima” e “Dados do Processo” aparecem na seção correta
   - Conferir aba “Não classificados” sem prompts de importação que deveriam estar classificados

---

## Observação importante (para manter confiança)
Essas mudanças propostas são “seguras” porque:
- não alteram a tabela do laudo
- não mudam o *conteúdo* do prompt (apenas o “nome/label” e metadados de organização), exceto onde decidirmos mover “EXTRAÇÃO OBRIGATÓRIA” do título para dentro do texto (o que é até melhor)
- usam a própria rotina de “sync_metadata” que preserva prompts customizados

Se você aprovar, eu implemento essa correção de consistência e aí sim você pode começar a ajustar os prompts com confiança total na organização.
