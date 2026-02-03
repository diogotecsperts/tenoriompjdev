

# Plano de Correção - Modal de Restauração de Fábrica

## Problema Identificado

O `AlertDialogContent` tem `max-w-lg` (512px) como largura padrão, mas o footer contém 3 botões com textos longos:
- "Exportar PDF Primeiro"
- "Cancelar"
- "Restaurar Padrão de Fábrica"

Isso faz com que o texto do último botão vaze/quebre.

## Solução

Adicionar classe `max-w-xl` (576px) ou `max-w-2xl` (672px) no `AlertDialogContent` específico para aumentar a largura do modal e acomodar todos os botões.

Também ajustar o layout do footer para garantir que os botões fiquem bem dispostos em telas menores.

## Arquivo a Modificar

`src/components/dev-panel/DevPrompts.tsx`

## Mudança Específica

**Linha 1192** - Adicionar classe de largura:

```tsx
// Antes
<AlertDialogContent>

// Depois
<AlertDialogContent className="max-w-xl">
```

**Linha 1211** - Ajustar o footer para wrap em mobile:

```tsx
// Antes
<AlertDialogFooter className="gap-2">

// Depois
<AlertDialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
```

## Resultado Esperado

- Modal com largura suficiente para acomodar os 3 botões
- Botões não quebram ou vazam texto
- Em mobile, botões podem empilhar se necessário

