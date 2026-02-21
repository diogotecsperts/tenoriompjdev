

# Plano — Quesitos a Prova de Balas + sanitizeOcrAccents Global

## 3 Acoes Aprovadas

| # | Acao | Escopo |
|---|------|--------|
| 1 | Regex robusto no DOCX e PDF | Frontend — `createQuesitoParagraphs` e `formatQuesitos` |
| 2 | `sanitizeOcrAccents()` GLOBAL | Frontend — aplicado em TODOS os campos de texto longo no DOCX e PDF |
| 4 | Sub-rotina automatica no backend | Backend — `processar-autos/index.ts` |

---

## Acao 1: Reescrever `createQuesitoParagraphs` e `formatQuesitos` com Regex Robusto

### DOCX (`src/utils/generateLaudoDOCX.ts`, linhas 148-199)

Reescrever `createQuesitoParagraphs` para:

1. Usar Regex que detecta padroes reais de numeracao: `/^(\d+[\.\)\-]|\d+\.\d+[\.\)]?|[a-z]\)|[IVX]+\s*[\-\.\)]|QUESITO\s+\d+)/im`
2. Fazer split forcado nesses padroes, criando um `Paragraph` por quesito
3. Se a linha seguinte contem "RESPOSTA" (regex), formata normalmente; se NAO, injeta automaticamente um `Paragraph` em negrito: **"RESPOSTA SUGERIDA DA IA:"** (vazio para preenchimento)
4. Cada par fica em `Paragraph` separado com `spacing: { after: 200 }`

### PDF (`src/utils/generateLaudoPDF.ts`, linhas 122-133)

Reescrever `formatQuesitos` com a mesma logica de Regex para detectar e separar quesitos. Injetar "RESPOSTA SUGERIDA DA IA:" apos cada pergunta sem resposta detectada.

---

## Acao 2: `sanitizeOcrAccents()` — Aplicacao GLOBAL em Todos os Campos de Texto

### Nova funcao (em ambos os geradores)

Dicionario de substituicao com word boundary (`\b`) para evitar substituicoes parciais:

```text
lesoes -> lesões, protecao -> proteção, seguranca -> segurança,
nao -> não, funcoes -> funções, reducao -> redução,
infeccao -> infecção, orgao -> órgão, estetico -> estético,
atencao -> atenção, comunicacao -> comunicação, doenca -> doença,
prevencao -> prevenção, condicoes -> condições, situacao -> situação,
avaliacao -> avaliação, informacao -> informação, ocupacao -> ocupação,
operacao -> operação, classificacao -> classificação,
peticao -> petição, contestacao -> contestação, restricao -> restrição,
obrigacao -> obrigação, relacao -> relação, admissao -> admissão,
demissao -> demissão, exposicao -> exposição, conclusao -> conclusão
```

### Ponto de aplicacao — GLOBAL, nao apenas quesitos

A funcao sera integrada dentro de `sanitizeMarkdown()` como etapa final, antes do `.trim()`. Assim, TODOS os campos de texto que passam por `sanitizeMarkdown` (que e chamada por `createParagraph`, `createParagraphs`, `createQuesitoParagraphs`, `addParagraph`) serao automaticamente corrigidos.

**Campos cobertos automaticamente** (via `createParagraphs`/`addParagraph`):
- objetivoPericia
- resumoPeticaoInicial, resumoContestacao
- metodologiaPericial
- descricaoAtividadesLaborais
- historiaAcidente, historicoOcupacional, historiaAtual
- tratamentos, afastamentos
- antecedentes
- laudosMedicos, examesComplementares, exameFisico
- descricaoTecnicaDoencas
- nexoCausalJustificativa
- analiseIncapacidadeLaboral
- conclusaoAnalise, conclusaoJustificativa
- quesitosJuizo, quesitosReclamante, quesitosReclamada
- referenciasBibliograficas

Isso e muito mais elegante do que chamar `sanitizeOcrAccents` manualmente em cada campo — basta inserir a logica dentro de `sanitizeMarkdown` e todos os campos ficam blindados.

---

## Acao 4: Sub-rotina Automatica de Respostas no Backend

### Arquivo: `supabase/functions/processar-autos/index.ts`

### Diagnostico da arquitetura atual

A funcao `gerarResumosIA` (linha 1009) gera 6 tipos de conteudo analitico apos a extracao:
- descricao_doencas, nexo_causal, incapacidade (Prioridade 1)
- resumo_peticao, resumo_contestacao (Prioridade 2)
- referencias_bibliograficas (Prioridade 3)

Os quesitos (`extractedData.quesitos.juizo/reclamante/reclamada`) sao apenas copiados brutos do OCR e NUNCA passam por uma segunda chamada de IA.

O frontend (ImportarAutosDialog.tsx, linha 1066) mapeia diretamente `extractedData.quesitos.juizo` para o banco — sem processamento.

### Mudancas concretas

**1. Expandir `PROMPT_ID_MAPPING` (linha 653)** com 3 novas entradas:

```text
quesitos_juizo: 'prompt_regen_quesitosJuizo'
quesitos_reclamante: 'prompt_regen_quesitosReclamante'
quesitos_reclamada: 'prompt_regen_quesitosReclamada'
```

