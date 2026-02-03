

# Plano de Padronizacao de Nomenclatura - DevPrompts

## Resumo da Analise

Apos analise detalhada, confirmei que:

1. **O campo "Ambiente e Atividades Laborais" esta CORRETO** - ja foi padronizado na ultima correcao
2. **Existem inconsistencias menores** em outros campos entre o label no laudo e a descricao no prompt
3. **Existe um problema residual**: fallback do campo legado `descricaoPostoTrabalho` ainda no `regerar-campo-pdf`

---

## PROBLEMAS IDENTIFICADOS

### Problema 1: Fallback legado ainda existe

**Arquivo:** `supabase/functions/regerar-campo-pdf/index.ts`

**Localizacao:** Linhas 189-207 no objeto `fieldPrompts` (fallback)

O campo `descricaoPostoTrabalho` foi removido do mapeamento principal (linha 24), mas o fallback hardcoded ainda existe. Isso pode causar confusao e nao deveria estar la.

**Acao:** REMOVER a entrada `descricaoPostoTrabalho` do objeto `fieldPrompts`

---

### Problema 2: Nomenclaturas ligeiramente diferentes

Algumas descricoes de prompts nao correspondem exatamente aos labels dos campos no laudo:

| Campo no Laudo | Label Atual no Prompt | Label Sugerido |
|----------------|----------------------|----------------|
| "Historia da Molestia Atual" | "Historia atual - Regenerar via PDF" | "Historia da Molestia Atual - Regenerar via PDF" |
| "Antecedentes Pessoais e Familiares" | "Antecedentes patologicos - Regenerar via PDF" | "Antecedentes Pessoais e Familiares - Regenerar via PDF" |
| "Afastamentos do Trabalho" | "Afastamentos - Regenerar via PDF" | "Afastamentos do Trabalho - Regenerar via PDF" |
| "Descricao dos Laudos" | "Laudos medicos - Regenerar via PDF" | "Descricao dos Laudos Medicos - Regenerar via PDF" |
| "Descricao dos Exames" | "Exames complementares - Regenerar via PDF" | "Descricao dos Exames Complementares - Regenerar via PDF" |
| "Achados do Exame Fisico" | "Exame fisico - Regenerar via PDF" | "Achados do Exame Fisico - Regenerar via PDF" |
| "Necessidade de Auxilio de Terceiros" | "Auxilio de terceiros - Regenerar via PDF" | "Necessidade de Auxilio de Terceiros - Regenerar via PDF" |

---

## SOBRE O BOTAO "CARREGAR PADRAO"

O botao funciona assim:

```text
Usuario clica "Carregar Padrao"
        |
        v
  Dialog de confirmacao aparece
        |
        v
  Se confirmar, chama edge function `seed-prompts`
        |
        v
  Edge function faz UPSERT de todos os prompts
  definidos no codigo TypeScript
        |
        v
  Prompts no banco sao SOBRESCRITOS
  pelos valores hardcoded no codigo
```

**Pontos importantes:**

1. **NAO existe backup isolado** - os prompts padrao estao no proprio codigo da edge function
2. **Funciona apos refatoracoes** - desde que a edge function seja re-deployed
3. **Sobrescreve customizacoes** - qualquer ajuste feito pelo perito sera perdido
4. **Por isso existe o dialog de confirmacao** com alerta sobre perda de dados
5. **Por isso existe o botao "Exportar PDF"** - para fazer backup antes de resetar

---

## ARQUIVOS A MODIFICAR

| Arquivo | Modificacao |
|---------|-------------|
| `supabase/functions/seed-prompts/index.ts` | Padronizar nomenclatura das descricoes |
| `supabase/functions/regerar-campo-pdf/index.ts` | Remover fallback do campo legado |

---

## MUDANCAS DETALHADAS

### 1. seed-prompts/index.ts - Padronizar Descricoes

```typescript
// Antes
prompt_regen_historiaAtual: {
  description: 'Historia atual - Regenerar via PDF',
  ...
}

// Depois
prompt_regen_historiaAtual: {
  description: 'Historia da Molestia Atual - Regenerar via PDF',
  ...
}
```

Aplicar para todos os 7 campos listados acima.

### 2. regerar-campo-pdf/index.ts - Remover Fallback Legado

**Remover linhas 189-207** que contem:

```typescript
descricaoPostoTrabalho: `Extraia e detalhe a "Descricao do Posto de Trabalho"...`,
```

---

## GARANTIAS

1. **Zero impacto funcional** - apenas labels de exibicao mudam
2. **Nomenclatura 100% identica ao laudo** - facilita localizacao
3. **Codigo legado removido** - elimina confusao
4. **Edge functions precisam ser re-deployed** - para aplicar mudancas
5. **Apos deploy, clicar em "Carregar Padrao"** sincroniza os novos nomes no banco

---

## RESPOSTA AS SUAS PERGUNTAS

**1. O botao "Carregar Padrao" ainda funciona?**
Sim! Ele continua funcionando normalmente. Chama a edge function que faz upsert dos prompts padrao.

**2. O "Padrao" esta guardado em backup isolado?**
NAO. Os prompts padrao estao HARDCODED no codigo TypeScript da edge function `seed-prompts/index.ts`. Quando voce clica no botao, ele le esses valores do codigo e grava no banco. Por isso, apos cada refatoracao, precisamos fazer deploy da edge function para que o "padrao" reflita as mudancas.

**3. Isso esta funcionando mesmo com as refatoracoes?**
Sim, mas apenas porque fizemos deploy das edge functions apos cada mudanca. Se nao tivessemos feito deploy, o "Carregar Padrao" ainda traria os prompts antigos.

