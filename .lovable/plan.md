
# Correção: Unificar Prompts na Importação de PDF

## Problema Identificado

A função de importação de PDF (`processar-autos`) usa **prompts hardcoded** internos em vez de buscar os prompts do banco de dados. Isso causa inconsistência: as regras otimizadas que você definiu só funcionam ao clicar em "Buscar novamente", mas não durante a importação inicial do PDF.

| Fluxo | Onde busca o prompt | Resultado |
|-------|---------------------|-----------|
| Importar PDF (processar-autos) | Hardcoded em `getPromptForType()` | Referências genéricas, sem Schilling/Bradford-Hill/Simonin |
| Buscar Novamente (gerar-resumos) | `system_config` via `prompt-manager` | Referências corretas com regras obrigatórias |

## Por que "Regerar" não existe para Referências

Este comportamento **está correto**. Referências bibliográficas são geradas *analiticamente* a partir dos dados do laudo (CIDs, atividades, etc.), não *extraídas* do PDF. Por isso:
- O botão "Buscar novamente" (✨) É a função de gerar referências
- Não existe "Regerar" (🔄) porque não há texto para extrair do PDF

## Solução

Modificar a função `getPromptForType()` em `processar-autos/index.ts` para usar o `prompt-manager` em vez de prompts hardcoded.

## Arquivo a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/processar-autos/index.ts` | Refatorar `getPromptForType()` para usar `prompt-manager` |

## Implementação Técnica

### Antes (atual - problemático)
```text
function getPromptForType(tipo, ctx) {
  const prompts = {
    referencias_bibliograficas: `... prompt genérico hardcoded ...`
  };
  return prompts[tipo] || '';
}
```

### Depois (corrigido)
```text
async function getPromptForType(tipo, ctx) {
  // Mapeamento de tipos para IDs de prompt
  const promptMapping = {
    referencias_bibliograficas: 'prompt_gen_referencias',
    nexo_causal: 'prompt_gen_nexo_causal',
    incapacidade: 'prompt_gen_incapacidade',
    descricao_doencas: 'prompt_gen_descricao_doencas',
    // ... outros tipos
  };

  // Contexto para interpolação de variáveis
  const interpolationContext = {
    cids: ctx.cids || 'Não informado',
    atividadesLaborais: ctx.atividadesLaborais || 'Não informado',
    laudosMedicos: ctx.laudosMedicos || 'Não informado',
    // ... outras variáveis
  };

  // Buscar prompt do banco via prompt-manager
  const prompt = await getPrompt(
    promptMapping[tipo],
    defaultPrompts[tipo], // fallback hardcoded
    interpolationContext
  );

  return prompt;
}
```

## Mudanças Necessárias

1. **Tornar `getPromptForType()` assíncrona** para usar `await getPrompt()`
2. **Adicionar mapeamento** de tipos para IDs de prompt do banco
3. **Criar contexto de interpolação** com todas as variáveis (${cids}, ${atividadesLaborais}, etc.)
4. **Atualizar chamadas** de `getPromptForType()` para usar `await`
5. **Manter prompts hardcoded como fallback** para resiliência

## Impacto

- **Importação de PDF**: Passará a usar os prompts otimizados do banco
- **Consistência**: O comportamento será idêntico ao "Buscar novamente"
- **Retrocompatibilidade**: Se o banco falhar, usa o prompt hardcoded como fallback
- **Zero impacto na UI**: Não requer mudanças no frontend

## Resultado Esperado

Após a implementação:
1. Importar um novo PDF
2. As referências bibliográficas virão com Schilling, Bradford-Hill e Simonin obrigatórios
3. O comportamento será idêntico ao clicar em "Buscar novamente"
