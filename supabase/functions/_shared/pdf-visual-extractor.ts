import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

export interface ExtractedContent {
  rawText: string;
  pageCount: number;
  estimatedSections: string[];
  extractedAt: string;
  model: string;
  provider: string;
}

// Mapeamento de nomes amigáveis do DevPanel para nomes estáveis da API Gemini
// IMPORTANTE: Sincronizado com test-ai-connection/index.ts
const GEMINI_MODEL_MAP: Record<string, string> = {
  // Gemini 3.x — modelos reais da API Gemini atual
  'gemini-3-pro-preview': 'gemini-3-pro-preview',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  // Gemini 2.5 - aliases estáveis
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.5-flash-8b': 'gemini-2.5-flash-8b',
  // Gemini 2.0 (estáveis)
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
  // Gemini 1.5 (estáveis)
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
};

/**
 * Resolve o nome do modelo para o nome aceito pela API Gemini
 */
function resolveGeminiModelName(model: string): string {
  const resolved = GEMINI_MODEL_MAP[model] || model;
  if (resolved !== model) {
    console.log(`[pdf-visual-extractor] Model mapping: ${model} → ${resolved}`);
  }
  return resolved;
}

function shouldUseGeminiInteractionsAPI(apiModel: string): boolean {
  return /^gemini-3(?:\.|-|$)/.test(apiModel) || apiModel === 'gemini-3.5-flash';
}

function sanitizeGeminiError(raw: string, max = 1600): string {
  return raw
    .replace(/key=AIza[\w-]+/gi, 'key=[redacted]')
    .replace(/x-goog-api-key["'\s:=]+[A-Za-z0-9._\-]+/gi, 'x-goog-api-key=[redacted]')
    .slice(0, max);
}

function extractTextFromInteraction(data: any): string {
  const chunks: string[] = [];

  const visitContent = (content: any) => {
    if (!content) return;
    if (typeof content === 'string') chunks.push(content);
    if (typeof content?.text === 'string') chunks.push(content.text);
    if (Array.isArray(content)) content.forEach(visitContent);
  };

  if (typeof data?.output_text === 'string') chunks.push(data.output_text);
  if (Array.isArray(data?.outputs)) data.outputs.forEach(visitContent);
  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      if (step?.type === 'model_output' || step?.type === 'output' || !step?.type) {
        visitContent(step?.content);
      }
    }
  }

  return chunks.join('').trim();
}

// Prompt otimizado para extração de texto bruto (OCR)
const EXTRACTION_PROMPT = `Você é um sistema de OCR especializado. Extraia TODO o conteúdo textual deste documento PDF.

INSTRUÇÕES CRÍTICAS:
1. Transcreva TODO o texto de TODAS as páginas
2. Transcreva texto contido em IMAGENS (laudos escaneados, atestados, carimbos)
3. Preserve tabelas com formatação simples (use | para separar colunas)
4. NÃO resuma, NÃO interprete, NÃO omita nada
5. Separe páginas com: === PÁGINA X ===

Retorne um JSON com a estrutura:
{
  "rawText": "texto completo de todas as páginas...",
  "pageCount": número_total_de_páginas,
  "estimatedSections": ["PETIÇÃO INICIAL", "CONTESTAÇÃO", "QUESITOS DO JUÍZO", etc]
}

IMPORTANTE: estimatedSections deve listar as seções principais detectadas no documento para facilitar navegação posterior.`;

// Stream input type for memory-efficient processing
export interface StreamInput {
  stream: ReadableStream<Uint8Array>;
  size: number;
}

/**
 * Gera variantes de URI HTTPS completas para tentar (com e sem /v1beta)
 * A API pode aceitar diferentes formatos dependendo da versão
 */
function getFileUriVariants(fileUri: string): string[] {
  const variants: string[] = [fileUri]; // Original primeiro
  
  // Se tem /v1beta/, adicionar variante sem /v1beta/
  if (fileUri.includes('/v1beta/files/')) {
    const withoutV1beta = fileUri.replace('/v1beta/files/', '/files/');
    variants.push(withoutV1beta);
  }
  // Se não tem /v1beta/, adicionar variante com /v1beta/
  else if (fileUri.includes('googleapis.com/files/') && !fileUri.includes('/v1beta/')) {
    const withV1beta = fileUri.replace('/files/', '/v1beta/files/');
    variants.push(withV1beta);
  }
  
  return variants;
}

