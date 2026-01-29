/**
 * Mistral OCR - Cliente para extração de texto via Mistral AI OCR API
 * 
 * Características:
 * - Precisão: ~94.9% (elite para tabelas, fórmulas, documentos escaneados)
 * - Custo: ~$1.00 por 1.000 páginas
 * - Limite: 50MB por arquivo, 1.000 páginas
 * - Output: Markdown estruturado
 * 
 * Usar como fallback quando Gemini falhar ou como alternativa para
 * documentos complexos com tabelas e imagens.
 */

const MISTRAL_FILES_URL = 'https://api.mistral.ai/v1/files';
const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';

export interface MistralOCRResult {
  text: string;
  pageCount: number;
  provider: 'mistral-ocr';
  model: 'mistral-ocr-latest';
  processingTimeMs: number;
}

export interface MistralOCROptions {
  includeImageBase64?: boolean;
  pageLimit?: number;
}

/**
 * Extrai texto de um PDF usando Mistral OCR API
 * 
 * Processo:
 * 1. Upload do arquivo para Mistral Files API
 * 2. Chamada do endpoint OCR com file_id
 * 3. Combinação dos textos de todas as páginas
 * 4. Limpeza do arquivo temporário
 * 
 * @param pdfBytes - Bytes do PDF
 * @param apiKey - Chave de API do Mistral
 * @param options - Opções de extração
 * @returns Resultado da extração OCR
 */
export async function extractWithMistralOCR(
  pdfBytes: Uint8Array,
  apiKey: string,
  options: MistralOCROptions = {}
): Promise<MistralOCRResult> {
  const startTime = Date.now();
  const sizeMB = (pdfBytes.byteLength / 1024 / 1024).toFixed(2);
  
  console.log(`[mistral-ocr] Starting extraction (${sizeMB}MB)...`);
  
  // Validar tamanho (limite Mistral: 50MB)
  if (pdfBytes.byteLength > 50_000_000) {
    throw new Error(`Arquivo muito grande para Mistral OCR: ${sizeMB}MB (limite: 50MB)`);
  }
  
  let fileId: string | null = null;
  
  try {
    // STEP 1: Upload do arquivo para Mistral Files API
    console.log('[mistral-ocr] Uploading file to Mistral Files API...');
    
    const formData = new FormData();
    // Create new ArrayBuffer copy to ensure Blob compatibility
    const buffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(buffer).set(pdfBytes);
    formData.append('file', new Blob([buffer], { type: 'application/pdf' }), 'document.pdf');
    formData.append('purpose', 'ocr');
    
    const uploadResponse = await fetch(MISTRAL_FILES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Mistral upload failed (${uploadResponse.status}): ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    fileId = uploadResult.id;
    
    console.log(`[mistral-ocr] File uploaded successfully: ${fileId}`);
    
    // STEP 2: Chamar endpoint OCR
    console.log('[mistral-ocr] Calling OCR endpoint...');
    
    const ocrPayload: Record<string, unknown> = {
      model: 'mistral-ocr-latest',
      document: {
        type: 'file_id',
        file_id: fileId,
      },
      include_image_base64: options.includeImageBase64 ?? false,
    };
    
    // Adicionar limite de páginas se especificado
    if (options.pageLimit && options.pageLimit > 0) {
      ocrPayload.pages = Array.from({ length: options.pageLimit }, (_, i) => i);
    }
    
    const ocrResponse = await fetch(MISTRAL_OCR_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ocrPayload),
    });
    
    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      throw new Error(`Mistral OCR failed (${ocrResponse.status}): ${errorText}`);
    }
    
    const ocrResult = await ocrResponse.json();
    
    // STEP 3: Combinar textos de todas as páginas
    const pages = ocrResult.pages || [];
    const pageCount = pages.length;
    
    console.log(`[mistral-ocr] OCR complete: ${pageCount} pages extracted`);
    
    // Formatar texto com separadores de página
    const combinedText = pages
      .map((page: { index?: number; markdown?: string }, i: number) => {
        const pageNum = page.index !== undefined ? page.index + 1 : i + 1;
        const content = page.markdown || '';
        return `=== PÁGINA ${pageNum} ===\n${content}`;
      })
      .join('\n\n');
    
    const processingTimeMs = Date.now() - startTime;
    
    console.log(`[mistral-ocr] Extraction complete in ${processingTimeMs}ms, ${combinedText.length} chars`);
    
    return {
      text: combinedText,
      pageCount,
      provider: 'mistral-ocr',
      model: 'mistral-ocr-latest',
      processingTimeMs,
    };
    
  } finally {
    // STEP 4: Limpar arquivo temporário
    if (fileId) {
      try {
        await deleteMistralFile(fileId, apiKey);
        console.log('[mistral-ocr] Temporary file deleted');
      } catch (cleanupError) {
        console.warn('[mistral-ocr] Failed to delete temporary file:', cleanupError);
        // Não lançar erro - limpeza não é crítica
      }
    }
  }
}

/**
 * Deletar arquivo da Mistral Files API
 */
async function deleteMistralFile(fileId: string, apiKey: string): Promise<void> {
  const response = await fetch(`${MISTRAL_FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete Mistral file (${response.status}): ${errorText}`);
  }
}

/**
 * Verificar se a chave Mistral está configurada
 */
export async function hasMistralAPIKey(): Promise<boolean> {
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  return !!apiKey && apiKey.length > 0;
}

/**
 * Obter chave Mistral do ambiente
 */
export function getMistralAPIKey(): string | null {
  return Deno.env.get('MISTRAL_API_KEY') || null;
}
