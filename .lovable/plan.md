# Ajustes Step 1 & Step 2 — Pré-Laudo Previdenciário

## Objetivo

1. **Step 1 — Identificação:** remover `Telefone` e `Endereço`.
2. **Step 2 — Queixa Principal:** colapsar todos os campos em **um único campo grande**, preenchido automaticamente pela IA no momento do processamento do PDF, usando o prompt enviado pelo cliente.

Princípios mantidos do módulo:
- Zero-Touch Import (sem botão "gerar" — preenchimento vem do processar PDF).
- "Médico decide, IA sugere" (campo permanece 100% editável).
- Strict isolation: nada do módulo Trabalhista é modificado.
- jsonb tolerante: nenhum DROP/ALTER, dados antigos ficam latentes e não aparecem na UI.

---

## Step 1 — Remoção segura de Telefone e Endereço

**`src/modules/previdenciario/components/steps/Step01Identificacao.tsx`**
- Remover os dois `<Field>` (`telefone`, `endereco`).
- Não alterar o `IdentificacaoData` (jsonb tolerante; perícias antigas seguem válidas).

**`src/modules/previdenciario/lib/prelaudo-structure.ts`**
- Em `mergeFromExtracao`, remover as duas linhas `fill(... "telefone" ...)` e `fill(... "endereco" ...)`. Evita "fantasma" — a IA não vai mais alimentar campos que a UI não exibe.

**`src/modules/previdenciario/components/PainelLateralProcesso.tsx`** — sem mudança (painel é leitura do cache da extração; manter telefone/endereço lá não atrapalha e ainda dá utilidade ao perito durante a consulta).

---

## Step 2 — Campo único + integração no pipeline de processamento

### 2.1 UI (`Step02Queixa.tsx`)

Reescrever para conter **apenas**:
- Header (título + subtítulo).
- Uma `<Section>` com **um único `<Textarea>`** de ~14 linhas, ligado a `value.queixa_principal`.
- Subtítulo atualizado: "Texto unificado gerado a partir do processo. Edite livremente."

Os campos `inicio_sintomas`, `evolucao`, `lateralidade`, `fatores_agravantes` deixam de aparecer. Permanecem tolerados no jsonb (sem risco para perícias antigas).

### 2.2 Pipeline de extração — onde plugar o prompt

A integração acontece **dentro de `supabase/functions/prev-pre-processar/index.ts`**, no mesmo run que já popula `prev_extracao`. Fluxo:

```text
PDF → OCR/extrator atual → JSON estruturado (identificação, processo, CIDs, …)
                        ↘ texto bruto (raw_text)
                          ↓
              [NOVA ETAPA] LLM com prompt do cliente
                          ↓
              extracao.queixa_principal = parágrafo unificado
                          ↓
                  grava em prev_pericias.prev_extracao
```

Como `mergeFromExtracao` **já** copia `extracao.queixa_principal` para `prelaudo_data.queixa.queixa_principal`, **nenhuma mudança no client é necessária para o auto-preenchimento** além da própria UI do Step 2.

### 2.3 Prompt — armazenamento

Seguindo a arquitetura existente (memory: Global Prompt Manager):
- Chave nova: `prev_queixa_principal_unificada`.
- Salva via `supabase/functions/seed-prompts/index.ts` (adiciona entry ao seed).
- Lida em runtime via `_shared/prompt-manager.ts` (`getPrompt('prev_queixa_principal_unificada')`).
- Editável pelo DevPanel sem deploy.

Texto do prompt = exatamente o que o cliente mandou, com a única substituição já prevista por ele: `[texto gerado pelos chips]` → bloco contendo o `raw_text` + JSON sumarizado da extração corrente. Mantemos as 22 regras intactas.

### 2.4 Chamada LLM

Dentro de `prev-pre-processar`, após a extração principal:
- Modelo: `google/gemini-3-flash-preview` (mesmo padrão do módulo).
- Provider: Lovable AI Gateway com `LOVABLE_API_KEY` (já secret).
- `temperature` baixa (0.2) para fidelidade ao prompt.
- Tratamento de erro **não-fatal**: se a chamada falhar (429, 402, timeout), o processamento principal **não quebra** — grava `extracao.queixa_principal = ""` e loga em `backend_logger`. O médico vê o campo vazio e preenche/regenera depois (futura iteração).
- Validação simples de saída: 1 parágrafo, sem markdown/bullets (regra 17/18 do prompt). Se a IA devolver lixo, descarta e grava vazio.

### 2.5 Reprocessamento de perícias já processadas

**Não fazemos retroativo** (regra de projeto: "Stale Data Regeneration Policy"). Só novos processamentos vão gerar o campo. Perícias antigas continuam com o que tinham no `queixa_principal` (vazio ou pré-existente).

---

## Detalhes técnicos

**Arquivos alterados:**
- `src/modules/previdenciario/components/steps/Step01Identificacao.tsx` — remove 2 fields.
- `src/modules/previdenciario/components/steps/Step02Queixa.tsx` — reescrita mínima (um textarea).
- `src/modules/previdenciario/lib/prelaudo-structure.ts` — remove 2 `fill()` em `mergeFromExtracao`.
- `supabase/functions/prev-pre-processar/index.ts` — adiciona etapa LLM pós-extração para `queixa_principal`.
- `supabase/functions/seed-prompts/index.ts` — adiciona seed do prompt `prev_queixa_principal_unificada`.

**Não tocados:** schema/migrations, módulo Trabalhista, outras edge functions, export PDF/DOCX, painel lateral.

**Validação após build:**
1. Step 1 não mostra mais telefone/endereço; perícia antiga abre sem erro.
2. Step 2 mostra só o textarea grande.
3. Novo PDF processado → textarea da Queixa vem preenchido com parágrafo único técnico.
4. Falha da IA na queixa não quebra o resto da extração.
5. DevPanel → Prompts mostra `prev_queixa_principal_unificada` editável.

## Fora de escopo (próximas iterações)

- Botão "Regenerar Queixa" sob demanda dentro do Step 2.
- Reprocessamento retroativo de perícias antigas.
- Aplicar mesmo padrão de "campo unificado IA" aos Steps 3–10.
