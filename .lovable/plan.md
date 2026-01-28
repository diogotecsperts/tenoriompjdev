

## Plano: Implementação Completa da Fase 2 - Fluxo de Duas Fases

### Diagnóstico do Estado Atual

Após análise cuidadosa, identifiquei que:

**O que JA foi implementado (Fase 1 incompleta):**

| Componente | Status | Observação |
|------------|--------|------------|
| `pdf-visual-extractor.ts` | Criado | Função `extractVisualContent` pronta mas NÃO usada |
| `gemini-files-api.ts` | Criado | Upload de PDFs > 50MB pronto mas NÃO usado |
| `smart-chunker.ts` | Criado | Mapeamento de campos pronto mas NÃO usado |
| `system_config` (import_strategy) | Configurado | Valor = `two_phase` mas IGNORADO |
| `ImportarAutosDialog.tsx` | Atualizado | maxPdfSizeMb funciona corretamente |
| `DevSettings.tsx` | Atualizado | UI de configuração funcional |

**O que FALTA (problema crítico):**

| Componente | Status | Impacto |
|------------|--------|---------|
| `processar-autos/index.ts` | NAO INTEGRADO | Sistema ignora `import_strategy`, sempre usa `callPDFProvider` (passagem única) |
| `regerar-campo-pdf/index.ts` | NAO INTEGRADO | Não usa `retrieveExtractedContent` do bucket |
| Metadados do laudo | NAO SALVOS | `extracted_content_path` não é persistido |

---

### Plano de Implementação (Cautela Extrema)

#### Parte 1: Modificar `processar-autos/index.ts`

**Objetivo:** Adicionar lógica condicional para alternar entre `single_pass` e `two_phase`.

**Mudanças específicas:**

1. **Importar as utilidades** (linha ~3):
```typescript
import { extractVisualContent, storeExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk, getFieldPrompt, FIELD_REGIONS } from "../_shared/smart-chunker.ts";
```

2. **Buscar configuração de estratégia** dentro de `processarPDFBackground` (após linha 570):
```typescript
// Buscar estratégia de importação
const { data: strategyData } = await supabaseAdmin
  .from('system_config')
  .select('id, value')
  .in('id', ['import_strategy', 'text_fill_provider', 'text_fill_model', 'store_extracted_text']);

const strategyMap: Record<string, any> = {};
strategyData?.forEach(item => { strategyMap[item.id] = item.value; });

const usesTwoPhase = strategyMap.import_strategy === 'two_phase';
```

3. **Implementar fluxo condicional** (substituir linhas 584-630):
```typescript
if (usesTwoPhase) {
  // === FASE 1: Extração Visual (Gemini Oficial) ===
  await supabaseAdmin.from('import_jobs').update({ 
    progress: 10, 
    current_step: 'Fase 1: Extraindo texto com OCR...', 
    step_id: 'extraction' 
  }).eq('id', jobId);

  const pdfSizeBytes = Math.ceil(pdfBase64.length * 3 / 4);
  const useFilesAPI = pdfSizeBytes > 50_000_000;
  
  const extracted = await extractVisualContent(pdfBase64, { useFilesAPI });
  
  // Armazenar texto no bucket (se configurado)
  let extractedContentPath: string | null = null;
  if (strategyMap.store_extracted_text !== false) {
    extractedContentPath = await storeExtractedContent(extracted, userId, jobId);
  }

  // === FASE 2: Preenchimento por Campo (Provider Flexível) ===
  await supabaseAdmin.from('import_jobs').update({ 
    progress: 35, 
    current_step: 'Fase 2: Preenchendo campos...', 
    step_id: 'processing' 
  }).eq('id', jobId);

  // Chamar provider de Fase 2 para estruturação
  const fillResult = await callTwoPhaseFieldFill(
    extracted.rawText, 
    strategyMap.text_fill_provider || 'openrouter',
    strategyMap.text_fill_model || 'openai/gpt-4o-mini',
    systemPrompt
  );
  
  extractedData = ensureValidStructure(fillResult);
  
  // Salvar path do conteúdo extraído no resultado
  if (extractedContentPath) {
    (extractedData as any).extracted_content_path = extractedContentPath;
  }
} else {
  // === Fluxo atual (passagem única) ===
  const visionResult = await callPDFProvider(pdfBase64, systemPrompt, {...});
  // ... (código existente)
}
```

4. **Criar função auxiliar** `callTwoPhaseFieldFill` para enviar apenas texto ao provider de Fase 2 (sem PDF binário).

---

#### Parte 2: Modificar `regerar-campo-pdf/index.ts`

**Objetivo:** Usar texto completo do bucket para regenerações mais precisas.

**Mudanças específicas:**

