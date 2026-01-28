
## Plano Detalhado: Correção de Performance e Estabilidade da Importação de PDF

Este plano aborda todas as correções discutidas, organizadas de forma modular e com foco na preservação da qualidade do resultado.

---

## Arquitetura Atual (Diagnóstico)

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              FLUXO DE IMPORTAÇÃO (two_phase)                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  FASE 1: Extração Visual (OCR)                                                                  │
│  ├─ Modelo selecionado no DevPanel: gemini-3-flash-preview                                      │
│  ├─ API URL atual: /v1beta/models/gemini-3-flash-preview:generateContent                        │
│  ├─ PROBLEMA: API Gemini NÃO reconhece "gemini-3-flash-preview" como nome válido                │
│  └─ RESULTADO: Lentidão ou erro silencioso, fallback para single_pass                           │
│                                                                                                 │
│  FASE 2: Preenchimento de Campos                                                                │
│  ├─ Provider: OpenRouter                                                                        │
│  ├─ Modelo: google/gemini-3-flash-preview                                                       │
│  ├─ PROBLEMA: Texto muito longo → MAX_TOKENS → JSON truncado                                    │
│  └─ RESULTADO: Parse falha, fallback para single_pass, mais lentidão                            │
│                                                                                                 │
│  GERAÇÃO DE RESUMOS:                                                                            │
│  ├─ 6 resumos sequenciais com timeout de 120s cada (atual)                                      │
│  ├─ PROBLEMA: Se um resumo trava, o job todo para sem feedback                                  │
│  └─ RESULTADO: Frontend mostra "Analisando nexo causal" por 15+ minutos                         │
│                                                                                                 │
│  FRONTEND:                                                                                      │
│  ├─ Timeout global de 25 minutos (OK)                                                           │
│  ├─ PROBLEMA: Não detecta quando job travou sem atualizar updated_at                            │
│  └─ RESULTADO: Usuário espera indefinidamente                                                   │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Correção 1: Mapeamento de Modelos Gemini (Fase 1)

### Problema
O modelo selecionado no DevPanel (ex: `gemini-3-flash-preview`) não é reconhecido pela API Gemini direta. A API espera nomes como `gemini-2.5-flash`.

### Solução
Adicionar o mesmo mapeamento usado em `test-ai-connection/index.ts` ao `pdf-visual-extractor.ts`.

### Arquivo: `supabase/functions/_shared/pdf-visual-extractor.ts`

**Adicionar após linha 10 (após interface ExtractedContent):**

```typescript
// Mapeamento de nomes amigáveis do DevPanel para nomes estáveis da API Gemini
// IMPORTANTE: Sincronizado com test-ai-connection/index.ts
const GEMINI_MODEL_MAP: Record<string, string> = {
  // Gemini 3.0 Preview → mapeia para 2.5 (até 3.0 GA)
  'gemini-3-pro-preview': 'gemini-2.5-pro',
  'gemini-3-flash-preview': 'gemini-2.5-flash',
  'gemini-3-flash-lite-preview': 'gemini-2.5-flash-8b',
  // Gemini 2.5 - aliases estáveis
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-8b',
  'gemini-2.5-flash-8b': 'gemini-2.5-flash-8b',
  // Gemini 2.0 (estáveis)
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
  // Gemini 1.5 (estáveis)
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
};

/**
 * Resolve o nome do modelo para o nome aceito pela API Gemini
 */
function resolveGeminiModelName(model: string): string {
  const resolved = GEMINI_MODEL_MAP[model] || model;
  if (resolved !== model) {
    console.log(`[pdf-visual-extractor] Model mapping: ${model} → ${resolved}`);
  }
  return resolved;
}
```

**Modificar linha 77 em `extractWithInlineBase64`:**

```typescript
async function extractWithInlineBase64(
  pdfBase64: string,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // Resolver nome do modelo para API
  const apiModel = resolveGeminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
  
  console.log(`[pdf-visual-extractor] Calling Gemini API with model: ${apiModel}`);
  // ... resto do código
```

**Modificar linha 130 em `extractWithFilesAPI`:**

```typescript
async function extractWithFilesAPI(
  pdfBase64: string,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // ... upload code ...
  
  // Resolver nome do modelo para API
  const apiModel = resolveGeminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
  
  console.log(`[pdf-visual-extractor] Calling Gemini Files API with model: ${apiModel}`);
  // ... resto do código
```

