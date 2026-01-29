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
  // Gemini 3.0 Preview → mapeia para 2.5 (até 3.0 GA)
  'gemini-3-pro-preview': 'gemini-2.5-pro',
  'gemini-3-flash-preview': 'gemini-2.5-flash',
  'gemini-3-flash-lite-preview': 'gemini-2.5-flash-8b',
  // Gemini 2.5 - aliases estáveis
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-8b',
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

/**
 * Extrai texto visual de um PDF usando Gemini Vision
 * Esta função é usada na Fase 1 do processamento em duas fases
 */
export async function extractVisualContent(
  pdfInput: string | Uint8Array,
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

  const isBytes = pdfInput instanceof Uint8Array;
  const approxSizeBytes = isBytes
    ? pdfInput.byteLength
    : Math.ceil((pdfInput as string).length * 3 / 4);

  console.log(`[pdf-visual-extractor] Starting extraction with model: ${model}, useFilesAPI: ${options.useFilesAPI}, inputType: ${isBytes ? 'bytes' : 'base64'}, approxSizeMB: ${(approxSizeBytes / (1024 * 1024)).toFixed(2)}`);
  
  const startTime = Date.now();
  let result: ExtractedContent;

  if (options.useFilesAPI) {
    // Para PDFs > 50MB, usar Files API
    result = isBytes
      ? await extractWithFilesAPIBytes(pdfInput as Uint8Array, model, apiKey)
      : await extractWithFilesAPI(pdfInput as string, model, apiKey);
  } else {
    // Para PDFs menores, usar inline base64
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

    // Call generateContent with file URI
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { file_data: { file_uri: fileUri, mime_type: 'application/pdf' } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1048576,
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini Vision (Files API) error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return parseExtractionResult(text, model, 'gemini-files-api');
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
  
  console.log(`[pdf-visual-extractor] Calling Gemini API with model: ${apiModel} (original: ${model})`);
  
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
        maxOutputTokens: 1048576, // Maximum for large extractions
      }
    })
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
    
    // Call generateContent with file URI
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { file_data: { file_uri: fileUri, mime_type: 'application/pdf' } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1048576,
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini Vision (Files API) error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return parseExtractionResult(text, model, 'gemini-files-api');
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