/**
 * Helper resiliente para chamar generateContent com arquivo via Files API
 * IMPORTANTE: Usa apenas URIs HTTPS completas (nunca formato curto files/ID)
 * Tenta múltiplos formatos de payload para compatibilidade com variações da API
 */
async function callGeminiGenerateContentWithFile(
  apiKey: string,
  apiModel: string,
  fileUri: string,
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
  // Mantém a chamada abaixo do timeout de gateway (~150s). Sem isso o cliente
  // recebe apenas "Edge Function returned a non-2xx status code", sem causa real.
  const OCR_GENERATE_TIMEOUT_MS = 105_000;
  
  // Gerar variantes de URI HTTPS completas (nunca usar formato curto!)
  const uriVariants = getFileUriVariants(fileUri);
  console.log(`[pdf-visual-extractor] URI variants to try: ${uriVariants.join(', ')}`);
  
  // Configurações base de geração (alinhado com callGeminiVision que funciona)
  const generationConfig = {
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 65536,
    responseMimeType: "application/json",
  };

  // Definir as tentativas em ordem (SEM URIs curtas!)
  const attempts: Array<{
    name: string;
    payload: object;
  }> = [];
  
  // Para cada variante de URI, tentar camelCase e snake_case
  for (let i = 0; i < uriVariants.length; i++) {
    const uri = uriVariants[i];
    const variantLabel = i === 0 ? 'original' : `variant${i}`;
    
    // Tentativa com camelCase (fileData)
    attempts.push({
      name: `A${i + 1}-camelCase-${variantLabel}`,
      payload: {
        contents: [{
          parts: [
            { fileData: { fileUri: uri, mimeType: 'application/pdf' } },
            { text: prompt }
          ]
        }],
        generationConfig
      }
    });
    
    // Tentativa com snake_case (file_data)
    attempts.push({
      name: `C${i + 1}-snake_case-${variantLabel}`,
      payload: {
        contents: [{
          parts: [
            { file_data: { file_uri: uri, mime_type: 'application/pdf' } },
            { text: prompt }
          ]
        }],
        generationConfig
      }
    });
  }

  let lastError = '';
  
  for (const attempt of attempts) {
    console.log(`[pdf-visual-extractor] Trying ${attempt.name} with model: ${apiModel}`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OCR_GENERATE_TIMEOUT_MS);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const responseText = await response.text();
      
      if (response.ok) {
        console.log(`[pdf-visual-extractor] SUCCESS with ${attempt.name}`);
        try {
          const data = JSON.parse(responseText);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return { ok: true, text };
        } catch (parseErr) {
          console.error(`[pdf-visual-extractor] ${attempt.name} - Failed to parse response JSON:`, parseErr);
          return { ok: false, error: `Parse error: ${parseErr}` };
        }
      }
      
      // Check if it's an INVALID_ARGUMENT error (retry-able with next format)
      const isInvalidArgument = response.status === 400 && 
        (responseText.includes('INVALID_ARGUMENT') || responseText.toLowerCase().includes('invalid argument'));
      
      if (isInvalidArgument) {
        console.warn(`[pdf-visual-extractor] ${attempt.name} failed with INVALID_ARGUMENT (400), trying next format...`);
        console.warn(`[pdf-visual-extractor] Response: ${responseText.substring(0, 500)}`);
        lastError = `${attempt.name}: ${responseText.substring(0, 300)}`;
        continue; // Try next format
      }
      
      // For other errors (401, 403, 429, 5xx), don't retry - return immediately
      console.error(`[pdf-visual-extractor] ${attempt.name} failed with non-retryable error (${response.status})`);
      console.error(`[pdf-visual-extractor] Response: ${responseText.substring(0, 1000)}`);
      return { ok: false, error: `HTTP ${response.status}: ${responseText}` };
      
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        const timeoutMsg = `Gemini OCR timeout after ${Math.round(OCR_GENERATE_TIMEOUT_MS / 1000)}s (model=${apiModel}, payload=${attempt.name}). Documento provavelmente grande/demorado demais para processamento síncrono.`;
        console.error(`[pdf-visual-extractor] ${timeoutMsg}`);
        return { ok: false, error: timeoutMsg };
      }
      console.error(`[pdf-visual-extractor] ${attempt.name} fetch error:`, fetchErr);
      lastError = `${attempt.name}: ${fetchErr}`;
      // Network errors are retry-able
      continue;
    }
  }
  
  // All attempts failed
  console.error(`[pdf-visual-extractor] All ${attempts.length} payload attempts failed. Last error: ${lastError}`);
  return { ok: false, error: `All attempts failed. Last: ${lastError}` };
}

