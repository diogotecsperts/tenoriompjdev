
# Fase 2: Integração das Edge Functions ao Prompt Manager ✅ CONCLUÍDA

## Objetivo
Conectar as três principais edge functions de IA (`gerar-resumos`, `regerar-campo-pdf` e `processar-autos`) ao `prompt-manager.ts` criado na Fase 1, permitindo que todos os prompts sejam gerenciados centralizadamente e editáveis via DevPanel.

---

## ✅ Arquivos Modificados

### 1. `supabase/functions/gerar-resumos/index.ts` ✅
**Mudanças realizadas:**
- Importado `getPrompt` do `prompt-manager.ts`
- Substituídos prompts hardcoded (`prompts` object → `defaultPrompts`) por chamadas ao prompt-manager
- Adicionado mapeamento `promptMapping` com IDs e metadados para cada tipo de resumo
- System prompt agora também é buscado via prompt-manager (`prompt_system_gerar_resumos`)

### 2. `supabase/functions/regerar-campo-pdf/index.ts` ✅
**Mudanças realizadas:**
- Importado `getPrompt` do `prompt-manager.ts`
- Adicionado mapeamento `fieldPromptMapping` com 21 campos configuráveis
- Mantido `fieldPrompts` como fallback hardcoded
- Duas chamadas de prompt-manager: uma para bucket_full_text e outra para cached content

### 3. `supabase/functions/processar-autos/index.ts` ✅
**Mudanças realizadas:**
- Importado `getPrompt` do `prompt-manager.ts`
- Renomeado `systemPrompt` para `defaultSystemPrompt`
- Criada função `getSystemPrompt()` que busca via prompt-manager com cache por request
- Mantida constante `systemPrompt` como alias para retrocompatibilidade

### 4. `supabase/functions/_shared/smart-chunker.ts` ✅
**Mudanças realizadas:**
- Importado `getPrompt` do `prompt-manager.ts`
- Criada função assíncrona `getFieldPromptAsync()` que busca prompts via prompt-manager
- Mantida função síncrona `getFieldPrompt()` como fallback

---

## IDs de Prompts Registrados

### Geração de Conteúdo (gerar-resumos)
| promptId | Descrição | cardId | sectionId |
|----------|-----------|--------|-----------|
| `prompt_gen_resumo_peticao` | Resumir petição inicial | `resumo-autos` | `resumo` |
| `prompt_gen_resumo_contestacao` | Resumir contestação | `resumo-autos` | `resumo` |
| `prompt_gen_descricao_doencas` | Descrição técnica das doenças | `analise-tecnica` | `descricao-doencas` |
| `prompt_gen_nexo_causal` | Análise de nexo causal | `analise-tecnica` | `nexo` |
| `prompt_gen_incapacidade` | Análise de incapacidade | `analise-tecnica` | `analise-incapacidade` |
| `prompt_gen_sugestoes_pericia` | Sugestões para perícia | `periciando` | `anamnese` |
| `prompt_gen_referencias` | Referências bibliográficas | `referencias` | `referencias` |
| `prompt_gen_aprimorar_texto` | Aprimorar texto | `_global` | `_aprimorar` |
| `prompt_system_gerar_resumos` | System prompt padrão | `_system` | `_gerar_resumos` |

### Regeneração via PDF (regerar-campo-pdf)
| promptId | Campo | cardId | sectionId |
|----------|-------|--------|-----------|
| `prompt_regen_historiaAtual` | historiaAtual | `periciando` | `anamnese` |
| `prompt_regen_historicoOcupacional` | historicoOcupacional | `periciando` | `anamnese` |
| `prompt_regen_historiaAcidente` | historiaAcidente | `periciando` | `acidente` |
| `prompt_regen_antecedentes` | antecedentes | `periciando` | `antecedentes` |
| `prompt_regen_tratamentos` | tratamentos | `periciando` | `antecedentes` |
| `prompt_regen_afastamentos` | afastamentos | `periciando` | `antecedentes` |
| `prompt_regen_laudosMedicos` | laudosMedicos | `exame` | `laudos` |
| `prompt_regen_examesComplementares` | examesComplementares | `exame` | `exames` |
| `prompt_regen_exameFisico` | exameFisico | `exame` | `exame-fisico` |
| `prompt_regen_descricaoPostoTrabalho` | descricaoPostoTrabalho | `posto-trabalho` | `dados-posto` |
| `prompt_regen_descricaoAtividadesLaborais` | descricaoAtividadesLaborais | `posto-trabalho` | `dados-posto` |
| `prompt_regen_descricaoTecnicaDoencas` | descricaoTecnicaDoencas | `analise-tecnica` | `descricao-doencas` |
| `prompt_regen_conclusaoAnalise` | conclusaoAnalise | `conclusao` | `conclusao` |
| `prompt_regen_tabelaSUSEP` | tabelaSUSEP | `conclusao` | `sequelas` |
| `prompt_regen_danoEstetico` | danoEstetico | `conclusao` | `sequelas` |
| `prompt_regen_auxilioTerceiros` | auxilioTerceiros | `conclusao` | `sequelas` |
| `prompt_regen_quesitosJuizo` | quesitosJuizo | `conclusao` | `quesitos` |
| `prompt_regen_quesitosReclamante` | quesitosReclamante | `conclusao` | `quesitos` |
| `prompt_regen_quesitosReclamada` | quesitosReclamada | `conclusao` | `quesitos` |
| `prompt_regen_resumoPeticaoInicial` | resumoPeticaoInicial | `resumo-autos` | `resumo` |
| `prompt_regen_resumoContestacao` | resumoContestacao | `resumo-autos` | `resumo` |

### Sistema / Importação
| promptId | Descrição | cardId | sectionId |
|----------|-----------|--------|-----------|
| `prompt_import_system` | Mega-prompt de extração | `_system` | `_import` |

---

## Fluxo de Execução Implementado

```text
1. Edge function recebe requisição
2. Determina qual promptId usar baseado no tipo/campo
3. Chama getPrompt(promptId, defaultPrompt, context, options)
   └─ prompt-manager verifica cache (TTL 5 min)
   └─ Se não em cache: busca do system_config
   └─ Se não existe: usa fallback + auto-registra (se autoRegister=true)
4. Retorna prompt interpolado com variáveis do contexto
5. Edge function usa o prompt para chamar a IA
```

---

## Próxima Fase (Fase 3)

Implementar a UI do DevPanel para editar os prompts que foram registrados no banco:

1. Criar componentes:
   - `DevPrompts.tsx` - Página principal de gerenciamento
   - `PromptEditor.tsx` - Editor individual de prompt

2. Implementar leitura/escrita no `system_config` (com versionamento simples)

3. Implementar a seção "Novos / Não classificados"
   - Lista todos os prompts com `isClassified: false`

4. Adicionar tab no `DevPanel` para abrir "Prompts IA"

---

## Fase 4 (Futura)

Fonte única de verdade: sincronizar ordem com o LaudoEditor:

1. Extrair `consolidatedCards` do `LaudoEditor.tsx` para um módulo compartilhado
2. Usar essa mesma estrutura para LaudoEditor e DevPrompts
3. Garantir que mudanças futuras de cards/sections sejam refletidas automaticamente
