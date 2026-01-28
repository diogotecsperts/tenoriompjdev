

## Plano Completo: Otimização de Importação de PDF em Duas Fases

### Análise do Fluxo Atual

O sistema atual funciona assim:
1. **Importação**: `callPDFProvider` envia o PDF binário (base64) para o provider configurado
2. **Extração**: O provider (Gemini, OpenRouter, etc.) faz OCR + estruturação em uma única passagem
3. **Resumos**: Após extração, `gerarResumosIA` gera resumos usando apenas texto já extraído
4. **Regeneração por campo**: `regerar-campo-pdf` usa dados armazenados em `import_jobs.result` (não o PDF original)

### O que você observou corretamente

- A regeneração de campos funciona com qualquer provider porque já recebe **texto puro** (do cache em `import_jobs.result`)
- O problema está **apenas na Fase 1** (enviar PDF binário de 68MB)
- Após extração, tudo funciona com providers mais baratos

### O que o Plano vai Mudar

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FLUXO ATUAL (1 Fase)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  PDF 68MB → Provider único → Estrutura JSON completa                   │
│                                                                         │
│  Problemas:                                                            │
│  - OpenRouter: ❌ Falha (limite 20MB binário)                          │
│  - Gemini: ✅ Funciona, mas caro e passagem única                      │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓ ↓ ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUXO NOVO (2 Fases)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  FASE 1: Extração Visual (Gemini Oficial - OBRIGATÓRIO)                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PDF 68MB → Gemini 3.0 Flash (API Direta Google)                 │   │
│  │                                                                  │   │
│  │ Prompt otimizado para OCR:                                      │   │
│  │ "Transcreva TODO o texto, incluindo imagens. Não resuma."       │   │
│  │                                                                  │   │
│  │ Resultado: Texto bruto (~2-5MB) + índice de seções              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ARMAZENAMENTO:                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Bucket: processos-pdf/{userId}/{jobId}/extracted.json           │   │
│  │ Conteúdo: { rawText, pageCount, sections[] }                    │   │
│  │                                                                  │   │
│  │ Tabela: import_jobs.result.extracted_content_path               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  FASE 2: Preenchimento por Campo (Provider Flexível)                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Texto 2-5MB → Chunking Inteligente → Chamadas focadas           │   │
│  │                                                                  │   │
│  │ Para cada campo:                                                │   │
│  │   1. getRelevantChunk(fullText, "quesitos.juizo")              │   │
│  │      → Retorna últimos 30% do texto (onde quesitos aparecem)   │   │
│  │                                                                  │   │
│  │   2. callAI(openrouter, gpt-4o-mini, chunk, promptCampo)       │   │
│  │      → Payload: ~500KB (vs 90MB do PDF)                        │   │
│  │      → Custo: ~10x menor                                        │   │
│  │                                                                  │   │
│  │ Providers disponíveis: OpenRouter, Lovable, Gemini              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Impacto na Inserção de Informações nas Seções

A inserção nas seções será **mais precisa e econômica**:

| Aspecto | Atual | Novo |
|---------|-------|------|
| **Extração inicial** | Uma passagem tentando extrair tudo | OCR focado + preenchimento por campo |
| **Quesitos** | Pode perder contexto em PDFs grandes | Busca focada nos últimos 30% do texto |
| **História Ocupacional** | Depende do modelo pegar tudo | Chunk específico dos primeiros 30% |
| **Regeneração (botão 🔄)** | Usa cache parcial | Usa texto completo armazenado no bucket |
| **Custo por campo** | N/A (passagem única) | ~$0.002-0.005 por campo (muito barato) |

---

### Etapas de Implementação

#### Etapa 1: Criar Função de Extração Visual

**Arquivo**: `supabase/functions/_shared/pdf-visual-extractor.ts`

Criar função que usa APENAS Gemini Oficial para extrair texto bruto do PDF, preservando conteúdo de imagens:

```typescript
interface ExtractedContent {
  rawText: string;           // Texto completo do documento
  pageCount: number;         // Número de páginas
  estimatedSections: string[]; // ["PETIÇÃO INICIAL", "CONTESTAÇÃO", "QUESITOS", ...]
  extractedAt: string;       // Timestamp
  model: string;             // Modelo usado
}

const EXTRACTION_PROMPT = `
Extraia TODO o conteúdo textual deste documento PDF, incluindo:
1. Texto de todas as páginas
2. Texto contido em IMAGENS (laudos escaneados, atestados, etc.)
3. Tabelas (preserve a estrutura)

