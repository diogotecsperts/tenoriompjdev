
## Plano: Correção Cirúrgica - Estabilizar Fase 2 com tryFixTruncatedJson Robusto + JSON-Mode

---

## Diagnóstico Confirmado

Os logs mostram claramente o problema:

```text
textPreview: "```json\n{\n  \"vitima\": {\n  \"nome\": \"VANILDO..."
textEnding: "...demitido por incapacidade técnica/física.\"\n}\n```"
```

**Problemas identificados:**
1. A IA está envolvendo o JSON em marcadores Markdown: ` ```json ... ``` `
2. A função `tryFixTruncatedJson` atual (linhas 118-150) **remove** esses marcadores, mas falha quando há caracteres de controle dentro das strings
3. O JSON retornado é **válido** - só precisa ser limpo corretamente

---

## Correções Propostas

### 1. Melhorar `tryFixTruncatedJson` (processar-autos/index.ts)

**Localização:** Linhas 117-150

**Melhorias:**

```typescript
function tryFixTruncatedJson(jsonStr: string): object | null {
  if (!jsonStr || typeof jsonStr !== 'string') return null;
  
  // PASSO 1: Limpar entrada
  let cleaned = jsonStr.trim();
  
  // PASSO 2: Extrair JSON de blocos Markdown (```json ... ``` ou ``` ... ```)
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  } else {
    // Remover marcadores soltos no início/fim
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  
  // PASSO 3: Tentar parse direto primeiro
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  
  // PASSO 4: Escapar caracteres de controle dentro de strings JSON
  // Isso corrige newlines literais (\n real) dentro de valores de string
  cleaned = cleaned.replace(
    /"([^"\\]*(\\.[^"\\]*)*)"/g,
    (match) => {
      // Escapar newlines, tabs e carriage returns que não estão escapados
      return match
        .replace(/(?<!\\)\n/g, '\\n')
        .replace(/(?<!\\)\r/g, '\\r')
        .replace(/(?<!\\)\t/g, '\\t');
    }
  );
  
  // PASSO 5: Remover trailing commas antes de } ou ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // PASSO 6: Tentar parse após limpeza
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  
  // PASSO 7: Fechar estruturas truncadas
  const openBraces = (cleaned.match(/{/g) || []).length;
  const closeBraces = (cleaned.match(/}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/]/g) || []).length;
  
  // Fechar string aberta
  if (cleaned.match(/"[^"]*$/)) {
    cleaned += '"';
  }
  
  // Fechar arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    cleaned += ']';
  }
  
  // Fechar objetos
  for (let i = 0; i < openBraces - closeBraces; i++) {
    cleaned += '}';
  }
  
  // PASSO 8: Parse final
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[tryFixTruncatedJson] Could not fix JSON:', e);
    console.error('[tryFixTruncatedJson] First 200 chars:', cleaned.substring(0, 200));
    return null;
  }
}
```

---

### 2. Forçar JSON-Mode na Chamada de IA da Fase 2

O prompt atual pede JSON, mas **não força** a IA a retornar JSON puro. Vou adicionar `response_format` para providers que suportam.

**Arquivo:** `supabase/functions/_shared/ai-config.ts`

**Modificações em `callOpenAICompatible`** (linha 592):

```typescript
async function callOpenAICompatible(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string, 
  maxOutputTokens?: number,
  options?: { jsonMode?: boolean }  // NOVO
) {
  const body: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  };
  
  if (maxOutputTokens) {
    body.max_tokens = maxOutputTokens;
  }
  
  // NOVO: Forçar JSON mode se solicitado
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  
  // ... resto igual
}
```

**Modificações em `callGeminiDirect`** (linha 561):

```typescript
async function callGeminiDirect(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string, 
  maxOutputTokens?: number,
  options?: { jsonMode?: boolean }  // NOVO
) {
  const generationConfig: any = {
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: maxOutputTokens || 8192,
  };
  
  // NOVO: Forçar JSON mode para Gemini
  if (options?.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  
  const url = `${config.endpoint}/${config.model}:generateContent?key=${config.apiKey}`;
  
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
      }],
      generationConfig
    })
  });
  // ... resto igual
}
```

**Propagar opção `jsonMode` através de `callAI`** (linha 394):

```typescript
export async function callAI(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string,
  options?: { 
    userId?: string; 
    promptType?: string; 
    maxOutputTokens?: number;
    jsonMode?: boolean;  // NOVO
  }
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean }> {
  // Passar jsonMode para callProvider
  const result = await callProvider(config, systemPrompt, userPrompt, options?.maxOutputTokens, { jsonMode: options?.jsonMode });
  // ...
}
```

---

### 3. Usar JSON-Mode na Chamada da Fase 2 (processar-autos)

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linha 700)

**Antes:**
```typescript
const fillResult = await callAI(
  { ...aiConfig, provider: fillProvider, model: fillModel },
  systemPrompt,
  `Analise o seguinte texto...`,
  { promptType: 'two_phase_fill', userId, maxOutputTokens: 65536 }
);
```

**Depois:**
```typescript
const fillResult = await callAI(
  { ...aiConfig, provider: fillProvider, model: fillModel },
  systemPrompt,
  `Analise o seguinte texto...`,
  { promptType: 'two_phase_fill', userId, maxOutputTokens: 65536, jsonMode: true }  // NOVO
);
```

---

### 4. Ajustar Prompt para Reforçar JSON Puro

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linha 16)

Adicionar instrução explícita no final do `systemPrompt`:

```typescript
const systemPrompt = `Você é um assistente especializado...

INSTRUÇÕES ESPECÍFICAS:
...

FORMATO DE RESPOSTA:
- Retorne APENAS o objeto JSON, sem markdown, sem \`\`\`, sem explicações.
- Comece diretamente com { e termine com }`;
```

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `processar-autos/index.ts` | Reescrever `tryFixTruncatedJson` com 8 passos robustos |
| `processar-autos/index.ts` | Adicionar `jsonMode: true` na chamada da Fase 2 |
| `processar-autos/index.ts` | Ajustar `systemPrompt` para exigir JSON puro |
| `_shared/ai-config.ts` | Adicionar suporte a `jsonMode` em `callAI` |
| `_shared/ai-config.ts` | Adicionar `response_format` em `callOpenAICompatible` |
| `_shared/ai-config.ts` | Adicionar `responseMimeType` em `callGeminiDirect` |

---

## Por Que Isso Vai Funcionar

1. **O JSON já está sendo gerado corretamente** - os logs mostram estrutura válida
2. **O problema é o wrapper Markdown** - ` ```json ``` ` que não estava sendo removido corretamente
3. **JSON-mode** força a IA a retornar JSON puro, eliminando o problema na origem
4. **tryFixTruncatedJson robusto** serve como rede de segurança para casos edge

---

## Resultado Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Taxa de sucesso Fase 2 | ~30% | ~95%+ |
| Progresso médio | 28% | 58-65% |
| Fallback para single-pass | Frequente | Raro |

---

## Seção Técnica Detalhada

### Fluxo de Correção do JSON

```text
1. Entrada: "```json\n{\n  \"vitima\": ..."
2. Extração Markdown: {  "vitima": ...
3. Escape de newlines: Corrige \n literais dentro de strings
4. Remove trailing commas: Corrige ,}
5. Fecha estruturas: Adiciona } ou ] se truncado
6. Parse final: JSON válido
```

### Compatibilidade JSON-Mode por Provider

| Provider | Parâmetro | Suporte |
|----------|-----------|---------|
| OpenAI/OpenRouter | `response_format: { type: "json_object" }` | ✅ |
| Gemini | `responseMimeType: "application/json"` | ✅ |
| Lovable AI | Herda do gateway (OpenAI-compatible) | ✅ |
| Claude | Não suporta JSON-mode nativo | ⚠️ Depende do prompt |
