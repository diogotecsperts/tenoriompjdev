
## Confirmação (GLOBAL)
Tudo descrito aqui continua sendo **GLOBAL**:
- Os prompts configurados na nova página afetam **TODOS os usuários**.
- O acesso à página de configuração continua restrito ao painel de administração/desenvolvimento (para não expor controles sensíveis), mas o resultado do que for configurado é global.

---

## O que estava acontecendo (travamento / demora)
Para evitar ficar “pensando sem sair do lugar” novamente, vou estruturar a execução em **fases curtas com checkpoints**, e ao final de cada fase eu **paro, registro o que foi entregue e peço aprovação explícita para a próxima fase** (conforme você pediu). Isso também reduz risco de perder a lógica do todo.

---

## Novo requisito adicionado ao plano: “Ao criar novos campos/seções, a página de Prompts deve refletir automaticamente e ficar no mesmo lugar do Laudo”
Você quer duas coisas ao mesmo tempo:
1) **Ordem e posicionamento idênticos** ao editor de laudos (igual ao menu/estrutura do LaudoEditor).
2) **Dinamismo**: ao adicionarmos novos campos/seções no futuro, isso precisa “aparecer sozinho” na página de prompts, já funcional.

### Diagnóstico do código atual (por que isso não é automático hoje)
- A ordem das seções do editor está definida em **um array local** `consolidatedCards` dentro de `src/pages/LaudoEditor.tsx`.
- A página nova de prompts, se for feita “na mão”, corre o risco de ficar **desalinhada** do LaudoEditor quando vocês adicionarem novas seções/campos.

---

## Melhor solução (robusta e “inteligente”) a adicionar ao plano
Vou acrescentar **uma camada de “catálogo/registro” de prompts + auto-descoberta**, para garantir:
- **Mesmo posicionamento** do LaudoEditor
- **Aparecimento automático** de prompts novos
- **Sem risco de esquecer etapas** ao criar campos novos

### A. Fonte única de verdade (Single Source of Truth) para ORDEM/SEÇÕES
**Objetivo:** a página de prompts sempre mostrar na mesma ordem do editor, sem duplicar listas.

**Mudança arquitetural planejada:**
1) Extrair a definição de estrutura do laudo (hoje `consolidatedCards` dentro do `LaudoEditor.tsx`) para um **módulo compartilhado** (ex.: `src/lib/laudo-structure.ts`).
2) O **LaudoEditor** passa a importar essa estrutura de lá.
3) A página **DevPrompts** também importa essa mesma estrutura para renderizar os prompts no exato mesmo lugar/ordem.

**Resultado:** se amanhã você inserir “Seção X” entre “Exame Clínico” e “Análise Técnica”, a página de prompts automaticamente vai refletir essa mesma posição porque ambas consomem a mesma estrutura.

### B. Catálogo de Prompts com “Auto-Descoberta” (para não depender de cadastro manual)
**Objetivo:** quando surgir um campo novo (ou um prompt novo), ele deve aparecer automaticamente na página de prompts, mesmo que alguém esqueça de cadastrar manualmente.

**Como isso vai funcionar:**
1) O `prompt-manager` (backend) passa a ter um modo **auto-register**:
   - Se uma função pedir um `promptId` que não existe no `system_config`, o sistema:
     - retorna um **prompt genérico seguro** (fallback) para não quebrar nada
     - **cria automaticamente** um registro em `system_config` com esse `promptId` + texto padrão (upsert), marcando como “novo / não classificado”
2) A página de prompts terá uma área “**Novos / Não classificados**” que lista esses prompts recém-descobertos.
3) No editor de prompts, você conseguirá **atribuir** esse prompt a um local da UI:
   - cardId (ex.: `analise-tecnica`)
   - sectionId (ex.: `analise-incapacidade`)
   - ordem (ex.: posição 3 dentro da seção)
4) Uma vez classificado, ele passa a aparecer exatamente no local correto (dentro do card/section correspondente).

**Por que isso é importante:**
- Você não fica refém de alguém lembrar “também precisa colocar no DevPrompts”.
- Garante “dínamismo” real sem precisar alterar a página toda vez.

### C. “Perfeitamente funcional” para campos novos
Para um campo novo ficar funcional, existem 3 tipos de “funcionalidade” de IA no sistema atual:
1) **Aprimorar texto** (já é genérico via `gerar-resumos tipo=aprimorar_texto`)
2) **Regenerar via PDF** (usa `regerar-campo-pdf` e exige prompt e mapeamento)
3) **Gerar conteúdo novo** (usa `gerar-resumos` por tipo)

**O que será automático:**
- Se for apenas “Aprimorar texto”, ele já funciona em qualquer campo.
- Se for “Regenerar via PDF” para um campo novo:
  - O prompt será auto-criado no `system_config` (não quebra).
  - Ele aparecerá na lista “Novos / Não classificados”.
  - Você ajusta o prompt e (opcionalmente) as dependências.
