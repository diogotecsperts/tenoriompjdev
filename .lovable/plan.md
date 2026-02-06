

# Correção do Cabeçalho e Numeração de Página do DOCX

## Problemas Identificados

### 1. Numeração de Página Invisível
O texto "Página X de XX" desapareceu porque:
- A imagem do rodapé está em modo **floating** sem `behindDocument`, o que significa que ela fica **na frente** do texto
- O parágrafo da numeração está sendo adicionado **após** a imagem, mas como a imagem é flutuante e cobre tudo, a numeração fica escondida por baixo

**Solução**: A numeração precisa ser posicionada de forma que fique **sobre** a imagem do rodapé. No Word, isso é conseguido usando posicionamento relativo no mesmo parágrafo da imagem ou usando um TextBox.

### 2. Cabeçalho Mal Posicionado e Incorreto

Comparativo PDF vs DOCX atual:

| Aspecto | PDF | DOCX Atual |
|---------|-----|------------|
| Largura da imagem | `PAGE.width - 16` = 194mm | 793 pixels (~210mm, largura total) |
| Posição X | `xPos = 8` (centralizado com margens) | Usando `alignment: CENTER` mas com largura total |
| Aparência | Centralizado com margens visuais | Parece esticado e mal posicionado |

**Problema raiz**: O cabeçalho no DOCX está usando 793 pixels (largura total A4), quando deveria usar um valor proporcional a 194mm (igual ao PDF), e o parágrafo precisa estar corretamente centralizado.

---

## Solução Técnica

### Correção 1: Cabeçalho com Dimensões Corretas

No PDF, o cabeçalho usa:
- `imgWidth = PAGE.width - 16` = 210 - 16 = **194mm**
- Isso equivale a: `194 / 210 * 793 ≈ 733 pixels`

```typescript
// Largura do cabeçalho (igual ao PDF: PAGE.width - 16mm = 194mm)
// Proporção: 194/210 = 0.924
const HEADER_WIDTH_RATIO = 0.924;
const headerWidth = Math.round(A4_WIDTH_PIXELS * HEADER_WIDTH_RATIO); // ~733 pixels
```

### Correção 2: Numeração de Página Sobre a Imagem

Para que a numeração fique visível sobre a imagem flutuante, temos duas opções:

**Opção A (Mais simples)**: Manter `behindDocument: true` na imagem do rodapé
- Isso faz a imagem ficar por trás de qualquer texto
- A numeração aparecerá normalmente sobre ela
- Mas já temos margem de segurança suficiente para o texto do documento não tocar

**Opção B (Mais robusta)**: Usar posicionamento negativo na numeração
- Usar `spacing: { before: -X }` para "subir" a numeração sobre a imagem

Recomendo a **Opção A** - reativar `behindDocument: true` já que a margem de segurança de 12mm está funcionando.

---

## Implementação Detalhada

### Arquivo: `src/utils/generateLaudoDOCX.ts`

**1. Ajustar largura do cabeçalho (linhas 669-670)**

```typescript
// ANTES:
const headerWidth = A4_WIDTH_PIXELS;

// DEPOIS:
// Largura do cabeçalho = 194mm (igual ao PDF: PAGE.width - 16)
// Proporção em relação à largura total: 194/210 = 0.924
const HEADER_WIDTH_RATIO = 0.924;
const headerWidth = Math.round(A4_WIDTH_PIXELS * HEADER_WIDTH_RATIO); // ~733 pixels
```

**2. Reativar behindDocument no rodapé (linha 726)**

```typescript
// ANTES:
// Removido behindDocument: true para imagem ficar sobre qualquer texto

// DEPOIS:
behindDocument: true, // Imagem fica por trás - numeração aparece sobre ela
```

**3. Ajustar espaçamento da numeração (linha 747)**

```typescript
// ANTES:
spacing: { before: 200 },

// DEPOIS:
spacing: { before: 0 }, // Numeração fica no topo do footer
```

---

## Resumo das Alterações

| Local | Alteração | Efeito |
|-------|-----------|--------|
| Linha 669 | Usar `HEADER_WIDTH_RATIO = 0.924` para calcular `headerWidth` | Cabeçalho com 733px (~194mm) como no PDF |
| Linha 726 | Reativar `behindDocument: true` | Imagem do rodapé fica por trás da numeração |
| Linha 747 | Mudar `before: 200` para `before: 0` | Numeração fica melhor posicionada |

---

## Resultado Esperado

Após as correções:
- **Cabeçalho**: Centralizado com margens visuais iguais ao PDF (~8mm de cada lado)
- **Rodapé**: Banner edge-to-edge com "Página X de XX" em branco visível sobre ele
- **Texto do documento**: Mantém a margem de segurança de 12mm acima do rodapé