async function callGeminiInteractionsWithFile(
  apiKey: string,
  apiModel: string,
  fileUri: string,
  prompt: string
): Promise<{ ok: true; text: string; interactionId?: string } | { ok: false; error: string; interactionId?: string }> {
  const createUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const headers = {
    'x-goog-api-key': apiKey,
    'Content-Type': 'application/json',
    'Api-Revision': '2026-05-20',
  };

  const payload = {
    model: apiModel,
    input: [
      { type: 'document', uri: fileUri, mime_type: 'application/pdf' },
      { type: 'text', text: prompt },
    ],
    system_instruction: 'Você é um sistema de OCR especializado. Extraia texto de documentos PDF de forma fiel, completa e sem inventar dados.',
    generation_config: {
      temperature: 0.1,
      max_output_tokens: 65536,
      response_mime_type: 'application/json',
    },
    background: true,
  };

  console.log(`[pdf-visual-extractor] Creating Gemini background interaction with model: ${apiModel}`);
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const createText = await createResponse.text();

  if (!createResponse.ok) {
    return { ok: false, error: `Interactions create failed (${createResponse.status}): ${sanitizeGeminiError(createText)}` };
  }

  let interaction: any;
  try {
    interaction = JSON.parse(createText);
  } catch (parseErr) {
    return { ok: false, error: `Interactions create parse error: ${parseErr}` };
  }

  const interactionId = interaction?.id;
  if (!interactionId) {
    const text = extractTextFromInteraction(interaction);
    if (text) return { ok: true, text };
    return { ok: false, error: `Interactions create did not return id or output: ${sanitizeGeminiError(createText)}` };
  }

  const deadline = Date.now() + 8 * 60_000;
  let lastStatus = interaction?.status || 'in_progress';
  let lastBody = interaction;
  let delayMs = 2500;

  while (Date.now() < deadline) {
    if (lastStatus === 'completed') {
      const text = extractTextFromInteraction(lastBody);
      if (!text) {
        return { ok: false, interactionId, error: `Interactions completed without text output (interactionId=${interactionId})` };
      }
      return { ok: true, text, interactionId };
    }

    if (lastStatus === 'failed' || lastStatus === 'cancelled') {
      return {
        ok: false,
        interactionId,
        error: `Interactions ${lastStatus} (interactionId=${interactionId}): ${sanitizeGeminiError(JSON.stringify(lastBody))}`,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(6000, delayMs + 500);

    const pollResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${interactionId}`, {
      method: 'GET',
      headers,
    });
    const pollText = await pollResponse.text();
    if (!pollResponse.ok) {
      return { ok: false, interactionId, error: `Interactions poll failed (${pollResponse.status}, interactionId=${interactionId}): ${sanitizeGeminiError(pollText)}` };
    }
    try {
      lastBody = JSON.parse(pollText);
      lastStatus = lastBody?.status || 'in_progress';
      console.log(`[pdf-visual-extractor] Gemini interaction ${interactionId} status=${lastStatus}`);
    } catch (parseErr) {
      return { ok: false, interactionId, error: `Interactions poll parse error (interactionId=${interactionId}): ${parseErr}` };
    }
  }

  return {
    ok: false,
    interactionId,
    error: `Gemini OCR still processing after background polling timeout (model=${apiModel}, interactionId=${interactionId}).`,
  };
}

/**
 * Extrai texto visual de um PDF usando Gemini Vision
 * Esta função é usada na Fase 1 do processamento em duas fases
 * 
 * Supports three input types:
 * - string: base64 encoded PDF
 * - Uint8Array: raw bytes (will be converted to base64 for small files, or uploaded via Files API for large files)
 * - StreamInput: stream + size for memory-efficient processing of large files (67MB+)
 */
export async function extractVisualContent(
  pdfInput: string | Uint8Array | StreamInput,
  options: {
    useFilesAPI?: boolean;
    model?: string;
    geminiApiKey?: string;
  } = {}
): Promise<ExtractedContent> {
  const model = options.model || 'gemini-2.5-flash';
  const apiKey = options.geminiApiKey || await getGeminiApiKey();
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada para extração visual');
  }

  // Determine input type
  const isStream = typeof pdfInput === 'object' && 'stream' in pdfInput && 'size' in pdfInput;
  const isBytes = pdfInput instanceof Uint8Array;
  
  let approxSizeBytes: number;
  if (isStream) {
    approxSizeBytes = (pdfInput as StreamInput).size;
  } else if (isBytes) {
    approxSizeBytes = (pdfInput as Uint8Array).byteLength;
  } else {
    approxSizeBytes = Math.ceil((pdfInput as string).length * 3 / 4);
  }

  console.log(`[pdf-visual-extractor] Starting extraction with model: ${model}, useFilesAPI: ${options.useFilesAPI}, inputType: ${isStream ? 'stream' : isBytes ? 'bytes' : 'base64'}, approxSizeMB: ${(approxSizeBytes / (1024 * 1024)).toFixed(2)}`);

  // Auto-escolha da Files API quando o caller não decidiu:
  // acima de ~4MB, a codificação base64 inline + JSON.stringify facilmente
  // estoura o limite de memória da Edge Function (150MB). Só faz sentido
  // inline abaixo desse patamar.
  const AUTO_FILES_API_THRESHOLD = 4 * 1024 * 1024;
  const resolvedModelForRouting = resolveGeminiModelName(model);
  const shouldUseFilesAPI =
    options.useFilesAPI === true ||
    shouldUseGeminiInteractionsAPI(resolvedModelForRouting) ||
    (options.useFilesAPI === undefined && approxSizeBytes > AUTO_FILES_API_THRESHOLD);
  if (options.useFilesAPI === undefined && shouldUseFilesAPI) {
    console.log(`[pdf-visual-extractor] Auto-selecting Files API (size ${(approxSizeBytes / (1024 * 1024)).toFixed(2)}MB > ${(AUTO_FILES_API_THRESHOLD / (1024 * 1024)).toFixed(0)}MB threshold) to avoid OOM`);
  }

  const startTime = Date.now();
  let result: ExtractedContent;

  if (isStream) {
    // STREAMING MODE: For large files (67MB+), stream directly to Files API
    console.log('[pdf-visual-extractor] Using STREAMING mode for large PDF...');
    result = await extractWithFilesAPIStream(pdfInput as StreamInput, model, apiKey);
  } else if (shouldUseFilesAPI) {
    // PDFs > 4MB (auto) ou quando o caller pediu explicitamente: usar Files API
    result = isBytes
      ? await extractWithFilesAPIBytes(pdfInput as Uint8Array, model, apiKey)
      : await extractWithFilesAPI(pdfInput as string, model, apiKey);
  } else {
    // Para PDFs pequenos (< 4MB), usar inline base64
    const base64 = isBytes
      ? encode(
          (pdfInput as Uint8Array).buffer.slice(
            (pdfInput as Uint8Array).byteOffset,
            (pdfInput as Uint8Array).byteOffset + (pdfInput as Uint8Array).byteLength
          ) as ArrayBuffer
        )
      : (pdfInput as string);
    result = await extractWithInlineBase64(base64, model, apiKey);
  }

  const duration = Date.now() - startTime;
  console.log(`[pdf-visual-extractor] Extraction completed in ${duration}ms, rawText length: ${result.rawText.length}`);
  
  return result;
}

/**
 * Extração usando Files API a partir de bytes (evita base64 gigante em memória)
 */
async function extractWithFilesAPIBytes(
  pdfBytes: Uint8Array,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // Import the files API module
  const { uploadToGeminiFilesAPIBytes, deleteGeminiFile } = await import('./gemini-files-api.ts');

  // Upload to Files API
  console.log('[pdf-visual-extractor] Uploading large PDF bytes to Gemini Files API...');
  const fileUri = await uploadToGeminiFilesAPIBytes(pdfBytes, apiKey);
  console.log(`[pdf-visual-extractor] File uploaded: ${fileUri}`);

  try {
    // Resolver nome do modelo para API Gemini
    const apiModel = resolveGeminiModelName(model);
    console.log(`[pdf-visual-extractor] Calling Gemini Files API with model: ${apiModel} (original: ${model})`);

    const result = shouldUseGeminiInteractionsAPI(apiModel)
      ? await callGeminiInteractionsWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT)
      : await callGeminiGenerateContentWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT);
    
    if (!result.ok) {
      throw new Error(`Gemini Vision (Files API Bytes) error: ${result.error}`);
    }

    return parseExtractionResult(
      result.text,
      model,
      shouldUseGeminiInteractionsAPI(apiModel) ? 'gemini-interactions-files-api' : 'gemini-files-api'
    );
  } finally {
    // Clean up uploaded file
    try {
      await deleteGeminiFile(fileUri, apiKey);
      console.log('[pdf-visual-extractor] Temporary file deleted from Files API');
    } catch (cleanupError) {
      console.warn('[pdf-visual-extractor] Failed to delete temporary file:', cleanupError);
    }
  }
}

/**
 * Extração via STREAMING para PDFs muito grandes (67MB+)
 * Evita carregar o arquivo inteiro na memória do Edge Function
 */
async function extractWithFilesAPIStream(
  input: StreamInput,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // Import the files API module
  const { uploadToGeminiFilesAPIStream, deleteGeminiFile } = await import('./gemini-files-api.ts');

  // Upload via streaming
  console.log(`[pdf-visual-extractor] Uploading large PDF via STREAMING (${(input.size / (1024 * 1024)).toFixed(2)}MB)...`);
  const fileUri = await uploadToGeminiFilesAPIStream(input.stream, input.size, apiKey);
  console.log(`[pdf-visual-extractor] Streaming upload complete: ${fileUri}`);

  try {
    // Resolver nome do modelo para API Gemini
    const apiModel = resolveGeminiModelName(model);
    console.log(`[pdf-visual-extractor] Calling Gemini generateContent with model: ${apiModel}, fileUri: ${fileUri}`);

    const result = shouldUseGeminiInteractionsAPI(apiModel)
      ? await callGeminiInteractionsWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT)
      : await callGeminiGenerateContentWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT);
    
    if (!result.ok) {
      throw new Error(`Gemini Vision (Streaming) error: ${result.error}`);
    }

    return parseExtractionResult(
      result.text,
      model,
      shouldUseGeminiInteractionsAPI(apiModel) ? 'gemini-interactions-streaming' : 'gemini-streaming'
    );
  } finally {
    // Clean up uploaded file
    try {
      await deleteGeminiFile(fileUri, apiKey);
      console.log('[pdf-visual-extractor] Temporary file deleted from Files API');
    } catch (cleanupError) {
      console.warn('[pdf-visual-extractor] Failed to delete temporary file:', cleanupError);
    }
  }
}

/**
 * Extração direta com base64 inline (PDFs < 50MB)
 */
async function extractWithInlineBase64(
  pdfBase64: string,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // Resolver nome do modelo para API Gemini
  const apiModel = resolveGeminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
  
  console.log(`[pdf-visual-extractor] Calling Gemini API (inline base64) with model: ${apiModel} (original: ${model})`);
  
  // Usar maxOutputTokens seguro (65536 em vez de 1048576)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 105_000);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: EXTRACTION_PROMPT },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: pdfBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536,
      }
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId)).catch((err) => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Gemini OCR timeout after 105s (model=${apiModel}). Documento provavelmente grande/demorado demais para processamento síncrono.`);
    }
    throw err;
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Vision error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return parseExtractionResult(text, model, 'gemini');
}

/**
 * Extração usando Files API para PDFs grandes (> 50MB, até 2GB)
 */
async function extractWithFilesAPI(
  pdfBase64: string,
  model: string,
  apiKey: string
): Promise<ExtractedContent> {
  // Import the files API module
  const { uploadToGeminiFilesAPI, deleteGeminiFile } = await import('./gemini-files-api.ts');
  
  // Upload to Files API
  console.log('[pdf-visual-extractor] Uploading large PDF to Gemini Files API...');
  const fileUri = await uploadToGeminiFilesAPI(pdfBase64, apiKey);
  console.log(`[pdf-visual-extractor] File uploaded: ${fileUri}`);
  
  try {
    // Resolver nome do modelo para API Gemini
    const apiModel = resolveGeminiModelName(model);
    console.log(`[pdf-visual-extractor] Calling Gemini Files API with model: ${apiModel} (original: ${model})`);
    
    const result = shouldUseGeminiInteractionsAPI(apiModel)
      ? await callGeminiInteractionsWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT)
      : await callGeminiGenerateContentWithFile(apiKey, apiModel, fileUri, EXTRACTION_PROMPT);
    
    if (!result.ok) {
      throw new Error(`Gemini Vision (Files API) error: ${result.error}`);
    }

    return parseExtractionResult(
      result.text,
      model,
      shouldUseGeminiInteractionsAPI(apiModel) ? 'gemini-interactions-files-api' : 'gemini-files-api'
    );
  } finally {
    // Clean up uploaded file
    try {
      await deleteGeminiFile(fileUri, apiKey);
      console.log('[pdf-visual-extractor] Temporary file deleted from Files API');
    } catch (cleanupError) {
      console.warn('[pdf-visual-extractor] Failed to delete temporary file:', cleanupError);
    }
  }
}

