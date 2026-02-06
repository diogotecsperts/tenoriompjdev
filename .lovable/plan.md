
# Correções na Exportação DOCX

## Problemas Identificados

### 1. Formato Padrão Errado
O estado inicial do `exportFormat` usa `'pdf'` como fallback:
```typescript
// Linha 253 de LaudoEditor.tsx
const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>(() => {
  return (localStorage.getItem('laudo-export-format') as 'pdf' | 'docx') || 'pdf';
  //                                                                        ^^^^
});
```

### 2. Rodapé DOCX com Problemas Visuais

Analisando as imagens fornecidas:

| Aspecto | PDF (Correto) | DOCX (Problema) |
|---------|---------------|-----------------|
| Banner | Encaixa nas bordas | Não encaixa nas extremidades |
| "Página X de XX" | Dentro do banner, centralizado | Abaixo do banner, fora |

**Causa raiz:** No PDF, o texto "Página X de XX" é desenhado diretamente sobre a imagem do rodapé usando coordenadas absolutas. No DOCX, a imagem e o texto são elementos separados em parágrafos distintos no Footer.

---

## Solução Técnica

### Correção 1: Alterar Formato Padrão para DOCX

Modificar o fallback de `'pdf'` para `'docx'`:

```typescript
const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>(() => {
  return (localStorage.getItem('laudo-export-format') as 'pdf' | 'docx') || 'docx';
});
```

### Correção 2: Rodapé DOCX Profissional

A solução envolve três ajustes na biblioteca `docx`:

**A) Imagem de rodapé edge-to-edge:**
- Usar `floating` positioning com `HorizontalPositionRelativeFrom.PAGE`
- Definir `wrap: none` para a imagem não empurrar o texto
- Usar margem negativa no parágrafo para compensar as margens da página

**B) Numeração de página sobre a imagem:**
- Colocar a numeração no mesmo parágrafo do rodapé usando posicionamento absoluto
- Alternativamente, criar um campo de texto posicionado sobre a imagem

**C) Abordagem mais robusta (recomendada):**
- Remover a numeração de página separada
- Usar `PositionalTab` ou posicionamento absoluto para colocar o texto sobre a imagem
- Configurar o footer com margem mínima e a imagem em modo floating

---

## Implementação Detalhada

### Arquivo: `src/pages/LaudoEditor.tsx`

**Linha 253** - Alterar fallback:
```typescript
// ANTES
|| 'pdf';

// DEPOIS
|| 'docx';
```

### Arquivo: `src/utils/generateLaudoDOCX.ts`

**Linhas 683-716** - Refatorar criação do footer:

```typescript
// Preparar footer com imagem edge-to-edge e numeração sobreposta
let footerContent: Paragraph[] = [];

if (footerImageBuffer) {
  // Calcular largura total da página A4 em EMUs (English Metric Units)
  // A4 = 210mm, margens = ~20mm esquerda + ~15mm direita = 35mm
  // Para edge-to-edge, precisamos compensar as margens
  const pageWidthEmu = 595 * 9525; // pontos para EMU
  
  footerContent = [
    new Paragraph({
      children: [
        new ImageRun({
          data: footerImageBuffer,
          transformation: {
            width: 595,  // Largura A4 em pontos
            height: footerHeight,
          },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.PAGE,
              offset: 0,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PAGE,
              align: VerticalPositionAlign.BOTTOM,
            },
            wrap: {
              type: TextWrappingType.NONE,
            },
            behindDocument: true,
          },
          type: "png",
        }),
      ],
    }),
    // Numeração de página posicionada sobre a imagem
    new Paragraph({
      children: [
        new TextRun({
          children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
          size: FONT.sizeSmall,
          color: "FFFFFF", // Branco para contraste sobre o banner
          font: FONT.name,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0 },
    }),
  ];
}
```

**Configuração de margens da seção:**
```typescript
properties: {
  page: {
    margin: {
      top: convertInchesToTwip(1.2),
      bottom: convertInchesToTwip(0.4), // Reduzir para acomodar imagem
      left: convertInchesToTwip(0.79),
      right: convertInchesToTwip(0.59),
      footer: convertInchesToTwip(0.2), // Footer mais próximo da borda
    },
  },
},
```

### Imports Adicionais Necessários

```typescript
import {
  // ... imports existentes ...
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  VerticalPositionAlign,
  TextWrappingType,
} from "docx";
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `LaudoEditor.tsx` | Mudar fallback de `'pdf'` para `'docx'` (1 linha) |
| `generateLaudoDOCX.ts` | Adicionar imports de posicionamento (~4 imports) |
| `generateLaudoDOCX.ts` | Refatorar criação do footer com floating image (~40 linhas) |
| `generateLaudoDOCX.ts` | Ajustar margens da página para footer edge-to-edge (~3 linhas) |

---

## Detalhes Técnicos

### Por que a imagem não encaixa nas bordas?

No DOCX atual, a imagem está usando posicionamento inline (padrão). Isso significa que ela respeita as margens da página definidas na seção. Para que a imagem "sangre" até as bordas como no PDF, é necessário:

1. Usar `floating` positioning em vez de inline
2. Posicionar relativo à `PAGE` (não à margem)
3. Definir `offset: 0` para começar exatamente na borda

### Por que a numeração ficou abaixo da imagem?

No código atual, a numeração é um parágrafo separado adicionado após a imagem:
```typescript
// Código atual - PROBLEMA
footerContent.push(
  new Paragraph({ ... imagem ... }),
  new Paragraph({ ... "Página X de XX" ... }), // ← Fica abaixo!
);
```

No PDF, o texto é desenhado diretamente sobre a imagem em coordenadas absolutas. No DOCX, precisamos simular isso com positioning absoluto ou margem negativa para "subir" o texto sobre a imagem.

### Solução Alternativa (se floating não funcionar bem)

Se o posicionamento floating apresentar problemas em diferentes versões do Word, uma alternativa é:
1. Manter a imagem inline mas com margens negativas no parágrafo
2. Usar um Table invisível no footer para posicionar elementos
