

# Correção Completa: Cabeçalho, Numeração e Transparência do DOCX

## Problemas Identificados

### 1. Cabeçalho Mal Posicionado
**No PDF:**
- `yPos = 2` (2mm do topo)
- `xPos = 8` (8mm da esquerda = centralizado com 8mm de margem em cada lado)
- Largura: `PAGE.width - 16` = 194mm

**No DOCX atual:**
- A imagem está apenas `AlignmentType.CENTER` mas o header tem margens internas que empurram a imagem
- Sem controle de posição vertical (fica abaixo)
- Margem superior da página está em `32mm` (excessivo)

### 2. Numeração de Página Muito Baixa
**No PDF:**
- Posição: `PAGE.height - 5` = 5mm da borda inferior
- Centralizado horizontalmente

**No DOCX atual:**
- `spacing: { before: 0 }` coloca a numeração no topo do footer container
- Mas o footer container inicia onde a margem bottom termina, não na borda da página

### 3. Transparência nas Imagens
O problema de "transparência" pode ter duas causas:
1. **Compressão/Qualidade**: A biblioteca `docx` pode estar aplicando compressão
2. **Blending Mode**: Quando `behindDocument: true`, há interação com layers

---

## Análise Detalhada do PDF

```text
┌─────────────────────────────┐ ← 0mm (topo)
│         ╔═══════╗           │ ← yPos = 2mm (cabeçalho começa)
│         ║HEADER ║ (194mm)   │
│         ╚═══════╝           │ ← headerBottomY ≈ 45mm
│   ↑ 8mm         ↑ 8mm       │ ← margens laterais
│         CONTEÚDO            │
│            ...              │
│         ╔═══════╗           │ ← footerTopY ≈ 270mm
│ ← 0mm   ║FOOTER ║ (210mm) → │ ← Edge-to-edge
│         ╚═══════╝           │
│      "Página X de XX"       │ ← PAGE.height - 5 = 292mm
└─────────────────────────────┘ ← 297mm (base)
```

---

## Solução Técnica

### Correção 1: Cabeçalho com Posicionamento Floating

Para replicar o PDF exatamente, precisamos usar **floating** no cabeçalho também, com:
- Posição horizontal: 8mm da borda esquerda (em EMUs)
- Posição vertical: 2mm do topo da página (em EMUs)
- Largura: 733 pixels (194mm)

```typescript
// Conversão: 1mm = 914400/25.4 ≈ 36000 EMUs
const MM_TO_EMU = 36000;

new ImageRun({
  data: headerImageBuffer,
  transformation: {
    width: headerWidth,  // 733 pixels
    height: headerHeight,
  },
  floating: {
    horizontalPosition: {
      relative: HorizontalPositionRelativeFrom.PAGE,
      offset: 8 * MM_TO_EMU,  // 8mm da esquerda (como no PDF)
    },
    verticalPosition: {
      relative: VerticalPositionRelativeFrom.PAGE,
      offset: 2 * MM_TO_EMU,  // 2mm do topo (como no PDF)
    },
    wrap: { type: TextWrappingType.NONE },
    behindDocument: true,
  },
  type: "png",
})
```

### Correção 2: Numeração de Página Posicionada

Para a numeração ficar 5mm acima da borda inferior (como no PDF), precisamos usar posicionamento absoluto:

```typescript
// Posição vertical da numeração = 292mm do topo = PAGE.height - 5
// Em EMUs: 292 * 36000 = 10,512,000 EMUs

new Paragraph({
  frame: {
    position: {
      x: 0,
      y: 292 * MM_TO_EMU,  // 5mm da borda inferior
    },
    width: A4_WIDTH_PIXELS,
    anchor: {
      horizontal: FrameAnchorType.PAGE,
      vertical: FrameAnchorType.PAGE,
    },
  },
  children: [...],
  alignment: AlignmentType.CENTER,
})
```

Alternativamente, usar `spacing: { before: X }` negativo para "subir" a numeração sobre a imagem.

### Correção 3: Margem Superior do Header

Reduzir a margem `header` da página para permitir que a imagem fique mais próxima do topo:

```typescript
margin: {
  top: "2mm",      // Espaço mínimo (cabeçalho é floating)
  header: "0mm",   // Header na borda superior
  ...
}
```

---

## Implementação Detalhada

### Arquivo: `src/utils/generateLaudoDOCX.ts`

**1. Adicionar constante de conversão para EMUs**

```typescript
// 1mm = 914400 / 25.4 ≈ 36000 EMUs (English Metric Units)
const MM_TO_EMU = 36000;
```

**2. Modificar o cabeçalho para usar floating (linhas ~686-701)**

```typescript
if (headerImageBuffer) {
  headerContent = [
    new Paragraph({
      children: [
        new ImageRun({
          data: headerImageBuffer,
          transformation: {
            width: headerWidth,  // ~733 pixels (194mm)
            height: headerHeight,
          },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.PAGE,
              offset: 8 * MM_TO_EMU,  // 8mm da esquerda (como PDF)
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PAGE,
              offset: 2 * MM_TO_EMU,  // 2mm do topo (como PDF)
            },
            wrap: {
              type: TextWrappingType.NONE,
            },
            behindDocument: true,  // Fica por trás do conteúdo
          },
          type: "png",
        }),
      ],
    }),
  ];
}
```

**3. Ajustar posição da numeração (linhas ~739-752)**

Calcular a altura da área do footer e posicionar a numeração 5mm da borda:

```typescript
// A numeração deve ficar 5mm acima da borda inferior (como no PDF)
// Como a imagem está behindDocument e cobre ~27mm, precisamos posicionar a numeração
// sobre ela usando spacing negativo ou frame positioning

footerContent.push(
  new Paragraph({
    children: [
      new TextRun({
        children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
        size: FONT.sizeSmall,
        color: "FFFFFF",
        font: FONT.name,
      }),
    ],
    alignment: AlignmentType.CENTER,
    // Usar margem negativa para subir a numeração sobre a imagem
    // A altura do footer container é ~footerHeightMm, queremos ficar 5mm da borda
    spacing: { 
      before: Math.round((footerHeightMm - 5) * 20 * 2),  // twips (1mm ≈ 40 twips)
    },
  })
);
```

**4. Ajustar margens da página (linhas ~759-765)**

```typescript
margin: {
  top: "45mm",                    // Altura do cabeçalho + margem segurança
  bottom: `${bottomMarginMm}mm`,  // Dinâmico
  left: "20mm",
  right: "15mm",
  header: "0mm",                  // Header na borda (imagem floating)
  footer: "0mm",                  // Footer na borda (imagem floating)
},
```

---

## Resumo das Alterações

| Problema | Solução | Arquivo/Linha |
|----------|---------|---------------|
| Cabeçalho à direita | Usar floating com `offset: 8mm` horizontal | ~686-701 |
| Cabeçalho muito abaixo | Usar floating com `offset: 2mm` vertical | ~686-701 |
| Cabeçalho transparente | Adicionar `behindDocument: true` no header | ~686-701 |
| Numeração muito baixa | Ajustar `spacing.before` para posicionar sobre a imagem | ~739-752 |
| Transparência geral | Verificar se as imagens PNG têm fundo opaco | N/A |

---

## Resultado Esperado

Após as correções:
- **Cabeçalho**: Exatamente como no PDF - 8mm das bordas laterais, 2mm do topo
- **Rodapé**: Edge-to-edge como já está funcionando
- **Numeração**: Centralizada, aproximadamente 5mm da borda inferior (sobre o banner)
- **Aparência**: Imagens sólidas sem efeito de transparência

