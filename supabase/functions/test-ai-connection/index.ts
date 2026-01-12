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

async function testGemini(apiKey: string, model: string): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!apiKey) {
    return { success: false, errorMessage: 'API Key não fornecida' };
  }

  try {
    const modelName = model.replace('google/', '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with exactly: OK' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, errorMessage: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return { success: !!data.candidates?.[0]?.content?.parts?.[0]?.text, errorMessage: null };
  } catch (error) {
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
