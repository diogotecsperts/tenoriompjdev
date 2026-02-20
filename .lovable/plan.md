
# Plano — Correção da Tabulação Estranha no DOCX com Justificação

## Diagnóstico Completo da Causa Raiz

O problema é **100% identificado e documentado na especificação OOXML**. Não é um bug do gerador — é um comportamento padrão do Word com justificação que exige uma configuração explícita para ser desativado.

### O que acontece tecnicamente

Quando o `createParagraphs` divide o texto em blocos por `\n\n` e, dentro de cada bloco, usa `TextRun({ break: 1 })` para representar quebras simples (`\n`), o documento DOCX resultante contém internamente o equivalente ao **Shift+Enter** (soft line break) do Word.

O comportamento padrão do Word ao encontrar um parágrafo justificado com soft line breaks é: **expandir cada linha incompleta até a margem direita**, distribuindo os espaços entre as palavras. Isso produz exatamente o efeito visto nas imagens — linhas com palavras separadas por espaços enormes.

O PDF não tem esse problema porque o mecanismo de layout do jsPDF opera pixel a pixel e não segue a lógica OOXML de "justificar linhas que terminam em Shift+Enter".

### Prova Técnica (OOXML Spec)

A especificação Office Open XML define o elemento `<w:doNotExpandShiftReturn>` com a descrição exata:

> "Specifies whether applications should fully justify the contents of incomplete lines which end in a soft line break when the parent paragraph is fully justified."

Quando esse elemento está **ausente** (comportamento padrão), o Word justifica essas linhas. Quando está **presente**, o Word trata essas linhas como alinhadas à esquerda dentro do parágrafo justificado — o comportamento correto.

### Disponibilidade na Biblioteca

Verificado diretamente em `node_modules/docx/dist/index.d.ts`:

- Linha 925: `readonly doNotExpandShiftReturn?: boolean;` — disponível em `ICompatibilityOptions`
- Linha 1435: `readonly compatibility?: ICompatibilityOptions;` — disponível em `IPropertiesOptions` (passado ao `new Document({...})`)

**Conclusão: a correção é aplicada em uma única linha do Document constructor, sem alterar nenhuma lógica existente.**

---

## O que Será Implementado

### Operação Única — Adicionar `compatibility.doNotExpandShiftReturn` ao `Document`

No arquivo `src/utils/generateLaudoDOCX.ts`, na criação do `new Document({...})` que começa na linha 897, adicionar:

```typescript
const doc = new Document({
  compatibility: {
    doNotExpandShiftReturn: true,  // ← ÚNICA MUDANÇA
  },
  sections: [
    {
      // ... resto sem alteração
    },
  ],
});
```

Isso insere `<w:compat><w:doNotExpandShiftReturn/></w:compat>` no XML do documento, instruindo o Word (e LibreOffice) a não justificar linhas que terminam em soft line break.

---

## Por que esta é a Abordagem Correta

Foram consideradas e descartadas alternativas menos seguras:

| Alternativa | Problema |
|---|---|
| Trocar `AlignmentType.BOTH` por `AlignmentType.LEFT` | Elimina a justificação — visual inferior para documentos jurídicos |
| Quebrar por `\n` em parágrafos separados em vez de `break: 1` | Exigiria reescrever `createParagraphs` inteiramente, quebraria o espaçamento entre parágrafos e eliminaria o recuo visual das quebras simples dentro de um mesmo bloco |
| Usar `DISTRIBUTE` como tipo de alinhamento | Distribui letras individualmente — pior resultado visual |
| Pós-processar o XML do DOCX para remover `w:br` | Frágil, requer parse de XML, alto risco de regressão |

A abordagem de `doNotExpandShiftReturn` é a solução **oficial OOXML** para exatamente este problema — documentada na especificação e disponível na versão instalada da biblioteca.

---

## Escopo da Mudança

| Arquivo | Mudança |
|---|---|
| `src/utils/generateLaudoDOCX.ts` | Adicionar `compatibility: { doNotExpandShiftReturn: true }` ao `new Document({})` |

- Nenhuma alteração nas funções `createParagraphs`, `createParagraph`, `sanitizeMarkdown`, `isFieldEmpty` ou `debugField`
- Zero impacto no gerador de PDF
- Zero impacto nas correções implementadas nas sessões anteriores
- Nenhuma migração de banco, edge function ou dependência nova
- Compatível com Word 2007+, Word 365 e LibreOffice Writer
