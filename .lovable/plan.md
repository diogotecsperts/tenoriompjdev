

# Estilização da Scrollbar - Card de Navegação

## Problema

A scrollbar nativa do navegador aparece com cor preta/escura, destoando completamente do visual limpo e suave do site que usa tons de Slate/Teal.

## Solução

Adicionar estilos CSS personalizados para a scrollbar usando as variáveis de cor já definidas no design system. A abordagem mais limpa é criar uma classe utilitária que pode ser reutilizada em qualquer elemento com scroll nativo.

---

## Mudanças

### Arquivo: `src/index.css`

Adicionar estilos de scrollbar customizada na seção `@layer components`:

```css
/* Scrollbar customizada para elementos com overflow */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 9999px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}
```

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

Aplicar a classe no div da navegação (linha 800):

```tsx
// Antes
<div className="max-h-[50vh] overflow-y-auto">

// Depois
<div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
```

---

## Resultado Visual

| Elemento | Antes | Depois |
|----------|-------|--------|
| Largura | ~12px (padrão) | 6px (fina e discreta) |
| Track | Cinza escuro | Transparente |
| Thumb | Preto | Cinza claro (`--border`) |
| Hover | Sem mudança | Cinza médio suave |

A scrollbar ficará sutil, com a mesma cor da borda (`--border` = Slate-200), alinhada perfeitamente ao design system do site.

---

## Compatibilidade

- Chrome, Edge, Safari: Suporte completo via `-webkit-scrollbar`
- Firefox: Usará fallback padrão (ainda funcional, apenas menos estilizado)

