

## Plano: Adicionar Indicador de Partes Processadas no Preview

### Status Atual

| Funcionalidade | Status |
|---------------|--------|
| Filtro `chunked_import` na aba Logs de IA | Implementado |
| Badge `Chunked` na aba Logs de Backend | Implementado |
| Indicador de partes processadas no Preview | **Falta implementar** |

### O que Falta

O preview de resultado após a importação de um PDF grande (que foi dividido em partes) não mostra:
1. Que o processamento foi feito em modo "Chunked"
2. Quantas partes foram processadas
3. O provider de OCR usado em cada parte

### Mudanças Necessárias

#### 1. Expandir Interface `AIUsageInfo`

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Adicionar campos para informações de processamento chunked:

```typescript
interface AIUsageInfo {
  pdfExtraction: {
    provider: string;
    model: string;
    note?: string;
    durationMs?: number;
    usedFallback?: boolean;
    originalProvider?: string;
    fallbackReason?: string;
    // NOVOS CAMPOS:
    strategy?: 'single_pass' | 'two_phase' | 'client_side_split';
    partsProcessed?: number;
    totalPages?: number;
  };
  summaries: {
    provider: string;
    model: string;
    count: number;
    durationMs?: number;
  };
  totalDurationMs?: number;
}
```

#### 2. Adicionar Indicador Visual no Preview

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx` (na função `renderPreview`)

Na seção "Inteligências Artificiais Utilizadas", adicionar um indicador para processamento chunked:

```tsx
{/* Chunked Processing Indicator */}
{aiUsage.pdfExtraction.strategy === 'client_side_split' && aiUsage.pdfExtraction.partsProcessed && (
  <div className="col-span-2 pt-3 border-t border-border">
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <Layers className="h-4 w-4 text-purple-600" />
        <span className="font-medium text-purple-700 dark:text-purple-400">
          Processamento Chunked
        </span>
        <Badge variant="secondary" className="bg-purple-500/20 text-purple-700 dark:text-purple-300">
          {aiUsage.pdfExtraction.partsProcessed} partes
        </Badge>
        {aiUsage.pdfExtraction.totalPages && (
          <span className="text-xs text-muted-foreground">
            ({aiUsage.pdfExtraction.totalPages} páginas totais)
          </span>
        )}
      </div>
    </div>
  </div>
)}
```

#### 3. Garantir que o Backend Envie os Dados

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Verificar que a função `processarChunkedPDFBackground` inclui os campos no objeto `aiUsage`:

```typescript
const aiUsage = {
  pdfExtraction: {
    provider: 'mistral-ocr',
    model: 'mistral-ocr-latest',
    durationMs: extractionDurationMs,
    strategy: 'client_side_split',
    partsProcessed: fileParts.length,
    totalPages: totalPages
  },
  summaries: {
    provider: aiConfig.provider,
    model: aiConfig.model,
    count: successCount,
    durationMs: summariesDurationMs
  },
  totalDurationMs: totalDurationMs
};
```

---

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/tools/ImportarAutosDialog.tsx` | Modificar | Expandir interface `AIUsageInfo` + adicionar UI de chunked no preview |
| `supabase/functions/processar-autos/index.ts` | Verificar | Garantir que `aiUsage` inclui `strategy`, `partsProcessed` e `totalPages` |

---

### Resultado Esperado

Após processamento de um PDF grande (>20MB), o preview mostrará:

```text
┌────────────────────────────────────────────────────────────────┐
│ 🖥️ Inteligências Artificiais Utilizadas                       │
├────────────────────────────────────────────────────────────────┤
│  📄 Extração do PDF          │  ✨ Geração dos Resumos        │
│  mistral-ocr-latest          │  gemini-2.5-flash              │
│  Mistral OCR                 │  IA Integrada                  │
│  ⏱️ 45.2s                    │  ⏱️ 68.3s                      │
│                              │  ✓ 5 de 5 textos gerados       │
├────────────────────────────────────────────────────────────────┤
│  🧩 Processamento Chunked    [4 partes]  (800 páginas totais)  │
└────────────────────────────────────────────────────────────────┘
│  ⏱️ Tempo total: 1m 53s                                       │
└────────────────────────────────────────────────────────────────┘
```

### Benefícios

1. **Transparência total**: Usuário sabe que seu PDF foi dividido e processado em partes
2. **Rastreabilidade**: Informação visível tanto no preview quanto nos logs do DevPanel
3. **Consistência visual**: Usa o mesmo estilo roxo/purple do badge "Chunked" nos logs