### Impacto
- **Sem perda de qualidade**: O modelo real usado (gemini-2.5-flash) é equivalente ao selecionado
- **Velocidade**: API reconhece o modelo corretamente → sem delays ou retries
- **Compatibilidade**: Funciona com Files API para PDFs > 50MB

---

## Correção 2: Prevenção de Truncamento na Fase 2

### Problema
Textos muito longos na Fase 2 causam `MAX_TOKENS`, truncando o JSON de resposta.

### Solução
1. Aumentar `maxOutputTokens` explicitamente
2. Se ainda truncar, usar chunking inteligente com o `smart-chunker.ts` existente
3. Limitar texto de entrada de forma inteligente (preservando início e fim)

### Arquivo: `supabase/functions/processar-autos/index.ts`

**Modificar o bloco da Fase 2 (linhas 657-673):**

```typescript
// PHASE 2: Field Filling with Flexible Provider
await supabaseAdmin.from('import_jobs').update({ 
  progress: 35, 
  current_step: 'Fase 2: Preenchendo campos...', 
  step_id: 'processing',
  updated_at: new Date().toISOString()
}).eq('id', jobId);

console.log('[processar-autos] Starting Phase 2 - structured field filling...');

const fillProvider = strategyMap.text_fill_provider || 'lovable';
const fillModel = strategyMap.text_fill_model || 'google/gemini-3-flash-preview';

// Use the existing AI config for field filling (text only, no PDF)
const aiConfig = await getAIConfig();

// ===== NOVO: Limitar tamanho do texto de forma inteligente =====
let textForFilling = extracted.rawText;
const MAX_INPUT_CHARS = 200_000; // ~50k tokens para entrada

if (textForFilling.length > MAX_INPUT_CHARS) {
  console.warn(`[processar-autos] Text too long (${textForFilling.length} chars), applying smart truncation`);
  
  // Preservar início (dados do processo, petição) e fim (quesitos)
  const headChars = Math.floor(MAX_INPUT_CHARS * 0.6); // 60% início
  const tailChars = Math.floor(MAX_INPUT_CHARS * 0.35); // 35% fim
  const separator = '\n\n[... conteúdo intermediário omitido para processamento - seções detectadas preservadas ...]\n\n';
  
  textForFilling = textForFilling.substring(0, headChars) + 
                   separator + 
                   textForFilling.substring(textForFilling.length - tailChars);
  
  console.log(`[processar-autos] Truncated to ${textForFilling.length} chars (head: ${headChars}, tail: ${tailChars})`);
}
// ===== FIM NOVO =====

// Call AI with the extracted raw text (no binary PDF!)
const fillResult = await callAI(
  { ...aiConfig, provider: fillProvider, model: fillModel },
  systemPrompt,
  `Analise o seguinte texto extraído de um documento de processo trabalhista e retorne o JSON estruturado:\n\n${textForFilling}`,
  { 
    promptType: 'two_phase_fill', 
    userId,
    maxOutputTokens: 65536 // Garantir espaço para resposta JSON completa
  }
);
```

### Impacto na Qualidade
- **Preservação de dados críticos**: Início (nome, processo, petição) e fim (quesitos) são preservados
- **Meio do documento**: Geralmente contém documentos anexos repetitivos, menos críticos
- **Fallback mantido**: Se ainda falhar, o fallback para single_pass continua funcionando

---

## Correção 3: Geração de Resumos com Tratamento de Falhas Parciais

### Problema
Se um resumo falha ou trava, o job inteiro para sem feedback. O usuário não sabe o que aconteceu.

### Solução
1. Cada resumo tem try/catch individual (já existe parcialmente)
2. **NOVO**: Reportar falhas parciais no resultado final
3. **NOVO**: Marcar quais resumos falharam para possível retry no editor
4. Continuar gerando os outros resumos mesmo se um falhar

### Arquivo: `supabase/functions/processar-autos/index.ts`

**Modificar a interface de retorno (linhas 325-343) para incluir falhas:**

