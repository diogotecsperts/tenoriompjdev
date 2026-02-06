
# ✅ IMPLEMENTADO: Exportação DOCX para Laudos

## Resumo Executivo

**Viabilidade: ALTA** - A exportação DOCX é perfeitamente implantável e pode replicar praticamente todas as características visuais do PDF atual, incluindo cabeçalhos, rodapés com imagens PNG, tabulações, estilos de texto e formatação profissional.

---

## Análise Técnica

### Biblioteca Recomendada: `docx` (npm)

| Aspecto | Suporte |
|---------|---------|
| Cabeçalho com imagem PNG | Sim - ImageRun em Header |
| Rodapé com imagem PNG | Sim - ImageRun em Footer |
| Numeração de páginas | Sim - PageNumber element |
| Texto justificado | Sim - AlignmentType.BOTH |
| Títulos com sublinhado | Sim - borders em Paragraph |
| Negrito, itálico | Sim - TextRun com bold/italic |
| Cores personalizadas | Sim - shading e color props |
| Campos label:valor | Sim - múltiplos TextRun |
| Margens customizadas | Sim - margins em Section |
| Listas numeradas | Sim - numbering support |
| TypeScript | Sim - tipos incluídos |
| Funciona no browser | Sim - file-saver para download |

### Comparativo de Capacidades

```text
+------------------------+--------+--------+
| Recurso                | PDF    | DOCX   |
+------------------------+--------+--------+
| Cabeçalho PNG          | Sim    | Sim    |
| Rodapé PNG             | Sim    | Sim    |
| Paginação auto         | Sim    | Word   |
| Texto justificado      | Manual | Nativo |
| Edição pós-export      | Não    | Sim    |
| Fidelidade visual      | 100%   | ~95%   |
+------------------------+--------+--------+
```

### Diferenças Importantes

1. **Paginação**: No PDF controlamos manualmente onde quebrar página. No DOCX o Word calcula automaticamente - isso é uma **vantagem** pois se adapta a diferentes tamanhos de papel.

2. **Justificação**: No PDF implementamos justificação manual. No DOCX é nativo e melhor.

3. **Fontes**: O DOCX usa fontes do sistema do usuário. Recomendo usar fontes universais (Arial, Times New Roman).

---

## Proposta de Interface

### Componente: DropdownMenu com Switch

```text
┌─────────────────────────────────────┐
│  [Baixar em PDF ▼] [🔀]            │
└─────────────────────────────────────┘
         │
         ▼ (ao clicar na seta ou texto)
    ┌──────────────────┐
    │  📄 Baixar PDF   │
    │  📝 Baixar DOCX  │
    └──────────────────┘
```

**Funcionamento:**
- Botão principal mostra formato atual: "Baixar em PDF" ou "Baixar em DOCX"
- Switch à direita alterna o formato padrão (persiste em localStorage)
- Clicar no texto executa download no formato atual
- Seta opcional abre dropdown com ambas opções

---

## Plano de Implementação

### Etapa 1: Instalar Dependências

```bash
npm install docx file-saver
npm install -D @types/file-saver
```

### Etapa 2: Criar Gerador DOCX

**Arquivo:** `src/utils/generateLaudoDOCX.ts`

Estrutura espelhada ao `generateLaudoPDF.ts`:

1. Carregar imagens do timbrado como base64 (mesma função existente)
2. Criar Document com:
   - Header contendo ImageRun do cabeçalho PNG
   - Footer contendo ImageRun do rodapé PNG + PageNumber
   - Sections com todo o conteúdo
3. Aplicar estilos equivalentes:
   - Títulos de seção: azul #1B3665, negrito, com linha abaixo
   - Parágrafos: justificados, tamanho 10pt
   - Campos label:valor: label em negrito
4. Usar Packer.toBlob() + saveAs() para download

### Etapa 3: Modificar UI do LaudoEditor

**Arquivo:** `src/pages/LaudoEditor.tsx` (linha ~805)

Substituir o botão simples por um componente com dropdown:

```tsx
const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>(() => {
  return (localStorage.getItem('laudo-export-format') as 'pdf' | 'docx') || 'pdf';
});

// Persistir preferência
useEffect(() => {
  localStorage.setItem('laudo-export-format', exportFormat);
}, [exportFormat]);

// Funções de export
const handleExportPDF = async () => { /* código existente */ };
const handleExportDOCX = async () => { /* novo código */ };

const handleExport = () => {
  if (exportFormat === 'pdf') handleExportPDF();
  else handleExportDOCX();
};

// UI
<div className="flex items-center">
  <Button 
    variant="outline" 
    size="sm" 
    onClick={handleExport}
    className="rounded-r-none"
  >
    <FileText className="h-4 w-4 sm:mr-2" />
    <span className="hidden sm:inline">
      Baixar em {exportFormat.toUpperCase()}
    </span>
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() => setExportFormat(prev => prev === 'pdf' ? 'docx' : 'pdf')}
    className="rounded-l-none border-l-0 px-2"
  >
    <RefreshCw className="h-3 w-3" />
  </Button>
</div>
```

---

## Arquivos Afetados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `package.json` | Modificar | Adicionar `docx` e `file-saver` |
| `src/utils/generateLaudoDOCX.ts` | Criar | Novo gerador DOCX (~400 linhas) |
| `src/pages/LaudoEditor.tsx` | Modificar | Adicionar dropdown de formato |
| `generateLaudoPDF.ts` | Manter | Zero alterações |

---

## Garantias de Segurança

- O código de exportação PDF existente **não será alterado**
- O novo gerador DOCX será um arquivo **completamente separado**
- As funções compartilhadas (carregamento de imagens, formatação de datas) serão **extraídas para um módulo comum** se necessário
- O botão de PDF continuará funcionando exatamente como antes

---

## Limitações Conhecidas

1. **Posicionamento pixel-perfect**: DOCX não permite controle absoluto como PDF, mas para laudos textuais não é problema
2. **Fontes**: Usuário precisa ter a fonte instalada (usaremos Arial/Calibri universais)
3. **Tamanho de arquivo**: DOCX tende a ser maior que PDF quando contém imagens

---

## Estimativa de Esforço

- **Gerador DOCX**: ~400 linhas de código
- **Modificação UI**: ~50 linhas
- **Testes**: Validar visual em Word, LibreOffice, Google Docs

