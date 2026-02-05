

# Correção: Metodologia Pericial na Ordem Correta do PDF

## Problema Atual

O PDF gerado está assim:

```
BACKUP DE PROMPTS DE IA
├── GUIA DE REFERÊNCIA ✓
├── CAMPOS FIXOS (GERENCIADOS VIA BANCO DE DADOS)  ← AQUI É O PROBLEMA
│   └── Metodologia Pericial (com destaque grande em âmbar)
├── DADOS PRELIMINARES
├── RESUMO DOS AUTOS
│   └── Resumo dos Autos
├── ...
```

## Solução

Mover a Metodologia Pericial para dentro do fluxo normal, na posição correta:

```
BACKUP DE PROMPTS DE IA
├── GUIA DE REFERÊNCIA ✓ (já menciona campos fixos - OK)
├── DADOS PRELIMINARES
│   └── ...
├── RESUMO DOS AUTOS
│   ├── Resumo dos Autos
│   └── Metodologia Pericial [Campo Fixo - SQL]  ← CORRETO
├── DADOS DO PERICIANDO
│   └── ...
```

---

## Mudanças no Código

### Arquivo: `src/components/dev-panel/DevPrompts.tsx`

#### 1. REMOVER a seção separada de Campos Fixos (linhas 561-604)

Remover completamente o bloco que cria a seção "CAMPOS FIXOS (GERENCIADOS VIA BANCO DE DADOS)" antes do loop dos cards.

#### 2. MODIFICAR o loop de geração do PDF para incluir campos fixos na posição correta

Dentro do loop que itera por `card.sections`, verificar se a seção atual é um campo fixo e renderizá-lo de forma integrada:

```tsx
for (const section of card.sections) {
  const isFixedConfig = FIXED_CONFIG_SECTIONS[section.id];
  const sectionPrompts = groupedPrompts[card.id]?.[section.id] || [];
  
  // Se é campo fixo, renderizar com indicador discreto
  if (isFixedConfig) {
    checkNewPage(50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(section.label, margin, yPos);
    yPos += 6;
    
    // Indicador discreto de campo fixo
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`ID: ${isFixedConfig}  |  Tipo: Campo Fixo (SQL)`, margin, yPos);
    yPos += 5;
    if (metodologiaConfig?.updatedAt) {
      doc.text(`Atualizado em: ${new Date(metodologiaConfig.updatedAt).toLocaleDateString("pt-BR")}`, margin, yPos);
      yPos += 5;
    }
    doc.setTextColor(0);
    yPos += 3;
    
    // Texto do campo
    const metodologiaText = metodologiaConfig?.texto || "(Não carregado)";
    const metodologiaLines = splitText(metodologiaText, contentWidth);
    for (const line of metodologiaLines) {
      checkNewPage(6);
      doc.text(line, margin, yPos);
      yPos += 5;
    }
    yPos += 8;
    continue; // Próxima seção
  }
  
  // Lógica existente para prompts normais
  if (sectionPrompts.length === 0) continue;
  // ...resto do código existente...
}
```

---

## Resultado Visual no PDF

```
RESUMO DOS AUTOS (título azul)
────────────────────────────────

Resumo dos Autos
ID: prompt_import_resumo  |  Tipo: Importar
Atualizado em: 04/02/2025

[conteúdo do prompt]

────────────────────────────────

Metodologia Pericial
ID: config_metodologia_padrao  |  Tipo: Campo Fixo (SQL)
Atualizado em: 04/02/2025

A perícia médica judicial foi realizada segundo critérios
técnicos e científicos reconhecidos na Medicina Legal...

────────────────────────────────

DADOS DO PERICIANDO (próximo card)
```

O indicador "Tipo: Campo Fixo (SQL)" diferencia sutilmente este campo dos demais (que mostram "Importar", "Gerar", etc.), mas sem o destaque exagerado em âmbar.

---

## Resumo das Alterações

| Local | Ação |
|-------|------|
| Linhas 561-604 | REMOVER bloco inteiro "CAMPOS FIXOS (GERENCIADOS VIA BANCO)" |
| Dentro do loop de sections (~linha 620) | ADICIONAR lógica para campos fixos integrados |
| Guia de Referência (linhas 534-537) | MANTER como está (informativo OK) |

