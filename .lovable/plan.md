

# Correção do Layout do Histórico de Impugnações

## Problema

O botão de excluir (lixeira) está sendo cortado/ficando fora da área visível porque o modal está com largura insuficiente e o layout flexbox está comprimindo o botão.

## Solução

### Alteração 1: Aumentar largura do modal

**Arquivo**: `src/components/impugnacao/ImpugnacaoHistorico.tsx`

**Linha 192** - Mudar:
```tsx
<SheetContent className="w-[400px] sm:w-[540px]">
```

Para:
```tsx
<SheetContent className="w-[500px] sm:w-[640px]">
```

### Alteração 2: Garantir que o botão não seja comprimido

**Linha 282-289** - Adicionar `flex-shrink-0` ao botão:
```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
  onClick={(e) => handleDeleteClick(e, imp.id)}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

### Alteração 3: Adicionar padding ao container dos cards

**Linha 233** - Mudar:
```tsx
<div className="space-y-2">
```

Para:
```tsx
<div className="space-y-2 pr-2">
```

Isso adiciona um pequeno espaço à direita para garantir que o botão fique visível mesmo com a scrollbar.

## Resultado Visual

| Antes | Depois |
|-------|--------|
| Modal: 400px / 540px | Modal: 500px / 640px |
| Botão lixeira cortado | Botão visível e clicável |
| Cards encostando na borda | Cards com espaço adequado |

## Resumo das Mudanças

| Linha | Alteração |
|-------|-----------|
| 192 | Aumentar largura do SheetContent |
| 233 | Adicionar `pr-2` ao container dos cards |
| 285 | Adicionar `flex-shrink-0` ao botão de excluir |

