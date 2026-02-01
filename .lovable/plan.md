
# Fase 2: Integração das Edge Functions ao Prompt Manager

## Objetivo
Conectar as três principais edge functions de IA (`gerar-resumos`, `regerar-campo-pdf` e `processar-autos`) ao `prompt-manager.ts` criado na Fase 1, permitindo que todos os prompts sejam gerenciados centralizadamente e editáveis via DevPanel.

---

## Arquivos a Modificar

### 1. `supabase/functions/gerar-resumos/index.ts`
**Mudanças:**
- Importar `getPrompt` do `prompt-manager.ts`
- Substituir os prompts hardcoded (`prompts` object) por chamadas ao prompt-manager
- Manter os prompts hardcoded como fallback (passados como `defaultPrompt`)
- Adicionar metadados de classificacao (`cardId`, `sectionId`) para cada prompt

**IDs de prompts a criar:**
| promptId | Descrição | cardId | sectionId |
|----------|-----------|--------|-----------|
| `prompt_gen_resumo_peticao` | Resumir petição inicial | `resumo-autos` | `resumo` |
| `prompt_gen_resumo_contestacao` | Resumir contestação | `resumo-autos` | `resumo` |
| `prompt_gen_descricao_doencas` | Descrição técnica das doenças | `analise-tecnica` | `descricao-doencas` |
| `prompt_gen_nexo_causal` | Análise de nexo causal | `analise-tecnica` | `nexo` |
| `prompt_gen_incapacidade` | Análise de incapacidade | `analise-tecnica` | `analise-incapacidade` |
| `prompt_gen_sugestoes_pericia` | Sugestões para perícia | `periciando` | `anamnese` |
| `prompt_gen_referencias` | Referências bibliográficas | `referencias` | `referencias` |
| `prompt_gen_aprimorar_texto` | Aprimorar texto (grammar/style) | `_global` | `_aprimorar` |
| `prompt_system_gerar_resumos` | System prompt padrão | `_system` | `_gerar_resumos` |

---

### 2. `supabase/functions/regerar-campo-pdf/index.ts`
**Mudanças:**
- Importar `getPrompt` do `prompt-manager.ts`
- Substituir o objeto `fieldPrompts` por chamadas dinâmicas ao prompt-manager
- Cada campo regenerável terá seu próprio prompt configurável
- Manter fallback com prompts atuais detalhados

**IDs de prompts a criar (regeneração via PDF):**
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

---

### 3. `supabase/functions/processar-autos/index.ts`
**Mudanças:**
- Importar `getPrompt` do `prompt-manager.ts`
- Extrair o mega-prompt de sistema (`systemPrompt`) para ser configurável
- O prompt de sistema é crítico e extenso (~15KB), mas será editável via DevPanel

**IDs de prompts a criar:**
| promptId | Descrição | cardId | sectionId |
|----------|-----------|--------|-----------|
| `prompt_import_system` | Mega-prompt principal de extração | `_system` | `_import` |

---

### 4. `supabase/functions/_shared/smart-chunker.ts`
**Mudanças:**
- Importar `getPrompt` do `prompt-manager.ts`
- Substituir o objeto `prompts` em `getFieldPrompt()` por chamadas ao prompt-manager
- Usar padrão de nomenclatura: `prompt_chunk_{fieldKey}`

---

## Dependências Cruzadas (Campos que "se enxergam")

Para alguns prompts, o contexto precisa incluir dados de outros campos. Isso será implementado via **variáveis de template**:

```typescript
// Exemplo: prompt de nexo causal precisa ver CIDs, histórico, etc.
const prompt = await getPrompt(
  'prompt_gen_nexo_causal',
  defaultNexoCausalPrompt,
  {
    cids: contexto.cids,
    postoTrabalho: contexto.postoTrabalho,
    atividadesLaborais: contexto.atividadesLaborais,
    historicoOcupacional: contexto.historicoOcupacional,
    historiaAcidente: contexto.historiaAcidente,
    // ... outros campos relacionados
  }
);
```

O prompt armazenado no banco poderá usar `${cids}`, `${postoTrabalho}`, etc., e o `prompt-manager` fará a interpolação automaticamente.

---

## Fluxo de Execução

```text
1. Edge function recebe requisição
2. Determina qual promptId usar baseado no tipo/campo
3. Chama getPrompt(promptId, defaultPrompt, context)
   └─ prompt-manager verifica cache (TTL 5 min)
   └─ Se não em cache: busca do system_config
   └─ Se não existe: usa fallback + auto-registra
4. Retorna prompt interpolado com variáveis do contexto
5. Edge function usa o prompt para chamar a IA
```

---

## Garantias de Segurança

- **Fallback sempre funciona**: Se o banco estiver indisponível ou o prompt não existir, o sistema usa o prompt hardcoded original
- **Cache reduz latência**: Prompts são cacheados por 5 minutos, minimizando queries ao banco
- **Auto-registro**: Novos campos adicionados no futuro automaticamente criam seus prompts no banco como "não classificados"
- **Nenhuma quebra**: A mudança é transparente - comportamento idêntico ao atual até que alguém edite um prompt no DevPanel

---

## Arquivos Finais

| Arquivo | Ação |
|---------|------|
| `supabase/functions/gerar-resumos/index.ts` | Modificar |
| `supabase/functions/regerar-campo-pdf/index.ts` | Modificar |
| `supabase/functions/processar-autos/index.ts` | Modificar |
| `supabase/functions/_shared/smart-chunker.ts` | Modificar |
| `supabase/functions/_shared/prompt-manager.ts` | Já criado (Fase 1) |

---

## Testes de Validação

Após implementação, validar:
1. Gerar resumo de petição (botão "Resumir Texto")
2. Regenerar campo via PDF (botão de refresh em campo com PDF importado)
3. Importar autos completo (processar PDF)
4. Verificar que prompts aparecem no `system_config` com IDs corretos

---

## Próxima Fase (Fase 3)

Após esta fase, a Fase 3 implementará a UI do DevPanel para editar os prompts que foram registrados no banco. Os prompts estarão prontos para serem visualizados e editados.