- Se esse novo campo precisar de uma lógica especial (ex.: usar smart chunker em uma região específica do PDF), isso ainda exige um ajuste técnico (porque é inteligência de extração), mas o **prompt e a UI de configuração** já estarão prontos.

### D. Posicionamento exatamente “entre as opções” do LaudoEditor
Como o LaudoEditor já tem cards/sections (ex.: “Dados Preliminares”, “Resumo dos Autos”, “Periciando”…), a página de prompts vai replicar:
- Mesmos cards
- Mesmos títulos/descrições
- Mesma ordem
- E dentro deles: os prompts relacionados

Isso elimina drift e atende seu requisito de “exatamente no local”.

---

## Atualização do plano anterior (com essa camada de dinamismo)
Abaixo está o plano completo, já incluindo o novo requisito.

### Fase 1 (Backend base, sem quebrar nada) — 1ª aprovação
1) Criar `supabase/functions/_shared/prompt-manager.ts`
   - cache TTL 5 min
   - `getPrompt(promptId, defaultPrompt, context)`
   - substituição de variáveis `${...}`
   - **auto-register** opcional: `ensurePromptExists(promptId, defaultPrompt, metaBase)`
2) Definir padrão de IDs de prompt (exemplos):
   - `prompt_regen_resumoPeticaoInicial`
   - `prompt_regen_historiaAtual`
   - `prompt_gen_incapacidade`
   - `prompt_import_processar_autos_system`
3) Logs claros (para auditoria e debug): quando criar prompt automaticamente, registrar `[prompt-manager] auto-registered promptId=...`.

**Checkpoint ao final da Fase 1 (eu paro e te peço aprovação):**
- Funções continuam usando fallback hardcoded se nada existir no banco.
- Nenhum fluxo do app quebra.

### Fase 2 (Integração nas funções de IA) — 2ª aprovação
4) Integrar `gerar-resumos` ao `prompt-manager`
5) Integrar `regerar-campo-pdf` ao `prompt-manager`
   - aqui entra também a parte de **dependências cruzadas** (campos “se enxergarem”)
6) Integrar `processar-autos` (megaprompt) ao `prompt-manager`

**Checkpoint ao final da Fase 2:**
- Teste de geração (resumos) e regeneração (via PDF) funcionando como antes.
- Quando faltar prompt no banco, o sistema se mantém estável e (se auto-register ligado) cria o prompt para aparecer no painel.

### Fase 3 (UI do DevPanel: página de prompts) — 3ª aprovação
7) Criar componentes:
   - `DevPrompts.tsx`
   - `PromptEditor.tsx`
8) Implementar leitura/escrita no `system_config` (com versionamento simples)
9) Implementar a seção “Novos / Não classificados”
   - lista todos os prompts que existem no banco e ainda não têm `cardId/sectionId` atribuídos
10) Adicionar tab no `DevPanel` para abrir “Prompts IA”

**Checkpoint ao final da Fase 3:**
- Você consegue editar prompts globalmente.
- Prompts “descobertos automaticamente” aparecem para você classificar.

### Fase 4 (Fonte única de verdade: sincronizar ordem com o LaudoEditor) — 4ª aprovação
11) Extrair `consolidatedCards` do `LaudoEditor.tsx` para um módulo compartilhado
12) Usar essa mesma estrutura para:
   - LaudoEditor (render/menus)
   - DevPrompts (ordem e posicionamento)
13) Garantir que qualquer mudança futura de cards/sections seja refletida automaticamente na página de prompts.

**Checkpoint ao final da Fase 4:**
- Página de prompts fica 100% “espelhada” do laudo.

---

## Regras de execução (para não perder nenhuma etapa)
- Eu vou executar exatamente nessa ordem.
- Ao terminar cada fase, eu:
  1) descrevo o que foi entregue
  2) listo rapidamente o que foi validado
  3) **peço sua aprovação para seguir para a próxima fase** (como você pediu)

---

## Observações importantes (para alinhar expectativa)
- “Aparecer automaticamente” é garantido via **auto-register + lista de não classificados**.
- “Ficar automaticamente no local exato” é garantido quando:
  - você classifica o prompt novo (card/section), ou
  - o campo novo for adicionado seguindo o padrão de cadastro de metadados (que vamos deixar muito simples).
- Se vocês quiserem no futuro “adicionar campos sem mexer em código” (campos dinâmicos criados por admin), isso é uma fase extra (maior) porque envolve armazenamento de valores (provavelmente JSONB), PDF, validações e layout. Posso propor isso depois, mas não misturo agora para não atrasar seu projeto.

---

## Próxima ação
Após você aprovar este complemento, eu inicio a **Fase 1** imediatamente.
