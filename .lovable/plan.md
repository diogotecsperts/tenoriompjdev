

## Plano: Sincronização do Seletor de Modelo Gemini para Fase 1 com o Provider Inventory

### Situação Atual (Diagnóstico Completo)

Após análise detalhada, confirmo sua observação:

| Componente | Status | Detalhes |
|------------|--------|----------|
| **Provider Inventory v2.0** | ✅ Funcional | Botão "Atualizar Modelos" chama `list-gemini-models` e popula `dynamicGeminiModels[]` |
| **Cache de Modelos** | ✅ Funcional | `gemini_models_cache` no `system_config` com TTL de 24h |
| **dynamicGeminiModels** | ✅ Populado | Contém modelos estáveis buscados via API (ex: gemini-2.5-flash, gemini-3-pro-preview) |
| **geminiModelDetails** | ✅ Populado | Mapa com metadados incluindo `supportsPdf`, `inputTokenLimit` |
| **Fase 1 (OCR)** | ❌ Hardcoded | `extractVisualContent()` usa `gemini-2.5-flash` fixo - **NÃO configurável** |
| **Interface SystemConfig** | ❌ Faltando | Não possui campo `phase1_gemini_model` |

---

### Arquitetura da Sincronização

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         PROVIDER INVENTORY v2.0                                │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ [Gemini Row]                                                            │   │
│  │                                                                         │   │
│  │   API Key: AIza***                  [🔄 Atualizar Modelos] [▶ Test]     │   │
│  │                                             │                           │   │
│  └─────────────────────────────────────────────┼───────────────────────────┘   │
│                                                │                               │
│                                                ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                fetchGeminiModels()                                      │   │
│  │                                                                         │   │
│  │   • Chama Edge Function: list-gemini-models                             │   │
│  │   • Recebe: models[], versionedModels[], imageModels[]                  │   │
│  │   • Popula:                                                             │   │
│  │     ├── dynamicGeminiModels[] (modelos estáveis)                        │   │
│  │     ├── versionedGeminiModels[] (com datas/sufixos)                     │   │
│  │     ├── geminiImageModels[]                                             │   │
│  │     └── geminiModelDetails{} (metadados: supportsPdf, tokens, etc)      │   │
│  │   • Salva cache em system_config.gemini_models_cache (TTL 24h)          │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                │                               │
│                ┌──────────────────────────────┬┴───────────────────────────┐   │
│                ▼                              ▼                            ▼   │
│  ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────┐
│  │ Default/Fallback Model  │   │ PDF Extraction Model    │   │ Fase 1 Gemini   │
│  │ (quando Gemini)         │   │ (quando single_pass)    │   │ OCR Model       │
│  │                         │   │                         │   │ (two_phase)     │
│  │ ✅ Sincronizado         │   │ ✅ Sincronizado         │   │ ❌ FALTANDO     │
│  └─────────────────────────┘   └─────────────────────────┘   └─────────────────┘
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

### Implementação Completa

#### Parte 1: Atualizar Interface TypeScript

**Arquivo:** `src/components/dev-panel/DevSettings.tsx` (linhas 43-64)

Adicionar `phase1_gemini_model` à interface `SystemConfig`:

```typescript
interface SystemConfig {
  // ... campos existentes ...
  // Two-phase import strategy
  import_strategy: string;
  text_fill_provider: string;
  text_fill_model: string;
  store_extracted_text: boolean;
  phase1_gemini_model: string;  // ← NOVO
}
```

---

#### Parte 2: Atualizar Estado Inicial

**Arquivo:** `src/components/dev-panel/DevSettings.tsx` (onde config é inicializado, ~linha 210)

Adicionar valor padrão:

```typescript
const [config, setConfig] = useState<SystemConfig>({
  // ... campos existentes ...
  phase1_gemini_model: "gemini-2.5-flash",  // ← NOVO - valor padrão
});
```

---

#### Parte 3: Atualizar fetchConfig

**Arquivo:** `src/components/dev-panel/DevSettings.tsx` (função fetchConfig)

Adicionar `phase1_gemini_model` à busca e parsing:

```typescript
// Na lista de IDs a buscar, adicionar:
.in('id', [
  // ... existentes ...
  'phase1_gemini_model'  // ← NOVO
])

// No parsing do resultado, adicionar:
phase1_gemini_model: getValue('phase1_gemini_model', 'gemini-2.5-flash')
```

---

#### Parte 4: Atualizar saveConfig

**Arquivo:** `src/components/dev-panel/DevSettings.tsx` (função saveConfig)

Adicionar salvamento do novo campo:

```typescript
const configsToSave: { id: string; value: any }[] = [
  // ... existentes ...
  { id: 'phase1_gemini_model', value: config.phase1_gemini_model },  // ← NOVO
];
```

---

#### Parte 5: Adicionar Seletor de Modelo Fase 1 na UI

**Arquivo:** `src/components/dev-panel/DevSettings.tsx` (após linha 2323, dentro do bloco `two_phase`)

Adicionar nova seção **ANTES** da seção "Fase 2: Preenchimento de Campos":

