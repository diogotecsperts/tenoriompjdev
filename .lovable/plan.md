# ✅ IMPLEMENTAÇÃO CONCLUÍDA: Client-Side PDF Splitting

**Status**: Implementado e deployado em 2026-01-29

## Visão Geral

Esta solução move a lógica de divisão de PDFs grandes para o navegador do cliente, eliminando o gargalo de memória (150MB) do Supabase Edge Functions.

## Por que esta solução funciona

| Problema Atual | Solução Client-Side |
|----------------|---------------------|
| Edge Function com limite de 150MB RAM | Navegador tem GBs de RAM disponível |
| pdf-lib carrega arquivo inteiro em memória | Divisão acontece no browser antes do upload |
| Gemini falha com 800+ páginas | Cada parte terá ~50 páginas (dentro do limite de tokens) |
| Mistral falha com arquivos >50MB | Cada chunk terá max 20MB |

### Arquitetura Nova

```text
[Browser]                              [Backend]
    |                                      |
    | 1. Seleciona PDF (68MB)             |
    |                                      |
    | 2. Tamanho > 20MB?                  |
    |    SIM -> Inicia Client-Side Split  |
    |                                      |
    | 3. pdf-lib divide em partes         |
    |    (max 50 páginas ou 20MB cada)    |
    |                                      |
    | 4. Upload parte_1.pdf               |
    |    Upload parte_2.pdf              -->  Storage
    |    Upload parte_3.pdf               |
    |                                      |
    | 5. Chama Edge Function com          |
    |    array de caminhos               -->  processar-autos-partes
    |                                      |
    |                                      | 6. Processa cada parte
    |                                      |    (Gemini/Mistral por parte)
    |                                      |
    |                                      | 7. Combina resultados
    |<-- Status via polling --------------|
    |                                      |
    | 8. Preview com dados combinados     |
```

### Mudanças Técnicas

#### 1. Instalar pdf-lib no frontend

```bash
npm install pdf-lib
```

O `pdf-lib` já é usado no backend (Deno), agora será adicionado ao frontend React.

#### 2. Criar utilitário de split client-side

**Arquivo:** `src/lib/pdf-splitter.ts`

```typescript
import { PDFDocument } from 'pdf-lib';

export interface ClientSplitResult {
  parts: Blob[];
  pageRanges: { start: number; end: number }[];
  totalPages: number;
  originalSizeMB: number;
}

export interface SplitOptions {
  maxSizeBytes?: number;      // Max 20MB por parte
  maxPagesPerPart?: number;   // Max 50 páginas por parte
}

const DEFAULT_OPTIONS: Required<SplitOptions> = {
  maxSizeBytes: 20_000_000,   // 20MB
  maxPagesPerPart: 50,        // 50 páginas
};

export async function splitPDFClientSide(
  file: File,
  options: SplitOptions = {},
  onProgress?: (progress: number, message: string) => void
): Promise<ClientSplitResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSizeMB = file.size / 1024 / 1024;
  
  onProgress?.(5, 'Carregando PDF...');
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = pdfDoc.getPageCount();
  
  onProgress?.(15, `PDF carregado: ${totalPages} páginas`);
  
  // Estimar páginas por parte baseado no tamanho
  const bytesPerPage = file.size / totalPages;
  let pagesPerPart = Math.floor(opts.maxSizeBytes / bytesPerPage);
  pagesPerPart = Math.min(pagesPerPart, opts.maxPagesPerPart);
  pagesPerPart = Math.max(pagesPerPart, 10); // Mínimo 10 páginas
  
  const parts: Blob[] = [];
  const pageRanges: { start: number; end: number }[] = [];
  
  for (let startPage = 0; startPage < totalPages; startPage += pagesPerPart) {
    const endPage = Math.min(startPage + pagesPerPart, totalPages);
    const pageCount = endPage - startPage;
    
    const progress = 15 + ((startPage / totalPages) * 70);
    onProgress?.(progress, `Criando parte ${parts.length + 1}: páginas ${startPage + 1}-${endPage}`);
    
    // Criar novo documento com essas páginas
    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from({ length: pageCount }, (_, i) => startPage + i);
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    // Serializar para bytes
    const partBytes = await newPdf.save();
    const partBlob = new Blob([partBytes], { type: 'application/pdf' });
    
    parts.push(partBlob);
    pageRanges.push({ start: startPage + 1, end: endPage });
  }
  
  onProgress?.(90, `Divisão completa: ${parts.length} partes`);
  
  return {
    parts,
    pageRanges,
    totalPages,
    originalSizeMB
  };
}

export function needsClientSplit(fileSizeMB: number): boolean {
  return fileSizeMB > 20; // Threshold de 20MB
}
```

#### 3. Modificar ImportarAutosDialog.tsx

**Arquivo:** `src/components/tools/ImportarAutosDialog.tsx`

Adicionar novo estado e lógica para chunked upload:

