import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestRequest {
  provider: string;
  model: string;
  apiKey?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { provider, model, apiKey } = await req.json() as TestRequest;

    console.log(`[test-ai-connection] Testing provider: ${provider}, model: ${model}`);

    let success = false;
    let errorMessage: string | null = null;

    switch (provider) {
      case 'lovable':
        ({ success, errorMessage } = await testLovableAI(model));
        break;
      case 'gemini':
        ({ success, errorMessage } = await testGemini(apiKey!, model));
        break;
      case 'openai':
        ({ success, errorMessage } = await testOpenAI(apiKey!, model));
        break;
      case 'claude':
        ({ success, errorMessage } = await testClaude(apiKey!, model));
        break;
      case 'groq':
        ({ success, errorMessage } = await testOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', apiKey!, model));
        break;
      case 'deepseek':
        ({ success, errorMessage } = await testOpenAICompatible('https://api.deepseek.com/v1/chat/completions', apiKey!, model));
        break;
      case 'openrouter':
        ({ success, errorMessage } = await testOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', apiKey!, model));
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    const latencyMs = Date.now() - startTime;

    return new Response(JSON.stringify({
      success,
      provider,
      model,
      latencyMs,
      message: success ? 'Conexão estabelecida com sucesso' : `Falha: ${errorMessage}`,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    console.error('[test-ai-connection] Error:', errorMessage);

    return new Response(JSON.stringify({
      success: false,
      latencyMs,
      error: errorMessage,
      message: `Erro ao testar conexão: ${errorMessage}`
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function testLovableAI(model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!apiKey) {
    return { success: false, errorMessage: 'LOVABLE_API_KEY não configurada' };
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errorMessage: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return { success: !!data.choices?.[0]?.message?.content, errorMessage: null };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

// Mapeamento de nomes amigáveis para nomes corretos da API Gemini
const GEMINI_MODEL_MAP: Record<string, string> = {
  // Gemini 3.0 (mais recentes)
  'gemini-3-pro': 'gemini-2.5-pro-preview-05-06', // fallback até 3.0 ser lançado
  'gemini-3-flash': 'gemini-2.5-flash-preview-05-20',
  'gemini-3-flash-lite': 'gemini-2.5-flash-8b-exp-0924',
  // Gemini 2.5
  'gemini-2.5-pro': 'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-flash': 'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-8b-exp-0924',
  // Gemini 2.0 e 1.5 (estáveis)
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-1.5-flash',
};

function isImageModel(modelId: string): boolean {
  return modelId.includes('image') || 
         modelId.includes('imagen') ||
         modelId.includes('native-audio');
}

async function testGemini(apiKey: string, model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!apiKey) {
    return { success: false, errorMessage: 'API Key não fornecida' };
  }

  try {
    // Mapear nome do modelo se necessário
    const inputModel = model.replace('google/', '');
    const modelName = GEMINI_MODEL_MAP[inputModel] || inputModel;
    
    console.log(`[test-ai-connection] Testing Gemini model: ${inputModel} -> ${modelName}`);
    
    // Check if it's an image model - use different test approach
    if (isImageModel(modelName)) {
      console.log(`[test-ai-connection] Detected image model: ${modelName}, using model info endpoint`);
      
      // For image models, just verify the API key can access the model info
      const infoResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}?key=${apiKey}`
      );
      
      if (infoResponse.ok) {
        const modelInfo = await infoResponse.json();
        console.log(`[test-ai-connection] Image model accessible: ${modelInfo.displayName || modelName}`);
        return { success: true, errorMessage: null };
      } else {
        const errorData = await infoResponse.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${infoResponse.status}`;
        console.error(`[test-ai-connection] Image model not accessible: ${errorMessage}`);
        return { success: false, errorMessage };
      }
    }
    
    // Standard text model test
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with exactly: OK' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    const data = await response.json();
    
    // Log da resposta para debug
    console.log('[test-ai-connection] Gemini response:', JSON.stringify(data).substring(0, 500));

    // Verificar erro mesmo com HTTP 200
    if (data.error) {
      const errorMsg = data.error.message || JSON.stringify(data.error);
      console.error('[test-ai-connection] Gemini API error:', errorMsg);
      return { success: false, errorMessage: errorMsg };
    }

    if (!response.ok) {
      const errorText = JSON.stringify(data);
      return { success: false, errorMessage: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
    }

    // Verificar resposta válida
    const hasContent = !!data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!hasContent) {
      console.warn('[test-ai-connection] Gemini: empty or unexpected response format');
      return { success: false, errorMessage: 'Resposta vazia ou formato inesperado' };
    }
    
    return { success: true, errorMessage: null };
  } catch (error) {
    console.error('[test-ai-connection] Gemini exception:', error);
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

async function testOpenAI(apiKey: string, model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!apiKey) {
    return { success: false, errorMessage: 'API Key não fornecida' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errorMessage: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return { success: !!data.choices?.[0]?.message?.content, errorMessage: null };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

async function testClaude(apiKey: string, model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!apiKey) {
    return { success: false, errorMessage: 'API Key não fornecida' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'claude-3.5-sonnet',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Respond with exactly: OK' }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errorMessage: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return { success: !!data.content?.[0]?.text, errorMessage: null };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

async function testOpenAICompatible(endpoint: string, apiKey: string, model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!apiKey) {
    return { success: false, errorMessage: 'API Key não fornecida' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errorMessage: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return { success: !!data.choices?.[0]?.message?.content, errorMessage: null };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}
