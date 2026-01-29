
## Plano: Melhorias de UX e Logs para Client-Side PDF Splitting

### Descobertas da Análise

#### 1. Status do Client-Side Splitting
O Client-Side PDF Splitting já está implementado e funciona **independente da estratégia de importação** (Passagem Única ou Duas Fases):

```text
Frontend (PDF > 20MB):
  └── splitPDFClientSide() 
  └── Upload das partes
  └── Chama processar-autos com isChunkedUpload: true

Backend:
  └── Se isChunkedUpload === true:
      └── processarChunkedPDFBackground()  ← SEMPRE Mistral OCR + AI Config para estruturação
  └── Senão:
      └── processarPDFBackground()
          └── Verifica import_strategy → single_pass ou two_phase
```

**Conclusão**: O chunked upload é uma camada de **ingestão** que transforma arquivos grandes em menores. Depois da ingestão, a lógica de IA configurada no DevPanel é respeitada para a estruturação dos dados.

#### 2. Gaps Identificados
- UI de splitting mostra apenas progresso geral, não mostra quantas partes foram criadas nem tamanho de cada uma
- DevPanel não tem filtro específico para logs de processamento chunked
- `ai_usage_logs` não tem coluna para identificar se veio de processamento chunked

---

### Mudanças Propostas

#### A. Melhorias no Modal de Importação (`ImportarAutosDialog.tsx`)

**1. Indicador Visual Detalhado durante Splitting**

Adicionar estado para armazenar detalhes das partes criadas:
```typescript
interface PartInfo {
  partNumber: number;
  pageRange: { start: number; end: number };
  sizeMB: number;
}

const [splitParts, setSplitParts] = useState<PartInfo[]>([]);
```

Modificar a chamada de `splitPDFClientSide` para popular esse estado.

**2. UI de Splitting Melhorada**

Substituir o indicador simples por um card com:
- Total de partes sendo criadas
- Lista das partes com páginas e tamanho
- Barra de progresso por parte
- Estimativa de tempo restante

```tsx
{isSplitting && (
  <div className="space-y-4 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Scissors className="h-5 w-5 animate-pulse text-primary" />
        <span className="font-medium">Dividindo PDF grande...</span>
      </div>
      <Badge variant="outline">{splitParts.length} partes</Badge>
    </div>
    
    <Progress value={splitProgress} />
    <p className="text-sm text-muted-foreground">{splitMessage}</p>
    
    {/* Detalhes das partes */}
    {splitParts.length > 0 && (
      <div className="grid grid-cols-2 gap-2 mt-3">
        {splitParts.map((part) => (
          <div key={part.partNumber} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>Parte {part.partNumber}</span>
            <span className="text-muted-foreground">
              págs {part.pageRange.start}-{part.pageRange.end}
            </span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {part.sizeMB.toFixed(1)}MB
            </Badge>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

**3. Indicador no Preview de Resultado**

Quando o processamento chunked concluir, mostrar informações sobre:
- Quantas partes foram processadas
- Total de páginas
- Que usou Mistral OCR + estratégia client-side split

Já existe parcialmente em `aiUsage.pdfExtraction.strategy === 'client_side_split'`, expandir para UI.

---

#### B. Melhorias no DevPanel (Logs Backend)

**1. Novo filtro "chunked_import" em `DevAIUsageLogs.tsx`**

Adicionar opção de filtro por `prompt_type`:
```tsx
<SelectItem value="chunked_import">Importação Chunked</SelectItem>
```

**2. Badge visual para logs chunked em `DevBackendLogs.tsx`**

Quando a mensagem contiver "chunked" ou job_id de um import chunked, destacar visualmente:
```tsx
{log.message.toLowerCase().includes('chunked') && (
  <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">
    <Layers className="h-3 w-3 mr-1" />
    Chunked
  </Badge>
)}
```

**3. Adicionar coluna metadata nos logs para mostrar partsCount**

Quando o backend logar info chunked, já inclui `partsProcessed`. Garantir que o DevBackendLogs exiba essa informação expandida.

---

#### C. Sincronização com Configurações do DevPanel

O processamento chunked já está sincronizado corretamente:

| Etapa | Configuração Usada |
|-------|-------------------|
| OCR das partes | `mistral-ocr-latest` (hardcoded - necessário pois Gemini não suporta uploads > 20MB individuais) |
| Estruturação (callAI) | `getAIConfig()` → Respeita provider/model do DevPanel |
| Geração de resumos | `gerarResumosIA()` → Usa `getAIConfig()` do DevPanel |

**Não há inconsistência** - o chunked mode usa Mistral apenas para OCR (extração de texto), e depois usa as configurações globais de IA para o preenchimento e resumos.

---

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/lib/pdf-splitter.ts` | Modificar | Retornar info de cada parte (sizeMB) no callback |
| `src/components/tools/ImportarAutosDialog.tsx` | Modificar | Adicionar estado e UI para mostrar partes durante split e no preview |
| `src/components/dev-panel/DevAIUsageLogs.tsx` | Modificar | Adicionar filtro `chunked_import` |
| `src/components/dev-panel/DevBackendLogs.tsx` | Modificar | Adicionar badge visual para logs chunked |

