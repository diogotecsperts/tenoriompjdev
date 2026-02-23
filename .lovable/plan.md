

# Correção: Adicionar `textoProcesso` ao `interpolationContext`

## Causa Raiz

A variável `${textoProcesso}` nos templates de quesitos nunca era substituída pelo texto real do documento (~195k chars). O objeto `interpolationContext` na função `getPromptForType` (linha 915-954) não incluía esta variável, fazendo com que o Gemini recebesse a string literal `${textoProcesso}` em vez do conteúdo do processo.

## Correção (1 linha adicionada)

### Arquivo: `supabase/functions/processar-autos/index.ts`

Na linha 953, após `conclusao`, adicionar:

```typescript
    // Outros campos que podem ser usados em prompts futuros
    metodologia: ctx.metodologia || 'Não informado',
    conclusao: ctx.conclusao || 'Não informado',
    
    // Texto bruto integral do processo para quesitos
    textoProcesso: ctx.textoProcesso || '',
  };
```

## Deploy

`processar-autos`

