

# Correção do Layout do Modal de Histórico

## Problemas Identificados

1. **Modal preso na borda direita**: O Sheet usa `sm:max-w-sm` no componente base que limita a largura
2. **Cards não centralizados**: O padding interno não está balanceado
3. **Campo de busca cortado**: O placeholder "processo" aparece como "proce"

## Solução

### Alteração 1: Remover limitação de largura no Sheet base

**Arquivo**: `src/components/ui/sheet.tsx`

**Linha 40-41** - O `sm:max-w-sm` está limitando a largura customizada. Precisamos removê-lo para permitir larguras maiores:

```tsx
// De:
right: "inset-y-0 right-0 h-full w-3/4 border-l ... sm:max-w-sm",

// Para:
right: "inset-y-0 right-0 h-full w-3/4 border-l ...",
```

### Alteração 2: Aumentar largura e adicionar padding balanceado

**Arquivo**: `src/components/impugnacao/ImpugnacaoHistorico.tsx`

**Linha 192** - Aumentar a largura do modal:

```tsx
// De:
<SheetContent className="w-[500px] sm:w-[640px]">

// Para:
<SheetContent className="w-[560px] sm:w-[720px]">
```

### Alteração 3: Balancear padding interno

**Arquivo**: `src/components/impugnacao/ImpugnacaoHistorico.tsx`

**Linha 200** - Adicionar padding lateral simétrico ao container principal:

```tsx
// De:
<div className="mt-4 space-y-4">

// Para:
<div className="mt-4 space-y-4 px-2">
```

**Linha 233** - Ajustar o padding do container dos cards para ser simétrico:

```tsx
// De:
<div className="space-y-2 pr-2">

// Para:
<div className="space-y-2 px-1">
```

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Largura do modal | 500px / 640px (limitada) | 560px / 720px (efetiva) |
| Posicionamento | Grudado na direita | Mais espaço interno |
| Campo de busca | "Buscar por nome ou proce..." | "Buscar por nome ou processo..." |
| Cards | Desalinhados | Centralizados com padding igual |

## Arquivos Modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/ui/sheet.tsx` | Remover `sm:max-w-sm` da variante right |
| `src/components/impugnacao/ImpugnacaoHistorico.tsx` | Aumentar largura e balancear padding |

