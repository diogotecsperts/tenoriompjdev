

## Plano: Correções no DevPanel + Sincronização de Providers e Modelos

### Diagnóstico Completo

Após análise detalhada do `DevSettings.tsx` (2602 linhas), identifiquei:

---

### Problema 1: Seções Confusas e Mutuamente Exclusivas

**Situação atual:**
- A seção "Extração de PDF" (single_pass) permanece visível mesmo quando `import_strategy = two_phase`
- Isso confunde porque esses campos são IGNORADOS no modo duas fases
- O usuário não sabe qual seção está ativa

**Solução:**
- Adicionar indicadores visuais claros de qual modo está ativo
- Quando `two_phase` estiver ativo: mostrar badge "Inativo" na seção "Extração de PDF"
- Adicionar descrição explicando que a seção será usada apenas no modo `single_pass`

---

### Problema 2: Provider (Fase 2) Não Lista Todos os Providers

**Situação atual (linhas 2311-2329):**
```tsx
<SelectItem value="openrouter">OpenRouter</SelectItem>
<SelectItem value="lovable">IA Integrada</SelectItem>
<SelectItem value="gemini">Gemini Direto</SelectItem>
```
Apenas 3 providers fixos, ignora:
- OpenAI (se tiver API key)
- Claude (se tiver API key)
- Groq (se tiver API key)
- DeepSeek (se tiver API key)

**Solução:**
- Usar a mesma lógica do Provider Inventory: `AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id])`
- Mostra todos os providers que não precisam de chave OU têm chave salva

---

### Problema 3: Modelo (Fase 2) Não Sincroniza com Favoritos

**Situação atual (linhas 2335-2368):**
```tsx
{config.text_fill_provider === "openrouter" ? (
  <Input value={config.text_fill_model} ... />
) : (
  <Select>...</Select>  // Lista fixa de modelos
)}
```
- OpenRouter mostra apenas Input simples + 3 sugestões fixas
- NÃO mostra os modelos favoritos do Provider Inventory
- Groq nem aparece como opção

**Padrão correto (usado em Default Model, Fallback, PDF Extraction):**
1. Input + botão adicionar favorito
2. Lista de modelos favoritos clicáveis
3. Sugestões populares

---

### Arquitetura de Configurações (Para Sua Compreensão)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROVIDER INVENTORY v2.0                             │
│  (Fonte primária de verdade para providers e modelos)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  • AI_PROVIDERS[] → Lista de todos os providers disponíveis                 │
│  • savedApiKeys{} → Quais providers têm API key configurada                 │
│  • favoriteModels{openrouter: [...], groq: [...]} → Modelos salvos          │
│                                                                             │
│  Usado por:                                                                 │
│    ├── default_ai_provider / default_ai_model                               │
│    ├── fallback_ai_provider / fallback_ai_model                             │
│    ├── pdf_ai_provider / pdf_ai_model (single_pass)                         │
│    └── text_fill_provider / text_fill_model (two_phase Fase 2) ← FALTANDO   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE IMPORTAÇÃO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  import_strategy = ?                                                        │
│        │                                                                    │
│        ├── "single_pass" ─────────────────────────────────────────┐         │
│        │   Usa seção "Extração de PDF":                           │         │
│        │     • pdf_ai_provider                                    │         │
│        │     • pdf_ai_model                                       │         │
│        │     • pdf_fallback_provider                              │         │
│        │     • pdf_fallback_model                                 │         │
│        │                                                          │         │
│        └── "two_phase" ───────────────────────────────────────────┤         │
│            Fase 1: Gemini OCR (hardcoded)                         │         │
│            Fase 2: Usa seção "Estratégia de Importação":          │         │
│              • text_fill_provider                                 │         │
│              • text_fill_model                                    │         │
│              • store_extracted_text                               │         │
│                                                                   │         │
│            ⚠️ IGNORA seção "Extração de PDF"                      │         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Implementação das 3 Correções

#### Correção 1: Indicadores Visuais de Modo Ativo

**Arquivo:** `src/components/dev-panel/DevSettings.tsx`

**Mudanças no Card "Extração de PDF" (~linha 1860):**

```tsx
<Card className={cn(
  config.import_strategy === "two_phase" && "opacity-60 border-dashed"
)}>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Extração de PDF
      </CardTitle>
      {config.import_strategy === "two_phase" && (
        <Badge variant="outline" className="text-muted-foreground">
          Inativo (modo duas fases)
        </Badge>
      )}
    </div>
    <CardDescription>
      {config.import_strategy === "two_phase" 
        ? "Estas configurações são usadas apenas no modo 'Passagem Única'"
        : "Configurações específicas para processamento de documentos PDF com IA"
      }
    </CardDescription>
  </CardHeader>
  ...
</Card>
```

**Mudanças no Card "Estratégia de Importação" (~linha 2238):**

Adicionar badge "ATIVO" quando `two_phase`:
```tsx
<CardTitle className="flex items-center gap-2">
  <Zap className="h-5 w-5" />
  Estratégia de Importação
  {config.import_strategy === "two_phase" && (
    <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
      ATIVO
    </Badge>
  )}
</CardTitle>
```

---

#### Correção 2: Listar Todos os Providers Disponíveis

**Arquivo:** `src/components/dev-panel/DevSettings.tsx`

**Mudanças no Select de Provider Fase 2 (linhas 2307-2330):**

Substituir:
```tsx
<SelectContent>
  <SelectItem value="openrouter">OpenRouter</SelectItem>
  <SelectItem value="lovable">IA Integrada</SelectItem>
  <SelectItem value="gemini">Gemini Direto</SelectItem>
</SelectContent>
```

