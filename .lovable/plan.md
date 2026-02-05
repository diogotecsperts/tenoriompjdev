

# Correção: Scroll do Card de Navegação Travado

## Problema Identificado

O `ScrollArea` na navegação lateral tem `max-h-[50vh]`, mas está dentro de um container `sticky`. O problema é que:

1. O `sticky` mantém o elemento fixo na viewport durante o scroll
2. O `max-h-[50vh]` limita a altura máxima corretamente
3. **MAS** o `ScrollArea` do Radix UI precisa de uma altura **definida** (não apenas máxima) para ativar o scroll interno

### Por que `max-h` não funciona bem com ScrollArea

O componente `ScrollArea` do Radix calcula se precisa mostrar scrollbar baseado na comparação entre a altura do container e a altura do conteúdo. Com `max-h`, o container pode crescer até o máximo, mas se o conteúdo for menor, não há altura fixa definida - isso confunde o cálculo.

## Solução

Usar uma combinação de altura fixa com overflow controlado, ou usar `h-[50vh]` diretamente para garantir que o ScrollArea tenha uma altura definida para calcular o scroll.

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

```tsx
// Linha 800 - Antes
<ScrollArea className="max-h-[50vh]">

// Depois - Usar altura definida com flex para adaptação
<ScrollArea className="h-[50vh]">
```

Porém, para casos onde o conteúdo é menor que 50vh, isso criaria espaço vazio. A solução ideal é:

```tsx
// Solução otimizada - altura automática até um máximo, com scroll quando necessário
<div className="max-h-[50vh] overflow-y-auto">
  <div className="p-2 space-y-1">
    {/* conteúdo */}
  </div>
</div>
```

**Remover o `ScrollArea`** e usar `overflow-y-auto` nativo do CSS, que funciona perfeitamente com `max-h`.

---

## Mudança Proposta

| Local | Antes | Depois |
|-------|-------|--------|
| Linha 800-836 | `<ScrollArea className="max-h-[50vh]">...</ScrollArea>` | `<div className="max-h-[50vh] overflow-y-auto">...</div>` |

---

## Por que esta solução é melhor

1. **Simplicidade**: CSS nativo `overflow-y-auto` funciona perfeitamente com `max-h`
2. **Performance**: Menos overhead que o componente ScrollArea do Radix
3. **Compatibilidade**: Funciona bem com `sticky` positioning
4. **Responsividade**: Altura se adapta ao conteúdo até o máximo definido

---

## Resultado Esperado

1. O card de Navegação terá scroll interno funcional
2. Todas as opções do índice serão acessíveis
3. O sticky positioning continuará funcionando
4. Sem área branca extra na página