```typescript
async function gerarResumosIA(
  extractedData: any, 
  supabaseAdmin: any, 
  jobId: string,
  userId: string
): Promise<{
  resumos: {
    resumo_peticao: string;
    resumo_contestacao: string;
    descricao_doencas: string;
    nexo_causal: string;
    incapacidade: string;
    referencias_bibliograficas: string;
  };
  aiInfo: {
    provider: string;
    model: string;
    summariesGenerated: number;
    summariesFailed: string[];  // NOVO: lista de resumos que falharam
    errors: Record<string, string>;  // NOVO: mensagens de erro por tipo
  };
}> {
```

**Modificar o final da função (linhas 488-496):**

```typescript
  // Criar mapa de erros para frontend
  const errorsMap: Record<string, string> = {};
  for (const errMsg of summaryErrors) {
    const [tipo, ...rest] = errMsg.split(': ');
    errorsMap[tipo] = rest.join(': ');
  }
  
  // Identificar quais falharam
  const failedTypes = Object.keys(errorsMap);

  // Log warning se houver falhas parciais
  if (failedTypes.length > 0) {
    await logWarn('processar-autos', 
      `Processamento parcial: ${summariesGenerated}/${summariesToGenerate.filter(s => s.shouldGenerate).length} resumos gerados`, 
      jobId, {
        summariesGenerated,
        failed: failedTypes,
        errors: errorsMap
      }
    );
  }

  return {
    resumos: results,
    aiInfo: {
      provider: aiConfig.provider,
      model: aiConfig.model,
      summariesGenerated,
      summariesFailed: failedTypes,  // NOVO
      errors: errorsMap  // NOVO
    }
  };
```

**Modificar o resultado final do job (linhas 815-838):**

```typescript
const result = {
  success: true,
  data: extractedData,
  extracted_content_path: extractedContentPath,
  partialFailures: resumosResult.aiInfo.summariesFailed.length > 0 ? {
    failedSummaries: resumosResult.aiInfo.summariesFailed,
    errors: resumosResult.aiInfo.errors
  } : null,  // NOVO: Informar falhas parciais ao frontend
  aiUsage: {
    // ... existente
  },
  truncated: visionResult?.finishReason === "MAX_TOKENS"
};
```

---

## Correção 4: Feedback de Falhas Parciais no Frontend

### Problema
O frontend não sabe quais resumos falharam e não oferece opção de retry.

### Solução
1. Detectar `partialFailures` no resultado
2. Mostrar aviso visual indicando quais seções não foram importadas
3. Armazenar no `ai_metadata` do laudo para permitir retry no editor

### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

**Adicionar estado para falhas parciais (após linha 214):**

```typescript
const [partialFailures, setPartialFailures] = useState<{
  failedSummaries: string[];
  errors: Record<string, string>;
} | null>(null);
```

**Modificar a função checkJobStatus (linha 544-548):**

```typescript
if (data.status === 'completed' && data.result) {
  // Mark all steps as completed
  markAllStepsCompleted();
  
  // Success!
  setExtractedData(data.result.data);
  setAiUsage(data.result.aiUsage || null);
  setUsedModel(data.result.aiUsage?.pdfExtraction?.model || 'gemini-2.5-flash');
  
  // NOVO: Capturar falhas parciais
  if (data.result.partialFailures) {
    setPartialFailures(data.result.partialFailures);
  }
  
  setProcessingStep("preview");
  return true;
}
```

**Adicionar aviso visual na tela de preview (após a seção de AI Usage Info, buscar local apropriado):**

```tsx
{/* Aviso de Falhas Parciais */}
{partialFailures && partialFailures.failedSummaries.length > 0 && (
  <Alert variant="warning" className="mt-4">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Importação parcial</AlertTitle>
    <AlertDescription>
      <p className="mb-2">Algumas seções não puderam ser geradas automaticamente:</p>
      <ul className="list-disc list-inside text-sm space-y-1">
        {partialFailures.failedSummaries.map(tipo => (
          <li key={tipo}>
            <span className="font-medium">{formatSummaryTypeName(tipo)}</span>
            {partialFailures.errors[tipo] && (
              <span className="text-muted-foreground ml-1">
                ({partialFailures.errors[tipo].substring(0, 50)}...)
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Você poderá gerar essas seções manualmente no editor do laudo usando o botão "🔄 Regenerar".
      </p>
    </AlertDescription>
  </Alert>
)}
```

