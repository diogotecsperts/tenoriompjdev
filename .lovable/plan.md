

# Correção: Descontaminação de Variáveis de Quesitos (LLM Anchoring Fix)

## Diagnóstico

O `extractedData.quesitos.reclamante` chega preenchido com "Quesitos do Reclamante não identificados nos autos." (resultado da extração inicial pelo Gemini). Quando esse texto é injetado na variável `${quesitosTexto}` do prompt, o Gemini interpreta como uma validação prévia do sistema e repete a frase, ignorando os 120k chars do `textoProcesso`.

## Alterações (1 arquivo, 1 deploy)

### Arquivo: `supabase/functions/processar-autos/index.ts`

### Mudança 1: Função sanitizeQuesitos (antes da linha 1194)

Adicionar helper que limpa strings contaminadas:

```typescript
const sanitizeQuesitos = (text: string | undefined): string => {
  if (!text) return '';
  if (text.toLowerCase().includes('não identificados') || 
      text.toLowerCase().includes('nao identificados')) return '';
  return text;
};
```

### Mudança 2: Aplicar sanitização na montagem do contexto (linhas 1194-1196)

Substituir:
```typescript
quesitosJuizo: extractedData.quesitos?.juizo || '',
quesitosReclamante: extractedData.quesitos?.reclamante || '',
quesitosReclamada: extractedData.quesitos?.reclamada || '',
```

Por:
```typescript
quesitosJuizo: sanitizeQuesitos(extractedData.quesitos?.juizo),
quesitosReclamante: sanitizeQuesitos(extractedData.quesitos?.reclamante),
quesitosReclamada: sanitizeQuesitos(extractedData.quesitos?.reclamada),
```

### Mudança 3: Fallback de segurança na captura Head+Tail (linha 2524)

Substituir:
```typescript
if (mistralRawText && mistralRawText.length > 1000) {
```

Por:
```typescript
const textoOCR = mistralRawText || parsed?.text || extractedData?.textos_brutos?.peticao_inicial || '';
if (textoOCR && textoOCR.length > 1000) {
```

E usar `textoOCR` em vez de `mistralRawText` dentro do bloco (nas chamadas `.slice()`).

### Mudança 4: Remover quesitos contaminados do fallback (linhas 1210-1212)

No fallback robusto, remover as linhas que injetam quesitos contaminados no `textoProcesso`:
```typescript
// REMOVER estas 3 linhas:
extractedData.quesitos?.juizo || '',
extractedData.quesitos?.reclamante || '',
extractedData.quesitos?.reclamada || ''
```

Esses campos já estavam preenchidos com "não identificados", poluindo o fallback.

## O que NÃO muda

- Prompts dos quesitos permanecem suavizados
- shouldGenerate: true permanece
- Formato de saída QUESITO/RESPOSTA permanece
- Frase de fallback de inexistência permanece compatível com frontend

## Resultado Esperado

1. Log "DEBUG QUESITOS": `quesitosTexto: 0` (descontaminado) e `textoProcesso: ~120000`
2. Gemini recebe texto limpo sem ancoragem de "não identificados"
3. Gemini procura ativamente no textoProcesso de 120k chars pelas perguntas reais

## Deploy

`processar-autos`
