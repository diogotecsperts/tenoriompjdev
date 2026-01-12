import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AIConfig {
  provider: string;       // 'lovable', 'gemini', 'openai', 'claude', 'groq', 'deepseek', 'openrouter'
  model: string;          // ex: 'gemini-2.5-pro', 'gpt-4o'
  apiKey: string | null;  // API key do provider (null se lovable)
  endpoint: string;       // URL do endpoint
  displayModel: string;   // Nome amigável para exibição
  // Fallback configuration
  fallback?: {
    provider: string;
    model: string;
    apiKey: string | null;
    endpoint: string;
    displayModel: string;
  };
}

// Mapeamento de providers para endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openai: 'https://api.openai.com/v1/chat/completions',
  claude: 'https://api.anthropic.com/v1/messages',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

// Modelos padrão de cada provider
const DEFAULT_MODELS: Record<string, string> = {
  lovable: 'google/gemini-2.5-flash',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  claude: 'claude-3.5-sonnet',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-4o'
};

// ============= CACHE SYSTEM =============
interface CacheEntry {
  config: AIConfig;
  timestamp: number;
}

let configCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export function invalidateConfigCache(): void {
  configCache = null;
  console.log('[AI Config] Cache invalidated');
}

export function getCacheStatus(): { cached: boolean; ageMs: number | null } {
  if (!configCache) return { cached: false, ageMs: null };
  return { cached: true, ageMs: Date.now() - configCache.timestamp };
}

// ============= LOGGING SYSTEM =============
export async function logAIUsage(params: {
  userId?: string;
  provider: string;
  model: string;
  promptType: string;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  usedFallback?: boolean;
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    await supabase.from('ai_usage_logs').insert({
      user_id: params.userId || '00000000-0000-0000-0000-000000000000',
      provider: params.provider,
      model: params.model,
      prompt_type: params.promptType,
      tokens_input: params.tokensInput || 0,
      tokens_output: params.tokensOutput || 0,
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: params.errorMessage || null
    });

    console.log(`[AI Usage Log] ${params.promptType} - ${params.provider}/${params.model} - ${params.success ? 'SUCCESS' : 'FAILED'} - ${params.latencyMs}ms${params.usedFallback ? ' (FALLBACK)' : ''}`);
  } catch (error) {
    console.error('[logAIUsage] Failed to log:', error);
  }
}

// ============= CONFIG RETRIEVAL =============
export async function getAIConfig(forceRefresh = false): Promise<AIConfig> {
  // Check cache first
  if (!forceRefresh && configCache) {
    const age = Date.now() - configCache.timestamp;
    if (age < CACHE_TTL_MS) {
      console.log(`[AI Config] Using cached config (age: ${Math.round(age/1000)}s)`);
      return configCache.config;
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Buscar configurações do sistema incluindo fallback
    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('id, value')
      .in('id', ['default_ai_provider', 'default_ai_model', 'fallback_ai_provider', 'fallback_ai_model']);

    if (configError) {
      console.error('[AI Config] Error fetching config:', configError);
      return getDefaultConfig();
    }

    const configMap: Record<string, any> = {};
    configData?.forEach(item => {
      configMap[item.id] = item.value;
    });

    const provider = configMap.default_ai_provider || 'lovable';
    let model = configMap.default_ai_model || DEFAULT_MODELS[provider] || 'google/gemini-2.5-flash';
    
    const fallbackProvider = configMap.fallback_ai_provider || 'lovable';
    const fallbackModel = configMap.fallback_ai_model || 'google/gemini-2.5-flash';

    console.log(`[AI Config] Provider: ${provider}, Model: ${model}, Fallback: ${fallbackProvider}/${fallbackModel}`);

    // Build primary config
    let primaryConfig: AIConfig;

    // Se provider for lovable, não precisa de API key externa
    if (provider === 'lovable') {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableKey) {
        console.error('[AI Config] LOVABLE_API_KEY not configured');
      }
      primaryConfig = {
        provider: 'lovable',
        model,
        apiKey: lovableKey || null,
        endpoint: PROVIDER_ENDPOINTS.lovable,
        displayModel: model.replace('google/', '')
      };
    } else {
      // Buscar API key do provider selecionado
      const { data: keyData, error: keyError } = await supabase
        .from('global_api_keys')
        .select('api_key')
        .eq('id', provider)
        .single();

      if (keyError || !keyData?.api_key) {
        console.warn(`[AI Config] No API key found for provider ${provider}, falling back to Lovable AI`);
        primaryConfig = getDefaultConfig();
      } else {
        // Ajustar modelo se necessário
        if (provider === 'gemini' && model.startsWith('google/')) {
          model = model.replace('google/', '');
        }

        primaryConfig = {
          provider,
          model,
          apiKey: keyData.api_key,
          endpoint: PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.lovable,
          displayModel: model
        };
      }
    }

    // Build fallback config
    let fallbackConfig: AIConfig['fallback'] | undefined;
    
    if (fallbackProvider === 'lovable') {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      fallbackConfig = {
        provider: 'lovable',
        model: fallbackModel,
        apiKey: lovableKey || null,
        endpoint: PROVIDER_ENDPOINTS.lovable,
        displayModel: fallbackModel.replace('google/', '')
      };
    } else {
      // Buscar API key do fallback provider
      const { data: fallbackKeyData } = await supabase
        .from('global_api_keys')
        .select('api_key')
        .eq('id', fallbackProvider)
        .single();

      if (fallbackKeyData?.api_key) {
        let adjustedFallbackModel = fallbackModel;
        if (fallbackProvider === 'gemini' && fallbackModel.startsWith('google/')) {
          adjustedFallbackModel = fallbackModel.replace('google/', '');
        }
        
        fallbackConfig = {
          provider: fallbackProvider,
          model: adjustedFallbackModel,
          apiKey: fallbackKeyData.api_key,
          endpoint: PROVIDER_ENDPOINTS[fallbackProvider] || PROVIDER_ENDPOINTS.lovable,
          displayModel: adjustedFallbackModel
        };
      } else {
        // Fallback do fallback: Lovable AI
        const lovableKey = Deno.env.get('LOVABLE_API_KEY');
        fallbackConfig = {
          provider: 'lovable',
          model: 'google/gemini-2.5-flash',
          apiKey: lovableKey || null,
          endpoint: PROVIDER_ENDPOINTS.lovable,
          displayModel: 'gemini-2.5-flash'
        };
      }
    }

    primaryConfig.fallback = fallbackConfig;

    // Store in cache
    configCache = { config: primaryConfig, timestamp: Date.now() };
    console.log('[AI Config] Fetched fresh config from database and cached');

    return primaryConfig;

  } catch (error) {
    console.error('[AI Config] Exception:', error);
    return getDefaultConfig();
  }
}

