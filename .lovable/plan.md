
# Plano Definitivo — Correção Completa do Gerador DOCX/PDF

## Diagnóstico Final (após leitura integral dos dois geradores)

Existem **4 problemas técnicos distintos** no `generateLaudoDOCX.ts` (e parcialmente no `generateLaudoPDF.ts`):

---

### Problema 1 — `sanitizeMarkdown` com regex incompleta (CRÍTICO)

A função atual (linha 47–54 do DOCX, linha 61–68 do PDF) usa regex **sem flags globais adequadas**:

```typescript
.replace(/\*\*(.+?)\*\*/g, ...)  // não cruza quebras de linha (sem flag 's')
.replace(/\*(.+?)\*/g, '$1')     // não remove bullet "* " no início de linha
```

O que **não é tratado**:
- `### Título` → chega literal com as `#`
- `* item de lista` no início de linha → permanece com asterisco
- `**texto\ncom quebra**` → o `.+?` sem flag `s` não captura o bloco multi-linha
- Linhas separadoras `---` e `***`

---

### Problema 2 — `createParagraph` cria **um único bloco de texto** para campos multi-parágrafo (CRÍTICO)

Quando o campo tem múltiplos parágrafos separados por `\n\n`, tudo vai para um único `Paragraph` do docx com `\n\n` literal no meio — resultando em um bloco contínuo sem separação visual correta.

```typescript
const createParagraph = (text: string): Paragraph => {
  return new Paragraph({
    children: [new TextRun({ text: sanitizedText })], // tudo junto
  });
};
```

Campos afetados: `conclusaoAnalise`, `nexoCausalJustificativa`, `analiseIncapacidadeLaboral`, `resumoPeticaoInicial`, `descricaoTecnicaDoencas`, `laudosMedicos`, `examesComplementares`.

---

### Problema 3 — Campos com placeholder `[INSERIR...]` chegam no documento (CRÍTICO para uso médico)

A regra solicitada é **clara**: campo vazio ou com conteúdo de placeholder deve sair **invisível** do DOCX/PDF. Hoje:

- O gerador verifica `if (laudo.campo)` — correto para campos nulos
- Mas **não filtra** texto como `[INSERIR CID...]`, `Erro crítico:`, `Aguardando...`, `null`, `undefined` em string
- Também **não há verificação** de texto muito curto sem sentido médico real

---

### Problema 4 — Endereçamento judicial usa `"[VARA]"`, `"[NÚMERO]"`, `"[RECLAMANTE]"` como fallback literal no documento

Na linha 259–270 do DOCX, campos com valor `null` viram literalmente `[VARA]`, `[NÚMERO]` etc. no documento final — o mesmo problema conceitual: placeholder visível.

---

## O que será implementado

### Operação A — `sanitizeMarkdown` robusta (ambos os geradores)

Nova versão com todas as coberturas:

```typescript
const sanitizeMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    // 1. Headings: ### Título → Título
    .replace(/^#{1,6}\s+/gm, '')
    // 2. Bold multi-linha: **texto** → TEXTO (flag 's' para dotAll)
    .replace(/\*\*(.+?)\*\*/gs, (_, p1) => p1.toUpperCase())
    .replace(/__(.+?)__/gs, (_, p1) => p1.toUpperCase())
    // 3. Bullets com asterisco no início de linha: "* item" → "item"
    .replace(/^\*\s+/gm, '')
    // 4. Itálico simples (após remover bullets para não confundir)
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    // 5. Linhas separadoras: --- ou *** sozinhos numa linha
    .replace(/^[-*]{3,}\s*$/gm, '')
    // 6. Backtick code: `código` → código
    .replace(/`(.+?)`/g, '$1')
    // 7. Normalizar quebras de linha múltiplas
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
```

**Onde aplicar:** `generateLaudoDOCX.ts` E `generateLaudoPDF.ts` (ambos têm a mesma função vulnerável).

---

### Operação B — `createParagraphs` (plural) para campos longos no DOCX

Nova função que divide por `\n\n` e trata cada parágrafo individualmente:

```typescript
const createParagraphs = (text: string): Paragraph[] => {
  if (!text) return [];
  const sanitized = sanitizeMarkdown(text);
  const blocks = sanitized.split('\n\n').filter(b => b.trim());
  
  return blocks.map(block => {
    // Linhas únicas curtas sem pontuação final = subtítulo interno
    const lines = block.split('\n');
    const isSingleLineTitle = lines.length === 1 && 
      block.length < 80 && 
      !block.endsWith('.') && 
      !block.endsWith(',') &&
      block === block.toUpperCase(); // só vira subtítulo se for caixa alta
    
    if (isSingleLineTitle) {
      return createSubtitle(block);
    }
    
    // Quebras simples dentro do parágrafo → TextRun com break
    const textRuns = lines.flatMap((line, i) => {
      const runs: TextRun[] = [new TextRun({
        text: line,
        size: FONT.sizeDefault,
        color: COLORS.text,
        font: FONT.name,
      })];
      if (i < lines.length - 1) {
        runs.push(new TextRun({ break: 1 }));
      }
      return runs;
    });
    
    return new Paragraph({
      children: textRuns,
      alignment: AlignmentType.BOTH,
      spacing: { after: 120 },
    });
  });
};
```

Esta função substitui `createParagraph` nos campos de texto longo.

---

### Operação C — Filtro de placeholder e conteúdo inválido

Função `isFieldEmpty` que detecta campos que **não devem aparecer no documento**:

```typescript
const PLACEHOLDER_PATTERNS = [
  /^\[.+\]$/,              // [INSERIR algo]
  /^erro\s*cr[ií]tico/i,  // "erro critico: ..."
  /^aguardando/i,          // "aguardando..."
  /^undefined$/i,
  /^null$/i,
  /^n\/a$/i,
  /^-+$/,                  // só traços
];

const isFieldEmpty = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
};
```

Esta função substitui todos os `if (laudo.campo)` no gerador — agora `if (!isFieldEmpty(laudo.campo))`.

---

### Operação D — Remover fallbacks literais do endereçamento judicial

Linhas 259–270 do DOCX: remover os `|| "[VARA]"`, `|| "[NÚMERO]"`, `|| "[RECLAMANTE]"`, `|| "[RECLAMADA]"`. Se o campo estiver vazio, o label simplesmente não aparece — igual ao comportamento de todos os outros campos do documento.

---

## Escopo dos Arquivos

| Arquivo | Operações |
|---|---|
| `src/utils/generateLaudoDOCX.ts` | A + B + C + D (todas) |
| `src/utils/generateLaudoPDF.ts` | A + C (sanitização e filtro de placeholder) |

Nenhuma migração de banco. Nenhuma edge function. Nenhum prompt alterado.

---

## Garantias de Segurança

- **Zero regressão:** Nenhum campo que hoje aparece corretamente será suprimido — `isFieldEmpty` só bloqueia valores literalmente problemáticos
- **Compatibilidade:** `createParagraphs` é aditiva — a função `createParagraph` singular continua existindo para campos curtos como labels e datas
- **Ambos os formatos:** PDF e DOCX recebem o mesmo `sanitizeMarkdown` e `isFieldEmpty` — garantindo paridade de comportamento entre os dois
- **Dados legados:** Campos com Markdown gerado antes das proteções de IA serem ativadas serão limpos em tempo de exportação, sem precisar alterar o banco
