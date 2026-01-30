
# Adicionar Redimensionamento ao Campo de Texto do Quesito

## Resumo

O usuário deseja que o campo de texto do quesito possa ser expandido arrastando pelo canto inferior direito.

## Solução

Alterar a classe CSS do Textarea de `resize-none` para `resize-y`, permitindo redimensionamento vertical.

## Alteração

**Arquivo**: `src/pages/Impugnacao.tsx`

**Linha 654** - Mudar:
```tsx
className="min-h-[80px] resize-none"
```

Para:
```tsx
className="min-h-[80px] resize-y"
```

## Resultado Visual

O textarea terá uma alça no canto inferior direito que permitirá ao usuário arrastar para expandir verticalmente o campo conforme necessário.

---

## Seção Tecnica

### Opções de Resize CSS

| Valor | Comportamento |
|-------|---------------|
| `resize-none` | Não permite redimensionar (atual) |
| `resize-y` | Permite redimensionar apenas verticalmente (proposto) |
| `resize-x` | Permite redimensionar apenas horizontalmente |
| `resize` | Permite redimensionar em ambas direções |

A opção `resize-y` é a mais adequada pois:
- Permite expandir o campo para textos longos
- Mantém a largura consistente com o layout
- Não quebra o design responsivo
