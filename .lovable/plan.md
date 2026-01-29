
## Plano: Correção Completa da Extração de Dados na Importação

### Diagnóstico do Problema

A análise revelou **3 falhas estruturais** que explicam por que os campos ficam vazios ou com conteúdo resumido:

| Problema | Impacto | Solução |
|----------|---------|---------|
| Schema JSON não inclui campos de posto de trabalho | IA não extrai porque não foi pedido | Adicionar campos ao schema |
| Interface frontend não mapeia campos | Dados extraídos são ignorados | Expandir interface + mapeamento |
| Prompts de importação muito genéricos | Conteúdo resumido demais | Criar prompts específicos por campo |

### Comparativo: Importação vs Regeneração

```text
IMPORTAÇÃO ATUAL (problemático):
┌────────────────────────────────────────────┐
│ Prompt único → Extrai 30+ campos de uma vez│
│ JSON Schema grande → IA comprime respostas │
│ Resultado: Campos vazios ou muito resumidos│
└────────────────────────────────────────────┘

REGENERAÇÃO (funciona bem):
┌────────────────────────────────────────────┐
│ Prompt específico → Foca em 1 campo        │
│ Texto bruto → IA tem contexto completo     │
│ Resultado: Extração detalhada e completa   │
└────────────────────────────────────────────┘
```

---

## Mudanças Propostas

### 1. Backend: Expandir Schema JSON do Prompt Principal

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linhas 24-128)

Adicionar novos campos ao schema JSON do `systemPrompt`:

```json
{
  "vitima": { ... },
  "processo": { ... },
  "acidente": { ... },
  "documentos_checklist": { ... },
  "historico": { ... },
  "posto_trabalho": {
    "cargo_funcao": "",
    "data_admissao": "",
    "data_afastamento": "",
    "descricao_ambiente": "",
    "descricao_atividades": ""
  },
  "exame_clinico": { ... },
  "informacoes_medicas": { ... },
  "quesitos": { ... },
  "textos_brutos": { ... },
  "resumo": ""
}
```

**Instruções específicas a adicionar:**

```text
11. POSTO DE TRABALHO - MUITO IMPORTANTE:
   - cargo_funcao: cargo ou função exercida pelo reclamante
   - data_admissao: data de admissão na empresa (YYYY-MM-DD)
   - data_afastamento: data de afastamento/desligamento (YYYY-MM-DD)
   - descricao_ambiente: ambiente físico, equipamentos, condições ergonômicas, riscos
   - descricao_atividades: tarefas diárias, movimentos, esforços, jornada, pausas
   
   ATENÇÃO: Estes campos são CRÍTICOS para o laudo. Extraia DETALHADAMENTE tudo 
   que encontrar sobre o posto de trabalho, atividades, cargo e datas funcionais.
```

### 2. Backend: Atualizar `ensureValidStructure()`

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linhas 306-336)

Adicionar valores default para os novos campos:

```typescript
function ensureValidStructure(data: any): object {
  const defaultStructure = {
    // ... campos existentes ...
    posto_trabalho: {
      cargo_funcao: "",
      data_admissao: "",
      data_afastamento: "",
      descricao_ambiente: "",
      descricao_atividades: ""
    }
  };
  
  return {
    // ... mapeamentos existentes ...
    posto_trabalho: { ...defaultStructure.posto_trabalho, ...(data.posto_trabalho || {}) }
  };
}
```

### 3. Backend: Atualizar `gerarResumosIA()` - Passar Contexto de Posto de Trabalho

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linhas 614-631)

O contexto `postoTrabalho` e `atividadesLaborais` estão vazios. Corrigir:

```typescript
const contexto = {
  // ... outros campos ...
  postoTrabalho: extractedData.posto_trabalho?.descricao_ambiente || '',
  atividadesLaborais: extractedData.posto_trabalho?.descricao_atividades || '',
  // ... resto ...
};
```

### 4. Frontend: Expandir Interface `ExtractedData`

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx` (linhas 48-112)

Adicionar nova seção:

```typescript
interface ExtractedData {
  // ... campos existentes ...
  posto_trabalho: {
    cargo_funcao: string;
    data_admissao: string;
    data_afastamento: string;
    descricao_ambiente: string;
    descricao_atividades: string;
  };
  // ... resto ...
}
```

### 5. Frontend: Adicionar Mapeamento no `laudoData`

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx` (linhas 937-1019)