Por:
```tsx
<SelectContent>
  {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => (
    <SelectItem key={provider.id} value={provider.id}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: provider.color }} />
        <span>{provider.name}</span>
        {provider.id === "openrouter" && (
          <span className="text-[10px] text-muted-foreground">(Recomendado)</span>
        )}
      </div>
    </SelectItem>
  ))}
</SelectContent>
```

---

#### Correção 3: Sincronizar Modelos com Provider Inventory

**Arquivo:** `src/components/dev-panel/DevSettings.tsx`

**Adicionar função helper (~linha 600):**
```tsx
const textFillProviderHasCustomInput = () => {
  const provider = AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
  return provider?.customModelInput === true;
};

const getTextFillProvider = () => {
  return AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
};

const getTextFillProviderModels = () => {
  const provider = AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
  return provider?.models || [];
};
```

**Substituir a seção de Modelo Fase 2 (linhas 2333-2398):**

Novo código seguindo o padrão de Default Model / Fallback:

```tsx
<div className="space-y-2">
  <Label>Modelo (Fase 2)</Label>
  {textFillProviderHasCustomInput() ? (
    <div className="space-y-4">
      {/* Input + Add Favorite Button */}
      <div className="flex gap-2 items-center">
        <Input 
          value={config.text_fill_model} 
          onChange={e => setConfig({
            ...config,
            text_fill_model: e.target.value
          })} 
          placeholder={getTextFillProvider()?.modelPlaceholder} 
          className="flex-1"
        />
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => addFavoriteModel(config.text_fill_provider, config.text_fill_model)} 
          disabled={!config.text_fill_model.trim()} 
          title="Adicionar aos favoritos"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Favorite Models from Provider Inventory */}
      {favoriteModels[config.text_fill_provider]?.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground flex items-center gap-1">
            <Star className="h-3 w-3 text-yellow-500" />
            Meus modelos favoritos:
          </Label>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {favoriteModels[config.text_fill_provider].map(model => (
              <div 
                key={model} 
                className={cn(
                  "flex items-center justify-between p-2 rounded-md border text-sm group cursor-pointer hover:bg-muted/50 transition-colors", 
                  config.text_fill_model === model && "border-primary bg-primary/5"
                )} 
                onClick={() => setConfig({
                  ...config,
                  text_fill_model: model
                })}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                  <span className="font-mono text-xs truncate">{model}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Popular Suggestions */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Sugestões econômicas:</Label>
        <div className="flex flex-wrap gap-2">
          {(config.text_fill_provider === "openrouter" 
            ? [
                { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", cost: "$0.15/M" },
                { id: "deepseek/deepseek-chat", name: "DeepSeek", cost: "$0.14/M" },
                { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", cost: "$0.10/M" }
              ]
            : getTextFillProviderModels().slice(0, 4).map(m => ({ id: m, name: m, cost: "" }))
          ).map(model => (
            <Button
              key={model.id}
              variant={config.text_fill_model === model.id ? "secondary" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setConfig({
                ...config,
                text_fill_model: model.id
              })}
            >
              {model.name} 
              {model.cost && <span className="text-muted-foreground ml-1">({model.cost})</span>}
            </Button>
          ))}
        </div>
      </div>
    </div>
  ) : config.text_fill_provider === "gemini" ? (
    <Select value={config.text_fill_model} onValueChange={value => setConfig({
      ...config,
      text_fill_model: value
    })}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(dynamicGeminiModels.length > 0 ? dynamicGeminiModels : ["gemini-2.5-flash", "gemini-2.5-pro"]).map(modelId => (
          <SelectItem key={modelId} value={modelId}>{modelId}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Select value={config.text_fill_model} onValueChange={value => setConfig({
      ...config,
      text_fill_model: value
    })}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {getTextFillProviderModels().map(model => (
          <SelectItem key={model} value={model}>{model}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
</div>
```

---

### Resumo das Mudanças

| Correção | Arquivo | Linhas Afetadas | Descrição |
|----------|---------|-----------------|-----------|
| 1 | DevSettings.tsx | ~1860, ~2238 | Indicadores visuais "Inativo"/"ATIVO" |
| 2 | DevSettings.tsx | 2307-2330 | Provider Fase 2 lista todos os providers disponíveis |
| 3 | DevSettings.tsx | 2333-2398, ~600 | Modelos sincronizam com favoritos do Provider Inventory |

---

### Fluxo Após Correções

```
┌────────────────────────────────────────────────────────────────────┐
│                     DevPanel Configurações                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Provider Inventory v2.0                                      │  │
│  │ • Configura API keys                                         │  │
│  │ • Adiciona modelos favoritos (OpenRouter, Groq)              │  │
│  │   ├── openai/gpt-4o-mini ⭐                                  │  │
│  │   ├── deepseek/deepseek-chat ⭐                              │  │
│  │   └── google/gemini-2.5-flash ⭐                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                              ▼ (Sincronizado)                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Extração de PDF                    [Inativo - modo 2 fases]  │  │
│  │ (usado apenas no modo single_pass)                           │  │
│  │ • pdf_ai_provider: openrouter                                │  │
│  │ • pdf_ai_model: [favoritos sincronizados]                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Estratégia de Importação                          [✓ ATIVO]  │  │
│  │ • Modo: Duas Fases (Recomendado)                             │  │
│  │ • Provider Fase 2: [todos os providers disponíveis]          │  │
│  │ • Modelo Fase 2: [favoritos sincronizados + sugestões]       │  │
│  │   ├── openai/gpt-4o-mini ⭐ (selecionado)                    │  │
│  │   ├── deepseek/deepseek-chat ⭐                              │  │
│  │   └── [+ adicionar novo]                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

