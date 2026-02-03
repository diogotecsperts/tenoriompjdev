
# Correção: Prompt de CID Corrompido no Banco de Dados

## Problema Identificado

O prompt `prompt_gen_descricao_cid` está **corrompido** no banco de dados. Em vez de conter variáveis de interpolação como `${cids}`, ele contém um valor literal fixo:

| O que deveria estar | O que está salvo |
|---------------------|------------------|
| `${ctx.cids}` | `J45` |
| `${ctx.atividadesLaborais}` | `Não informado` |
| `${ctx.historicoOcupacional}` | `Não informado` |

**Consequência:** Qualquer CID digitado é ignorado e a IA sempre gera descrição de ASMA (J45).

**Causa provável:** Quando o prompt foi auto-registrado pela primeira vez, ele salvou um snapshot da execução (com valores já interpolados) ao invés do template original.

---

## Solução

### Parte 1: Corrigir o prompt no banco de dados

Executar um UPDATE direto para restaurar o prompt correto com variáveis de interpolação:

```sql
UPDATE system_config 
SET value = jsonb_set(
  value,
  '{prompt}',
  '"Você é um perito médico especialista em medicina do trabalho. Elabore a descrição técnica detalhada para cada CID informado.\n\nCÓDIGOS CID A DESCREVER:\n${cids}\n\nCONTEXTO OCUPACIONAL (se disponível):\n- Atividades laborais: ${atividadesLaborais}\n- Histórico ocupacional: ${historicoOcupacional}\n\nINSTRUÇÕES OBRIGATÓRIAS:\nPara CADA CID informado, forneça obrigatoriamente:\n\n1. TÍTULO EM CAIXA ALTA com nome completo da doença e código CID-10\n   Exemplo: TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)\n\n2. DEFINIÇÃO TÉCNICA\n   Descreva tecnicamente o que é a patologia, sua localização anatômica e características principais.\n\n3. ETIOLOGIA\n   Liste as causas possíveis, incluindo fatores ocupacionais quando aplicável.\n\n4. SINTOMAS CARACTERÍSTICOS\n   Descreva os sintomas típicos da condição.\n\n5. FATORES DE RISCO OCUPACIONAIS\n   Relacione com atividades laborais que podem causar ou agravar a condição.\n\nFORMATO DE SAÍDA:\n- Use CAIXA ALTA para títulos de seção (não use markdown com asteriscos)\n- Separe cada CID com uma linha em branco\n- Seja técnico e objetivo, mas completo\n- Mínimo 2 parágrafos por CID"'
),
value = jsonb_set(
  value,
  '{variables}',
  '["cids", "atividadesLaborais", "historicoOcupacional"]'
)
WHERE id = 'prompt_gen_descricao_cid';
```

### Parte 2: Corrigir a lógica de interpolação no gerar-resumos

O problema arquitetural é que o `gerar-resumos` usa **funções JavaScript** para gerar prompts (que aceitam `ctx` e resolvem as variáveis via template literals), mas o `prompt-manager` espera **templates com placeholders `${varName}`**.

Quando o prompt é buscado do banco, a função `interpolatePrompt` espera encontrar `${cids}` e substituir pelo valor do contexto. Porém, a função `gerar-resumos` precisa passar o contexto para a interpolação.

**Modificação necessária em `gerar-resumos/index.ts`:**

```typescript
// Buscar prompt customizado via prompt-manager
const mapping = promptMapping[tipo];
const prompt = await getPrompt(
  mapping.promptId,
  defaultPrompt,
  {
    // Contexto para interpolação - variáveis que serão substituídas
    cids: contexto.cids || 'Não informado',
    postoTrabalho: contexto.postoTrabalho || 'Não informado',
    atividadesLaborais: contexto.atividadesLaborais || 'Não informado',
    historicoOcupacional: contexto.historicoOcupacional || 'Não informado',
    // ... todas as outras variáveis do contexto
  },
  {
    description: mapping.description,
    cardId: mapping.cardId,
    sectionId: mapping.sectionId,
  }
);
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| **Banco de dados** | UPDATE para corrigir prompt corrompido |
| `supabase/functions/gerar-resumos/index.ts` | Passar contexto completo para interpolação |

---

## Implementação Detalhada

### 1. Migration SQL para corrigir o prompt

Criar migration que corrige o prompt corrompido e adiciona as variáveis corretas.

### 2. Atualizar gerar-resumos para passar contexto na interpolação

Na linha onde `getPrompt` é chamado (~421-432), o terceiro parâmetro (context) precisa incluir TODAS as variáveis que podem aparecer nos prompts.

Atualmente está assim:
```typescript
const prompt = await getPrompt(
  mapping.promptId,
  defaultPrompt,
  {}, // ← VAZIO! Nenhuma variável passada
  {
    description: mapping.description,
    cardId: mapping.cardId,
    sectionId: mapping.sectionId,
  }
);
```

Deve ficar assim:
```typescript
const prompt = await getPrompt(
  mapping.promptId,
  defaultPrompt,
  {
    // Todas as variáveis possíveis para interpolação
    cids: contexto.cids || 'Não informado',
    postoTrabalho: contexto.postoTrabalho || 'Não informado',
    atividadesLaborais: contexto.atividadesLaborais || 'Não informado',
    historicoOcupacional: contexto.historicoOcupacional || 'Não informado',
    exameFisico: contexto.exameFisico || 'Não informado',
    examesComplementares: contexto.examesComplementares || 'Não informado',
    antecedentes: contexto.antecedentes || 'Não informado',
    tratamentos: contexto.tratamentos || 'Não informado',
    historiaAcidente: contexto.historiaAcidente || 'Não informado',
    historiaAtual: contexto.historiaAtual || 'Não informado',
    peticaoInicial: contexto.peticaoInicial || 'Não informado',
    contestacao: contexto.contestacao || 'Não informado',
    nexoCausal: contexto.nexoCausal || 'Não informado',
    conclusao: contexto.conclusao || 'Não informado',
    metodologia: contexto.metodologia || 'Não informado',
    textoOriginal: contexto.textoOriginal || '',
    campo: contexto.campo || 'Não especificado',
  },
  {
    description: mapping.description,
    cardId: mapping.cardId,
    sectionId: mapping.sectionId,
  }
);
```

---

## Prevenção Futura

O problema original aconteceu porque o prompt foi **auto-registrado com valores já resolvidos**. A função `ensurePromptExists` recebeu o resultado de `defaultPrompts[tipo](contexto)` ao invés do template original.

Para prevenir isso, a arquitetura precisaria de refatoração maior (separar templates de funções geradoras). Por ora, a correção manual + passar contexto resolve o problema imediato.

---

## Resultado Esperado

Após a implementação:
1. Digitar `F32` → Gera descrição de Episódio Depressivo (F32)
2. Digitar `M54.5, G56.0` → Gera descrição de ambos os CIDs
3. Prompts customizados no banco funcionarão corretamente com variáveis
