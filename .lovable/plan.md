

# Plano — Correcao Global: Acentuacao, Quesitos e Documentos Avaliados (Refinado)

As duas ressalvas do Gem sao pertinentes e foram incorporadas ao plano.

---

## Demanda 1: Correcao de Acentuacao no `regerar-campo-pdf`

**Situacao atual**: O `processar-autos` ja tem regra de idioma no system prompt E inline no user prompt (dupla camada). O `regerar-campo-pdf` tem a regra apenas no system prompt (linha 525), mas NAO tem a injecao inline no user prompt.

**Acao**: Adicionar a regra de idioma inline ao final do user prompt no `regerar-campo-pdf/index.ts`, antes da chamada `callAI()` (linhas 526 e similar no fallback). Mesma estrategia que ja funciona no `processar-autos`.

**Arquivo**: `supabase/functions/regerar-campo-pdf/index.ts` (2 pontos de callAI: bucket path ~linha 526 e fallback path)

---

## Demanda 2: Reestruturacao dos Quesitos

### 2.1 — Prompts (4 locais + seed-prompts)

Todos os prompts de quesitos serao atualizados para:
1. Extrair LITERALMENTE cada pergunta com numeracao
2. Corrigir acentuacao do OCR
3. Gerar sugestao de resposta tecnica
4. Usar `\n\n` entre pares pergunta/resposta

**Arquivos e prompts a atualizar:**

| Arquivo | Prompt(s) |
|---------|-----------|
| `_shared/build-import-prompt.ts` | `prompt_import_quesitos` |
| `regerar-campo-pdf/index.ts` | fallbacks `quesitosJuizo`, `quesitosReclamante`, `quesitosReclamada` |
| `seed-prompts/index.ts` | `prompt_import_quesitos` (via buildImportPrompts que le de `build-import-prompt.ts`), `prompt_regen_quesitosJuizo`, `prompt_regen_quesitosReclamante`, `prompt_regen_quesitosReclamada` |

**Ressalva do Gem incorporada**: O `seed-prompts/index.ts` ja importa `DEFAULT_IMPORT_PROMPTS` do `build-import-prompt.ts` (linha 3), entao o `prompt_import_quesitos` sera atualizado automaticamente no seed quando atualizarmos o `build-import-prompt.ts`. Os 3 prompts de regen (`prompt_regen_quesitosJuizo/Reclamante/Reclamada`) precisam ser atualizados diretamente no `seed-prompts/index.ts`.

**Formato de saida esperado pela IA:**
```text
QUESITO 1: [Pergunta com acentos corrigidos]
RESPOSTA: [Sugestao tecnica baseada no caso]

QUESITO 2: [Pergunta]
RESPOSTA: [Sugestao tecnica]
```

### 2.2 — DOCX: `formatQuesitos()` refatorado

**Ressalva do Gem incorporada**: Em vez de usar `createParagraph()` (que joga tudo em um unico `Paragraph` com `TextRun`), a funcao de quesitos passara a usar `createParagraphs()` que ja divide por `\n\n` e cria instancias separadas de `Paragraph` com `spacing: { after: 120 }`. Isso resolve o problema de aglomeracao no Word.

**Mudanca concreta**: Substituir a chamada `createParagraph(formatQuesitos(...))` por `createQuesitoParagraphs(...)` — uma nova funcao dedicada que:
1. Divide o texto por `\n\n` (separador entre pares quesito/resposta)
2. Detecta linhas "QUESITO X:" e aplica negrito + cor primaria
3. Detecta linhas "RESPOSTA:" e aplica formatacao normal
4. Cada par vira um `Paragraph` separado com `spacing: { after: 200 }` para separacao visual clara

**Arquivo**: `src/utils/generateLaudoDOCX.ts` (linhas 139-146 e 662-681)

---

## Demanda 3: Documentos Avaliados

### 3.1 — UI: Novos checkboxes

**Arquivo**: `src/components/laudo/sections/DocumentosAvaliacao.tsx`

Adicionar ao array `documentosOptions`:
- `{ id: "ppra_pcmso", label: "PPRA e PCMSO" }`
- `{ id: "pgr", label: "PGR" }`
- `{ id: "aso", label: "ASOs - Atestados de Saúde Ocupacional" }`

Manter os existentes: `cat`, `prontuario`, `receitas`, `exames`, `laudos_anteriores`, `atestados`.

### 3.2 — DOCX e PDF: Logica condicional

**Arquivos**: `src/utils/generateLaudoDOCX.ts` e `src/utils/generateLaudoPDF.ts`

Substituir a logica atual (que lista apenas os checkboxes marcados) por uma estrutura hibrida:

**Bullets fixos** (sempre presentes):
1. Peticao inicial
2. Contestacao
3. Exames medicos
4. Laudos e atestados medicos
5. Quesitos do juizo e do autor

**Bullets condicionais** (aparecem quando o documento NAO foi marcado):
- Se `ppra_pcmso` E `pgr` ausentes: "Nao foram localizados nos autos os laudos de PPRA, PGR e PCMSO da empresa reclamada, considerados relevantes para analise de riscos ocupacionais."
- Se `cat` ausente: "Ausencia de Comunicacao de Acidente de Trabalho (CAT) vinculada ao caso."
- Se `aso` ausente: "Ausencia de Atestados de Saude Ocupacional (ASO) anteriores ao desligamento."

A secao sempre aparecera (sem condicao `if documentos.length > 0`), pois agora tem bullets fixos.

Atualizar tambem o `DOCUMENTOS_LABEL_MAP` nos dois geradores com as novas chaves `ppra_pcmso`, `pgr`, `aso`.

### 3.3 — JSON Template de importacao

**Arquivo**: `_shared/build-import-prompt.ts` (linha 64-70)

Atualizar o `documentos_checklist` no JSON template para incluir `ppra_pcmso`, `pgr` e `aso`.

---

## Resumo de Operacoes (7 arquivos)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/regerar-campo-pdf/index.ts` | Injetar REGRA_IDIOMA_INLINE no user prompt + atualizar fallbacks de quesitos com sugestao de respostas |
| 2 | `supabase/functions/_shared/build-import-prompt.ts` | Atualizar `prompt_import_quesitos` + adicionar `ppra_pcmso`, `pgr`, `aso` ao JSON template |
| 3 | `supabase/functions/seed-prompts/index.ts` | Atualizar `prompt_regen_quesitosJuizo/Reclamante/Reclamada` com sugestao de respostas |
| 4 | `src/components/laudo/sections/DocumentosAvaliacao.tsx` | Adicionar checkboxes ppra_pcmso, pgr, aso |
| 5 | `src/utils/generateLaudoDOCX.ts` | Nova funcao `createQuesitoParagraphs` + logica condicional de documentos |
| 6 | `src/utils/generateLaudoPDF.ts` | Logica condicional de documentos |
| 7 | (nenhum adicional) | `seed-prompts` ja importa de `build-import-prompt.ts` para import prompts |

**Deploy**: `regerar-campo-pdf`, `seed-prompts` (processar-autos nao precisa de mudanca nesta iteracao)

Apos deploy + "Restaurar Padrao de Fabrica" no DevPanel, todos os prompts de quesitos e documentos estarao atualizados no banco.

