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
        ({ success, errorMessage } = await testGemini(apiKey || Deno.env.get('GEMINI_API_KEY') || '', model));
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
      case 'minimax': {
        const key = apiKey || Deno.env.get('MINIMAX_API_KEY') || '';
        ({ success, errorMessage } = await testOpenAICompatible('https://api.minimax.io/v1/chat/completions', key, model || 'MiniMax-M3'));
        break;
      }
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

// Mapeamento mínimo: não rebaixa modelos Pro/Preview para outro Pro, para evitar falso teste em modelo sem free tier.
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3-flash-lite': 'gemini-3.1-flash-lite',
};

function formatGeminiError(rawError: unknown): string {
  const text = typeof rawError === 'string' ? rawError : JSON.stringify(rawError || {});
  if (/free_tier_requests/i.test(text) && /limit[^0-9]*0/i.test(text)) {
    return 'Modelo Gemini sem cota gratuita nesta chave (free_tier_requests limit 0). Use um modelo Flash como gemini-2.5-flash ou habilite billing no Google AI Studio para modelos Pro/Preview.';
  }
  if (/quota|rate limit|429/i.test(text)) {
    return `Limite/quota do Gemini: ${text.substring(0, 500)}`;
  }
  return text;
}

function isImageModel(modelId: string): boolean {
  return modelId.includes('image') || 
         modelId.includes('imagen') ||
         modelId.includes('native-audio');
}

function shouldUseGeminiInteractionsAPI(modelId: string): boolean {
  return /^gemini-3(?:\.|-|$)/.test(modelId) || modelId === 'gemini-3.5-flash';
}

// Detecta se é modelo flash 2.5+ (suporta thinkingConfig)
function isFlash25Model(modelId: string): boolean {
  return modelId.includes('2.5-flash') || modelId.includes('2.0-flash');
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

    if (shouldUseGeminiInteractionsAPI(modelName)) {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
          'Api-Revision': '2026-05-20',
        },
        body: JSON.stringify({
          model: modelName,
          input: 'Respond with exactly one word: OK',
          generation_config: { max_output_tokens: 128, temperature: 0.1 },
          store: false,
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        return { success: false, errorMessage: formatGeminiError(`HTTP ${response.status}: ${text}`) };
      }
      const data = JSON.parse(text);
      const output = data.output_text || data.outputs?.map((o: any) => o?.text || '').join('') || data.steps?.flatMap((s: any) => s?.content || []).map((c: any) => c?.text || '').join('') || '';
      return { success: /OK/i.test(output) || !!data.id, errorMessage: null };
    }
    
    // Standard text model test
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    // Configuração de geração com tokens suficientes para evitar falso MAX_TOKENS em modelos com thinking
    const generationConfig: Record<string, any> = { 
      maxOutputTokens: 8192,
      temperature: 0.1  // Baixa para respostas determinísticas
    };
    
    // Para modelos flash 2.5+, desativar thinking para teste rápido
    if (isFlash25Model(modelName)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
      console.log(`[test-ai-connection] Flash model detected, disabling thinking for test`);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          role: 'user',
          parts: [{ text: 'Respond with exactly one word: OK' }] 
        }],
        generationConfig
      })
    });

    const data = await response.json();
    
    // Log da resposta para debug
    console.log('[test-ai-connection] Gemini response:', JSON.stringify(data).substring(0, 500));

    // Verificar erro mesmo com HTTP 200
    if (data.error) {
      const errorMsg = formatGeminiError(data.error.message || data.error);
      console.error('[test-ai-connection] Gemini API error:', errorMsg);
      return { success: false, errorMessage: errorMsg };
    }

    if (!response.ok) {
      const errorText = formatGeminiError(data);
      return { success: false, errorMessage: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
    }

    // Verificar finishReason para diagnóstico mais preciso
    const finishReason = data.candidates?.[0]?.finishReason;
    const parts = data.candidates?.[0]?.content?.parts || [];
    const fullText = parts.map((p: any) => p.text || '').join('').trim();
    
    // Se truncou por MAX_TOKENS sem produzir texto, erro específico
    if (finishReason === 'MAX_TOKENS' && !fullText) {
      console.warn('[test-ai-connection] Gemini: MAX_TOKENS without text output');
      return { 
        success: false, 
        errorMessage: 'Saída truncada (MAX_TOKENS). Modelo pode requerer mais tokens ou desativar thinking.' 
      };
    }
    
    // Se não há texto mas também não é MAX_TOKENS
    if (!fullText) {
      console.warn('[test-ai-connection] Gemini: empty response, finishReason:', finishReason);
      return { 
        success: false, 
        errorMessage: `Resposta vazia (finishReason: ${finishReason || 'unknown'})` 
      };
    }
    
    console.log(`[test-ai-connection] Gemini test successful, response: "${fullText.substring(0, 50)}"`);
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
    const isDeepSeek = endpoint.includes('deepseek.com');
    const isDeepSeekReasoner = isDeepSeek && model.includes('reasoner');
    const isMinimax = endpoint.includes('minimax.io');

    const body: Record<string, any> = {
      model,
      messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
      max_tokens: 10
    };

    // DeepSeek V4 tem thinking mode ON por default — desligar no teste para latência previsível
    if (isDeepSeek && !isDeepSeekReasoner) {
      body.thinking = { type: 'disabled' };
    }

    // MiniMax M3: thinking desabilitado e temperatura 0 (padrão global do projeto)
    if (isMinimax) {
      body.thinking = { type: 'disabled' };
      body.temperature = 0;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
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
