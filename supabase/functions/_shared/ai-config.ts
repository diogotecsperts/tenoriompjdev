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
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  minimax: 'https://api.minimax.io/v1/chat/completions',
};

// Modelos padrão de cada provider
const DEFAULT_MODELS: Record<string, string> = {
  lovable: 'google/gemini-2.5-flash',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  claude: 'claude-3-7-sonnet-20250219',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-v4-flash',
  openrouter: 'openai/gpt-4o',
  minimax: 'MiniMax-M3',
};

// ============= RETRY CONFIGURATION =============
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  retryableStatuses: number[];
}

type AIErrorCode =
  | 'quota_exceeded'
  | 'invalid_key'
  | 'rate_limited'
  | 'provider_timeout'
  | 'invalid_request'
  | 'response_truncated'
  | 'provider_unavailable'
  | 'unknown';

export class AIProviderError extends Error {
  code: AIErrorCode;
  stage: string;
  provider: string;
  model: string;
  upstreamStatus: number | null;
  technicalDetail: string;

  constructor(args: {
    message: string;
    code?: AIErrorCode;
    stage?: string;
    provider: string;
    model: string;
    upstreamStatus?: number | null;
    technicalDetail?: string;
  }) {
    super(args.message);
    this.name = 'AIProviderError';
    this.code = args.code || 'unknown';
    this.stage = args.stage || 'ai_generation';
    this.provider = args.provider;
    this.model = args.model;
    this.upstreamStatus = args.upstreamStatus ?? null;
    this.technicalDetail = args.technicalDetail || args.message;
  }
}

function sanitizeErrorDetail(raw: string, max = 1200): string {
  return raw
    .replace(/key=AIza[\w-]+/gi, 'key=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key["'\s:=]+[A-Za-z0-9._\-]+/gi, 'api_key=[redacted]')
    .slice(0, max);
}

