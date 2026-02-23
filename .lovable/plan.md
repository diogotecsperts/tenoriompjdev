

# Correção: Texto Integral + Prompts Simplificados (processar-autos + seed-prompts)

## Alterações (2 arquivos, 2 deploys)

### Arquivo 1: `supabase/functions/processar-autos/index.ts`

#### Mudança 1: Remover fatiamento Head+Tail (linhas 2532-2540)

Substituir o bloco de captura com slice por texto integral:

```typescript
// ANTES:
const textoOCR = mistralRawText || parsed?.text || extractedData?.textos_brutos?.peticao_inicial || '';
if (textoOCR && textoOCR.length > 1000) {
  const _head = textoOCR.slice(0, 60000);
  const _tail = textoOCR.slice(-60000);
  (extractedData as any)._rawTextTail = _head + 
    "\n\n...[CONTEUDO INTERMEDIARIO OMITIDO PELO SISTEMA]...\n\n" + _tail;
  console.log(`[processar-autos] Preserved head+tail for quesitos (mistral-ocr): ${(extractedData as any)._rawTextTail.length} chars`);
}

// DEPOIS:
const textoOCR = mistralRawText || parsed?.text || extractedData?.textos_brutos?.peticao_inicial || '';
if (textoOCR && textoOCR.length > 1000) {
  (extractedData as any)._rawTextTail = textoOCR;
  console.log(`[processar-autos] Preserved full text for quesitos (mistral-ocr): ${textoOCR.length} chars`);
}
```

#### Mudança 2: Simplificar os 3 prompts de quesitos (linhas 827-935)

Substituir os 3 prompts (quesitos_juizo, quesitos_reclamante, quesitos_reclamada) pela estrutura limpa. Exemplo para juizo:

```
TEXTO INTEGRAL DO PROCESSO:
${textoProcesso}

DADOS DO CASO PARA FUNDAMENTAR AS RESPOSTAS:
- CIDs diagnosticados: ${cids}
- História atual: ${historiaAtual}
- Exame físico: ${exameFisico}
- Exames complementares: ${examesComplementares}
- Atividades laborais: ${atividadesLaborais}
- Nexo causal: ${nexoCausal}
- Incapacidade: ${incapacidade}

TAREFA: Leia o documento acima na íntegra. Localize e extraia todas as perguntas (quesitos) formuladas EXCLUSIVAMENTE pelo Juízo. Abaixo de cada pergunta extraída, gere a resposta técnica correspondente agindo como perito médico.

FORMATO DE SAÍDA:
QUESITO 1: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

QUESITO 2: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

REGRA DE INEXISTÊNCIA: Se e somente se o documento realmente não contiver perguntas do Juízo, retorne unicamente: 'Quesitos do Juízo não identificados nos autos.'
```

Mesma estrutura para Reclamante e Reclamada (mudando apenas o nome da parte).

#### Mudança 3: Simplificar fillPromptVariables (linha 990)

Reverter a diretiva complexa para fallback simples:
```typescript
quesitosTexto: ctx.quesitosTexto || ctx.quesitosJuizo || ctx.quesitosReclamante || ctx.quesitosReclamada || '',
```

### Arquivo 2: `supabase/functions/seed-prompts/index.ts`

#### Mudança 4: Atualizar os 3 prompts de regeneração de quesitos (linhas 477-557)

Substituir os 3 prompts `prompt_regen_quesitosJuizo`, `prompt_regen_quesitosReclamante` e `prompt_regen_quesitosReclamada` pela mesma estrutura limpa usada no processar-autos. Exemplo para Juizo:

```
TEXTO INTEGRAL DO PROCESSO:
${textoProcesso}

DADOS DO CASO PARA FUNDAMENTAR AS RESPOSTAS:
- CIDs diagnosticados: ${cids}
- História atual: ${historiaAtual}
- Exame físico: ${exameFisico}
- Exames complementares: ${examesComplementares}
- Atividades laborais: ${atividadesLaborais}
- Nexo causal: ${nexoCausal}
- Incapacidade: ${incapacidade}

TAREFA: Leia o documento acima na íntegra. Localize e extraia todas as perguntas (quesitos) formuladas EXCLUSIVAMENTE pelo Juízo. Abaixo de cada pergunta extraída, gere a resposta técnica correspondente agindo como perito médico.

FORMATO DE SAÍDA:
QUESITO 1: [pergunta corrigida]
RESPOSTA: [resposta técnica fundamentada]

REGRA DE INEXISTÊNCIA: Se e somente se o documento realmente não contiver perguntas do Juízo, retorne unicamente: 'Quesitos do Juízo não identificados nos autos.'
```

Mesma estrutura para Reclamante e Reclamada.

## O que NÃO muda

- sanitizeQuesitos permanece ativa
- shouldGenerate: true permanece
- Formato QUESITO/RESPOSTA permanece
- Frase de inexistência permanece compatível com frontend
- Fallback robusto de textoProcesso permanece (linhas 1216-1229)

## Deploy

`processar-autos` e `seed-prompts`