NÃO resuma. NÃO interprete. Apenas transcreva fielmente.
Separe páginas com: === PÁGINA X ===

Retorne JSON: {
  "rawText": "texto completo...",
  "pageCount": N,
  "estimatedSections": ["seções detectadas..."]
}
`;
```

#### Etapa 2: Implementar Google Files API para PDFs > 50MB

**Arquivo**: `supabase/functions/_shared/gemini-files-api.ts`

Para PDFs acima de 50MB (como o de 68MB do seu cliente), usar a Files API gratuita do Google:

```typescript
// Suporta até 2GB de PDF
// Armazenamento temporário gratuito por 48h no Google

async function uploadToGeminiFilesAPI(pdfBase64: string): Promise<string> {
  // 1. Upload do PDF para staging do Google
  const uploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuffer
    }
  );
  
  // 2. Retorna URI para uso no generateContent
  return file.uri;
}
```

#### Etapa 3: Criar Smart Chunker

**Arquivo**: `supabase/functions/_shared/smart-chunker.ts`

Mapear cada campo do laudo para a região relevante do documento:

```typescript
const FIELD_REGIONS = {
  // Início do documento
  'vitima.nome': { start: 0, end: 0.05 },
  'processo.numero': { start: 0, end: 0.05 },
  
  // Primeiros 30-40%
  'historico.historia_atual': { start: 0, end: 0.30 },
  'historico.historico_ocupacional': { start: 0, end: 0.35 },
  'acidente.descricao': { start: 0, end: 0.40 },
  
  // Meio do documento
  'exame_clinico.laudos_medicos': { start: 0.20, end: 0.60 },
  'exame_clinico.exames_complementares': { start: 0.20, end: 0.60 },
  
  // Final do documento
  'quesitos.juizo': { start: 0.70, end: 1.0 },
  'quesitos.reclamante': { start: 0.70, end: 1.0 },
  'quesitos.reclamada': { start: 0.70, end: 1.0 },
  
  // Documento completo (para buscas globais)
  'informacoes_medicas.cids_mencionados': { start: 0, end: 1.0 },
};

function getRelevantChunk(fullText: string, fieldKey: string): string {
  const region = FIELD_REGIONS[fieldKey] || { start: 0, end: 1.0 };
  const startChar = Math.floor(fullText.length * region.start);
  const endChar = Math.floor(fullText.length * region.end);
  return fullText.slice(startChar, endChar);
}
```

#### Etapa 4: Modificar `processar-autos`

**Arquivo**: `supabase/functions/processar-autos/index.ts`

Novo fluxo em duas fases:

```typescript
async function processarPDFBackground(...) {
  // Buscar configuração de estratégia
  const usesTwoPhase = await getSystemConfig('import_strategy') === 'two_phase';
  
  if (usesTwoPhase) {
    // FASE 1: Extração Visual (Gemini Oficial)
    updateProgress('Extraindo conteúdo visual...', 10, 'extraction');
    
    const extracted = await extractVisualContent(pdfBase64, {
      useFilesAPI: pdfSizeBytes > 50_000_000  // > 50MB
    });
    
    // Armazenar no bucket
    const contentPath = await saveToStorage(extracted);
    updateProgress('Conteúdo extraído e armazenado', 30, 'processing');
    
    // FASE 2: Preenchimento por Campo (Provider Configurável)
    const fillConfig = await getSystemConfig('text_fill_provider');
    
    for (const field of LAUDO_FIELDS) {
      updateProgress(`Preenchendo ${field.label}...`, progressMap[field.id], field.id);
      
      const chunk = getRelevantChunk(extracted.rawText, field.key);
      const filled = await callAI(fillConfig, chunk, field.prompt);
      
      result[field.key] = filled;
    }
    
    return { data: result, contentPath };
  } else {
    // Fluxo atual (passagem única)
    return await currentSinglePassFlow(...);
  }
}
```

#### Etapa 5: Melhorar `regerar-campo-pdf`

**Arquivo**: `supabase/functions/regerar-campo-pdf/index.ts`

Usar texto do bucket para regenerações mais precisas:

