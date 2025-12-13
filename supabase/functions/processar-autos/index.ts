import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Modelo configurável - fácil trocar para gemini-2.5-pro se necessário
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const systemPrompt = `Analise os autos do processo trabalhista e extraia as informações principais.

REGRAS:
- Extraia APENAS o que está explícito no documento
- Campos não encontrados devem ficar vazios ("")
- Seja CONCISO nas descrições (máximo 200 caracteres)
- CPF: XXX.XXX.XXX-XX
- Datas: YYYY-MM-DD
- CIDs: liste apenas os códigos, sem descrições

Retorne este JSON:
{
  "vitima": {"nome":"","cpf":"","data_nascimento":"","profissao":"","escolaridade":""},
  "processo": {"numero":"","vara":"","reclamante":"","reclamada":""},
  "acidente": {"data":"","descricao":"","local":""},
  "informacoes_medicas": {"cids_mencionados":[],"lesoes":"","tratamentos":"","afastamentos":""},
  "documentos_mencionados": [],
  "resumo": ""
}`;

// Helper to try to fix truncated JSON
function tryFixTruncatedJson(jsonStr: string): object | null {
  // First try parsing as-is
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to fix common truncation issues
  }

  let fixed = jsonStr.trim();
  
  // Remove markdown code blocks if present
  fixed = fixed.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  
  // Count open brackets
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;

  // If truncated in the middle of a string, try to close it
  if (fixed.match(/"[^"]*$/)) {
    fixed += '"';
  }

  // Add missing brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    fixed += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    fixed += '}';
  }

  try {
    return JSON.parse(fixed);
  } catch {
    console.error('Could not fix truncated JSON');
    return null;
  }
}

// Helper to create a valid structure with defaults
function ensureValidStructure(data: any): object {
  const defaultStructure = {
    vitima: { nome: "", cpf: "", data_nascimento: "", profissao: "", escolaridade: "" },
    processo: { numero: "", vara: "", reclamante: "", reclamada: "" },
    acidente: { data: "", descricao: "", local: "" },
    informacoes_medicas: { cids_mencionados: [], lesoes: "", tratamentos: "", afastamentos: "" },
    documentos_mencionados: [],
    resumo: ""
  };

  if (!data || typeof data !== 'object') {
    return defaultStructure;
  }

  return {
    vitima: { ...defaultStructure.vitima, ...(data.vitima || {}) },
    processo: { ...defaultStructure.processo, ...(data.processo || {}) },
    acidente: { ...defaultStructure.acidente, ...(data.acidente || {}) },
    informacoes_medicas: { ...defaultStructure.informacoes_medicas, ...(data.informacoes_medicas || {}) },
    documentos_mencionados: Array.isArray(data.documentos_mencionados) ? data.documentos_mencionados : [],
    resumo: data.resumo || ""
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { pdfBase64, fileName } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'No PDF content provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing PDF: ${fileName}, size: ${pdfBase64.length} chars`);

    // Call Gemini API with PDF
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRequest = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64
              }
            },
            {
              text: systemPrompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 16384,
        responseMimeType: "application/json"
      }
    };

    console.log(`Calling Gemini API with model: ${GEMINI_MODEL}`);

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequest),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to process PDF with AI', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response received, finishReason:', geminiData.candidates?.[0]?.finishReason);

    // Check for truncation
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.warn('Response was truncated due to max tokens limit');
    }

    // Extract the generated content
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error('No content in Gemini response:', JSON.stringify(geminiData));
      return new Response(
        JSON.stringify({ error: 'No content extracted from PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Raw response length:', generatedText.length);

    // Parse the JSON response from Gemini with truncation handling
    let extractedData = tryFixTruncatedJson(generatedText);
    
    if (!extractedData) {
      console.error('Failed to parse Gemini response as JSON:', generatedText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Failed to parse extracted data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure valid structure with all required fields
    extractedData = ensureValidStructure(extractedData);

    console.log('Successfully extracted data from PDF');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData,
        model: GEMINI_MODEL,
        truncated: finishReason === 'MAX_TOKENS'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error processing PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
