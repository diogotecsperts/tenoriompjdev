
# Correção do Rodapé DOCX - Banner Edge-to-Edge

## Problema Identificado

Analisando a imagem fornecida, o banner do rodapé está encostando na borda esquerda, mas não se estende até a borda direita da página. Isso acontece porque:

1. **Unidades incorretas**: O `offset` na biblioteca `docx` usa EMUs (English Metric Units), não pontos
2. **Largura da imagem insuficiente**: 595 pontos de largura não cobre toda a página quando combinado com posicionamento flutuante
3. **Conversão de unidades**: 1 inch = 914400 EMUs, e a página A4 tem 210mm de largura

## Cálculos Necessários

```text
A4 Largura = 210mm = 8.27 inches
1 inch = 914400 EMUs
Largura total em EMUs = 8.27 × 914400 = 7,562,088 EMUs

Para transformation (pixels):
1 ponto = 0.75 pixels (conforme documentação)
Largura A4 em pontos = 595.28 pts
Largura em pixels = 595.28 / 0.75 ≈ 793 pixels
```

## Solução Técnica

### Arquivo: `src/utils/generateLaudoDOCX.ts`

**Mudança 1**: Usar dimensões em pixels corretas para a imagem

O problema principal é que `transformation.width` usa pixels, não pontos. Devemos usar a largura total da página A4 em pixels.

```typescript
// Largura A4 em pixels (595 pontos × 1.333... = ~793 pixels)
// Mas na prática, a biblioteca aceita valores em pontos que são convertidos
const A4_WIDTH_PIXELS = Math.round(595 * 1.333); // ~793 pixels
```

**Mudança 2**: Garantir que a imagem ocupe toda a largura usando a proporção correta

O footer precisa manter a proporção original da imagem PNG, mas esticando para a largura total da página. Como a imagem original do timbrado já foi desenhada para ocupar toda a largura, devemos calcular corretamente.

**Mudança 3**: Verificar se `offset: 0` realmente posiciona na borda

Quando usamos `relative: PAGE` e `offset: 0`, a imagem deve começar exatamente na borda esquerda. O problema pode ser que a largura especificada não é suficiente.

## Código Corrigido

```typescript
// Constantes de conversão
const POINTS_TO_PIXELS = 1.333; // 1 ponto = 1.333 pixels
const A4_WIDTH_MM = 210;
const A4_WIDTH_POINTS = 595.28;
const A4_WIDTH_PIXELS = Math.round(A4_WIDTH_POINTS * POINTS_TO_PIXELS); // 793

// No cálculo das dimensões do footer
const footerWidthPixels = A4_WIDTH_PIXELS; // Largura total da página
const footerHeightPixels = Math.round(footerWidthPixels * (footerDimensions.height / footerDimensions.width));

// Na criação do ImageRun
new ImageRun({
  data: footerImageBuffer,
  transformation: {
    width: footerWidthPixels,  // 793 pixels (largura total A4)
    height: footerHeightPixels,
  },
  floating: {
    horizontalPosition: {
      relative: HorizontalPositionRelativeFrom.PAGE,
      offset: 0, // Começa na borda esquerda
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
})
```

## Alteração Detalhada

### Linhas 661-665 - Ajustar cálculo de dimensões

Antes:
```typescript
const headerWidth = 595;
const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
const footerWidth = 595;
const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));
```

Depois:
```typescript
// Constante de conversão: a biblioteca docx usa pixels internamente
// A4 em pontos = 595.28, em pixels = 595.28 * 1.333 ≈ 793
const A4_WIDTH_PIXELS = 793;

const headerWidth = A4_WIDTH_PIXELS;
const headerHeight = Math.round(headerWidth * (headerDimensions.height / headerDimensions.width));
const footerWidth = A4_WIDTH_PIXELS;
const footerHeight = Math.round(footerWidth * (footerDimensions.height / footerDimensions.width));
```

### Linhas 697-699 - Usar a largura correta

Antes:
```typescript
transformation: {
  width: 595,  // Largura A4 em pontos (210mm)
  height: footerHeight,
},
```

Depois:
```typescript
transformation: {
  width: footerWidth,  // Largura total A4 em pixels
  height: footerHeight,
},
```

## Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| Linha 662 | Criar constante `A4_WIDTH_PIXELS = 793` |
| Linhas 663-666 | Usar `A4_WIDTH_PIXELS` para headerWidth e footerWidth |
| Linha 698 | Usar variável `footerWidth` em vez de valor fixo 595 |

## Observação Importante

A documentação da biblioteca `docx` indica que `transformation.width` e `transformation.height` estão em **pixels**, que correspondem a aproximadamente `pontos × 1.333`. Por isso, usar 595 (pontos) resulta em uma imagem menor do que o esperado.

## Impacto

- O cabeçalho também será ajustado para a largura correta
- O rodapé se estenderá de borda a borda como no PDF
- A numeração de página em branco ficará sobreposta ao banner
