
# Correção: Área Branca Bloqueando Visualização no DevPrompts

## Diagnóstico do Problema

O componente `CoverageChecklist` está causando uma área branca que cobre metade da interface por dois motivos:

### 1. Posicionamento Incorreto
```tsx
// Linha 791-843 em DevPrompts.tsx
<aside className="w-64 shrink-0 hidden lg:block">
  <div className="sticky top-4">  {/* ← O sticky wrapper */}
    <Card>
      {/* Navegação - OK dentro do sticky */}
    </Card>
  </div>  {/* ← FECHA aqui */}
  
  {/* CoverageChecklist está FORA do sticky! */}
  <CoverageChecklist prompts={prompts} />  {/* ← PROBLEMA */}
</aside>
```

O `CoverageChecklist` está **fora** do `div.sticky`, criando um elemento flutuante separado.

### 2. Altura Excessiva
```tsx
// Linha 154 em CoverageChecklist.tsx
<ScrollArea className="h-[calc(100vh-600px)] min-h-[200px]">
```

Essa altura de `100vh-600px` com `min-h-[200px]` cria um bloco grande que ocupa espaço mesmo quando não há conteúdo suficiente para justificar.

---

## Solução

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

Mover o `CoverageChecklist` para **dentro** do wrapper `sticky top-4`:

```tsx
<aside className="w-64 shrink-0 hidden lg:block">
  <div className="sticky top-4 space-y-4">  {/* Adicionar space-y-4 */}
    <Card>
      {/* Card de Navegação existente */}
    </Card>
    
    {/* CoverageChecklist DENTRO do sticky */}
    <CoverageChecklist prompts={prompts} />
  </div>
</aside>
```

### Arquivo: `src/components/dev-panel/CoverageChecklist.tsx`

Ajustar a altura do ScrollArea para ser mais compacta:

```tsx
// Antes
<ScrollArea className="h-[calc(100vh-600px)] min-h-[200px]">

// Depois
<ScrollArea className="max-h-[300px]">
```

---

## Resultado Esperado

1. Os dois cards (Navegação + Cobertura) ficam lado a lado verticalmente na sidebar
2. Ambos permanecem fixos durante scroll (sticky)
3. O CoverageChecklist tem altura máxima limitada a 300px
4. Sem área branca bloqueando a visualização dos prompts

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/dev-panel/DevPrompts.tsx` | Mover `CoverageChecklist` para dentro do `div.sticky` |
| `src/components/dev-panel/CoverageChecklist.tsx` | Alterar altura de `h-[calc(100vh-600px)] min-h-[200px]` para `max-h-[300px]` |
