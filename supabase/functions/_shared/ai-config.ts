import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AIConfig {
  provider: string;       // 'lovable', 'gemini', 'openai', 'claude', 'groq', 'deepseek', 'openrouter'
  model: string;          // ex: 'gemini-2.5-pro', 'gpt-4o'
  apiKey: string | null;  // API key do provider (null se lovable)
  endpoint: string;       // URL do endpoint
  displayModel: string;   // Nome amigável para exibição
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

export async function getAIConfig(): Promise<AIConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Buscar configurações do sistema
    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('id, value')
      .in('id', ['default_ai_provider', 'default_ai_model']);

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

    console.log(`[AI Config] Provider from DB: ${provider}, Model: ${model}`);

    // Se provider for lovable, não precisa de API key externa
    if (provider === 'lovable') {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableKey) {
        console.error('[AI Config] LOVABLE_API_KEY not configured');
      }
      return {
        provider: 'lovable',
        model,
        apiKey: lovableKey || null,
        endpoint: PROVIDER_ENDPOINTS.lovable,
        displayModel: model.replace('google/', '')
      };
    }

    // Buscar API key do provider selecionado
    const { data: keyData, error: keyError } = await supabase
      .from('global_api_keys')
      .select('api_key')
      .eq('id', provider)
      .single();

    if (keyError || !keyData?.api_key) {
      console.warn(`[AI Config] No API key found for provider ${provider}, falling back to Lovable AI`);
      return getDefaultConfig();
    }

    // Ajustar modelo se necessário (remover prefixo google/ para API Gemini direta)
    if (provider === 'gemini' && model.startsWith('google/')) {
      model = model.replace('google/', '');
    }

    console.log(`[AI Config] Using provider: ${provider}, model: ${model}`);

    return {
      provider,
      model,
      apiKey: keyData.api_key,
      endpoint: PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.lovable,
      displayModel: model
    };

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
    displayModel: 'gemini-2.5-flash'
  };
}

// Função para fazer chamada à IA com roteamento por provider
export async function callAI(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string
): Promise<{ text: string; provider: string; model: string }> {
  console.log(`[AI Call] Provider: ${config.provider}, Model: ${config.model}`);

  if (!config.apiKey) {
    throw new Error(`API key not configured for provider: ${config.provider}`);
  }

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

// Função especial para Gemini Vision (PDF)
export async function callGeminiVision(
  pdfBase64: string, 
  systemPrompt: string
): Promise<{ text: string; model: string; finishReason: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Buscar configuração de IA
  const config = await getAIConfig();
  
  // Para PDF, precisamos de Gemini Vision
  // Se o provider atual for Gemini com API key, usar direto
  // Caso contrário, usar Lovable AI com modelo Gemini
  
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
      // Se temos modelo configurado e é gemini, usar ele
      if (config.model && (config.model.includes('gemini') || config.provider === 'gemini')) {
        modelToUse = config.model.replace('google/', '');
      }
      console.log(`[Gemini Vision] Using Gemini API key from config with model: ${modelToUse}`);
    } else {
      // Fallback para Lovable AI (não suporta PDF diretamente)
      throw new Error('Gemini API key required for PDF processing. Configure it in DevPanel.');
    }
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
  
  console.log(`[Gemini Vision] Calling model: ${modelToUse}`);

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Gemini Vision] API error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const finishReason = data.candidates?.[0]?.finishReason || 'STOP';
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    text,
    model: modelToUse,
    finishReason
  };
}
