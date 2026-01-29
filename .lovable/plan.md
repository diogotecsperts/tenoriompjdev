

## Plano: UX e Logs para Client-Side PDF Splitting

### Status Final

| Funcionalidade | Status |
|---------------|--------|
| Filtro `chunked_import` na aba Logs de IA | ✅ Implementado |
| Badge `Chunked` na aba Logs de Backend | ✅ Implementado |
| Indicador de partes processadas no Preview | ✅ Implementado |
| Detalhes das partes durante splitting | ✅ Implementado |
| Indicador de upload por parte | ✅ Implementado |

### Mudanças Realizadas

#### Frontend (`src/components/tools/ImportarAutosDialog.tsx`)

1. **Interface `AIUsageInfo` expandida** com campos:
   - `strategy?: 'single_pass' | 'two_phase' | 'client_side_split'`
   - `partsProcessed?: number`
   - `totalPages?: number`

2. **Indicador visual no Preview** mostrando:
   - Badge roxo "Processamento Chunked"
   - Número de partes processadas
   - Total de páginas do documento

3. **UI de splitting aprimorada**:
   - Grid mostrando cada parte com páginas e tamanho
   - Indicador de upload por parte (enviando/enviado/pendente)

#### Backend (`supabase/functions/processar-autos/index.ts`)

1. **Objeto `aiUsage` completo** em `processarChunkedPDFBackground`:
   - `strategy: 'client_side_split'`
   - `partsProcessed: fileParts.length`
   - `totalPages: totalPages`

#### DevPanel

1. **`DevAIUsageLogs.tsx`**: Filtro `chunked_import` adicionado
2. **`DevBackendLogs.tsx`**: Badge visual "Chunked" para logs relacionados

### Resultado Visual no Preview

```text
┌────────────────────────────────────────────────────────────────┐
│ 🖥️ Inteligências Artificiais Utilizadas                       │
├────────────────────────────────────────────────────────────────┤
│  📄 Extração do PDF          │  ✨ Geração dos Resumos        │
│  mistral-ocr-latest          │  gemini-2.5-flash              │
│  Mistral                     │  IA Integrada                  │
│  ⏱️ 45.2s                    │  ⏱️ 68.3s                      │
│                              │  ✓ 5 de 5 textos gerados       │
├────────────────────────────────────────────────────────────────┤
│  🧩 Processamento Chunked    [4 partes]  (800 páginas totais)  │
├────────────────────────────────────────────────────────────────┤
│  ⏱️ Tempo total: 1m 53s                                       │
└────────────────────────────────────────────────────────────────┘
```

### Arquivos Modificados

- `src/lib/pdf-splitter.ts` - Callback `onPartCreated`
- `src/components/tools/ImportarAutosDialog.tsx` - Interface + UI chunked
- `src/components/dev-panel/DevAIUsageLogs.tsx` - Filtro chunked_import
- `src/components/dev-panel/DevBackendLogs.tsx` - Badge Chunked
- `supabase/functions/processar-autos/index.ts` - `totalPages` no aiUsage
