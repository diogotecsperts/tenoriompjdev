

# Correção: Área Branca Cobrindo Metade da Tela no DevPrompts

## Diagnóstico Completo

Após análise detalhada, identifiquei que o problema **NÃO** é mais o `CoverageChecklist` (que já foi ajustado). O problema está na **estrutura de alturas fixas** que não se adaptam ao container pai.

### Arquitetura atual

```text
DevPanel (h-screen)
└── main (flex-1 overflow-auto)
    └── div (p-6)
        └── DevPrompts
            ├── Header, Stats, Search... (altura variável)
            └── Tabs
                └── TabsContent "classified"
                    └── div.flex
                        ├── aside (w-64)
                        │   └── div.sticky
                        │       ├── Card (Navegação) - ScrollArea h-[calc(100vh-400px)]
                        │       └── CoverageChecklist - max-h-[300px] ✓ OK
                        └── div.flex-1 (Área de Conteúdo)
                            └── ScrollArea h-[calc(100vh-400px)] ← PROBLEMA
```

### O problema
A `ScrollArea` na linha 847 usa `h-[calc(100vh-400px)]`, que cria uma **altura fixa baseada na viewport**. Porém:

1. O DevPanel já tem seu próprio sistema de scroll (`main` com `overflow-auto`)
2. A subtração de 400px não considera o padding (`p-6`) nem o Header/Stats/Search do DevPrompts
3. Isso cria um "espaço morto" abaixo do ScrollArea que aparece como área branca

### A solução
Usar alturas **relativas ao container** em vez de **fixas à viewport**, permitindo que o conteúdo cresça naturalmente.

---

## Mudanças Propostas

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

#### 1. Área de conteúdo principal (linha 847)
```tsx
// Antes
<ScrollArea className="h-[calc(100vh-400px)]">

// Depois - Remove altura fixa, deixa o conteúdo fluir naturalmente
<div className="space-y-6 pr-4">
  {/* conteúdo sem ScrollArea wrapper */}
</div>
```

Alternativa se scroll for necessário:
```tsx
<ScrollArea className="max-h-[70vh]">
```

#### 2. Navegação lateral (linha 800)
```tsx
// Antes
<ScrollArea className="h-[calc(100vh-400px)]">

// Depois
<ScrollArea className="max-h-[50vh]">
```

#### 3. Tab de não classificados (linha 990)
```tsx
// Antes
<ScrollArea className="h-[calc(100vh-400px)]">

// Depois
<ScrollArea className="max-h-[70vh]">
```

---

## Abordagem Recomendada

A abordagem mais simples e eficaz é:

1. **Remover o ScrollArea da área de conteúdo principal** (linha 847) - deixar o scroll do `main` do DevPanel controlar
2. **Usar `max-h-*` em vez de `h-[calc...]`** nos ScrollAreas restantes

Isso elimina conflitos de scroll aninhado e permite que o layout flua naturalmente.

---

## Resumo das Alterações

| Linha | Componente | Antes | Depois |
|-------|------------|-------|--------|
| 800 | Nav ScrollArea | `h-[calc(100vh-400px)]` | `max-h-[50vh]` |
| 847 | Content ScrollArea | `h-[calc(100vh-400px)]` | Remover ScrollArea (usar div simples) |
| 990 | Unclassified ScrollArea | `h-[calc(100vh-400px)]` | `max-h-[70vh]` |

---

## Resultado Esperado

1. Área branca eliminada
2. Todo o conteúdo visível e acessível
3. Scroll suave controlado pelo container pai (DevPanel)
4. Sidebar com scroll independente limitado a 50vh
5. Layout responsivo que se adapta a diferentes tamanhos de tela

