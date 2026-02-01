
# Plano: Exportar Prompts para PDF

## Decisão Tomada

Após avaliação cuidadosa, implementarei **apenas a exportação em PDF** pelos seguintes motivos:

| Funcionalidade | Risco | Benefício | Veredicto |
|----------------|-------|-----------|-----------|
| Importação JSON | Alto - pode sobrescrever prompts incorretamente | Médio - restauração rápida | Não implementar |
| Exportação PDF | Zero | Alto - backup seguro e organizado | Implementar |

A importação exigiria validação extensiva (IDs, variáveis, estrutura), sistema de preview/merge, e ainda assim teria risco de corromper dados. A exportação PDF é 100% segura e atende perfeitamente à necessidade de backup.

## O que será implementado

### Botão "Exportar PDF" no header da página DevPrompts

**Localização**: Ao lado dos botões "Carregar Padrão" e "Atualizar"

**Comportamento**:
1. Gera um PDF profissional com todos os prompts
2. Organizado exatamente na mesma ordem do app (seguindo `LAUDO_CARDS_STRUCTURE`)
3. Cada seção separada visualmente
4. Inclui metadados importantes

## Estrutura do PDF Exportado

```
BACKUP DE PROMPTS DE IA
Data: 01/02/2026 às 20:35
Total: 31 prompts

═══════════════════════════════════════════
PRELIMINARES
═══════════════════════════════════════════

┌─ Objetivo da Perícia ─────────────────────
│ ID: prompt_regen_objetivoPericia
│ Tipo: Regerar
│ Variáveis: cids, exameFisico
│ 
│ [Texto completo do prompt aqui...]
│ 
│ Atualizado em: 01/02/2026
└───────────────────────────────────────────

┌─ Metodologia Pericial ────────────────────
│ ID: prompt_regen_metodologiaPericial
│ ...
└───────────────────────────────────────────

═══════════════════════════════════════════
RESUMO DOS AUTOS
═══════════════════════════════════════════

... (continua para cada card/seção)
```

## Detalhes Técnicos

### Arquivo a modificar

`src/components/dev-panel/DevPrompts.tsx`

### Dependência

Utilizará a biblioteca `jspdf` já instalada no projeto.

### Função de exportação

```typescript
const exportToPDF = async () => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.text('BACKUP DE PROMPTS DE IA', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 105, 28, { align: 'center' });
  doc.text(`Total: ${prompts.length} prompts`, 105, 34, { align: 'center' });
  
  let yPos = 50;
  
  // Iterar por cada card na ordem do laudo
  LAUDO_STRUCTURE.forEach(card => {
    // Título do card
    doc.setFontSize(14);
    doc.text(card.title.toUpperCase(), 20, yPos);
    yPos += 10;
    
    card.sections.forEach(section => {
      const sectionPrompts = groupedPrompts[card.id]?.[section.id] || [];
      
      sectionPrompts.forEach(prompt => {
        // Verificar se precisa nova página
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }
        
        // Renderizar prompt
        doc.setFontSize(10);
        doc.text(`ID: ${prompt.id}`, 20, yPos);
        // ... resto do conteúdo
      });
    });
  });
  
  doc.save(`prompts-backup-${Date.now()}.pdf`);
};
```

### Informações incluídas no PDF para cada prompt

1. ID do prompt (ex: `prompt_regen_historiaAtual`)
2. Tipo (Gerar, Regerar, Sistema, Importar)
3. Descrição
4. Variáveis utilizadas
5. Texto completo do prompt
6. Data da última atualização

## Resultado Final

Após implementação, você terá:

- Botão **"Exportar PDF"** no header da página Prompts IA
- PDF profissional e organizado
- Segue exatamente a mesma ordem do LaudoEditor
- Serve como backup permanente dos seus prompts otimizados
- Zero risco de quebrar qualquer funcionalidade
