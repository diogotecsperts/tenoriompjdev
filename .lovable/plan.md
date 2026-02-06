

# Correção do Rodapé DOCX - Margem de Segurança e Transparência

## Problemas Identificados

### 1. Texto Sobrepondo o Rodapé
O conteúdo do documento está entrando na área do rodapé porque as margens não estão configuradas adequadamente para manter a distância de segurança.

**No PDF:**
- `FOOTER_SAFETY_MARGIN = 12mm` - 12mm de margem acima do rodapé
- O `contentEndY` é calculado como `footerTopY - 12mm`

**No DOCX atual:**
- `bottom: convertInchesToTwip(0.5)` = ~12.7mm - parece adequado
- `footer: convertInchesToTwip(0.3)` = ~7.6mm - muito próximo da borda

O problema é que a margem `bottom` define onde o texto **pode** ir, mas o footer com imagem flutuante `behindDocument: true` fica **por trás** do conteúdo. Quando o rodapé tem altura de ~30-40mm (altura do banner), o texto pode entrar nessa área.

### 2. Aparência "Transparente" do Rodapé
A imagem está corretamente posicionada, mas como está configurada como `behindDocument: true`, ela fica por trás de qualquer texto que entre na área do footer, criando a impressão de transparência.

---

## Solução Técnica

### A) Aumentar Margem Inferior do Conteúdo

No PDF, usamos `FOOTER_SAFETY_MARGIN = 12mm` de distância entre o último texto e o topo do banner do rodapé. 

A margem `bottom` no DOCX deve considerar:
1. A altura do banner do rodapé (que vamos calcular dinamicamente)
2. + 12mm de margem de segurança adicional

```text
A4 = 297mm de altura
Altura estimada do banner de rodapé ≈ 27mm (baseado na proporção)
Margem de segurança = 12mm
Margem bottom ideal = altura_banner + 12mm ≈ 39mm ≈ 1.5 inches
```

### B) Usar Valores em Milímetros (mais legíveis)

A biblioteca `docx` aceita strings como `"12mm"`, `"39mm"` diretamente nas margens. Isso torna o código mais claro e alinhado com a lógica do PDF.

---

## Implementação Detalhada

### Arquivo: `src/utils/generateLaudoDOCX.ts`

**1. Adicionar constante de margem de segurança (similar ao PDF)**

Na seção de constantes (após linha 38):

```typescript
// Margens de segurança (equivalente ao PDF)
const FOOTER_SAFETY_MARGIN_MM = 12; // 12mm acima do banner do rodapé
```

**2. Calcular margem bottom dinamicamente**

Após calcular `footerHeight` (linha 669):

```typescript
// Converter altura do footer de pixels para mm
// A4: 793 pixels = 210mm, então 1 pixel ≈ 0.265mm
const footerHeightMm = Math.round(footerHeight * 0.265);

// Margem inferior = altura do rodapé + margem de segurança
const bottomMarginMm = footerHeightMm + FOOTER_SAFETY_MARGIN_MM;
```

**3. Aplicar margens corrigidas na seção**

Alterar as margens da página (linhas 747-754):

```typescript
margin: {
  top: "32mm",          // ~1.26 inches (espaço para cabeçalho)
  bottom: `${bottomMarginMm}mm`, // Dinâmico: altura rodapé + 12mm segurança
  left: "20mm",         // Igual ao PDF
  right: "15mm",        // Igual ao PDF
  footer: "0mm",        // Footer na borda inferior
},
```

**4. Garantir que a imagem fique sobre o conteúdo (não transparente)**

Remover `behindDocument: true` para que a imagem do rodapé **cubra** qualquer texto que porventura ainda chegue perto:

```typescript
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
  // REMOVIDO: behindDocument: true
},
```

**Alternativa mais segura**: Manter `behindDocument: true` mas garantir que a margem seja grande o suficiente para que o texto nunca alcance a área do banner.

---

## Resumo das Alterações

| Local | Alteração | Impacto |
|-------|-----------|---------|
| Após linha 38 | Adicionar `FOOTER_SAFETY_MARGIN_MM = 12` | Constante de segurança |
| Linha 669-670 | Calcular `footerHeightMm` e `bottomMarginMm` | Margem dinâmica |
| Linhas 747-754 | Usar margens em `mm` com valor calculado | Texto nunca toca o rodapé |

---

## Valores Finais Esperados

Para um banner de rodapé com ~27mm de altura:
- `footerHeightMm` ≈ 27mm
- `bottomMarginMm` = 27 + 12 = 39mm
- Isso garante que o texto do documento termine **pelo menos 12mm acima** do topo do banner

---

## Comparativo

```text
+------------------------+------------+------------+
| Parâmetro              | PDF        | DOCX Novo  |
+------------------------+------------+------------+
| Margem segurança       | 12mm       | 12mm       |
| Altura banner rodapé   | ~27mm      | ~27mm      |
| Distância texto→banner | 12mm       | 12mm       |
| Margem bottom total    | dinâmica   | ~39mm      |
+------------------------+------------+------------+
```

---

## Observação sobre Transparência

A imagem do banner PNG do rodapé (arquivo `public/timbrado-rodape.png`) deve ter fundo opaco. Se a imagem original tiver fundo transparente, ela mostrará o conteúdo por baixo mesmo quando bem posicionada. Se isso ainda ocorrer após as correções de margem, será necessário verificar o arquivo PNG original.