Adicionar campos no objeto de criação do laudo:

```typescript
const laudoData = {
  // ... campos existentes ...
  
  // NOVOS: Dados do Posto de Trabalho
  dados_funcionais_cargo: extractedData.posto_trabalho?.cargo_funcao || '',
  dados_funcionais_admissao: extractedData.posto_trabalho?.data_admissao || null,
  dados_funcionais_afastamento: extractedData.posto_trabalho?.data_afastamento || null,
  descricao_posto_trabalho: extractedData.posto_trabalho?.descricao_ambiente || '',
  descricao_atividades_laborais: extractedData.posto_trabalho?.descricao_atividades || '',
  
  // ... resto ...
};
```

### 6. Sobre Nexo e Incapacidade: Manter como Checkboxes, Não Preencher Justificativas

O usuário solicitou que:
- Tipo de nexo causal → Marcar baseado na extração
- Justificativa do nexo → Deixar vazio para o médico
- Tipo de incapacidade → Marcar baseado na extração
- Justificativa da incapacidade → Deixar vazio para o médico

**Isso já está correto** no código atual (linhas 987-988):

```typescript
nexo_causal_justificativa: '',  // Deixado vazio intencionalmente
analise_incapacidade_laboral: '',  // Deixado vazio intencionalmente
```

O tipo de nexo já é preenchido (linha 977):
```typescript
nexo_causal_tipo: extractedData.informacoes_medicas.nexo_sugerido || '',
```

Para incapacidade, ajustar o mapeamento no frontend para usar `conclusao_status`:
```typescript
conclusao_status: mapIncapacidadeToConclusaoStatus(extractedData.informacoes_medicas.incapacidade_alegada)
```

### 7. Seção Conclusão: Melhorar Extração de CIDs

O problema reportado é que a conclusão fica vazia. O campo `conclusao_cid` já é mapeado da lista de CIDs:

```typescript
conclusao_cid: extractedData.informacoes_medicas.cids_mencionados?.join(', ') || '',
```

A melhoria deve vir do prompt backend para priorizar a extração de CIDs:

```text
INSTRUÇÕES ESPECÍFICAS - PRIORIDADE MÁXIMA:
7. INFORMAÇÕES MÉDICAS:
   - cids_mencionados: EXTRAIA TODOS os códigos CID-10 do documento (ex: M54.2, G56.0)
   - Procure em laudos médicos, atestados, receitas, CAT
   - NÃO deixe este campo vazio se houver qualquer código CID
```

---

## Resumo das Mudanças

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `processar-autos/index.ts` | Modificar | Expandir `systemPrompt` com seção `posto_trabalho` |
| `processar-autos/index.ts` | Modificar | Atualizar `ensureValidStructure()` |
| `processar-autos/index.ts` | Modificar | Corrigir contexto em `gerarResumosIA()` |
| `ImportarAutosDialog.tsx` | Modificar | Expandir interface `ExtractedData` |
| `ImportarAutosDialog.tsx` | Modificar | Adicionar mapeamentos em `laudoData` |

---

## Resultado Esperado

Após as mudanças:

| Campo | Antes | Depois |
|-------|-------|--------|
| Cargo/Função | Vazio | Preenchido |
| Data Admissão | Vazio | Preenchido |
| Data Afastamento | Vazio | Preenchido |
| Descrição Posto de Trabalho | Vazio | Preenchido detalhadamente |
| Descrição Atividades Laborais | Vazio | Preenchido detalhadamente |
| Tipo de Nexo | Preenchido | Mantido |
| Justificativa Nexo | Vazio | Mantido vazio (para médico) |
| Tipo de Incapacidade | Parcial | Mapeado corretamente |
| Justificativa Incapacidade | Vazio | Mantido vazio (para médico) |
| Conclusão CID | Parcial | Extração priorizada |

---

## Proteção da Infraestrutura

As mudanças são **aditivas** e **não destrutivas**:

1. O schema JSON é expandido (não substituído)
2. A função `ensureValidStructure` garante retrocompatibilidade com dados antigos
3. O mapeamento no frontend usa operador `||` para valores undefined
4. Nenhuma lógica de processamento existente é alterada
5. Os prompts específicos do `regerar-campo-pdf` permanecem inalterados
