

# Correção de Prompt: Remoção de Viés Defensivo nos Quesitos

## Diagnóstico

As frases punitivas ("RISCO LEGAL", "ESTRITAMENTE PROIBIDO", "causará quebra crítica") disparam filtros de segurança do Gemini 3.0 Flash, fazendo o modelo preferir retornar a frase de erro ("não identificados") em vez de realizar a busca. A arquitetura de dados (Head+Tail) está funcionando -- o problema agora é puramente de linguagem de prompt.

## Alterações (3 arquivos, 2 deploys)

### Arquivo 1: `supabase/functions/processar-autos/index.ts`

**3 blocos de DEFAULT_PROMPTS** (linhas 844-858, 877-893, 912-928):

Para `quesitos_juizo` e `quesitos_reclamada`, substituir os blocos "ATENÇÃO — BUSCA AGRESSIVA" e "REGRA DE INEXISTÊNCIA (RISCO LEGAL)" por:

```
FOCO DE BUSCA: As perguntas do Juízo [ou da Reclamada] estão tipicamente localizadas no FINAL do texto
(Contestações e Despachos). Procure por pontos de interrogação (?), listas numeradas, e termos como
'diga o perito', 'informe', 'esclareça'. Extraia as perguntas e responda-as tecnicamente.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta formulada pelo Juízo [ou pela Reclamada]
no texto, retorne apenas a frase exata: 'Quesitos do Juízo [ou da Reclamada] não identificados nos autos.'
```

Para `quesitos_reclamante`, substituir por:

```
FOCO DE BUSCA: As perguntas do Reclamante estão tipicamente localizadas no INÍCIO do texto (Petição Inicial).
Procure por pontos de interrogação (?), listas numeradas, e termos como 'diga o perito', 'informe', 'esclareça'.
Extraia as perguntas do reclamante e responda-as tecnicamente.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta formulada pelo Reclamante no texto,
retorne apenas a frase exata: 'Quesitos do Reclamante não identificados nos autos.'
```

### Arquivo 2: `supabase/functions/seed-prompts/index.ts`

**3 prompts de regeneração** (linhas 500-502, 527-529, 554-556):

Mesma substituição: remover "ATENÇÃO — BUSCA AGRESSIVA OBRIGATÓRIA: É GARANTIDO..." e "REGRA DE INEXISTÊNCIA (RISCO LEGAL)..." por versões suavizadas com direcionamento posicional (INÍCIO para Reclamante, FINAL para Juízo e Reclamada).

### Arquivo 3: `supabase/functions/_shared/build-import-prompt.ts`

**prompt_import_quesitos** (linhas 423-425):

Substituir as duas regras punitivas por:

```
FOCO DE BUSCA:
- QUESITOS DO RECLAMANTE: Procure no INÍCIO do texto (Petição Inicial).
- QUESITOS DO JUÍZO: Procure nos Despachos (geralmente no FINAL do texto).
- QUESITOS DA RECLAMADA: Procure na Contestação (geralmente no FINAL do texto).
Procure por pontos de interrogação (?), listas numeradas, e termos como 'diga o perito', 'informe', 'esclareça'.

REGRA DE INEXISTÊNCIA: Caso não exista absolutamente nenhuma pergunta de um grupo específico,
retorne apenas: 'Quesitos do [Juízo/Reclamante/Reclamada] não identificados nos autos.'

NÃO invente quesitos - extraia APENAS os que existem no documento.
```

## O que NÃO muda

- Nenhuma variavel, lógica ou fluxo de dados alterado
- A frase exata de fallback permanece idêntica (compatível com o filtro do frontend)
- A instrução "NÃO invente quesitos" permanece
- O formato de saída (QUESITO X / RESPOSTA) permanece
- As instruções obrigatórias 1-5 permanecem intactas
- O `shouldGenerate` e o `textoProcesso` permanecem como estão

## Deploy

`processar-autos` e `seed-prompts`