**2. Expandir `DEFAULT_PROMPTS` (linha 663)** com 3 novos fallbacks dedicados:

Cada prompt recebe o texto bruto dos quesitos e instrui a IA a:
- Corrigir acentuacao OCR
- Manter numeracao original
- Gerar resposta tecnica para cada quesito baseada nos dados do caso
- Formato: `QUESITO 1: [pergunta]\nRESPOSTA: [sugestao]\n\nQUESITO 2:...`

Variaveis de interpolacao usadas: `${quesitosTexto}`, `${cids}`, `${historiaAtual}`, `${exameFisico}`, `${examesComplementares}`, `${atividadesLaborais}`, `${nexoCausal}`, `${incapacidade}`

**3. Expandir `contexto` (linha 1053)** com os textos brutos dos quesitos:

```text
quesitosJuizo: extractedData.quesitos?.juizo || ''
quesitosReclamante: extractedData.quesitos?.reclamante || ''
quesitosReclamada: extractedData.quesitos?.reclamada || ''
```

E tambem incluir nexoCausal e incapacidade ja gerados (pois as respostas dos quesitos dependem deles):

```text
nexoCausalGerado: results.nexo_causal || ''
incapacidadeGerada: results.incapacidade || ''
```

**4. Expandir `summariesToGenerate` (linha 1102)** com 3 novas entradas entre Prioridade 2 e 3:

```text
{ tipo: 'quesitos_juizo', shouldGenerate: !!contexto.quesitosJuizo && contexto.quesitosJuizo.length > 30, step: 'Respondendo quesitos do Juízo...', progress: 87 }
{ tipo: 'quesitos_reclamante', shouldGenerate: !!contexto.quesitosReclamante && contexto.quesitosReclamante.length > 30, step: 'Respondendo quesitos do Reclamante...', progress: 89 }
{ tipo: 'quesitos_reclamada', shouldGenerate: !!contexto.quesitosReclamada && contexto.quesitosReclamada.length > 30, step: 'Respondendo quesitos da Reclamada...', progress: 91 }
```

**5. Expandir `results` (linha 1032)** com as 3 novas chaves.

**6. Mapear resultados de volta** apos `gerarResumosIA` retornar (nas 2 pipelines: `processarPDFBackground` e `processarChunkedPDFBackground`):

Antes de salvar o resultado final, substituir os quesitos brutos pelos processados:

```text
if (resumosResult.resumos.quesitos_juizo) {
  (extractedData as any).quesitos.juizo = resumosResult.resumos.quesitos_juizo;
}
// idem para reclamante e reclamada
```

Isso garante que o frontend (ImportarAutosDialog.tsx, linha 1066) receba os quesitos ja com respostas e acentos corrigidos, sem precisar de nenhuma alteracao no frontend.

### Dependencia interna importante

Os quesitos precisam ter acesso ao nexo_causal e incapacidade ja gerados para produzir respostas tecnicas de qualidade. Isso e viavel porque os quesitos estao na Prioridade 2.5, apos nexo_causal e incapacidade (Prioridade 1). O `contexto` sera expandido com os resultados parciais.

**Porem**, o `contexto` e montado ANTES do loop. Sera necessario atualizar o contexto DENTRO do loop apos gerar nexo_causal e incapacidade:

```text
// Apos gerar nexo_causal:
contexto.nexoCausalGerado = results.nexo_causal;
// Apos gerar incapacidade:
contexto.incapacidadeGerada = results.incapacidade;
```

### Impacto no tempo

~10-15s por quesito. No pior caso (3 quesitos), +45s ao pipeline de ~5min. Dentro do orcamento de 600s.

---

## Resumo de Operacoes (3 arquivos, 1 deploy)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `src/utils/generateLaudoDOCX.ts` | Reescrever `createQuesitoParagraphs` com Regex + injecao de "RESPOSTA SUGERIDA DA IA:" + integrar `sanitizeOcrAccents` em `sanitizeMarkdown` (GLOBAL) |
| 2 | `src/utils/generateLaudoPDF.ts` | Reescrever `formatQuesitos` com Regex + integrar `sanitizeOcrAccents` em `sanitizeMarkdown` (GLOBAL) |
| 3 | `supabase/functions/processar-autos/index.ts` | Adicionar 3 novas entradas de quesitos ao `gerarResumosIA` (`PROMPT_ID_MAPPING`, `DEFAULT_PROMPTS`, `results`, `contexto`, `summariesToGenerate`) + mapear resultados de volta em ambas as pipelines |

**Deploy**: `processar-autos`

## Resultado esperado (Zero-Touch)

Quando a barra de "Importar Autos" chegar a 100%, os quesitos ja aparecerao na UI:
- Com respostas tecnicas sugeridas pela IA (geradas automaticamente no backend)
- Com acentos corrigidos (dupla blindagem: IA no backend + dicionario OCR no frontend)
- Separados por numeracao (Regex no DOCX/PDF como camada de seguranca extra)
- Sem nenhum clique adicional do perito

Todos os OUTROS campos de texto (anamnese, historico, laudos, nexo, etc.) tambem sao blindados contra erros de OCR via `sanitizeOcrAccents` integrado em `sanitizeMarkdown`.