function getDefaultConfig(): AIConfig {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  return {
    provider: 'lovable',
    model: 'google/gemini-2.5-flash',
    apiKey: lovableKey || null,
    endpoint: PROVIDER_ENDPOINTS.lovable,
    displayModel: 'gemini-2.5-flash',
    fallback: {
      provider: 'lovable',
      model: 'google/gemini-2.5-flash',
      apiKey: lovableKey || null,
      endpoint: PROVIDER_ENDPOINTS.lovable,
      displayModel: 'gemini-2.5-flash'
    }
  };
}

// ============= AI CALL FUNCTIONS =============
export async function callAI(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean }> {
  console.log(`[AI Call] Provider: ${config.provider}, Model: ${config.model}`);
  const startTime = Date.now();

  if (!config.apiKey) {
    throw new Error(`API key not configured for provider: ${config.provider}`);
  }

  try {
    const result = await callProvider(config, systemPrompt, userPrompt);
    const latencyMs = Date.now() - startTime;

    // Log successful call
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: result.provider,
        model: result.model,
        promptType: options.promptType,
        latencyMs,
        success: true,
        usedFallback: false
      });
    }

    return { ...result, usedFallback: false };
  } catch (primaryError) {
    console.error(`[AI Call] Primary provider ${config.provider} failed:`, primaryError);
    const primaryLatency = Date.now() - startTime;

    // Log primary failure
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: config.provider,
        model: config.model,
        promptType: options.promptType,
        latencyMs: primaryLatency,
        success: false,
        errorMessage: primaryError instanceof Error ? primaryError.message : 'Unknown error',
        usedFallback: false
      });
    }

    // Try fallback if available
    if (config.fallback && config.fallback.apiKey) {
      console.log(`[AI Fallback] Trying fallback: ${config.fallback.provider}/${config.fallback.model}`);
      const fallbackStartTime = Date.now();

      try {
        const fallbackConfig: AIConfig = {
          provider: config.fallback.provider,
          model: config.fallback.model,
          apiKey: config.fallback.apiKey,
          endpoint: config.fallback.endpoint,
          displayModel: config.fallback.displayModel
        };

        const result = await callProvider(fallbackConfig, systemPrompt, userPrompt);
        const fallbackLatency = Date.now() - fallbackStartTime;

        // Log successful fallback
        if (options?.promptType) {
          await logAIUsage({
            userId: options.userId,
            provider: result.provider,
            model: result.model,
            promptType: options.promptType,
            latencyMs: fallbackLatency,
            success: true,
            usedFallback: true
          });
        }

        console.log(`[AI Fallback] Success with ${result.provider}/${result.model}`);
        return { ...result, usedFallback: true };
      } catch (fallbackError) {
        console.error(`[AI Fallback] Fallback also failed:`, fallbackError);
        const fallbackLatency = Date.now() - fallbackStartTime;

        // Log fallback failure
        if (options?.promptType) {
          await logAIUsage({
            userId: options.userId,
            provider: config.fallback.provider,
            model: config.fallback.model,
            promptType: options.promptType,
            latencyMs: fallbackLatency,
            success: false,
            errorMessage: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
            usedFallback: true
          });
        }

        throw fallbackError;
      }
    }

    throw primaryError;
  }
}