1. **Importar utilidades** (linha ~3):
```typescript
import { retrieveExtractedContent } from "../_shared/pdf-visual-extractor.ts";
import { getRelevantChunk, getFieldPrompt } from "../_shared/smart-chunker.ts";
```

2. **Buscar conteúdo do bucket primeiro** (após linha 131):
```typescript
// Primeiro, tentar buscar texto completo do bucket (mais preciso)
const extractedContentPath = aiMetadata?.extracted_content_path;

if (extractedContentPath) {
  const extracted = await retrieveExtractedContent(extractedContentPath);
  
  if (extracted?.rawText) {
    // Usar smart chunker para pegar região relevante
    const relevantChunk = getRelevantChunk(extracted.rawText, fieldKey);
    const specificPrompt = getFieldPrompt(fieldKey);
    
    const result = await callAI(aiConfig, 
      'Você é um assistente especializado em extração de dados médicos e jurídicos.',
      `${specificPrompt}\n\nConteúdo relevante:\n${relevantChunk}`,
      { promptType: `regerar_${fieldKey}` }
    );
    
    return new Response(JSON.stringify({
      texto: result.text,
      provider: result.provider,
      model: result.model,
      source: 'bucket_full_text'
    }), {...});
  }
}

// Fallback: usar dados estruturados em cache (código atual)
```

---

#### Parte 3: Persistir Metadados no Laudo

**Objetivo:** Garantir que o botão de regeneração (🔄) funcione no editor.

**Mudanças em `ImportarAutosDialog.tsx`** (função `createLaudo`):

Adicionar ao objeto `aiMetadata`:
```typescript
const aiMetadata = {
  importJobId: currentJobId,
  pdfFilePath: currentFilePath,
  extracted_content_path: extractedData.extracted_content_path || null,  // NOVO
  provider: extractedData.aiUsage?.pdfExtraction?.provider || 'unknown',
  // ... resto dos campos
};
```

---

### Resumo das Mudanças por Arquivo

| Arquivo | Ação | Linhas Afetadas | Prioridade |
|---------|------|-----------------|------------|
| `supabase/functions/processar-autos/index.ts` | Modificar | ~3, 570-650 | CRÍTICA |
| `supabase/functions/regerar-campo-pdf/index.ts` | Modificar | ~3, 131-160 | ALTA |
| `src/components/tools/ImportarAutosDialog.tsx` | Modificar | ~700-750 (createLaudo) | MÉDIA |

---

### Segurança e Fallbacks

1. **Fallback de Extração**: Se `extractVisualContent` falhar, fazer fallback para `callPDFProvider` (passagem única)

2. **Validação de Texto Extraído**: Verificar se `extracted.rawText.length > 1000` antes de prosseguir

3. **Timeout por Fase**: Implementar timeout separado para cada fase (Fase 1: 5min, Fase 2: 10min)

4. **Logging Detalhado**: Adicionar logs específicos para cada fase para facilitar debug no DevPanel

---

### Fluxo Visual do Novo Sistema

```
PDF 68MB upload
      │
      ▼
┌─────────────────────────────┐
│ Verificar import_strategy  │
│ (system_config)             │
└─────────────────────────────┘
      │
      ├── single_pass ──────────────────────────────────────┐
      │                                                      │
      ▼                                                      ▼
┌─────────────────────────────┐               ┌─────────────────────────────┐
│ DUAS FASES                  │               │ PASSAGEM ÚNICA               │
├─────────────────────────────┤               │ (fluxo atual inalterado)    │
│                             │               └─────────────────────────────┘
│ Fase 1: Gemini OCR          │
│ - extractVisualContent()    │
│ - Files API se > 50MB       │
│ - Resultado: rawText ~3MB   │
│ - Armazenar no bucket       │
│                             │
│ Fase 2: Provider Flexível   │
│ - Usar text_fill_provider   │
│ - Enviar apenas texto       │
│ - Smart chunking por campo  │
│ - Custo ~60% menor          │
│                             │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ Salvar no import_jobs       │
│ + extracted_content_path    │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ Criar Laudo com ai_metadata │
│ contendo path do bucket     │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ Regeneração (🔄) usa        │
│ retrieveExtractedContent()  │
│ + getRelevantChunk()        │
└─────────────────────────────┘
```

---

### Ordem de Implementação (Sequencial para Segurança)

1. **Primeiro:** Modificar `processar-autos/index.ts` com o fluxo condicional
2. **Segundo:** Deploy e testar importação com arquivo pequeno
3. **Terceiro:** Modificar `regerar-campo-pdf/index.ts` para usar bucket
4. **Quarto:** Atualizar `ImportarAutosDialog.tsx` para persistir metadados
5. **Quinto:** Testar fluxo completo com PDF de 68MB

