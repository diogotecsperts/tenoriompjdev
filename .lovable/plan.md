

# Destaque Visual para Campo Fixo no PDF

## Objetivo

Adicionar destaque visual ao texto "Tipo: Campo Fixo (SQL)" no PDF exportado:
1. Símbolo de banco de dados (🗄️ ou similar) antes do texto
2. Texto em **negrito** e cor **laranja forte**
3. Manter o mesmo tamanho de fonte (9pt)

---

## Mudança no Código

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

Na função `exportToPDF`, dentro do bloco que renderiza campos fixos (linhas 591-596), modificar para:

```tsx
// Indicador de campo fixo com destaque
doc.setFontSize(9);
doc.setFont("helvetica", "normal");
doc.setTextColor(100); // Cinza para o ID
doc.text(`ID: ${isFixedConfig}  |  `, margin, yPos);

// Calcular posição após o ID
const idWidth = doc.getTextWidth(`ID: ${isFixedConfig}  |  `);

// Símbolo + texto em laranja negrito
doc.setFont("helvetica", "bold");
doc.setTextColor(234, 88, 12); // Laranja forte (orange-600)
doc.text(`[DB] Tipo: Campo Fixo (SQL)`, margin + idWidth, yPos);

// Restaurar cor
doc.setTextColor(100);
doc.setFont("helvetica", "normal");
yPos += 5;
```

---

## Resultado Visual no PDF

```
Metodologia Pericial
ID: config_metodologia_padrao  |  [DB] Tipo: Campo Fixo (SQL)  ← laranja negrito
Atualizado em: 05/02/2025

A perícia médica judicial foi realizada segundo critérios...
```

O `[DB]` funciona como representação textual do ícone de banco de dados, já que PDFs gerados via jsPDF não suportam emojis/ícones nativamente.

---

## Nota Técnica

O jsPDF não suporta inserir emojis diretamente (como 🗄️), então usaremos `[DB]` como identificador visual compacto. Alternativamente, poderia ser `◉` ou outro caractere especial, mas `[DB]` é mais claro e legível.

