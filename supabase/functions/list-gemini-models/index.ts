import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface ModelInfo {
  id: string;
  displayName: string;
  family: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsPdf: boolean;
  description?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'API Key não fornecida'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[list-gemini-models] Fetching available models from Google API...');

    // Query Google's models endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[list-gemini-models] Google API error:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText.substring(0, 200);
      }

      return new Response(JSON.stringify({
        success: false,
        error: errorMessage
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const rawModels: GeminiModel[] = data.models || [];

    console.log(`[list-gemini-models] Found ${rawModels.length} total models`);

    // Filter models that support generateContent (text generation)
    const textModels = rawModels.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent')
    );

    console.log(`[list-gemini-models] ${textModels.length} models support generateContent`);

    // Transform and categorize models
    const models: ModelInfo[] = textModels.map(m => {
      const modelId = m.name.replace('models/', '');
      const family = getModelFamily(modelId);
      
      return {
        id: modelId,
        displayName: m.displayName || formatDisplayName(modelId),
        family,
        inputTokenLimit: m.inputTokenLimit || 0,
        outputTokenLimit: m.outputTokenLimit || 0,
        supportsPdf: modelId.includes('vision') || 
                     modelId.includes('pro') || 
                     modelId.includes('flash') ||
                     family === '3.0' ||
                     family === '2.5',
        description: m.description
      };
    });

    // Sort models: 3.0 > 2.5 > 2.0 > 1.5 > others, then by name
    models.sort((a, b) => {
      const familyOrder = ['3.0', '2.5', '2.0', '1.5', '1.0', 'other'];
      const aIdx = familyOrder.indexOf(a.family);
      const bIdx = familyOrder.indexOf(b.family);
      
      if (aIdx !== bIdx) return aIdx - bIdx;
      
      // Within same family, sort Pro before Flash before Lite
      const typeOrder = (id: string) => {
        if (id.includes('pro')) return 0;
        if (id.includes('flash') && !id.includes('lite')) return 1;
        if (id.includes('lite') || id.includes('8b')) return 2;
        return 3;
      };
      
      const aType = typeOrder(a.id);
      const bType = typeOrder(b.id);
      
      if (aType !== bType) return aType - bType;
      
      return a.id.localeCompare(b.id);
    });

    // Group by category
    const categories: Record<string, string[]> = {};
    models.forEach(m => {
      if (!categories[m.family]) {
        categories[m.family] = [];
      }
      categories[m.family].push(m.id);
    });

    // Get recommended models for PDF processing
    const pdfModels = models
      .filter(m => m.supportsPdf && m.inputTokenLimit >= 100000)
      .slice(0, 5)
      .map(m => m.id);

    console.log('[list-gemini-models] Categories:', Object.keys(categories));
    console.log('[list-gemini-models] PDF-capable models:', pdfModels);

    return new Response(JSON.stringify({
      success: true,
      models,
      categories,
      pdfModels,
      totalCount: models.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[list-gemini-models] Error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getModelFamily(modelId: string): string {
  if (modelId.includes('gemini-3') || modelId.includes('gemini-3.0')) return '3.0';
  if (modelId.includes('gemini-2.5') || modelId.includes('2.5')) return '2.5';
  if (modelId.includes('gemini-2.0') || modelId.includes('2.0')) return '2.0';
  if (modelId.includes('gemini-1.5') || modelId.includes('1.5')) return '1.5';
  if (modelId.includes('gemini-1.0') || modelId.includes('1.0')) return '1.0';
  return 'other';
}

function formatDisplayName(modelId: string): string {
  // Convert model-id to Display Name
  return modelId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/(\d+)\.(\d+)/g, '$1.$2') // Keep version numbers
    .replace('Gemini', 'Gemini')
    .replace('Flash', 'Flash')
    .replace('Pro', 'Pro')
    .replace('Lite', 'Lite');
}