```tsx
{config.import_strategy === "two_phase" && (
  <>
    <Separator />
    
    {/* NEW: Phase 1 Gemini Model Selection */}
    <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <Cpu className="h-4 w-4 text-blue-600" />
        Fase 1: Extração Visual (OCR)
        <Badge variant="outline" className="text-[10px]">Gemini Oficial</Badge>
      </h4>
      <p className="text-xs text-muted-foreground">
        O Gemini processa o PDF binário e extrai todo o texto via OCR. Para PDFs {'>'} 50MB, usa automaticamente a Google Files API.
      </p>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Modelo Gemini (Fase 1)</Label>
          {dynamicGeminiModels.length === 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => fetchGeminiModels(true)}
              disabled={loadingGeminiModels}
            >
              {loadingGeminiModels ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Carregar modelos
                </>
              )}
            </Button>
          )}
        </div>
        
        <Select 
          value={config.phase1_gemini_model || "gemini-2.5-flash"} 
          onValueChange={value => setConfig({...config, phase1_gemini_model: value})}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o modelo de OCR" />
          </SelectTrigger>
          <SelectContent>
            {/* Usar dynamicGeminiModels sincronizado com Provider Inventory */}
            {(dynamicGeminiModels.length > 0 
              ? dynamicGeminiModels.filter(modelId => {
                  // Filtrar apenas modelos que suportam PDF
                  const details = geminiModelDetails[modelId];
                  return details?.supportsPdf !== false;
                })
              : ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"]
            ).map(modelId => {
              const details = geminiModelDetails[modelId];
              return (
                <SelectItem key={modelId} value={modelId}>
                  <div className="flex items-center gap-2">
                    <span>{details?.displayName || modelId}</span>
                    {modelId.includes("3-") && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">3.0</Badge>
                    )}
                    {modelId.includes("pro") && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">Pro</Badge>
                    )}
                    {details?.inputTokenLimit && details.inputTokenLimit >= 1000000 && (
                      <Badge className="text-[10px] px-1 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        {(details.inputTokenLimit / 1000000).toFixed(0)}M tokens
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        
        {modelsCacheUpdatedAt && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Modelos atualizados: {modelsCacheUpdatedAt.toLocaleString('pt-BR')}
            <Button 
              variant="link" 
              className="h-auto p-0 text-[10px] ml-1"
              onClick={() => fetchGeminiModels(true)}
              disabled={loadingGeminiModels}
            >
              {loadingGeminiModels ? "Atualizando..." : "Atualizar"}
            </Button>
          </p>
        )}
        
        <p className="text-xs text-muted-foreground">
          💡 Modelos 3.0 têm melhor OCR para documentos escaneados. Flash é mais rápido, Pro é mais preciso.
        </p>
      </div>
    </div>
    
    <Separator />
    
    {/* Phase 2 Provider Configuration - EXISTENTE */}
    <div className="space-y-4">
      <h4 className="font-medium text-sm">Fase 2: Preenchimento de Campos</h4>
      {/* ... código existente ... */}
    </div>
  </>
)}
```

---

#### Parte 6: Atualizar Backend (processar-autos)

**Arquivo:** `supabase/functions/processar-autos/index.ts` (linhas 576-611)

**6a. Adicionar campo à busca de configuração:**

```typescript
const { data: strategyData } = await supabaseAdmin
  .from('system_config')
  .select('id, value')
  .in('id', [
    'import_strategy', 
    'text_fill_provider', 
    'text_fill_model', 
    'store_extracted_text',
    'phase1_gemini_model'  // ← NOVO
  ]);
```

**6b. Passar modelo para extractVisualContent:**

```typescript
// Determine Phase 1 model from config (linha ~608)
const phase1Model = strategyMap.phase1_gemini_model || 'gemini-2.5-flash';
console.log(`[processar-autos] Phase 1 using model: ${phase1Model}`);

const extracted = await extractVisualContent(pdfBase64, { 
  useFilesAPI,
  model: phase1Model  // ← PASSA O MODELO CONFIGURADO
});
```

---

