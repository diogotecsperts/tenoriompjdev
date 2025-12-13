import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Modelo configurável - fácil trocar para gemini-2.5-pro se necessário
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const systemPrompt = `Você é um assistente especializado em análise de processos trabalhistas para médicos peritos. Analise os autos do processo e extraia TODAS as informações disponíveis para preencher um laudo pericial completo.

REGRAS GERAIS:
- Extraia APENAS o que está EXPLÍCITO no documento
- Campos não encontrados = "" (string vazia) ou [] (array vazio)
- Datas no formato: YYYY-MM-DD
- CPF no formato: XXX.XXX.XXX-XX
- CIDs: apenas códigos (ex: "J15.9", "M54.2")
- Seja detalhado nos campos de texto (história, descrições)

ESTRUTURA JSON A RETORNAR:
{
  "vitima": {
    "nome": "",
    "cpf": "",
    "data_nascimento": "",
    "profissao": "",
    "escolaridade": "",
    "dominancia": ""
  },
  "processo": {
    "numero": "",
    "vara": "",
    "reclamante": "",
    "reclamada": ""
  },
  "acidente": {
    "data": "",
    "descricao": "",
    "local": ""
  },
  "documentos_checklist": {
    "cat": false,
    "prontuario": false,
    "receitas": false,
    "exames": false,
    "laudos_anteriores": false,
    "atestados": false,
    "outros": []
  },
  "historico": {
    "historia_atual": "",
    "historico_ocupacional": "",
    "antecedentes_patologicos": "",
    "tratamentos_realizados": "",
    "afastamentos": ""
  },
  "exame_clinico": {
    "laudos_medicos": "",
    "exames_complementares": "",
    "lesoes_descritas": ""
  },
  "informacoes_medicas": {
    "cids_mencionados": [],
    "incapacidade_alegada": "",
    "nexo_sugerido": ""
  },
  "quesitos": {
    "juizo": "",
    "reclamante": "",
    "reclamada": ""
  },
  "resumo": ""
}

INSTRUÇÕES ESPECÍFICAS:
1. VÍTIMA: Extraia todos os dados pessoais do periciando/reclamante
2. PROCESSO: Número completo do processo, vara, partes
3. ACIDENTE: Data, descrição detalhada do evento, local
4. DOCUMENTOS: Marque true se o tipo de documento foi mencionado/anexado
5. HISTÓRICO: 
   - historia_atual: queixas atuais, sintomas relatados
   - historico_ocupacional: funções exercidas, tempo de serviço, atividades
   - antecedentes_patologicos: doenças prévias, cirurgias, condições anteriores
   - tratamentos_realizados: medicamentos, fisioterapia, cirurgias feitas
   - afastamentos: períodos de afastamento do trabalho, motivos
6. EXAME CLÍNICO:
   - laudos_medicos: resumo dos laudos médicos apresentados
   - exames_complementares: resultados de exames (imagem, laboratoriais)
   - lesoes_descritas: lesões mencionadas nos documentos
7. INFORMAÇÕES MÉDICAS:
   - cids_mencionados: lista de códigos CID encontrados
   - incapacidade_alegada: tipo de incapacidade mencionada
   - nexo_sugerido: "direto", "concausa", "agravamento" ou "" se não mencionado
8. QUESITOS: Se houver quesitos no documento, copie-os integralmente separados por categoria
9. RESUMO: Síntese breve do caso (máximo 300 caracteres)`;

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
    vitima: { nome: "", cpf: "", data_nascimento: "", profissao: "", escolaridade: "", dominancia: "" },
    processo: { numero: "", vara: "", reclamante: "", reclamada: "" },
    acidente: { data: "", descricao: "", local: "" },
    documentos_checklist: { cat: false, prontuario: false, receitas: false, exames: false, laudos_anteriores: false, atestados: false, outros: [] },
    historico: { historia_atual: "", historico_ocupacional: "", antecedentes_patologicos: "", tratamentos_realizados: "", afastamentos: "" },
    exame_clinico: { laudos_medicos: "", exames_complementares: "", lesoes_descritas: "" },
    informacoes_medicas: { cids_mencionados: [], incapacidade_alegada: "", nexo_sugerido: "" },
    quesitos: { juizo: "", reclamante: "", reclamada: "" },
    resumo: ""
  };

  if (!data || typeof data !== 'object') {
    return defaultStructure;
  }

  return {
    vitima: { ...defaultStructure.vitima, ...(data.vitima || {}) },
    processo: { ...defaultStructure.processo, ...(data.processo || {}) },
    acidente: { ...defaultStructure.acidente, ...(data.acidente || {}) },
    documentos_checklist: { ...defaultStructure.documentos_checklist, ...(data.documentos_checklist || {}) },
    historico: { ...defaultStructure.historico, ...(data.historico || {}) },
    exame_clinico: { ...defaultStructure.exame_clinico, ...(data.exame_clinico || {}) },
    informacoes_medicas: { ...defaultStructure.informacoes_medicas, ...(data.informacoes_medicas || {}) },
    quesitos: { ...defaultStructure.quesitos, ...(data.quesitos || {}) },
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