---

### Detalhes Técnicos

#### Modificação em `src/lib/pdf-splitter.ts`

Adicionar interface para callback com informações de partes:
```typescript
export interface PartCreatedInfo {
  partNumber: number;
  pageRange: { start: number; end: number };
  sizeMB: number;
}

export async function splitPDFClientSide(
  file: File,
  options: SplitOptions = {},
  onProgress?: (progress: number, message: string) => void,
  onPartCreated?: (info: PartCreatedInfo) => void  // NOVO
): Promise<ClientSplitResult> {
  // ... ao criar cada parte:
  onPartCreated?.({
    partNumber: parts.length,
    pageRange: { start: startPage + 1, end: endPage },
    sizeMB: partBytes.byteLength / 1024 / 1024
  });
}
```

#### Modificação em `ImportarAutosDialog.tsx`

```typescript
// Novo estado
const [splitParts, setSplitParts] = useState<Array<{
  partNumber: number;
  pageRange: { start: number; end: number };
  sizeMB: number;
}>>([]);

// Na chamada de splitPDFClientSide:
const { parts, pageRanges, totalPages } = await splitPDFClientSide(
  selectedFile,
  { maxSizeBytes: 20_000_000, maxPagesPerPart: 50 },
  (progress, message) => {
    setSplitProgress(progress);
    setSplitMessage(message);
  },
  (partInfo) => {
    setSplitParts(prev => [...prev, partInfo]);
  }
);

// Resetar ao iniciar novo split
setSplitParts([]);
```

#### UI de Upload com Indicador de Partes

Durante o upload das partes, mostrar qual parte está sendo enviada:
```tsx
{processingStep === "uploading" && splitParts.length > 0 && (
  <div className="space-y-2 mt-3">
    <p className="text-xs text-muted-foreground">
      Enviando partes para o servidor...
    </p>
    {splitParts.map((part, idx) => (
      <div key={idx} className="flex items-center gap-2 text-xs">
        {idx < currentUploadingPart ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : idx === currentUploadingPart ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : (
          <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
        )}
        <span>Parte {part.partNumber}: {part.sizeMB.toFixed(1)}MB</span>
      </div>
    ))}
  </div>
)}
```

---

### Resultado Esperado

1. **Durante o Split**: Usuário vê cada parte sendo criada com páginas e tamanho
2. **Durante o Upload**: Usuário vê progresso por parte
3. **No Preview**: Mostra que usou processamento chunked, quantas partes, provider de OCR
4. **No DevPanel**: Logs de chunked destacados visualmente, filtráveis

### Benefícios

- Transparência total sobre o processo de divisão
- UX moderna e informativa sem sobrecarregar
- DevPanel alinhado com novo tipo de processamento
- Manutenção do padrão visual existente
