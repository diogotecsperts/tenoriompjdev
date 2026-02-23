

# Correção: Prompt Dinâmico para Quesitos (Empty State Confusion)

## Diagnóstico Confirmado pelos Logs

Os logs do Supabase confirmam que as correções anteriores funcionaram:
- sanitizeQuesitos limpou o juizo (0 chars)
- Head+Tail preservou 120.055 chars de textoProcesso
- Reclamante (999 chars) e Reclamada (1.772 chars) tinham conteúdo real

O problema restante: quando `quesitosTexto` esta vazio (0 chars), o prompt renderiza assim:

```text
QUESITOS BRUTOS DO JUÍZO (extraídos do PDF — podem conter erros de OCR):
[VAZIO]

TEXTO BRUTO DO PROCESSO (para busca agressiva — use se os quesitos acima estiverem vazios ou incompletos):
[120k chars]
```

O Gemini ve a secao vazia, interpreta que "nao ha quesitos previamente extraidos", e dispara a REGRA DE INEXISTENCIA antes de procurar no textoProcesso.

## Correcao (1 arquivo, 1 deploy)

### Arquivo: `supabase/functions/processar-autos/index.ts`

### Mudanca 1: Tornar a secao de quesitos brutos condicional em fillPromptVariables (linha 987)

Alterar a logica de `quesitosTexto` para injetar uma directiva de busca quando vazio, em vez de uma string vazia:

Substituir (linha 987):
```typescript
quesitosTexto: ctx.quesitosTexto || ctx.quesitosJuizo || ctx.quesitosReclamante || ctx.quesitosReclamada || '',
```

Por:
```typescript
quesitosTexto: ctx.quesitosTexto || ctx.quesitosJuizo || ctx.quesitosReclamante || ctx.quesitosReclamada || '[NENHUM QUESITO PRE-EXTRAIDO — BUSCA NO TEXTO BRUTO E OBRIGATORIA]',
```

### Mudanca 2: Alterar os 3 templates de prompt para remover a secao de quesitos brutos quando vazia

Substituir nos 3 prompts (linhas 829-830, 866-867, 901-902) o bloco fixo:

```
QUESITOS BRUTOS DO [PARTE] (extraídos do PDF — podem conter erros de OCR):
${quesitosTexto}

TEXTO BRUTO DO PROCESSO (para busca agressiva — use se os quesitos acima estiverem vazios ou incompletos):
${textoProcesso}
```

Por uma versao com instrucao mais direta:

```
CONTEXTO DE QUESITOS:
${quesitosTexto}

TEXTO BRUTO COMPLETO DO PROCESSO (FONTE PRIMARIA — BUSQUE AQUI):
${textoProcesso}
```

E mover o "FOCO DE BUSCA" para ANTES do texto bruto, nao depois.

### Mudanca 3: Reforcar a prioridade do textoProcesso nas INSTRUCOES OBRIGATORIAS

Nos 3 prompts, adicionar como instrucao numero 0 (antes de todas as outras):

```
0. PRIORIDADE ABSOLUTA: O TEXTO BRUTO DO PROCESSO e a fonte primaria. SEMPRE leia e analise o texto bruto completo para localizar os quesitos, INDEPENDENTEMENTE de existirem quesitos pre-extraidos ou nao.
```

## O que NAO muda

- shouldGenerate: true permanece nos 3 quesitos
- sanitizeQuesitos permanece ativa
- Head+Tail permanece ativo
- Formato QUESITO/RESPOSTA permanece
- Regra de inexistencia permanece (so dispara se realmente nao houver perguntas no texto)

## Resultado Esperado

1. Quando quesitosTexto=0: o Gemini recebe "[NENHUM QUESITO PRE-EXTRAIDO]" em vez de vazio, forcando a busca no textoProcesso
2. O cabecalho "CONTEXTO DE QUESITOS" e neutro e nao sugere que ja houve validacao previa
3. A instrucao 0 reforca que o textoProcesso e a fonte primaria

## Deploy

`processar-autos`
