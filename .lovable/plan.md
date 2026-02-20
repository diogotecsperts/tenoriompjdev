

# Avaliação de Viabilidade — 6 Sugestões Analisadas

---

## Estado Confirmado Após Leitura do Código

Antes de avaliar as sugestões, o diagnóstico do estado atual após as sessões anteriores:

**REGEN (`regerar-campo-pdf/index.ts`):**
- Camada 1 (banco): CORRIGIDA
- Camada 2 (system prompt nos dois `callAI`): CORRIGIDA (linhas 525 e 662)
- Camada 3 (fallbacks `fieldPrompts`): CORRIGIDA (`laudosMedicos` e `examesComplementares` em formato plano)

**GERAR (`gerar-resumos/index.ts`):**
- O system prompt é `prompt_system_gerar_resumos` buscado dinamicamente via `getPrompt()` — sem instrução de plain text
- O fallback `defaultSystemPrompt` (linha 386) diz: "Você é um perito médico especialista..." — sem qualquer regra de formatação
- Os prompts `sugestoes_pericia` e `referencias_bibliograficas` **instruem Markdown explicitamente** (`##`, `###`, marcadores `-`)
- A interpolação das variáveis usa `${ctx.variavel}` no fallback hardcoded — funciona corretamente
- Os prompts do banco usam `\${variavel}` — interpolados corretamente pelo `getPrompt()`

---

## Sugestão 1 — "Restaurar Prompt Individual" dentro do PromptEditor

**Viabilidade: ALTA. Totalmente segura, zero risco de regressão.**

O `seed-prompts/index.ts` já contém o objeto `regenPrompts` com os defaults hardcoded de todos os prompts REGEN, e o frontend já tem infraestrutura de `invoke('seed-prompts', { action: 'seed' })`. Falta apenas uma ação `restore_single` na edge function que restaure apenas um `prompt_id` específico.

**Como implementar:**
- **`seed-prompts/index.ts`:** Adicionar um branch `action === 'restore_single'` que receba `{ promptId }` no body, busque o default em `regenPrompts`, `genPrompts` ou `systemPrompts`, e faça um `UPSERT` apenas para aquele ID
- **`PromptEditor.tsx`:** Adicionar botão "Restaurar Padrão" com AlertDialog de confirmação, que chama a nova action. Fica ao lado do botão "Reverter" atual

**Riscos:** Nenhum. Operação isolada por ID. Não afeta outros prompts.

---

## Sugestão 2 — Diff Visual no DevPanel (banco vs. código)

**Viabilidade: ALTA. Implementável 100% no frontend, sem edge function.**

O frontend já carrega todos os prompts do banco em `prompts` (estado do `DevPrompts.tsx`). Os defaults hardcoded estão no `seed-prompts/index.ts` (backend), então precisariam ser expostos via edge function. O approach mais limpo é adicionar a action `get_defaults` ao `seed-prompts` que retorna o mapa de prompts padrão, e o frontend faz a comparação linha a linha ou exibe ambos lado a lado.

**Como implementar:**
- **`seed-prompts/index.ts`:** Adicionar `action === 'get_defaults'` que retorna `{ ...regenPrompts, ...genPrompts, ...systemPrompts }` com apenas o campo `prompt` de cada um
- **`PromptEditor.tsx`:** Adicionar uma aba "Diff vs. Padrão" dentro do editor. Ao abrir, faz `invoke('seed-prompts', { action: 'get_defaults', promptId })` e exibe dois painéis: banco (editável) à esquerda e código (read-only) à direita. Diferenças destacadas com `bg-yellow-100` nas linhas divergentes

**Riscos:** Baixo. Operação read-only. O único cuidado é que prompts de IMPORT dependem de `DEFAULT_IMPORT_PROMPTS` importado de `build-import-prompt.ts` — essa dependência já existe na edge function, então será coberta automaticamente.

---

## Sugestão 3 — System Prompt Global de Formatação no REGEN

**Viabilidade: CONCLUÍDA. Esta sugestão JÁ foi implementada.**

Conforme o diff da sessão anterior e a leitura confirmada do código atual (linhas 525 e 662 do `regerar-campo-pdf/index.ts`), ambos os pontos de chamada `callAI` já contêm a `REGRA DE FORMATAÇÃO ESTRITA` completa. Esta sugestão está 100% resolvida e não requer nenhuma ação adicional.

---

## Sugestão 4 — Camadas 2 e 3 do REGEN

**Viabilidade: CONCLUÍDA. Esta sugestão JÁ foi implementada.**

Ambas as camadas foram corrigidas na última sessão. O código atual confirma:
- Linha 525: system prompt com regra de formatação estrita (caminho bucket)
- Linha 662: system prompt com regra de formatação estrita (caminho fallback/cache)
- Linhas 139-181: `fieldPrompts.laudosMedicos` e `fieldPrompts.examesComplementares` em formato plano sem asteriscos

Nenhuma ação necessária.

---