```typescript
// Novos imports
import { splitPDFClientSide, needsClientSplit } from '@/lib/pdf-splitter';

// Novos estados
const [isSplitting, setIsSplitting] = useState(false);
const [splitProgress, setSplitProgress] = useState(0);
const [splitMessage, setSplitMessage] = useState('');
const [uploadedParts, setUploadedParts] = useState<string[]>([]);

// Nova função processFile modificada
const processFile = async () => {
  if (!selectedFile || !user) return;

  try {
    processingStartTime.current = Date.now();
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    
    // Verificar se precisa dividir client-side
    if (needsClientSplit(fileSizeMB)) {
      // === MODO CHUNKED ===
      setIsSplitting(true);
      setSplitProgress(0);
      setSplitMessage('Preparando divisão do PDF...');
      
      // Dividir no browser
      const { parts, pageRanges, totalPages } = await splitPDFClientSide(
        selectedFile,
        { maxSizeBytes: 20_000_000, maxPagesPerPart: 50 },
        (progress, message) => {
          setSplitProgress(progress);
          setSplitMessage(message);
        }
      );
      
      setIsSplitting(false);
      setProcessingStep("uploading");
      
      // Upload de cada parte
      const partPaths: string[] = [];
      const baseName = selectedFile.name.replace('.pdf', '');
      
      for (let i = 0; i < parts.length; i++) {
        setUploadProgress(Math.floor((i / parts.length) * 90));
        
        const partPath = `${user.id}/${Date.now()}-${baseName}_part_${i + 1}.pdf`;
        const { error } = await supabase.storage
          .from('processos-pdf')
          .upload(partPath, parts[i]);
        
        if (error) throw new Error(`Falha no upload da parte ${i + 1}`);
        partPaths.push(partPath);
      }
      
      setUploadProgress(100);
      setUploadedParts(partPaths);
      
      // Chamar Edge Function com array de partes
      setProcessingStep("analyzing");
      setAnalysisStep("Processando partes do documento...");
      
      const { data, error } = await supabase.functions.invoke('processar-autos', {
        body: { 
          fileName: selectedFile.name,
          fileParts: partPaths,  // NOVO: array de caminhos
          pageRanges,
          totalPages,
          isChunkedUpload: true
        }
      });
      
      if (error) throw error;
      
      // Continuar polling normalmente...
      const jobId = data.jobId;
      setCurrentJobId(jobId);
      // ... resto do polling igual
      
    } else {
      // === MODO NORMAL (arquivo pequeno) ===
      // ... código atual sem mudanças
    }
    
  } catch (error) {
    // ... tratamento de erro
  }
};
```

#### 4. Adicionar UI de splitting

No JSX do modal, adicionar indicador visual do split:

```tsx
{isSplitting && (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <Layers className="h-5 w-5 animate-pulse text-primary" />
      <span className="font-medium">Dividindo PDF grande...</span>
    </div>
    <Progress value={splitProgress} />
    <p className="text-sm text-muted-foreground">{splitMessage}</p>
  </div>
)}
```

#### 5. Modificar Edge Function para aceitar partes

**Arquivo:** `supabase/functions/processar-autos/index.ts`

Adicionar lógica para processar partes separadamente:

```typescript
// No handler principal, verificar se é chunked upload
const { fileName, filePath, fileParts, pageRanges, totalPages, isChunkedUpload } = await req.json();

if (isChunkedUpload && fileParts?.length > 0) {
  // Processar cada parte separadamente
  const partResults: any[] = [];
  
  for (let i = 0; i < fileParts.length; i++) {
    await supabaseAdmin.from('import_jobs').update({
      current_step: `Processando parte ${i + 1}/${fileParts.length}...`,
      progress: Math.floor((i / fileParts.length) * 60),
      updated_at: new Date().toISOString()
    }).eq('id', jobId);
    
    // Download da parte
    const { data: partData } = await supabaseAdmin.storage
      .from('processos-pdf')
      .download(fileParts[i]);
    
    const partBytes = new Uint8Array(await partData.arrayBuffer());
    
    // Processar com Mistral OCR (dentro do limite de 20MB)
    const partResult = await extractWithMistralOCR(partBytes, mistralKey);
    partResults.push(partResult.text);
  }
  
  // Combinar textos
  const combinedText = partResults.join('\n\n--- PARTE ---\n\n');
  
  // Estruturar dados combinados
  const fillResult = await callAI(
    aiConfig,
    systemPrompt,
    `Analise o texto extraído de ${fileParts.length} partes:\n\n${combinedText}`,
    { promptType: 'chunked_import', userId, maxOutputTokens: 65536, jsonMode: true }
  );
  
  // Continuar com parseamento e geração de resumos...
  
} else {
  // Fluxo normal para arquivo único
  // ... código atual
}
```

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `package.json` | Modificar | Adicionar `pdf-lib` às dependencies |
| `src/lib/pdf-splitter.ts` | Criar | Utilitário de split client-side |
| `src/components/tools/ImportarAutosDialog.tsx` | Modificar | Adicionar lógica de chunked upload |
| `supabase/functions/processar-autos/index.ts` | Modificar | Aceitar array de partes e processar |

### Fluxo de Processamento Final

| Tamanho PDF | Fluxo |
|-------------|-------|
| < 20MB | Upload direto -> Gemini/Mistral (normal) |
| 20MB - 200MB | Split client-side -> Upload partes -> Mistral por parte -> Combinar |
| > 200MB | Erro amigável (limite prático) |

### Vantagens desta Implementação

1. **Zero custo de infraestrutura**: Usa recursos do browser do cliente
2. **Escalabilidade**: Cada usuário usa sua própria máquina
3. **Elimina OOM no backend**: Partes de 20MB cabem folgado no Edge Function
4. **Dentro dos limites de IA**: 50 páginas por parte evita saturação de tokens
5. **UX transparente**: Barra de progresso mostra cada etapa

### Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Browser travar com PDF muito grande | Usar Web Worker para não bloquear UI |
| Upload falhar no meio | Implementar retry por parte |
| Usuário fechar aba durante split | Avisar que está processando localmente |