```typescript
// Buscar conteúdo do bucket (se disponível)
const contentPath = laudo.ai_metadata?.extracted_content_path;

if (contentPath) {
  // Texto completo disponível - muito mais preciso!
  const { data } = await supabase.storage
    .from('processos-pdf')
    .download(contentPath);
  
  const extracted = JSON.parse(await data.text());
  const relevantChunk = getRelevantChunk(extracted.rawText, fieldKey);
  
  // Usar provider configurado (OpenRouter = mais barato)
  return await callAI(fillConfig, relevantChunk, fieldPrompts[fieldKey]);
}

// Fallback: usar dados estruturados em cache (atual)
return await useStructuredCache(...);
```

#### Etapa 6: Sincronizar Limite de PDF na UI

**Arquivo**: `src/components/tools/ImportarAutosDialog.tsx`

Corrigir os valores hardcoded para usar configuração dinâmica:

1. Adicionar estado `maxPdfSizeMb`
2. Buscar de `system_config` junto com outras configs
3. Usar valor dinâmico nas validações (linhas 406, 431)
4. Atualizar texto de ajuda (linha 1306)

#### Etapa 7: Adicionar Configurações no DevPanel

**Arquivo**: `src/components/dev-panel/DevSettings.tsx`

Nova seção "Estratégia de Importação":

- **Modo de Importação**: "Passagem Única" / "Duas Fases (Recomendado)"
- **Provider para Preenchimento** (Fase 2): OpenRouter / Lovable / Gemini
- **Modelo de Preenchimento**: Lista dinâmica baseada no provider
- **Armazenar Texto Extraído**: Toggle (permite regeneração mais precisa)

---

### Migração de Banco de Dados

```sql
-- Novas configurações para estratégia de duas fases
INSERT INTO system_config (id, value, description) VALUES
  ('import_strategy', '"two_phase"', 'Estratégia: single_pass ou two_phase'),
  ('text_fill_provider', '"openrouter"', 'Provider para preenchimento de campos (Fase 2)'),
  ('text_fill_model', '"openai/gpt-4o-mini"', 'Modelo para preenchimento de campos'),
  ('store_extracted_text', 'true', 'Armazenar texto extraído para regeneração')
ON CONFLICT (id) DO NOTHING;

-- Garantir bucket existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('processos-pdf', 'processos-pdf', false)
ON CONFLICT DO NOTHING;
```

---

### Comparativo de Custos (PDF 796 páginas / 68MB)

| Operação | Passagem Única | Duas Fases |
|----------|----------------|------------|
| Extração (Fase 1) | $0.40-0.60 | $0.15-0.25 (só OCR) |
| Preenchimento (Fase 2) | Incluído acima | $0.03-0.05 (OpenRouter) |
| Regeneração por campo | Cache limitado | $0.002 por campo |
| **Total** | **~$0.50** | **~$0.20** |
| **Economia** | - | **~60%** |

---

### Arquivos a Serem Criados/Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/_shared/pdf-visual-extractor.ts` | **Criar** | Extração visual (OCR de imagens) |
| `supabase/functions/_shared/gemini-files-api.ts` | **Criar** | Suporte a PDFs > 50MB |
| `supabase/functions/_shared/smart-chunker.ts` | **Criar** | Chunking inteligente por campo |
| `supabase/functions/processar-autos/index.ts` | **Modificar** | Fluxo em duas fases |
| `supabase/functions/regerar-campo-pdf/index.ts` | **Modificar** | Usar texto do bucket |
| `src/components/tools/ImportarAutosDialog.tsx` | **Modificar** | Sincronizar limite de PDF + progresso detalhado |
| `src/components/dev-panel/DevSettings.tsx` | **Modificar** | Configurações de estratégia |
| Migração SQL | **Criar** | Novas configs + bucket |

---

### Resumo dos Benefícios

1. **Economia de 60%+**: OpenRouter para preenchimento custa muito menos
2. **PDFs até 2GB**: Google Files API suporta arquivos gigantes
3. **Imagens preservadas**: Gemini Vision extrai texto de imagens com alta precisão
4. **Precisão superior**: Chunks focados por campo em vez de passagem única
5. **Regeneração melhorada**: Texto completo armazenado permite regenerações mais precisas
6. **Flexibilidade**: Cada fase usa o provider mais adequado
7. **UI sincronizada**: Limite de PDF configurável no DevPanel reflete em toda a aplicação

