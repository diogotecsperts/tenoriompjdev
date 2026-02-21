

# Plano — Resolver Acentuacao na Importacao (Bug Real Identificado)

## Diagnostico Correto

Voce tem **toda razao**. O laudo `241c0285` foi importado **hoje** (21/02/2026 12:02) — nao e dado antigo. A regra de idioma no `summarySystemPrompt` (linha 902) esta sendo **ignorada pelo modelo**.

### Por que a regra falha?

O pipeline funciona assim:

1. `getPromptForType('descricao_doencas', ctx)` busca o prompt do **banco de dados** (DevPanel)
2. O prompt do banco **NAO contem regra de idioma** — so tem as instrucoes tecnicas
3. `callAI(aiConfig, summarySystemPrompt, prompt)` envia: system=summarySystemPrompt, user=prompt
4. O modelo `google/gemini-3-flash-preview` da mais peso ao **user prompt** e ignora a regra de acentuacao que esta apenas no system prompt

A Secao 15 (Analise de Incapacidade) saiu com acentos corretos provavelmente por acaso — o modelo foi inconsistente.

### Solucao

Injetar a regra de idioma **diretamente no final de cada user prompt** enviado ao modelo, alem de mante-la no system prompt. Isso garante redundancia: mesmo que o modelo ignore o system prompt, a regra estara no texto que ele processa diretamente.

## Operacao Tecnica (1 arquivo)

### Arquivo: `supabase/functions/processar-autos/index.ts`

Na funcao `gerarResumosIA`, **apos** obter o prompt via `getPromptForType()` (linha 1155) e **antes** de chamar `callAI()` (linha 1164), concatenar a regra de idioma ao final do user prompt:

```
Linha ~1155 (depois de obter o prompt):

const prompt = await getPromptForType(tipo, contexto);

// Injetar regra de idioma no final do user prompt para reforcar
const REGRA_IDIOMA_INLINE = '\n\nREGRA FINAL INQUEBRAVEL: Todo o texto acima DEVE ser redigido em Portugues Brasileiro correto e formal, com TODOS os acentos e diacriticos (a, e, i, o, u, a, e, o, a, o, c). Palavras como "infeccao", "nao", "orgao", "funcoes" sao ERROS GRAVES — o correto e "infeccao", "nao", "orgao", "funcoes". NUNCA omita acentos.';

const promptComRegra = prompt + REGRA_IDIOMA_INLINE;
```

E na chamada `callAI` (linha 1164), usar `promptComRegra` em vez de `prompt`:

```
const result = await Promise.race([
  callAI(aiConfig, summarySystemPrompt, promptComRegra, { ... }),
  timeoutPromise
]);
```

Aplicar o mesmo no retry (linha 1218-1219).

## Resultado esperado

- A regra de idioma estara presente em **dois lugares**: system prompt E user prompt
- Independente do modelo dar mais peso a um ou outro, a regra sera vista
- Funciona para qualquer prompt do DevPanel (que nao tem a regra)
- Zero impacto em prompts que ja geram texto com acentos (redundancia inofensiva)
- Novas importacoes de PDF terao acentuacao correta desde a primeira geracao
- O usuario NAO precisa usar "Regerar" — o texto ja vira correto na importacao