/**
 * Parse the extraction result into structured format
 */
function parseExtractionResult(text: string, model: string, provider: string): ExtractedContent {
  // Try to parse as JSON first
  try {
    // Clean potential markdown code blocks
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }
    
    const parsed = JSON.parse(cleanText);
    
    return {
      rawText: parsed.rawText || cleanText,
      pageCount: parsed.pageCount || countPages(parsed.rawText || cleanText),
      estimatedSections: parsed.estimatedSections || [],
      extractedAt: new Date().toISOString(),
      model,
      provider
    };
  } catch {
    // If not valid JSON, use raw text as-is
    console.warn('[pdf-visual-extractor] Could not parse as JSON, using raw text');
    
    return {
      rawText: text,
      pageCount: countPages(text),
      estimatedSections: detectSections(text),
      extractedAt: new Date().toISOString(),
      model,
      provider
    };
  }
}

/**
 * Count pages from === PÁGINA X === markers
 */
function countPages(text: string): number {
  const matches = text.match(/===\s*PÁGINA\s*\d+\s*===/gi);
  return matches ? matches.length : 1;
}

/**
 * Auto-detect document sections from common legal keywords
 */
function detectSections(text: string): string[] {
  const sections: string[] = [];
  const patterns = [
    { regex: /petição\s*inicial/i, name: 'PETIÇÃO INICIAL' },
    { regex: /contestação/i, name: 'CONTESTAÇÃO' },
    { regex: /quesitos\s*(do\s*)?juízo/i, name: 'QUESITOS DO JUÍZO' },
    { regex: /quesitos\s*(do\s*)?reclamante/i, name: 'QUESITOS DO RECLAMANTE' },
    { regex: /quesitos\s*(da\s*)?reclamada/i, name: 'QUESITOS DA RECLAMADA' },
    { regex: /laudo\s*(médico|pericial)/i, name: 'LAUDO MÉDICO' },
    { regex: /atestado/i, name: 'ATESTADOS' },
    { regex: /exame\s*(complementar|laboratorial|imagem)/i, name: 'EXAMES' },
    { regex: /ctps|carteira\s*de\s*trabalho/i, name: 'CTPS' },
    { regex: /cat\s*-?\s*comunicação/i, name: 'CAT' },
  ];
  
  for (const { regex, name } of patterns) {
    if (regex.test(text) && !sections.includes(name)) {
      sections.push(name);
    }
  }
  
  return sections;
}