function extractStatus(message: string): number | null {
  const match = message.match(/(?:HTTP\s+|status\D+|error\s*\()(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export function classifyAIProviderError(
  error: unknown,
  provider: string,
  model: string,
  stage = 'ai_generation',
): AIProviderError {
  if (error instanceof AIProviderError) return error;

  const raw = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  const detail = sanitizeErrorDetail(raw);
  const status = extractStatus(detail);
  const lower = detail.toLowerCase();

  let code: AIErrorCode = 'unknown';
  let message = `Falha no provider ${provider}/${model}.`;

  if (status === 402 || /credit|billing|balance|saldo|insufficient[_\s-]?quota|quota exceeded|resource_exhausted/i.test(detail)) {
    code = 'quota_exceeded';
    message = `Saldo/cota insuficiente no provider ${provider}/${model}.`;
  } else if (status === 429 || /rate limit|too many requests|requests per minute|rpm|tpm/i.test(detail)) {
    code = 'rate_limited';
    message = `Limite de requisições atingido no provider ${provider}/${model}.`;
  } else if (status === 401 || status === 403 || /invalid api key|api key not valid|unauthorized|forbidden|authentication/i.test(detail)) {
    code = 'invalid_key';
    message = `Credencial inválida ou sem permissão para ${provider}/${model}.`;
  } else if (status === 400 || /invalid request|invalid_argument|bad request|unsupported|not found|does not exist/i.test(detail)) {
    code = 'invalid_request';
    message = `Requisição inválida para ${provider}/${model}. Verifique modelo, parâmetros ou tamanho do contexto.`;
  } else if (/timeout|timed out|aborterror|request timeout|gateway timeout|504/.test(lower)) {
    code = 'provider_timeout';
    message = `Tempo excedido no provider ${provider}/${model}.`;
  } else if (/truncated|max_tokens|incomplete|json incompleto|unterminated/i.test(detail)) {
    code = 'response_truncated';
    message = `Resposta incompleta/truncada do provider ${provider}/${model}.`;
  } else if ((status && status >= 500) || /unavailable|overloaded|temporarily|server error|bad gateway|service unavailable/i.test(detail)) {
    code = 'provider_unavailable';
    message = `Provider ${provider}/${model} indisponível no momento.`;
  }

  return new AIProviderError({
    message,
    code,
    stage,
    provider,
    model,
    upstreamStatus: status,
    technicalDetail: detail,
  });
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  retryableStatuses: [429, 502, 503, 504]
};

// Cache for retry configuration
let retryConfigCache: { config: RetryConfig; timestamp: number } | null = null;
const RETRY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get retry configuration from database with caching
 */
export async function getRetryConfig(): Promise<RetryConfig> {
  // Check cache first
  if (retryConfigCache && Date.now() - retryConfigCache.timestamp < RETRY_CACHE_TTL_MS) {
    return retryConfigCache.config;
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('system_config')
      .select('id, value')
      .in('id', ['retry_max_attempts', 'retry_base_delay_ms', 'retry_enabled']);

    if (error) throw error;

    const configMap: Record<string, any> = {};
    data?.forEach(item => { configMap[item.id] = item.value; });

    const config: RetryConfig = {
      maxRetries: configMap.retry_enabled === false ? 0 : (configMap.retry_max_attempts ?? 3),
      baseDelayMs: configMap.retry_base_delay_ms ?? 1000,
      retryableStatuses: [429, 502, 503, 504]
    };

    retryConfigCache = { config, timestamp: Date.now() };
    console.log(`[Retry Config] Loaded: enabled=${configMap.retry_enabled !== false}, maxRetries=${config.maxRetries}, baseDelay=${config.baseDelayMs}ms`);

    return config;
  } catch (err) {
    console.error('[Retry Config] Error loading, using defaults:', err);
    return DEFAULT_RETRY_CONFIG;
  }
}

/**
 * Invalidate retry config cache (call after saving new config)
 */
export function invalidateRetryConfigCache(): void {
  retryConfigCache = null;
  console.log('[Retry Config] Cache invalidated');
}

/**
 * Fetch with automatic retry and exponential backoff for rate limits
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  configOverride?: Partial<RetryConfig> & { requestTimeoutMs?: number }
): Promise<Response> {
  // Load config from database (cached)
  const baseConfig = await getRetryConfig();
  const config = { ...baseConfig, ...configOverride };
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const controller = configOverride?.requestTimeoutMs ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), configOverride!.requestTimeoutMs)
        : null;
      const response = await fetch(url, {
        ...options,
        signal: controller?.signal || options.signal,
      }).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      // Success - return immediately
      if (response.ok) {
        if (attempt > 0) {
          console.log(`[Retry] ✅ Success after ${attempt} retries`);
        }
        return response;
      }

      lastResponse = response;

      // Check if error is retryable and we have attempts left
      if (config.retryableStatuses.includes(response.status) && attempt < config.maxRetries) {
        const delay = config.baseDelayMs * Math.pow(2, attempt); // Exponential: 1s, 2s, 4s
        console.log(`[Retry] ⏳ Status ${response.status} (rate limit), waiting ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Not retryable or exhausted retries - return the response for error handling
      return response;
    } catch (networkError) {
      lastError = networkError instanceof Error ? networkError : new Error(String(networkError));

      if (networkError instanceof DOMException && networkError.name === 'AbortError') {
        throw new Error(`Request timeout after ${configOverride?.requestTimeoutMs ?? 0}ms`);
      }
      
      // Network errors can also be retried
      if (attempt < config.maxRetries) {
        const delay = config.baseDelayMs * Math.pow(2, attempt);
        console.log(`[Retry] 🔌 Network error, waiting ${delay}ms (attempt ${attempt + 1}/${config.maxRetries}): ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw lastError;
    }
  }

  // Should not reach here, but just in case
  if (lastResponse) return lastResponse;
  throw lastError || new Error('Unknown error in fetchWithRetry');
}

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
  retryCount?: number;
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Include retry count in error message if present (for backward compatibility)
    let errorMessage = params.errorMessage || null;
    if (params.retryCount && params.retryCount > 0 && !params.success) {
      errorMessage = errorMessage 
        ? `${errorMessage} (after ${params.retryCount} retries)`
        : `Failed after ${params.retryCount} retries`;
    }
    
    await supabase.from('ai_usage_logs').insert({
      user_id: params.userId || '00000000-0000-0000-0000-000000000000',
      provider: params.provider,
      model: params.model,
      prompt_type: params.promptType,
      tokens_input: params.tokensInput || 0,
      tokens_output: params.tokensOutput || 0,
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: errorMessage,
      retry_count: params.retryCount || 0,
      used_fallback: params.usedFallback || false
    });

    const retryInfo = params.retryCount && params.retryCount > 0 ? ` (${params.retryCount} retries)` : '';
    const fallbackInfo = params.usedFallback ? ' (FALLBACK)' : '';
    console.log(`[AI Usage Log] ${params.promptType} - ${params.provider}/${params.model} - ${params.success ? 'SUCCESS' : 'FAILED'} - ${params.latencyMs}ms${fallbackInfo}${retryInfo}`);
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
    } else if (provider === 'minimax') {
      // MiniMax: chave via env (MINIMAX_API_KEY), consistente com Mistral OCR
      const minimaxKey = Deno.env.get('MINIMAX_API_KEY');
      if (!minimaxKey) {
        console.warn('[AI Config] MINIMAX_API_KEY não configurada, fallback para Lovable AI');
        primaryConfig = getDefaultConfig();
      } else {
        // Model é sempre MiniMax-M3 — força caso venha algo diferente
        primaryConfig = {
          provider: 'minimax',
          model: 'MiniMax-M3',
          apiKey: minimaxKey,
          endpoint: PROVIDER_ENDPOINTS.minimax,
          displayModel: 'MiniMax-M3',
        };
      }
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
    } else if (fallbackProvider === 'minimax') {
      const minimaxKey = Deno.env.get('MINIMAX_API_KEY');
      if (minimaxKey) {
        fallbackConfig = {
          provider: 'minimax',
          model: 'MiniMax-M3',
          apiKey: minimaxKey,
          endpoint: PROVIDER_ENDPOINTS.minimax,
          displayModel: 'MiniMax-M3',
        };
      } else {
        const lovableKey = Deno.env.get('LOVABLE_API_KEY');
        fallbackConfig = {
          provider: 'lovable',
          model: 'google/gemini-2.5-flash',
          apiKey: lovableKey || null,
          endpoint: PROVIDER_ENDPOINTS.lovable,
          displayModel: 'gemini-2.5-flash'
        };
      }
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
  options?: { userId?: string; promptType?: string; maxOutputTokens?: number; jsonMode?: boolean; requestTimeoutMs?: number }
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean }> {
  console.log(`[AI Call] Provider: ${config.provider}, Model: ${config.model}${options?.maxOutputTokens ? `, maxOutputTokens: ${options.maxOutputTokens}` : ''}${options?.jsonMode ? ', jsonMode: true' : ''}`);
  const startTime = Date.now();

  if (!config.apiKey) {
    throw new Error(`API key not configured for provider: ${config.provider}`);
  }

  try {
    const result = await callProvider(config, systemPrompt, userPrompt, options?.maxOutputTokens, { jsonMode: options?.jsonMode, requestTimeoutMs: options?.requestTimeoutMs });
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
    const classifiedPrimary = classifyAIProviderError(primaryError, config.provider, config.model, 'ai_generation');
    console.error(`[AI Call] Primary provider ${config.provider} failed:`, classifiedPrimary);
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
        errorMessage: `${classifiedPrimary.code}: ${classifiedPrimary.technicalDetail}`,
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

        const result = await callProvider(fallbackConfig, systemPrompt, userPrompt, options?.maxOutputTokens, { jsonMode: options?.jsonMode, requestTimeoutMs: Math.min(options?.requestTimeoutMs || 60_000, 60_000) });
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
        const classifiedFallback = classifyAIProviderError(fallbackError, config.fallback.provider, config.fallback.model, 'ai_generation');
        console.error(`[AI Fallback] Fallback also failed:`, classifiedFallback);
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
          errorMessage: `${classifiedFallback.code}: ${classifiedFallback.technicalDetail}`,
            usedFallback: true
          });
        }

        throw classifiedFallback;
      }
    }

    throw classifiedPrimary;
  }
}

async function callProvider(
  config: AIConfig, 
  systemPrompt: string, 
  userPrompt: string,
  maxOutputTokens?: number,
  options?: { jsonMode?: boolean; requestTimeoutMs?: number }
): Promise<{ text: string; provider: string; model: string }> {
  switch (config.provider) {
    case 'lovable':
      return await callLovableAI(config, systemPrompt, userPrompt, maxOutputTokens, options);
    case 'gemini':
      return await callGeminiDirect(config, systemPrompt, userPrompt, maxOutputTokens, options);
    case 'openai':
    case 'groq':
    case 'deepseek':
    case 'openrouter':
    case 'minimax':
      return await callOpenAICompatible(config, systemPrompt, userPrompt, maxOutputTokens, options);
    case 'claude':
      return await callClaude(config, systemPrompt, userPrompt, maxOutputTokens);
    default:
      console.warn(`[AI Call] Unknown provider ${config.provider}, falling back to Lovable`);
      return await callLovableAI(config, systemPrompt, userPrompt, maxOutputTokens, options);
  }
}

async function callLovableAI(config: AIConfig, systemPrompt: string, userPrompt: string, maxOutputTokens?: number, options?: { jsonMode?: boolean; requestTimeoutMs?: number }) {
  const body: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  };
  
  // Add max_tokens if specified (OpenAI-compatible parameter)
  if (maxOutputTokens) {
    body.max_tokens = maxOutputTokens;
  }
  
  // JSON mode for OpenAI-compatible APIs (Lovable AI gateway)
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
    console.log('[callLovableAI] JSON mode enabled');
  }
  
  const response = await fetchWithRetry(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, { requestTimeoutMs: options?.requestTimeoutMs || 75_000 });

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

async function callGeminiDirect(config: AIConfig, systemPrompt: string, userPrompt: string, maxOutputTokens?: number, options?: { jsonMode?: boolean; requestTimeoutMs?: number }) {
  const url = `${config.endpoint}/${config.model}:generateContent?key=${config.apiKey}`;
  
  const generationConfig: any = {
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: maxOutputTokens || 8192,
  };
  
  // JSON mode for Gemini
  if (options?.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
    console.log('[callGeminiDirect] JSON mode enabled (responseMimeType: application/json)');
  }

  // Safety settings — desativar bloqueios automáticos (contexto médico/legal)
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ];
  
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [{ text: userPrompt }]
      }],
      generationConfig,
      safetySettings,
    })
  }, { requestTimeoutMs: options?.requestTimeoutMs || 75_000 });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const finishReason = candidate?.finishReason || 'UNKNOWN';

  // Detectar resposta vazia (SAFETY, MAX_TOKENS, etc.) para acionar fallback em vez de silêncio
  if (!text) {
    throw new Error(`Gemini returned empty response (finishReason: ${finishReason})`);
  }

  return {
    text,
    provider: config.provider,
    model: config.displayModel
  };
}

async function callOpenAICompatible(config: AIConfig, systemPrompt: string, userPrompt: string, maxOutputTokens?: number, options?: { jsonMode?: boolean; requestTimeoutMs?: number }) {
  const isDeepSeek = config.provider === 'deepseek';
  const isDeepSeekReasoner = isDeepSeek && config.model.includes('reasoner');
  const isMinimax = config.provider === 'minimax';

  // DeepSeek JSON quirk: exige a palavra "json" no prompt (system ou user) senão pode retornar vazio
  let finalSystemPrompt = systemPrompt;
  if (isDeepSeek && options?.jsonMode) {
    const hasJsonKeyword = /json/i.test(systemPrompt) || /json/i.test(userPrompt);
    if (!hasJsonKeyword) {
      finalSystemPrompt = `${systemPrompt}\n\nResponda em formato JSON válido.`;
      console.log('[callOpenAICompatible] DeepSeek JSON mode: injecting "json" keyword');
    }
  }

  const body: any = {
    model: isMinimax ? 'MiniMax-M3' : config.model, // MiniMax é sempre M3 (id case-sensitive)
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
  };
  
  // Add max_tokens if specified
  if (maxOutputTokens) {
    body.max_tokens = maxOutputTokens;
  }
  
  // JSON mode for OpenAI-compatible APIs
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
    console.log(`[callOpenAICompatible] JSON mode enabled for ${config.provider}`);
  }

  // DeepSeek V4 default: desligar thinking mode (mais rápido/previsível). Manter só no legacy `-reasoner`.
  if (isDeepSeek && !isDeepSeekReasoner) {
    body.thinking = { type: 'disabled' };
  }
  // MiniMax M3: thinking SEMPRE desabilitado (economia 30-40% output, evita lixo)
  if (isMinimax) {
    body.thinking = { type: 'disabled' };
    body.temperature = body.temperature ?? 0;
  }
  
  const response = await fetchWithRetry(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, { requestTimeoutMs: options?.requestTimeoutMs || 75_000 });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${config.provider} API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  // DeepSeek em JSON mode pode retornar content vazio (issue documentado) — lançar erro para acionar fallback
  if (isDeepSeek && !text) {
    throw new Error('DeepSeek returned empty content (known JSON mode issue)');
  }

  return {
    text,
    provider: config.provider,
    model: config.displayModel
  };
}

async function callClaude(config: AIConfig, systemPrompt: string, userPrompt: string, maxOutputTokens?: number, options?: { requestTimeoutMs?: number }) {
  const response = await fetchWithRetry(config.endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxOutputTokens || 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    }),
  }, { requestTimeoutMs: options?.requestTimeoutMs || 75_000 });

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

// ============= PDF PROVIDER CONFIGURATION =============
export interface PDFConfig {
  provider: string;  // 'openrouter', 'gemini', 'lovable'
  model: string;     // e.g. 'google/gemini-2.5-flash'
  fallbackProvider: string;
  fallbackModel: string;
}

// Models with high context for PDF processing via OpenRouter
export const OPENROUTER_PDF_MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M tokens', cost: '$0.10/M' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '1M tokens', cost: '$2.50/M' },
  { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', context: '1M tokens', cost: '$2/M' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context: '200K tokens', cost: '$3/M' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context: '128K tokens', cost: '$0.40/M' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', context: '64K tokens', cost: '$0.14/M' },
];

async function getPDFConfig(): Promise<PDFConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Config unificada: phase1_ocr_provider + phase1_gemini_model são a única fonte
  // de verdade para OCR em todos os módulos. pdf_fallback_* permanece como
  // fallback opcional configurável.
  const { data, error } = await supabase
    .from('system_config')
    .select('id, value')
    .in('id', ['phase1_ocr_provider', 'phase1_gemini_model', 'pdf_fallback_provider', 'pdf_fallback_model']);

  if (error) {
    console.error('[getPDFConfig] Error:', error);
    return {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallbackProvider: 'lovable',
      fallbackModel: 'google/gemini-2.5-flash'
    };
  }

  const configMap: Record<string, any> = {};
  data?.forEach(item => {
    configMap[item.id] = typeof item.value === 'string' ? item.value : String(item.value);
  });

  // callPDFProvider aceita 'openrouter' | 'gemini' | 'lovable'.
  // Mapear valores do OCR unificado para o schema esperado.
  const rawProvider = (configMap.phase1_ocr_provider || 'gemini').toLowerCase();
  const provider = rawProvider === 'gemini' ? 'gemini' : 'lovable'; // mistral/minimax caem em lovable como safety net
  const model = provider === 'gemini'
    ? (configMap.phase1_gemini_model || 'gemini-2.5-flash')
    : 'google/gemini-2.5-flash';

  return {
    provider,
    model,
    fallbackProvider: configMap.pdf_fallback_provider || 'lovable',
    fallbackModel: configMap.pdf_fallback_model || 'google/gemini-2.5-flash'
  };
}


// ============= PDF PROVIDER ROUTER WITH DYNAMIC FALLBACK =============
export async function callPDFProvider(
  pdfBase64: string,
  systemPrompt: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; model: string; provider: string; finishReason: string; usedFallback: boolean; originalProvider?: string; fallbackReason?: string }> {
  const pdfConfig = await getPDFConfig();
  console.log(`[callPDFProvider] Primary: ${pdfConfig.provider}/${pdfConfig.model}, Fallback: ${pdfConfig.fallbackProvider}/${pdfConfig.fallbackModel}`);

  try {
    // Try primary provider
    switch (pdfConfig.provider) {
      case 'openrouter':
        return await callOpenRouterPDF(pdfBase64, pdfConfig.model, systemPrompt, options);
      case 'gemini':
        const geminiResult = await callGeminiVision(pdfBase64, systemPrompt, pdfConfig.model, options);
        return { ...geminiResult, provider: 'gemini' };
      case 'lovable':
        return await callLovableAIPDF(pdfBase64, pdfConfig.model, systemPrompt, options);
      default:
        console.warn(`[callPDFProvider] Unknown provider ${pdfConfig.provider}, falling back to OpenRouter`);
        return await callOpenRouterPDF(pdfBase64, pdfConfig.model, systemPrompt, options);
    }
  } catch (primaryError) {
    console.error(`[callPDFProvider] ❌ Primary provider ${pdfConfig.provider}/${pdfConfig.model} failed:`, primaryError);
    
    const errorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
    
    // Detectar erro específico de limite de páginas do Anthropic/Claude
    const isPageLimitError = errorMessage.includes('100 PDF pages') || 
                             errorMessage.includes('maximum of 100');
    
    const fallbackReason = isPageLimitError 
      ? 'Limite de 100 páginas excedido (Anthropic)' 
      : 'Erro no provider principal';
    
    if (isPageLimitError) {
      console.warn('[callPDFProvider] ⚠️ Anthropic page limit detected - switching to Gemini model');
    }
    
    // CORREÇÃO: Comparar providers E modelos para decidir fallback
    const differentProvider = pdfConfig.provider !== pdfConfig.fallbackProvider;
    const differentModel = pdfConfig.model !== pdfConfig.fallbackModel;
    const shouldTryFallback = differentProvider || differentModel;
    
    console.log(`[callPDFProvider] Fallback check: differentProvider=${differentProvider}, differentModel=${differentModel}, willTryFallback=${shouldTryFallback}`);
    
    if (shouldTryFallback) {
      console.log(`[callPDFProvider] 🔄 Trying configured fallback: ${pdfConfig.fallbackProvider}/${pdfConfig.fallbackModel}`);
      try {
        let fallbackResult;
        switch (pdfConfig.fallbackProvider) {
          case 'openrouter':
            fallbackResult = await callOpenRouterPDF(pdfBase64, pdfConfig.fallbackModel, systemPrompt, options);
            break;
          case 'gemini':
            const gemResult = await callGeminiVision(pdfBase64, systemPrompt, pdfConfig.fallbackModel, options);
            fallbackResult = { ...gemResult, provider: 'gemini' };
            break;
          case 'lovable':
          default:
            fallbackResult = await callLovableAIPDF(pdfBase64, pdfConfig.fallbackModel, systemPrompt, options);
            break;
        }
        console.log(`[callPDFProvider] ✅ Fallback ${pdfConfig.fallbackProvider}/${pdfConfig.fallbackModel} succeeded`);
        return { ...fallbackResult, usedFallback: true, originalProvider: `${pdfConfig.provider}/${pdfConfig.model}`, fallbackReason };
      } catch (fallbackError) {
        console.error(`[callPDFProvider] ❌ Fallback ${pdfConfig.fallbackProvider}/${pdfConfig.fallbackModel} also failed:`, fallbackError);
        
        // Last resort: Lovable AI (if not already tried)
        if (pdfConfig.fallbackProvider !== 'lovable') {
          console.log('[callPDFProvider] 🔄 Last resort: Lovable AI with google/gemini-2.5-flash');
          try {
            const lastResortResult = await callLovableAIPDF(pdfBase64, 'google/gemini-2.5-flash', systemPrompt, options);
            return { ...lastResortResult, usedFallback: true, originalProvider: `${pdfConfig.provider}/${pdfConfig.model}`, fallbackReason: 'Todos os providers configurados falharam' };
          } catch (lastError) {
            console.error('[callPDFProvider] ❌ All providers failed');
          }
        }
      }
    }
    
    throw primaryError;
  }
}

// ============= OPENROUTER PDF WITH RETRY =============
async function callOpenRouterPDF(
  pdfBase64: string,
  model: string,
  systemPrompt: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; model: string; provider: string; finishReason: string; usedFallback: boolean }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const startTime = Date.now();

  // Get OpenRouter API key
  const { data: keyData } = await supabase
    .from('global_api_keys')
    .select('api_key')
    .eq('id', 'openrouter')
    .single();

  if (!keyData?.api_key) {
    throw new Error('OpenRouter API key not configured. Configure it in DevPanel.');
  }

  console.log(`[OpenRouter PDF] Calling model: ${model}`);

  try {
    const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyData.api_key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovable.dev',
        'X-Title': 'Perito AI - PDF Processing'
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: `data:application/pdf;base64,${pdfBase64}`
              }
            }
          ]
        }],
        max_tokens: 32768,
        response_format: { type: 'json_object' }
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OpenRouter PDF] API error:", response.status, errorText);
      
      if (options?.promptType) {
        await logAIUsage({
          userId: options.userId,
          provider: 'openrouter',
          model: model,
          promptType: options.promptType,
          latencyMs,
          success: false,
          errorMessage: `API error: ${response.status} - ${errorText}`
        });
      }
      
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason || 'stop';
    const text = data.choices?.[0]?.message?.content || '';

    // Log success
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'openrouter',
        model: model,
        promptType: options.promptType,
        latencyMs,
        success: true,
        tokensInput: data.usage?.prompt_tokens,
        tokensOutput: data.usage?.completion_tokens
      });
    }

    console.log(`[OpenRouter PDF] Success - Model: ${model}, Finish: ${finishReason}, Latency: ${latencyMs}ms`);

    return {
      text,
      model,
      provider: 'openrouter',
      finishReason,
      usedFallback: false
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'openrouter',
        model: model,
        promptType: options.promptType,
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    throw error;
  }
}

// ============= LOVABLE AI PDF WITH RETRY =============
async function callLovableAIPDF(
  pdfBase64: string,
  model: string,
  systemPrompt: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; model: string; provider: string; finishReason: string; usedFallback: boolean }> {
  const startTime = Date.now();
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');

  if (!lovableKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  console.log(`[Lovable AI PDF] Calling model: ${model}`);

  try {
    // Lovable AI uses base64 inline for files
    const response = await fetchWithRetry('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`
              }
            }
          ]
        }],
        max_tokens: 32768,
        response_format: { type: 'json_object' }
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Lovable AI PDF] API error:", response.status, errorText);
      
      if (options?.promptType) {
        await logAIUsage({
          userId: options.userId,
          provider: 'lovable',
          model: model,
          promptType: options.promptType,
          latencyMs,
          success: false,
          errorMessage: `API error: ${response.status}`
        });
      }
      
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason || 'stop';
    const text = data.choices?.[0]?.message?.content || '';

    // Capturar tokens para cálculo de custo
    const tokensInput = data.usage?.prompt_tokens || 0;
    const tokensOutput = data.usage?.completion_tokens || 0;

    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'lovable',
        model: model,
        promptType: options.promptType,
        latencyMs,
        success: true,
        tokensInput,
        tokensOutput
      });
    }

    console.log(`[Lovable AI PDF] Success - Tokens: ${tokensInput}/${tokensOutput}, Latency: ${latencyMs}ms`);

    return {
      text,
      model,
      provider: 'lovable',
      finishReason,
      usedFallback: false
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    
    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'lovable',
        model: model,
        promptType: options.promptType,
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    throw error;
  }
}

// ============= GEMINI VISION (PDF) WITH RETRY =============
export async function callGeminiVision(
  pdfBase64: string, 
  systemPrompt: string,
  model: string,
  options?: { userId?: string; promptType?: string }
): Promise<{ text: string; model: string; finishReason: string; usedFallback: boolean }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const startTime = Date.now();

  // Use the model passed as parameter (from pdfConfig)
  let modelToUse = model.replace('google/', '');
  console.log(`[Gemini Vision] Using model from pdfConfig: ${modelToUse}`);

  // Get Gemini API key
  let apiKey: string | null = null;
  
  // First try from AI config
  const config = await getAIConfig();
  if (config.provider === 'gemini' && config.apiKey) {
    apiKey = config.apiKey;
    console.log(`[Gemini Vision] Using API key from AI config`);
  } else {
    // Try environment variable
    apiKey = Deno.env.get('GEMINI_API_KEY') || null;
    
    if (!apiKey) {
      // Try from global_api_keys table
      const { data: keyData } = await supabase
        .from('global_api_keys')
        .select('api_key')
        .eq('id', 'gemini')
        .single();
      
      apiKey = keyData?.api_key || null;
    }

    if (apiKey) {
      console.log(`[Gemini Vision] Using API key from global_api_keys`);
    } else {
      throw new Error('Gemini API key required for PDF processing. Configure it in DevPanel.');
    }
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
  
  console.log(`[Gemini Vision] Calling model: ${modelToUse}`);

  try {
    const response = await fetchWithRetry(geminiUrl, {
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
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Gemini Vision] API error:", response.status, errorText);
      
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

    // Capturar tokens do Gemini para cálculo de custo
    const tokensInput = data.usageMetadata?.promptTokenCount || 0;
    const tokensOutput = data.usageMetadata?.candidatesTokenCount || 0;

    if (options?.promptType) {
      await logAIUsage({
        userId: options.userId,
        provider: 'gemini',
        model: modelToUse,
        promptType: options.promptType,
        latencyMs,
        success: true,
        tokensInput,
        tokensOutput
      });
    }

    console.log(`[Gemini Vision] Success - Tokens: ${tokensInput}/${tokensOutput}, Latency: ${latencyMs}ms`);

    return {
      text,
      model: modelToUse,
      finishReason,
      usedFallback: false
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    
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
