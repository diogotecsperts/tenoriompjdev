

# Plano de Correção: Dependências Cruzadas nos Prompts de Regeneração

## Problema Principal

Os prompts de regeneração (`prompt_regen_*`) atualmente **não recebem contexto de outros campos**. Quando você clica no botão 🔄 para regenerar um campo, o sistema:

1. Busca o prompt do banco ✅
2. NÃO passa dados de outros campos para interpolação ❌

Isso significa que se você editar um prompt para usar `${cids}` ou `${exameFisico}`, essas variáveis ficarão literalmente como `${cids}` ao invés de serem substituídas pelos valores reais.

## Diferença: Geração vs Regeneração

### Geração (✅ Funciona com contexto)
- Botões: "Resumir Texto", "Gerar Nexo Causal", "Gerar Análise de Incapacidade"
- Edge Function: `gerar-resumos`
- Contexto: Recebe dados de vários campos do laudo
- **Funciona perfeitamente com dependências cruzadas**

### Regeneração (⚠️ Não recebe contexto)
- Botão: 🔄 (Regerar a partir do PDF)
- Edge Function: `regerar-campo-pdf`
- Contexto: Recebe apenas o conteúdo do PDF
- **NÃO suporta dependências cruzadas atualmente**

## Solução Proposta

### 1. Modificar `regerar-campo-pdf` para buscar dados do laudo

**Arquivo:** `supabase/functions/regerar-campo-pdf/index.ts`

Alterar a query do laudo para buscar todos os campos relevantes:

```text
// De:
.select('id, user_id, ai_metadata')

// Para:
.select('id, user_id, ai_metadata, diagnostico_cids, 
  descricao_posto_trabalho, descricao_atividades_laborais,
  historico_ocupacional, historia_acidente, historia_atual,
  exame_fisico, exames_complementares, antecedentes,
  tratamentos, afastamentos, nexo_causal_justificativa,
  conclusao_analise, ...')
```

### 2. Passar contexto para getPrompt

Após buscar o laudo, passar os dados como contexto:

```text
const specificPrompt = await getPrompt(
  mapping?.promptId,
  defaultPrompt,
  {
    // Dados do laudo para interpolação
    cids: JSON.stringify(laudo.diagnostico_cids || []),
    postoTrabalho: laudo.descricao_posto_trabalho || '',
    atividadesLaborais: laudo.descricao_atividades_laborais || '',
    historicoOcupacional: laudo.historico_ocupacional || '',
    historiaAcidente: laudo.historia_acidente || '',
    historiaAtual: laudo.historia_atual || '',
    exameFisico: laudo.exame_fisico || '',
    examesComplementares: laudo.exames_complementares || '',
    antecedentes: laudo.antecedentes || '',
    tratamentos: laudo.tratamentos || '',
    nexoCausal: laudo.nexo_causal_justificativa || '',
    conclusao: laudo.conclusao_analise || ''
  },
  { autoRegister: true, ... }
);
```

### 3. Definir quais campos cada prompt pode "enxergar"

Criar um mapeamento de dependências:

| Campo sendo regenerado | Campos que pode ver |
|------------------------|---------------------|
| `descricaoTecnicaDoencas` | cids |
| `conclusaoAnalise` | cids, nexoCausal, exameFisico, examesComplementares |
| `tabelaSUSEP` | cids, exameFisico, conclusaoAnalise |
| `danoEstetico` | cids, exameFisico |
| `auxilioTerceiros` | cids, exameFisico, conclusaoAnalise |
| `nexoCausal` (se tivesse regen) | cids, postoTrabalho, atividadesLaborais, historicoOcupacional |

## Melhoria de UI Proposta

### 4. Separar visualmente prompts de Geração vs Regeneração

Na página de Prompts IA, adicionar indicadores visuais:

- **Badge "Gerar"** (verde): Prompts `prompt_gen_*`
- **Badge "Regerar"** (azul): Prompts `prompt_regen_*`
- **Badge "Sistema"** (cinza): Prompts `prompt_system_*` e `prompt_import_*`

### 5. Adicionar documentação das variáveis disponíveis

No editor de prompts, exibir:
- Lista de variáveis detectadas no prompt atual
- Lista de variáveis **disponíveis** para aquele contexto
- Tooltip explicando que variáveis são substituídas automaticamente

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/regerar-campo-pdf/index.ts` | Modificar - Buscar dados do laudo e passar como contexto |
| `src/components/dev-panel/DevPrompts.tsx` | Modificar - Adicionar badges de tipo |
| `src/components/dev-panel/PromptEditor.tsx` | Modificar - Mostrar variáveis disponíveis |

## Resultado Esperado

Após implementação:

1. Ao editar o prompt `prompt_regen_descricaoTecnicaDoencas`, você poderá usar `${cids}` e ele será substituído pelos CIDs reais do laudo durante a regeneração

2. Ao editar `prompt_regen_conclusaoAnalise`, você poderá usar `${nexoCausal}`, `${exameFisico}`, etc.

3. A UI mostrará claramente quais variáveis estão disponíveis para cada prompt

4. Os prompts de geração e regeneração serão visualmente diferenciados

