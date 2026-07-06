## Objetivo
Fazer o campo "Tempo que está sem trabalhar" aparecer no documento exportado (DOCX e PDF) imediatamente **acima do título "Queixa principal"**, **sempre** — mesmo quando vazio no app.

## Diagnóstico
O campo `identificacao.tempo_sem_trabalhar` já existe no editor (Step01) e é exportado hoje dentro do bloco de Identificação (rótulo "Tempo sem trabalhar"):

- `prelaudo-docx.ts` linha 211
- `prelaudo-pdf.ts` linha 334

Além de ficar no lugar errado (topo, junto dos dados pessoais), passa pelo `isFieldEmpty` — quando vazio, some. Por isso o cliente diz que "não sai no documento".

## Mudança

1. **`src/modules/previdenciario/lib/export/prelaudo-docx.ts`**
   - Remover `labeled("Tempo sem trabalhar", id.tempo_sem_trabalhar || "")` do bloco Identificação (linha 211).
   - Dentro do `if (included.has("queixa"))`, **antes** do `sectionTitle("Queixa principal")`, inserir um parágrafo **sempre visível** no formato:
     `Tempo que está sem trabalhar: <valor ou vazio>`
     — construído diretamente com `new Paragraph({ children: [baseRun("Tempo que está sem trabalhar: ", { bold: true }), baseRun(stripLightMarkdown(id.tempo_sem_trabalhar || ""))] })`, **sem** passar pelo helper `labeled` (que oculta quando vazio). Manter parágrafo em branco entre essa linha e o título "Queixa principal".

2. **`src/modules/previdenciario/lib/export/prelaudo-pdf.ts`**
   - Remover a chamada `labeled(doc, "Tempo sem trabalhar", id.tempo_sem_trabalhar || "", y)` do bloco Identificação (linha 334).
   - Dentro do `if (included.has("queixa"))`, **antes** do `sectionTitle(doc, "Queixa principal", y)`, renderizar a linha "Tempo que está sem trabalhar: <valor ou vazio>" **sempre**, usando o renderizador de rótulo bruto (não o `labeled` que faz early-return quando `isFieldEmpty`). Seguir a espessura/estilo já usado em rótulos do cabeçalho (label negrito + valor). Espaço em branco antes do título "Queixa principal".

3. **Rótulo:** padronizar como "Tempo que está sem trabalhar" (igual ao editor), substituindo "Tempo sem trabalhar".

4. **Exportar mesmo quando o step Identificação estiver desmarcado:** a nova linha vive dentro do bloco `queixa`, então basta a etapa "Queixa" estar incluída para a linha aparecer. Isso resolve o caso em que o cliente exporta só parte do documento.

## Comportamento resultante
- Preenchido: `Tempo que está sem trabalhar: 8 meses`
- Vazio: `Tempo que está sem trabalhar: ` (rótulo aparece, valor em branco)

Em ambos os casos, o título "Queixa principal" vem logo abaixo, com o espaçamento padrão.

## O que NÃO muda
- Estrutura de dados, tipos, prompts, IA, DB, edge functions, DevPanel, Trabalhista, Impugnação.
- Editor Step01 (campo continua onde está, preenchimento manual).
- Regras de textos fixos, comorbidades, incapacidades e "Conclusão" recém-adicionadas ficam intactas.
- Helper `labeled`/`isFieldEmpty` continua com o comportamento atual — apenas esta linha específica passa a ser renderizada de forma incondicional.