async function callProvider(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string
): Promise<{ text: string; provider: string; model: string }> {
  switch (config.provider) {
    case 'lovable':
      return await callLovableAI(config, systemPrompt, userPrompt);
    case 'gemini':
      return await callGeminiDirect(config, systemPrompt, userPrompt);
    case 'openai':
    case 'groq':
    case 'deepseek':
    case 'openrouter':
      return await callOpenAICompatible(config, systemPrompt, userPrompt);
    case 'claude':
      return await callClaude(config, systemPrompt, userPrompt);
    default:
      console.warn(`[AI Call] Unknown provider ${config.provider}, falling back to Lovable`);
      return await callLovableAI(config, systemPrompt, userPrompt);
  }
}

async function callLovableAI(config: AIConfig, systemPrompt: string, userPrompt: string) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Lovable AI error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: config.provider,
    model: config.displayModel
  };
}

async function callGeminiDirect(config: AIConfig, systemPrompt: string, userPrompt: string) {
  const url = `${config.endpoint}/${config.model}:generateContent?key=${config.apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
      }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    provider: config.provider,
    model: config.displayModel
  };
}

async function callOpenAICompatible(config: AIConfig, systemPrompt: string, userPrompt: string) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${config.provider} API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: config.provider,
    model: config.displayModel
  };
}

async function callClaude(config: AIConfig, systemPrompt: string, userPrompt: string) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    text: data.content?.[0]?.text || '',
    provider: config.provider,
    model: config.displayModel
  };
}

// ============= GEMINI VISION (PDF) =============
export async function callGeminiVision(
  pdfBase64: string, 
  systemPrompt: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; model: string; finishReason: string; usedFallback: boolean }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const startTime = Date.now();

  // Buscar configuração de IA
  const config = await getAIConfig();
  
  // Para PDF, precisamos de Gemini Vision
  let apiKey: string | null = null;
  let useDirectGemini = false;
  let modelToUse = 'gemini-2.5-flash';

  if (config.provider === 'gemini' && config.apiKey) {
    apiKey = config.apiKey;
    useDirectGemini = true;
    modelToUse = config.model.replace('google/', '');
    console.log(`[Gemini Vision] Using direct Gemini API with model: ${modelToUse}`);
  } else {
    // Tentar buscar GEMINI_API_KEY do env (legado)
    apiKey = Deno.env.get('GEMINI_API_KEY') || null;
    
    if (!apiKey) {
      // Buscar do banco
      const { data: keyData } = await supabase
        .from('global_api_keys')
        .select('api_key')
        .eq('id', 'gemini')
        .single();
      
      apiKey = keyData?.api_key || null;
    }

    if (apiKey) {
      useDirectGemini = true;
      if (config.model && (config.model.includes('gemini') || config.provider === 'gemini')) {
        modelToUse = config.model.replace('google/', '');
      }
      console.log(`[Gemini Vision] Using Gemini API key from config with model: ${modelToUse}`);
    } else {
      throw new Error('Gemini API key required for PDF processing. Configure it in DevPanel.');
    }
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
  
  console.log(`[Gemini Vision] Calling model: ${modelToUse}`);

  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64
              }
            },
            { text: systemPrompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 32768,
          responseMimeType: "application/json"
        }
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Gemini Vision] API error:", response.status, errorText);
      
      // Log failure
      if (options?.promptType) {
        await logAIUsage({
          userId: options.userId,
          provider: 'gemini',
          model: modelToUse,
          promptType: options.promptType,
          latencyMs,
          success: false,
          errorMessage: `API error: ${response.status}`
        });
      }
      
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const finishReason = data.candidates?.[0]?.finishReason || 'STOP';
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Log success
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'gemini',
        model: modelToUse,
        promptType: options.promptType,
        latencyMs,
        success: true
      });
    }

    return {
      text,
      model: modelToUse,
      finishReason,
      usedFallback: false
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    
    // Log failure if not already logged
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'gemini',
        model: modelToUse,
        promptType: options.promptType,
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    throw error;
  }
}