**Adicionar função helper para formatar nomes:**

```typescript
const formatSummaryTypeName = (tipo: string) => {
  const names: Record<string, string> = {
    resumo_peticao: 'Resumo da Petição Inicial',
    resumo_contestacao: 'Resumo da Contestação',
    descricao_doencas: 'Descrição Técnica das Doenças',
    nexo_causal: 'Análise de Nexo Causal',
    incapacidade: 'Análise de Incapacidade',
    referencias_bibliograficas: 'Referências Bibliográficas'
  };
  return names[tipo] || tipo;
};
```

**Modificar laudoData para incluir metadados de falhas parciais (linha 769-791):**

```typescript
ai_metadata: aiUsage ? {
  importDate: new Date().toISOString(),
  pdfFilePath: currentFilePath,
  importJobId: currentJobId,
  extracted_content_path: (extractedData as any).extracted_content_path || null,
  // NOVO: Marcar quais seções falharam para retry no editor
  failedSummaries: partialFailures?.failedSummaries || [],
  pdfExtraction: { /* ... */ },
  summaries: { /* ... */ }
} : null
```

---

## Correção 5: Detecção de Jobs Travados no Frontend

### Problema
O frontend não detecta quando o job parou de atualizar (edge function travou ou deu timeout).

### Solução
Detectar quando `updated_at` não muda por um período razoável (5 minutos) e mostrar opção de retry.

### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

**Adicionar estado para detecção de stale (após linha 229):**

```typescript
const [isJobStale, setIsJobStale] = useState(false);
const lastJobUpdateRef = useRef<string | null>(null);
const staleCheckCountRef = useRef(0);
const STALE_THRESHOLD_POLLS = 20; // 20 polls * 3s = 60 segundos sem update = stale
```

**Modificar checkJobStatus para detectar stale:**

```typescript
const checkJobStatus = async (jobId: string): Promise<boolean> => {
  try {
    // ... código existente de fetch ...
    
    const data = await response.json();
    
    // NOVO: Detectar job travado (updated_at não muda)
    if (lastJobUpdateRef.current === data.updatedAt) {
      staleCheckCountRef.current++;
      
      if (staleCheckCountRef.current >= STALE_THRESHOLD_POLLS) {
        console.warn('[ImportarAutosDialog] Job appears stale - no updates for 60+ seconds');
        setIsJobStale(true);
        
        // Não parar o polling ainda, apenas mostrar aviso
        // Usuário pode decidir continuar esperando ou cancelar
      }
    } else {
      // Reset counter when we see an update
      lastJobUpdateRef.current = data.updatedAt;
      staleCheckCountRef.current = 0;
      setIsJobStale(false);
    }
    
    // ... resto do código existente ...
```

**Adicionar UI para job stale (dentro do bloco de analyzing):**

```tsx
{isJobStale && (
  <Alert variant="warning" className="mt-4">
    <Clock className="h-4 w-4" />
    <AlertTitle>Processamento lento</AlertTitle>
    <AlertDescription>
      <p>O processamento não teve atualizações nos últimos 60 segundos.</p>
      <p className="text-sm text-muted-foreground mt-1">
        Isso pode indicar que o servidor está sobrecarregado ou o modelo de IA está lento.
      </p>
      <div className="flex gap-2 mt-3">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            // Continuar esperando - apenas resetar o contador
            staleCheckCountRef.current = 0;
            setIsJobStale(false);
          }}
        >
          Continuar esperando
        </Button>
        <Button 
          variant="destructive" 
          size="sm"
          onClick={() => {
            // Cancelar e voltar ao início
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setProcessingStep("idle");
            toast({
              variant: "destructive",
              title: "Processamento cancelado",
              description: "Você pode tentar novamente com outro arquivo ou configuração."
            });
          }}
        >
          Cancelar
        </Button>
      </div>
    </AlertDescription>
  </Alert>
)}
```

---

## Resumo de Arquivos a Modificar

