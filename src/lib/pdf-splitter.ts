/**
 * Client-Side PDF Splitter
 * 
 * Divide PDFs grandes em partes menores no navegador do cliente,
 * evitando limites de memória do backend (150MB Edge Functions)
 * e limites de tokens das APIs de IA.
 * 
 * Usa pdf-lib para preservar integridade (imagens, fontes, referências)
 */

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

export interface PartCreatedInfo {
  partNumber: number;
  pageRange: { start: number; end: number };
  sizeMB: number;
}

const DEFAULT_OPTIONS: Required<SplitOptions> = {
  maxSizeBytes: 20_000_000,   // 20MB
  maxPagesPerPart: 50,        // 50 páginas
};

/**
 * Divide um PDF em partes menores no navegador do cliente
 * 
 * @param file - Arquivo PDF selecionado pelo usuário
 * @param options - Opções de divisão
 * @param onProgress - Callback para atualizar progresso
 * @returns Array de blobs com as partes do PDF
 */
export async function splitPDFClientSide(
  file: File,
  options: SplitOptions = {},
  onProgress?: (progress: number, message: string) => void,
  onPartCreated?: (info: PartCreatedInfo) => void
): Promise<ClientSplitResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSizeMB = file.size / 1024 / 1024;
  
  console.log(`[pdf-splitter] Starting client-side split for ${file.name} (${originalSizeMB.toFixed(2)}MB)`);
  
  onProgress?.(5, 'Carregando PDF no navegador...');
  
  // Carregar o PDF na memória do browser
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true // Tenta ignorar criptografia se houver
  });
  const totalPages = pdfDoc.getPageCount();
  
  console.log(`[pdf-splitter] PDF loaded: ${totalPages} pages, ${originalSizeMB.toFixed(2)}MB`);
  onProgress?.(15, `PDF carregado: ${totalPages} páginas`);
  
  // Estimar páginas por parte baseado no tamanho
  const bytesPerPage = file.size / totalPages;
  let pagesPerPart = Math.floor(opts.maxSizeBytes / bytesPerPage);
  
  // Aplicar limites
  pagesPerPart = Math.min(pagesPerPart, opts.maxPagesPerPart);
  pagesPerPart = Math.max(pagesPerPart, 10); // Mínimo 10 páginas por parte
  
  const estimatedParts = Math.ceil(totalPages / pagesPerPart);
  console.log(`[pdf-splitter] Will create ~${estimatedParts} parts (${pagesPerPart} pages each)`);
  
  const parts: Blob[] = [];
  const pageRanges: { start: number; end: number }[] = [];
  
  for (let startPage = 0; startPage < totalPages; startPage += pagesPerPart) {
    const endPage = Math.min(startPage + pagesPerPart, totalPages);
    const pageCount = endPage - startPage;
    
    // Calcular progresso (15% a 85% é a fase de splitting)
    const progress = 15 + ((startPage / totalPages) * 70);
    const partNumber = parts.length + 1;
    onProgress?.(progress, `Criando parte ${partNumber}: páginas ${startPage + 1}-${endPage}`);
    
    console.log(`[pdf-splitter] Creating part ${partNumber}: pages ${startPage + 1}-${endPage}`);
    
    // Criar novo documento com essas páginas
    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from({ length: pageCount }, (_, i) => startPage + i);
    
    // copyPages preserva todas as referências internas (imagens, fontes, etc.)
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    // Serializar para bytes com compressão otimizada
    const partBytes = await newPdf.save({
      useObjectStreams: true // Otimização de compressão
    });
    
    // Converter para Blob - cria cópia do ArrayBuffer para compatibilidade
    const buffer = new ArrayBuffer(partBytes.byteLength);
    new Uint8Array(buffer).set(partBytes);
    const partBlob = new Blob([buffer], { type: 'application/pdf' });
    
    parts.push(partBlob);
    pageRanges.push({ start: startPage + 1, end: endPage }); // 1-indexed para display
    
    const partSizeMB = partBytes.byteLength / 1024 / 1024;
    console.log(`[pdf-splitter] Part ${partNumber} created: ${partSizeMB.toFixed(2)}MB (${pageCount} pages)`);
    
    // Notify callback about the created part
    onPartCreated?.({
      partNumber,
      pageRange: { start: startPage + 1, end: endPage },
      sizeMB: partSizeMB
    });
  }
  
  onProgress?.(90, `Divisão completa: ${parts.length} partes`);
  
  const totalSplitSize = parts.reduce((acc, p) => acc + p.size, 0);
  console.log(`[pdf-splitter] Split complete: ${parts.length} parts, total ${(totalSplitSize / 1024 / 1024).toFixed(2)}MB`);
  
  return {
    parts,
    pageRanges,
    totalPages,
    originalSizeMB
  };
}

/**
 * Verifica se um arquivo precisa de split client-side
 * 
 * @param fileSizeMB - Tamanho do arquivo em MB
 * @returns true se o arquivo deve ser dividido no cliente
 */
export function needsClientSplit(fileSizeMB: number): boolean {
  // Threshold de 20MB - arquivos maiores serão divididos
  return fileSizeMB > 20;
}

/**
 * Estima quantas partes serão necessárias para um PDF
 * 
 * @param fileSizeBytes - Tamanho do arquivo em bytes
 * @param pageCount - Número estimado de páginas (opcional)
 * @returns Número estimado de partes
 */
export function estimatePartsCount(
  fileSizeBytes: number,
  pageCount?: number
): number {
  const maxSizeBytes = DEFAULT_OPTIONS.maxSizeBytes;
  
  if (fileSizeBytes <= maxSizeBytes) return 1;
  
  if (pageCount) {
    const bytesPerPage = fileSizeBytes / pageCount;
    const pagesPerPart = Math.min(
      Math.floor(maxSizeBytes / bytesPerPage),
      DEFAULT_OPTIONS.maxPagesPerPart
    );
    return Math.ceil(pageCount / pagesPerPart);
  }
  
  // Estimativa sem contagem de páginas
  return Math.ceil(fileSizeBytes / maxSizeBytes);
}