## Sugestão 5 e 6 — Auditoria dos `prompt_gen_*` (Nexo Causal, Incapacidade, Interpolação)

**Viabilidade: ALTA para auditoria. Correção requer atenção cirúrgica.**

Após leitura do `gerar-resumos/index.ts` e do `seed-prompts/index.ts`, o diagnóstico completo é:

**Interpolação de variáveis — FUNCIONANDO CORRETAMENTE**

O `getPrompt()` do `prompt-manager.ts` interpola `${variavel}` do banco. Os fallbacks no `gerar-resumos` usam `${ctx.variavel}` nativo do template literal TypeScript. O mapeamento de contexto (linhas 423-441) cobre todas as variáveis. Não há falha de interpolação.

**Análises técnicas (nexo, incapacidade) — SÓLIDAS, sem Markdown contaminante**

- `prompt_gen_nexo_causal` (banco/seed): usa critérios de Bradford-Hill e Simonin. Não contém asteriscos. Retorno esperado é texto analítico contínuo
- `prompt_gen_incapacidade` (banco/seed): usa 5 seções com CAIXA ALTA para títulos (`"- Use CAIXA ALTA para títulos de seção"`, linha 236) — esta é a instrução correta para texto de laudo
- `prompt_gen_incapacidade` (fallback hardcoded no `gerar-resumos`): instrução análoga, sem asteriscos

**Problema real identificado — `sugestoes_pericia`**

O prompt `sugestoes_pericia` (tanto no banco quanto no fallback) instrui explicitamente `##`, `###` e marcadores `-`. Mas este é um caso **intencional e aceitável**: sugestões são exibidas em um painel dedicado (`AIInfoModal`) que usa `react-markdown` para renderizar o Markdown, não no corpo do laudo. Portanto, o Markdown aqui é correto e não polui o editor.

**Problema real identificado — `referencias_bibliograficas`**

O prompt de referências usa `1-`, `2-` como numeração — isso é texto plano, não Markdown. Correto.

**Problema real identificado — `gerar-resumos` não tem camada de formatação global**

Ao contrário do REGEN, o `gerar-resumos` usa `prompt_system_gerar_resumos` como system prompt — mas esse prompt não contém instrução de plain text. O fallback (linha 386) também não contém. Isso significa que nexo causal e incapacidade poderiam receber Markdown se a IA decidir incluí-lo. Os prompts individuais têm proteção parcial (`"Não use markdown com asteriscos"` no `incapacidade`), mas não sistêmica.

---

## O que Será Implementado

Com base na análise, 3 e 4 já estão prontas. Serão implementadas as 3 restantes com uma correção de segurança identificada na auditoria:

### Operação A — Botão "Restaurar Padrão" no PromptEditor

**Arquivo:** `supabase/functions/seed-prompts/index.ts`
- Adicionar `action === 'restore_single'` que recebe `promptId` no body, localiza o default nos objetos internos e faz UPSERT apenas para esse ID

**Arquivo:** `src/components/dev-panel/PromptEditor.tsx`
- Adicionar botão "Restaurar Padrão" com ícone `RotateCcw` no header do dialog, protegido por `AlertDialog` de confirmação
- Ao confirmar, chama `invoke('seed-prompts', { action: 'restore_single', promptId: prompt.id })`, exibe toast de sucesso e chama `onSaved()`

### Operação B — Diff Visual no PromptEditor

**Arquivo:** `supabase/functions/seed-prompts/index.ts`
- Adicionar `action === 'get_defaults'` que aceita `promptId` opcional. Se passado, retorna apenas o default daquele ID; se não passado, retorna todos

**Arquivo:** `src/components/dev-panel/PromptEditor.tsx`
- Adicionar aba "Diff vs. Padrão" dentro do `ScrollArea`. Ao clicar, faz fetch do default e exibe dois blocos `<pre>` lado a lado: "Banco (atual)" e "Código (padrão)". Linhas divergentes recebem `bg-amber-500/10`. Se os textos forem idênticos, exibe badge verde "Idêntico ao padrão"

### Operação C — Camada Global de Formatação no GERAR (nova descoberta)

**Arquivo:** `supabase/functions/gerar-resumos/index.ts`
- Atualizar `defaultSystemPrompt` (linha 386) para incluir instrução condicional: apenas prompts que NÃO são `sugestoes_pericia` e NÃO são `aprimorar_texto` recebem a regra de plain text. Sugestões e aprimoramento são casos especiais onde Markdown é intencional
- Implementação: criar variável `formattingRule` baseada no `tipo` e concatenar ao system prompt antes de chamar `callAI`

---

## Escopo dos Arquivos

- `supabase/functions/seed-prompts/index.ts`: novas actions `restore_single` e `get_defaults`
- `src/components/dev-panel/PromptEditor.tsx`: botão de restaurar e aba de diff
- `supabase/functions/gerar-resumos/index.ts`: formatação seletiva no system prompt

Deploy obrigatório de `seed-prompts` e `gerar-resumos` após as alterações.