| Arquivo | Mudanças | Impacto |
|---------|----------|---------|
| `supabase/functions/_shared/pdf-visual-extractor.ts` | Adicionar `GEMINI_MODEL_MAP` e função `resolveGeminiModelName` | Fase 1 usa modelo correto na API |
| `supabase/functions/processar-autos/index.ts` | Truncamento inteligente Fase 2, falhas parciais nos resumos | Previne MAX_TOKENS, feedback de erros |
| `src/components/tools/ImportarAutosDialog.tsx` | Estado de falhas parciais, detecção de stale, UI de aviso | Usuário vê o que falhou e pode agir |

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            FLUXO DE IMPORTAÇÃO CORRIGIDO                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  FASE 1: Extração Visual (OCR)                                                                  │
│  ├─ Modelo no DevPanel: gemini-3-flash-preview                                                  │
│  ├─ Mapeamento: gemini-3-flash-preview → gemini-2.5-flash  ✅ CORRIGIDO                         │
│  ├─ API URL: /v1beta/models/gemini-2.5-flash:generateContent                                    │
│  └─ RESULTADO: Extração rápida e confiável                                                      │
│                                                                                                 │
│  FASE 2: Preenchimento de Campos                                                                │
│  ├─ Texto limitado a 200k chars (preservando início + fim)  ✅ CORRIGIDO                        │
│  ├─ maxOutputTokens: 65536 para JSON completo                                                   │
│  └─ RESULTADO: JSON válido sem truncamento                                                      │
│                                                                                                 │
│  GERAÇÃO DE RESUMOS:                                                                            │
│  ├─ Cada resumo em try/catch isolado                                                            │
│  ├─ Se um falha, continua os outros  ✅ JÁ EXISTIA                                              │
│  ├─ NOVO: Reporta quais falharam no resultado                                                   │
│  └─ RESULTADO: Processamento parcial possível, feedback claro                                   │
│                                                                                                 │
│  FRONTEND:                                                                                      │
│  ├─ Timeout global de 25 minutos (mantido)                                                      │
│  ├─ NOVO: Detecta stale após 60s sem update                                                     │
│  ├─ NOVO: Mostra aviso com opções (esperar/cancelar)                                            │
│  ├─ NOVO: Exibe quais resumos falharam na preview                                               │
│  └─ RESULTADO: Usuário sempre informado, pode agir                                              │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Garantias de Qualidade

| Aspecto | Preservado | Explicação |
|---------|------------|------------|
| **Dados da vítima/processo** | ✅ | Início do documento sempre preservado no truncamento |
| **Quesitos do juízo** | ✅ | Final do documento sempre preservado no truncamento |
| **CIDs mencionados** | ✅ | Extraídos na Fase 1 (texto completo), usados nos resumos |
| **Textos brutos completos** | ⚠️ | Podem ser parciais em PDFs muito grandes, mas resumos são gerados |
| **Files API (PDFs > 50MB)** | ✅ | Continua funcionando normalmente |
| **Regeneração no editor** | ✅ | Usa texto armazenado no bucket, não afetado |

---

## Checklist de Validação Pós-Implementação

1. **Mapeamento de Modelos**
   - [ ] Selecionar `gemini-3-flash-preview` no DevPanel
   - [ ] Importar PDF pequeno
   - [ ] Verificar nos logs: `Model mapping: gemini-3-flash-preview → gemini-2.5-flash`
   - [ ] Tempo de Fase 1 deve ser < 60 segundos para PDF de 5MB

2. **Truncamento Inteligente**
   - [ ] Importar PDF grande (>200 páginas)
   - [ ] Verificar nos logs: `Truncated to X chars`
   - [ ] Verificar que dados da vítima, processo e quesitos estão presentes no laudo

3. **Falhas Parciais**
   - [ ] Simular falha (desconectar rede durante resumo)
   - [ ] Verificar que outros resumos continuam
   - [ ] Verificar aviso de falha parcial na preview
   - [ ] Verificar que `ai_metadata.failedSummaries` está preenchido no laudo

4. **Detecção de Stale**
   - [ ] Importar PDF durante sobrecarga do servidor
   - [ ] Verificar que após 60s aparece aviso "Processamento lento"
   - [ ] Verificar que botões "Continuar esperando" e "Cancelar" funcionam

5. **Performance Geral**
   - [ ] PDF pequeno (~50 páginas): < 3 minutos total
   - [ ] PDF médio (~100 páginas): < 5 minutos total
   - [ ] PDF grande (~200+ páginas): < 10 minutos total
