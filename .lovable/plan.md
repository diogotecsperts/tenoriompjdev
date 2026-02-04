
# Corrigir Organização da Tela Prompts IA para Espelhar o Laudo

## Diagnóstico Realizado

Comparei a estrutura definida em `src/lib/laudo-structure.ts` (fonte de verdade do laudo) com os dados no banco (`system_config`) e identifiquei **17 problemas** entre campos fora de ordem, classificados na seção errada ou com nomenclatura diferente do laudo.

---

## Resumo das Discrepâncias Encontradas

| Tipo de Problema | Quantidade |
|------------------|------------|
| Prompts na **seção errada** (cardId ou sectionId incorreto) | 3 |
| Prompts com **descrição diferente** do label no laudo | 5 |
| Prompts **sem ordem definida** (campo `order` null) | 33 (todos) |
| **Total de ajustes necessários** | 17 registros a corrigir |

---

## Detalhamento das Correções

### 1. Prompts na Seção Errada (cardId/sectionId incorretos)

| Prompt ID | Atual | Deveria Ser | Label no Laudo |
|-----------|-------|-------------|----------------|
| `prompt_regen_historicoOcupacional` | periciando/anamnese | periciando/**acidente** | Histórico Ocupacional |
| `prompt_gen_sugestoes_pericia` | periciando/anamnese | _(interno, mover para _system)_ | Sugestões IA (não é seção do laudo) |
| `prompt_system_perito` | _system/_global | _system/**_gerar_resumos** | Identidade Perito (system) |

### 2. Prompts com Descrição Diferente do Label do Laudo

| Prompt ID | Descrição Atual | Label Esperado (igual ao laudo) |
|-----------|-----------------|--------------------------------|
| `prompt_regen_historiaAtual` | "História da Moléstia Atual - Regenerar via PDF" | "Anamnese - Regenerar via PDF" |
| `prompt_regen_antecedentes` | "Antecedentes Pessoais e Familiares - Regenerar via PDF" | "Antecedentes Patológicos - Regenerar via PDF" |
| `prompt_regen_exameFisico` | "Achados do Exame Físico - Regenerar via PDF" | "Exame Físico Pericial - Regenerar via PDF" |
| `prompt_regen_descricaoAtividadesLaborais` | "Ambiente e Atividades Laborais - Regenerar via PDF" | "Dados do Posto de Trabalho - Regenerar via PDF" |
| `prompt_gen_descricao_doencas` | "Descrição técnica das doenças" | "Descrição Técnica das Doenças - Gerar" |

### 3. Ordem dos Prompts (campo `order` - todos estão `null`)

Para garantir ordenação igual ao laudo, atribuirei um número sequencial baseado na posição do campo dentro do laudo:

| cardId | sectionId | Prompt ID | order |
|--------|-----------|-----------|-------|
| resumo-autos | resumo | prompt_gen_resumo_peticao | 1 |
| resumo-autos | resumo | prompt_regen_resumoPeticaoInicial | 2 |
| resumo-autos | resumo | prompt_gen_resumo_contestacao | 3 |
| resumo-autos | resumo | prompt_regen_resumoContestacao | 4 |
| periciando | acidente | prompt_regen_historicoOcupacional | 1 |
| periciando | acidente | prompt_regen_historiaAcidente | 2 |
| periciando | anamnese | prompt_regen_historiaAtual | 1 |
| periciando | antecedentes | prompt_regen_antecedentes | 1 |
| periciando | antecedentes | prompt_regen_tratamentos | 2 |
| periciando | antecedentes | prompt_regen_afastamentos | 3 |
| posto-trabalho | dados-posto | prompt_regen_descricaoAtividadesLaborais | 1 |
| exame | laudos | prompt_regen_laudosMedicos | 1 |
| exame | exames | prompt_regen_examesComplementares | 1 |
| exame | exame-fisico | prompt_regen_exameFisico | 1 |
| analise-tecnica | descricao-doencas | prompt_gen_descricao_doencas | 1 |
| analise-tecnica | descricao-doencas | prompt_gen_descricao_cid | 2 |
| analise-tecnica | descricao-doencas | prompt_regen_descricaoTecnicaDoencas | 3 |
| analise-tecnica | nexo | prompt_gen_nexo_causal | 1 |
| analise-tecnica | analise-incapacidade | prompt_gen_incapacidade | 1 |
| conclusao | conclusao | prompt_regen_conclusaoAnalise | 1 |
| conclusao | sequelas | prompt_regen_tabelaSUSEP | 1 |
| conclusao | sequelas | prompt_regen_danoEstetico | 2 |
| conclusao | sequelas | prompt_regen_auxilioTerceiros | 3 |
| conclusao | quesitos | prompt_regen_quesitosJuizo | 1 |
| conclusao | quesitos | prompt_regen_quesitosReclamante | 2 |
| conclusao | quesitos | prompt_regen_quesitosReclamada | 3 |
| referencias | referencias | prompt_gen_referencias | 1 |
| _global | _aprimorar | prompt_gen_aprimorar_texto | 1 |
| _system | _gerar_resumos | prompt_system_gerar_resumos | 1 |
| _system | _gerar_resumos | prompt_system_perito | 2 |
| _system | _import | prompt_import_system | 1 |
| impugnacao | resposta | prompt_system_impugnacao | 1 |

---

## Arquivos a Modificar

| Local | Ação |
|-------|------|
| Tabela `system_config` (banco de dados) | UPDATE nos 17 registros para corrigir cardId, sectionId, description e order |
| `supabase/functions/seed-prompts/index.ts` | Atualizar as definições hardcoded para refletir as correções (para restaurar padrão) |
| `supabase/functions/gerar-resumos/index.ts` | Atualizar promptMapping para `prompt_gen_sugestoes_pericia` (mover para _system) |
| `src/components/dev-panel/DevPrompts.tsx` | Ordenar prompts pelo campo `order` dentro de cada seção |

---

## Implementação

### Passo 1: Atualizar registros no banco via SQL

Executar UPDATEs para corrigir os 17 registros afetados, ajustando:
- `value.cardId`
- `value.sectionId`
- `value.description`
- `value.order`

### Passo 2: Modificar DevPrompts.tsx para ordenar por `order`

Na função `getPromptsTypeSplit` ou no agrupamento, ordenar os prompts pelo campo `order` antes de renderizar.

### Passo 3: Atualizar seed-prompts para manter consistência

Corrigir os mapeamentos hardcoded no `seed-prompts/index.ts` para que ao "Restaurar Padrão de Fábrica" os valores sejam corretos.

### Passo 4: Corrigir gerar-resumos (sugestões perícia)

Mover `prompt_gen_sugestoes_pericia` para `_system/_internal` já que não é uma seção visível do laudo.

---

## Resultado Esperado

Após as correções:

1. A navegação lateral em "Prompts IA" terá a **mesma ordem exata** do LaudoEditor
2. Os **nomes das seções** serão idênticos aos do laudo
3. Dentro de cada seção, os prompts aparecerão **ordenados** (ex: primeiro Gerar, depois Regerar)
4. "Restaurar Padrão" manterá a estrutura correta

---

## Seções Finais (mantidas ao final)

Após os cards do laudo, as seções especiais permanecerão:
1. **Sistema** - prompts de sistema
2. **Globais** - aprimorar texto
3. **Impugnação** - resposta a impugnações

---

## Lembrete

Quando tocar no assunto da "Metodologia Pericial" (config_metodologia_padrao), lembrar de sugerir a **Opção B**: criar interface visual no DevPanel para editar sem SQL.