### Fluxo Completo Após Implementação

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           DevPanel > Configurações                             │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Provider Inventory v2.0                                                  │  │
│  │                                                                          │  │
│  │   Gemini: AIza***    [🔄 Atualizar Modelos]  ←──┐                        │  │
│  │                                                 │                        │  │
│  │   Popula:                                       │                        │  │
│  │   • dynamicGeminiModels[]                       │                        │  │
│  │   • geminiModelDetails{}                        │                        │  │
│  │                                                 │ Sincroniza             │  │
│  └─────────────────────────────────────────────────┼────────────────────────┘  │
│                                                    │                           │
│  ┌─────────────────────────────────────────────────┼────────────────────────┐  │
│  │ Extração de PDF [Inativo - modo 2 fases]        │ (usa quando single)    │  │
│  │                                                 │                        │  │
│  │   • pdf_ai_provider (sincronizado)              │                        │  │
│  │   • pdf_ai_model (sincronizado)        ─────────┘                        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Estratégia de Importação                                       [✓ ATIVO] │  │
│  │                                                                          │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │ Fase 1: Extração Visual (OCR)           [Gemini Oficial]           │ │  │
│  │   │                                                                    │ │  │
│  │   │   Modelo: [gemini-3-flash-preview ▼]   ←── NOVO: usa             │ │  │
│  │   │           • gemini-2.5-flash                 dynamicGeminiModels   │ │  │
│  │   │           • gemini-2.5-pro       [3.0]       + geminiModelDetails  │ │  │
│  │   │           • gemini-3-flash-preview [3.0]     para mostrar badges   │ │  │
│  │   │           • gemini-3-pro-preview [3.0] [Pro] [1M tokens]          │ │  │
│  │   │                                                                    │ │  │
│  │   │   Atualizado: 28/01/2026 10:30 [Atualizar]                        │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                          │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐ │  │
│  │   │ Fase 2: Preenchimento de Campos                                   │ │  │
│  │   │                                                                    │ │  │
│  │   │   Provider: [OpenRouter ▼]     Modelo: [openai/gpt-4o-mini ▼]     │ │  │
│  │   │   ⭐ Favoritos sincronizados com Provider Inventory                │ │  │
│  │   └────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                          │  │
│  │   [✓] Armazenar Texto Extraído                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

### Fluxo de Execução no Backend

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     processar-autos (Edge Function)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. Busca system_config:                                                        │
│     • import_strategy = "two_phase"                                             │
│     • phase1_gemini_model = "gemini-3-flash-preview" ←── NOVO                   │
│     • text_fill_provider = "openrouter"                                         │
│     • text_fill_model = "openai/gpt-4o-mini"                                    │
│                                                                                 │
│  2. Fase 1 (se two_phase):                                                      │
│     ┌───────────────────────────────────────────────────────────────────────┐   │
│     │ extractVisualContent(pdfBase64, {                                     │   │
│     │   useFilesAPI: pdfSizeBytes > 50MB,                                   │   │
│     │   model: "gemini-3-flash-preview"  ←── USA MODELO CONFIGURADO        │   │
│     │ })                                                                    │   │
│     │                                                                       │   │
│     │ → Se PDF > 50MB: uploadToGeminiFilesAPI() primeiro                    │   │
│     │ → Chama Gemini API com modelo configurado                             │   │
│     │ → Retorna: rawText, pageCount, estimatedSections                      │   │
│     └───────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  3. Armazena texto extraído no bucket (se store_extracted_text = true)          │
│                                                                                 │
│  4. Fase 2:                                                                     │
│     ┌───────────────────────────────────────────────────────────────────────┐   │
│     │ callAI({                                                              │   │
│     │   provider: "openrouter",                                             │   │
│     │   model: "openai/gpt-4o-mini"                                         │   │
│     │ }, systemPrompt, extractedText)                                       │   │
│     │                                                                       │   │
│     │ → Envia apenas TEXTO (não PDF binário)                                │   │
│     │ → Retorna: JSON estruturado com campos do laudo                       │   │
│     └───────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  5. Salva resultado com extracted_content_path para regenerações                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Garantias de Compatibilidade

| Funcionalidade | Status | Explicação |
|----------------|--------|------------|
| **Files API (PDFs > 50MB)** | ✅ Mantido | `useFilesAPI` continua sendo calculado por tamanho, independente do modelo |
| **OCR de Imagens** | ✅ Mantido | Todos os modelos Gemini 2.5+ e 3.0 suportam Vision/PDF |
| **Fallback para single_pass** | ✅ Mantido | Se Fase 1 falhar, código existente faz fallback automático |
| **Regeneração (🔄)** | ✅ Mantido | Usa texto do bucket, não depende do modelo de extração |
| **Cache de modelos** | ✅ Sincronizado | Usa mesmo `dynamicGeminiModels` do Provider Inventory |

---

### Resumo de Arquivos a Modificar

| Arquivo | Ação | Mudanças |
|---------|------|----------|
| `src/components/dev-panel/DevSettings.tsx` | Modificar | Interface, estado inicial, fetchConfig, saveConfig, UI do seletor Fase 1 |
| `supabase/functions/processar-autos/index.ts` | Modificar | Buscar e usar `phase1_gemini_model` |

---

### Checklist de Validação Pós-Implementação

1. **Sincronização**: Clicar "Atualizar Modelos" no Provider Inventory → modelos aparecem no seletor de Fase 1
2. **Filtro supportsPdf**: Apenas modelos com `supportsPdf: true` aparecem no seletor
3. **Badges informativos**: Modelos 3.0 mostram badge [3.0], Pro mostra [Pro], tokens mostram [1M tokens]
4. **Fallback seguro**: Se `phase1_gemini_model` não existir no banco, usa "gemini-2.5-flash"
5. **Files API funciona**: PDFs > 50MB continuam usando `uploadToGeminiFilesAPI` independente do modelo
6. **Import completo**: Testar importação de PDF pequeno e verificar logs mostrando modelo configurado

