/**
 * PDF Splitter - Divide PDFs grandes em partes menores
 * Usa pdf-lib para preservar integridade (imagens, fontes, referências)
 * 
 * Limite de memória do Worker: ~150MB
 * Target de partes: <40MB cada para processamento seguro via Gemini
 */

import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

export interface SplitResult {
  parts: Uint8Array[];
  pageRanges: { start: number; end: number }[];
  totalPages: number;
  originalSizeBytes: number;
}

export interface SplitOptions {
  maxSizeBytes?: number;
  maxParts?: number;
  minPagesPerPart?: number;
}

const DEFAULT_OPTIONS: Required<SplitOptions> = {
  maxSizeBytes: 40_000_000, // 40MB por parte
  maxParts: 4, // Máximo de 4 partes (~180MB total suportado)
  minPagesPerPart: 5, // Mínimo de 5 páginas por parte
};

/**
 * Divide um PDF em partes menores
 * 
 * Usa o método `copyPages()` do pdf-lib que preserva:
 * - Todas as referências internas
 * - Imagens embutidas
 * - Fontes
 * - Objetos compartilhados
 * 
 * @param pdfBytes - Bytes do PDF original
 * @param options - Opções de split
 * @returns Array de partes do PDF com metadados
 */
export async function splitPDF(
  pdfBytes: Uint8Array,
  options: SplitOptions = {}
): Promise<SplitResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSizeBytes = pdfBytes.byteLength;
  
  console.log(`[pdf-splitter] Loading PDF (${(originalSizeBytes / 1024 / 1024).toFixed(2)}MB)...`);
  
  // Carregar PDF original
  const originalPdf = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true, // Tenta ignorar criptografia se houver
  });
  const totalPages = originalPdf.getPageCount();
  
  // Se PDF é pequeno, não dividir
  if (originalSizeBytes <= opts.maxSizeBytes) {
    console.log(`[pdf-splitter] PDF is under ${opts.maxSizeBytes / 1024 / 1024}MB, no split needed`);
    return {
      parts: [pdfBytes],
      pageRanges: [{ start: 1, end: totalPages }],
      totalPages,
      originalSizeBytes,
    };
  }
  
  // Estimar páginas por parte baseado no tamanho
  const bytesPerPage = originalSizeBytes / totalPages;
  let pagesPerPart = Math.floor(opts.maxSizeBytes / bytesPerPage);
  
  // Garantir mínimo de páginas
  pagesPerPart = Math.max(pagesPerPart, opts.minPagesPerPart);
  
  // Calcular número estimado de partes
  const estimatedParts = Math.ceil(totalPages / pagesPerPart);
  
  console.log(`[pdf-splitter] Total pages: ${totalPages}, bytesPerPage: ${(bytesPerPage / 1024).toFixed(0)}KB, pagesPerPart: ${pagesPerPart}`);
  console.log(`[pdf-splitter] Estimated parts: ${estimatedParts}`);
  
  // Verificar se não excede o limite de partes
  if (estimatedParts > opts.maxParts) {
    throw new Error(
      `PDF muito grande: ${estimatedParts} partes seriam necessárias (máximo: ${opts.maxParts}). ` +
      `Considere dividir o arquivo manualmente antes do upload.`
    );
  }
  
  const parts: Uint8Array[] = [];
  const pageRanges: { start: number; end: number }[] = [];
  
  for (let startPage = 0; startPage < totalPages; startPage += pagesPerPart) {
    const endPage = Math.min(startPage + pagesPerPart, totalPages);
    const pageCount = endPage - startPage;
    
    console.log(`[pdf-splitter] Creating part ${parts.length + 1}: pages ${startPage + 1}-${endPage} (${pageCount} pages)`);
    
    // Criar novo documento
    const newPdf = await PDFDocument.create();
    
    // Copiar páginas (preserva todas as referências)
    const pageIndices = Array.from({ length: pageCount }, (_, i) => startPage + i);
    const copiedPages = await newPdf.copyPages(originalPdf, pageIndices);
    
    // Adicionar páginas ao novo documento
    copiedPages.forEach(page => newPdf.addPage(page));
    
    // Serializar para bytes
    const partBytes = await newPdf.save({
      useObjectStreams: true, // Otimização de compressão
    });
    
    parts.push(partBytes);
    pageRanges.push({ start: startPage + 1, end: endPage }); // 1-indexed para display
    
    const partSizeMB = (partBytes.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[pdf-splitter] Part ${parts.length} created: ${partSizeMB}MB`);
    
    // Verificar se a parte ficou maior que o esperado (páginas com muitas imagens)
    if (partBytes.byteLength > opts.maxSizeBytes * 1.2) {
      console.warn(`[pdf-splitter] Part ${parts.length} is larger than expected (${partSizeMB}MB). Consider reducing pages per part.`);
    }
  }
  
  const totalSplitSize = parts.reduce((acc, p) => acc + p.byteLength, 0);
  console.log(`[pdf-splitter] Split complete: ${parts.length} parts, total ${(totalSplitSize / 1024 / 1024).toFixed(2)}MB (original: ${(originalSizeBytes / 1024 / 1024).toFixed(2)}MB)`);
  
  return {
    parts,
    pageRanges,
    totalPages,
    originalSizeBytes,
  };
}

/**
 * Verifica se um PDF precisa ser dividido baseado no tamanho
 */
export function needsSplit(pdfSizeBytes: number, threshold: number = 45_000_000): boolean {
  return pdfSizeBytes > threshold;
}

/**
 * Estima quantas partes serão necessárias para um PDF
 */
export function estimateParts(
  pdfSizeBytes: number,
  pageCount: number,
  maxSizeBytes: number = 40_000_000
): number {
  if (pdfSizeBytes <= maxSizeBytes) return 1;
  
  const bytesPerPage = pdfSizeBytes / pageCount;
  const pagesPerPart = Math.floor(maxSizeBytes / bytesPerPage);
  
  return Math.ceil(pageCount / pagesPerPart);
}