/**
 * Get Gemini API key from database
 */
async function getGeminiApiKey(): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data } = await supabase
    .from('global_api_keys')
    .select('api_key')
    .eq('id', 'gemini')
    .single();
  
  return data?.api_key || Deno.env.get('GEMINI_API_KEY') || null;
}

/**
 * Store extracted content to Supabase storage
 */
export async function storeExtractedContent(
  extracted: ExtractedContent,
  userId: string,
  jobId: string
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const path = `${userId}/${jobId}/extracted.json`;
  const content = JSON.stringify(extracted, null, 2);
  
  const { error } = await supabase.storage
    .from('processos-pdf')
    .upload(path, new Blob([content], { type: 'application/json' }), {
      upsert: true
    });
  
  if (error) {
    console.error('[pdf-visual-extractor] Error storing extracted content:', error);
    throw new Error(`Falha ao armazenar conteúdo extraído: ${error.message}`);
  }
  
  console.log(`[pdf-visual-extractor] Stored extracted content at: ${path}`);
  return path;
}

/**
 * Retrieve extracted content from Supabase storage
 */
export async function retrieveExtractedContent(
  contentPath: string
): Promise<ExtractedContent | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase.storage
    .from('processos-pdf')
    .download(contentPath);
  
  if (error || !data) {
    console.error('[pdf-visual-extractor] Error retrieving content:', error);
    return null;
  }
  
  try {
    const text = await data.text();
    return JSON.parse(text) as ExtractedContent;
  } catch (parseError) {
    console.error('[pdf-visual-extractor] Error parsing stored content:', parseError);
    return null;
  }
}
