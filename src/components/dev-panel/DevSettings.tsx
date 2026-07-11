import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Save, AlertTriangle, RefreshCw, Zap, Lock, Eye, EyeOff, Check, Globe, Cpu, Shield, Play, XCircle, CheckCircle2, Plus, Copy, Trash2, Star, FileText, Pin, PinOff, Crown, Search, Activity, Clock } from "lucide-react";

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: string[];
  requiresKey: boolean;
  color: string;
  keyPlaceholder?: string;
  customModelInput?: boolean;
  modelPlaceholder?: string;
  modelDocsUrl?: string;
}

// Informações detalhadas do modelo Gemini
interface GeminiModelInfo {
  id: string;
  displayName: string;
  family: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsPdf: boolean;
  isImageModel: boolean;
  isVersioned: boolean;
}

interface SystemConfig {
  default_ai_provider: string;
  default_ai_model: string;
  fallback_ai_provider: string;
  fallback_ai_model: string;
  gemini_pdf_model: string;
  pdf_ai_provider: string;
  pdf_ai_model: string;
  pdf_fallback_provider: string;
  pdf_fallback_model: string;
  maintenance_mode: boolean;
  max_pdf_size_mb: number;
  allowed_ai_providers: string[];
  retry_enabled: boolean;
  retry_max_attempts: number;
  retry_base_delay_ms: number;
  // Two-phase import strategy
  import_strategy: string;
  text_fill_provider: string;
  text_fill_model: string;
  store_extracted_text: boolean;
  phase1_gemini_model: string;
  phase1_ocr_provider: string; // 'gemini' or 'mistral'
}

interface ApiKeys {
  [key: string]: string;
}

interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
  testedAt?: Date;
}

const GEMINI_SAFE_DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_FLASH_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-8b",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash"
];

const normalizeGeminiModelId = (modelId?: string | null) => (modelId || "").replace(/^google\//, "");

const isGeminiProModel = (modelId: string) => /(^|-)pro($|-)/i.test(modelId) || /pro-preview/i.test(modelId);
const isGeminiFlashModel = (modelId: string) => /(^|-)flash($|-)/i.test(modelId) || /flash-lite/i.test(modelId);
const isGeminiNonTextUtilityModel = (modelId: string) => /(?:image|imagen|tts|audio|lyria|robotics|computer-use|deep-research|omni|banana|antigravity)/i.test(modelId);

const getGeminiModelRank = (modelId: string) => {
  const normalized = normalizeGeminiModelId(modelId);
  const preferredIndex = GEMINI_FLASH_PRIORITY.indexOf(normalized);
  if (preferredIndex >= 0) return preferredIndex;
  if (isGeminiFlashModel(normalized) && !isGeminiNonTextUtilityModel(normalized)) return 100;
  if (isGeminiNonTextUtilityModel(normalized)) return 700;
  if (isGeminiProModel(normalized)) return 900;
  return 500;
};

const sortGeminiModelsSafely = (models: string[]) => Array.from(new Set(models.map(normalizeGeminiModelId).filter(Boolean))).sort((a, b) => {
  const rankDiff = getGeminiModelRank(a) - getGeminiModelRank(b);
  return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
});

const getSafeGeminiDefaultModel = (currentModel?: string | null, models: string[] = []) => {
  const rawCurrent = currentModel || "";
  const normalizedCurrent = normalizeGeminiModelId(rawCurrent);
  if (!rawCurrent.startsWith("google/") && normalizedCurrent && isGeminiFlashModel(normalizedCurrent) && !isGeminiNonTextUtilityModel(normalizedCurrent)) {
    return normalizedCurrent;
  }

  const sortedModels = sortGeminiModelsSafely(models);
  return sortedModels.find(model => isGeminiFlashModel(model) && !isGeminiNonTextUtilityModel(model)) || GEMINI_SAFE_DEFAULT_MODEL;
};

const AI_PROVIDERS: ProviderInfo[] = [{
  id: "lovable",
  name: "IA Integrada",
  description: "Gateway integrado sem necessidade de API key externa.",
  models: ["google/gemini-3-flash-preview", "google/gemini-3-pro-preview", "google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5", "openai/gpt-5-mini"],
  requiresKey: false,
  color: "hsl(168, 58%, 39%)"
}, {
  id: "mistral-ocr",
  name: "Mistral OCR",
  description: "Precisão elite (~94.9%) para tabelas e documentos escaneados. OCR especializado.",
  models: ["mistral-ocr-latest"],
  requiresKey: true,
  color: "hsl(168, 58%, 39%)",
  keyPlaceholder: "..."
}, {
  id: "openai",
  name: "OpenAI",
  description: "Modelos GPT-4o e série o1.",
  models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  requiresKey: true,
  color: "hsl(160, 84%, 39%)",
  keyPlaceholder: "sk-..."
}, {
  id: "gemini",
  name: "Google Gemini",
  description: "Modelos Gemini via Google AI Studio. Use 'Atualizar Modelos' para ver modelos disponíveis.",
  models: sortGeminiModelsSafely([
    // Flash — FREE TIER (recomendados como padrão)
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    // Pro — REQUEREM BILLING habilitado no Google AI Studio
    "gemini-3-pro-preview",
    "gemini-2.5-pro",
    "gemini-1.5-pro"
  ]),
  requiresKey: true,
  color: "hsl(217, 91%, 60%)",
  keyPlaceholder: "AIza..."
}, {
  id: "claude",
  name: "Anthropic Claude",
  description: "Modelos Claude com raciocínio avançado.",
  models: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  requiresKey: true,
  color: "hsl(25, 95%, 53%)",
  keyPlaceholder: "sk-ant-..."
}, {
  id: "groq",
  name: "Groq",
  description: "Inferência ultra-rápida com modelos open-source.",
  models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "meta-llama/llama-guard-4-12b", "qwen/qwen3-32b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct", "groq/compound", "groq/compound-mini", "whisper-large-v3", "whisper-large-v3-turbo"],
  requiresKey: true,
  color: "hsl(280, 87%, 65%)",
  keyPlaceholder: "gsk_...",
  customModelInput: true,
  modelPlaceholder: "llama-3.3-70b-versatile",
  modelDocsUrl: "https://console.groq.com/docs/models"
}, {
  id: "deepseek",
  name: "DeepSeek",
  description: "Modelos de alta qualidade com preços competitivos.",
  models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
  requiresKey: true,
  color: "hsl(200, 95%, 48%)",
  keyPlaceholder: "sk-..."
}, {
  id: "openrouter",
  name: "OpenRouter",
  description: "Gateway unificado com 200+ modelos de diversos providers.",
  models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001", "meta-llama/llama-3.3-70b-instruct", "thudm/glm-4-air-250414:free", "deepseek/deepseek-r1:free"],
  requiresKey: true,
  color: "hsl(340, 82%, 52%)",
  keyPlaceholder: "sk-or-...",
  customModelInput: true,
  modelPlaceholder: "provider/model-name ou provider/model:variant",
  modelDocsUrl: "https://openrouter.ai/models"
}, {
  id: "minimax",
  name: "MiniMax",
  description: "MiniMax M3 — chat multimodal, thinking desativado, temperature=0.",
  models: ["MiniMax-M3"],
  requiresKey: true,
  color: "hsl(45, 93%, 47%)",
  keyPlaceholder: "sk-cp-..."
}];

const DEFAULT_CONFIG: SystemConfig = {
  default_ai_provider: "lovable",
  default_ai_model: "google/gemini-2.5-flash",
  fallback_ai_provider: "lovable",
  fallback_ai_model: "google/gemini-2.5-flash",
  gemini_pdf_model: "gemini-2.5-flash",
  pdf_ai_provider: "openrouter",
  pdf_ai_model: "google/gemini-2.5-flash",
  pdf_fallback_provider: "lovable",
  pdf_fallback_model: "google/gemini-2.5-flash",
  maintenance_mode: false,
  max_pdf_size_mb: 50,
  allowed_ai_providers: ["lovable", "openai", "gemini", "claude", "groq", "deepseek", "openrouter", "minimax"],
  retry_enabled: true,
  retry_max_attempts: 3,
  retry_base_delay_ms: 1000,
  // Two-phase import strategy defaults
  import_strategy: "two_phase",
  text_fill_provider: "openrouter",
  text_fill_model: "openai/gpt-4o-mini",
  store_extracted_text: true,
  phase1_gemini_model: "gemini-2.5-flash",
  phase1_ocr_provider: "gemini"
};

// Gemini Vision models available for PDF extraction (aliases estáveis)
const GEMINI_PDF_MODELS = [{
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  description: 'Rápido e eficiente (recomendado)'
}, {
  id: 'gemini-2.0-flash',
  name: 'Gemini 2.0 Flash',
  description: 'Versão estável'
}, {
  id: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  description: 'Maior precisão, requer billing'
}, {
  id: 'gemini-1.5-pro',
  name: 'Gemini 1.5 Pro',
  description: 'Versão anterior, alta precisão'
}];

// PDF AI Providers
const PDF_AI_PROVIDERS = [{
  id: 'openrouter',
  name: 'OpenRouter',
  description: 'Gateway unificado - centraliza custos'
}, {
  id: 'gemini',
  name: 'Gemini Direto',
  description: 'API Google AI Studio (requer chave)'
}, {
  id: 'lovable',
  name: 'IA Integrada',
  description: 'Gateway integrado (requer modelo com suporte a PDF)'
}];

// OpenRouter models with high context for PDF processing
const OPENROUTER_PDF_MODELS = [{
  id: 'google/gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  context: '1M tokens',
  cost: '$0.10/M'
}, {
  id: 'google/gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  context: '1M tokens',
  cost: '$2.50/M'
}, {
  id: 'google/gemini-3-pro-preview',
  name: 'Gemini 3 Pro Preview',
  context: '1M tokens',
  cost: '$2/M'
}, {
  id: 'google/gemini-3-flash-preview',
  name: 'Gemini 3 Flash Preview',
  context: '1M tokens',
  cost: '$0.15/M'
}, {
  id: 'anthropic/claude-3.5-sonnet',
  name: 'Claude 3.5 Sonnet',
  context: '200K tokens',
  cost: '$3/M'
}, {
  id: 'meta-llama/llama-3.3-70b-instruct',
  name: 'Llama 3.3 70B',
  context: '128K tokens',
  cost: '$0.40/M'
}, {
  id: 'deepseek/deepseek-chat',
  name: 'DeepSeek Chat',
  context: '64K tokens',
  cost: '$0.14/M'
}];

// Helper para formatar token limit
const formatTokenLimit = (tokens: number): string => {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return tokens.toString();
};

export function DevSettings() {
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [savedApiKeys, setSavedApiKeys] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Test connection states
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Custom model input for providers with customModelInput=true
  const [customModelInputs, setCustomModelInputs] = useState<Record<string, string>>({});

  // Favorite models by provider
  const [favoriteModels, setFavoriteModels] = useState<Record<string, string[]>>({
    openrouter: [],
    groq: []
  });
  const [copiedModel, setCopiedModel] = useState<string | null>(null);

  // Pinned providers for visual organization
  const [pinnedProviders, setPinnedProviders] = useState<string[]>([]);

  // Filter state for provider table
  const [filterText, setFilterText] = useState("");

  // Dynamic Gemini models fetching
  const [dynamicGeminiModels, setDynamicGeminiModels] = useState<string[]>([]);
  const [versionedGeminiModels, setVersionedGeminiModels] = useState<string[]>([]);
  const [geminiImageModels, setGeminiImageModels] = useState<string[]>([]);
  const [geminiModelDetails, setGeminiModelDetails] = useState<Record<string, GeminiModelInfo>>({});
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [showVersionedModels, setShowVersionedModels] = useState(false);
  const [modelsCacheUpdatedAt, setModelsCacheUpdatedAt] = useState<Date | null>(null);

  // Auto-test debounce ref
  const autoTestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup auto-test timeout on unmount
  useEffect(() => {
    return () => {
      if (autoTestTimeoutRef.current) {
        clearTimeout(autoTestTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchApiKeys();
    fetchFavoriteModels();
    fetchPinnedProviders();
    fetchProviderStatus();
    fetchGeminiModelsCache();
  }, []);

  // Fetch saved provider test status
  const fetchProviderStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("system_config")
        .select("id, value")
        .like("id", "provider_status_%");
      
      if (error) throw error;
      
      if (data) {
        const results: Record<string, TestResult> = {};
        data.forEach(item => {
          const providerId = item.id.replace("provider_status_", "");
          const val = item.value as any;
          if (val && typeof val === 'object') {
            results[providerId] = {
              success: val.success ?? false,
              latencyMs: val.latencyMs,
              error: val.error,
              testedAt: val.lastTest ? new Date(val.lastTest) : undefined
            };
          }
        });
        setTestResults(prev => ({ ...prev, ...results }));
      }
    } catch (error) {
      console.error("Error fetching provider status:", error);
    }
  };

  // Fetch cached Gemini models
  const fetchGeminiModelsCache = async () => {
    try {
      const { data, error } = await supabase
        .from("system_config")
        .select("value")
        .eq("id", "gemini_models_cache")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      
      if (data?.value) {
        const cached = data.value as any;
        const cacheAge = Date.now() - new Date(cached.updatedAt).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas
        
        if (cacheAge < CACHE_TTL && cached.models) {
          // Use cached data
          const stableIds = cached.models.map((m: GeminiModelInfo) => m.id);
          const sortedStableIds = sortGeminiModelsSafely(stableIds.filter((id: string) => !isGeminiNonTextUtilityModel(id)));
          const versionedIds = sortGeminiModelsSafely(cached.versionedModels?.map((m: GeminiModelInfo) => m.id) || []);
          const imageIds = cached.imageModels?.map((m: GeminiModelInfo) => m.id) || [];
          
          setDynamicGeminiModels(sortedStableIds);
          setVersionedGeminiModels(versionedIds);
          setGeminiImageModels(imageIds);
          setModelsCacheUpdatedAt(new Date(cached.updatedAt));
          
          // Build details map
          const detailsMap: Record<string, GeminiModelInfo> = {};
          [...(cached.models || []), ...(cached.versionedModels || []), ...(cached.imageModels || [])].forEach((m: GeminiModelInfo) => {
            detailsMap[m.id] = m;
          });
          setGeminiModelDetails(detailsMap);
          
          // Update provider models list
          const geminiProvider = AI_PROVIDERS.find(p => p.id === 'gemini');
          if (geminiProvider) {
            geminiProvider.models = sortedStableIds.length > 0 ? sortedStableIds : sortGeminiModelsSafely(geminiProvider.models);
          }
          
          console.log(`[DevSettings] Loaded ${sortedStableIds.length} stable + ${versionedIds.length} versioned models from cache`);
        }
      }
    } catch (error) {
      console.error("Error fetching Gemini models cache:", error);
    }
  };

  const fetchPinnedProviders = async () => {
    try {
      const { data, error } = await supabase.from("system_config").select("value").eq("id", "pinned_ai_providers").single();
      if (error && error.code !== "PGRST116") throw error;
      if (data?.value) {
        const parsed = Array.isArray(data.value) ? data.value : [];
        setPinnedProviders(parsed.filter((v): v is string => typeof v === "string"));
      }
    } catch (error) {
      console.error("Error fetching pinned providers:", error);
    }
  };

  const togglePinProvider = async (providerId: string) => {
    const isPinned = pinnedProviders.includes(providerId);
    const updated = isPinned ? pinnedProviders.filter(p => p !== providerId) : [...pinnedProviders, providerId];
    try {
      const { error } = await supabase.from("system_config").upsert({
        id: "pinned_ai_providers",
        value: updated,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setPinnedProviders(updated);
      const providerName = AI_PROVIDERS.find(p => p.id === providerId)?.name;
      toast({
        title: isPinned ? "Desafixado" : "Fixado",
        description: <div className="flex items-center gap-2">
            <Pin className={cn("h-4 w-4", isPinned ? "text-muted-foreground" : "text-amber-500")} />
            <span>{providerName} {isPinned ? "removido dos favoritos" : "fixado no topo"}</span>
          </div>
      });
    } catch (error) {
      console.error("Error toggling pinned provider:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao atualizar providers fixados"
      });
    }
  };

  // Dynamic sorting: Active > Pinned (in pin order) > Alphabetical
  const getSortedProviders = () => {
    const providers = [...AI_PROVIDERS];
    return providers.sort((a, b) => {
      // Priority 1: Active provider always first
      const aIsActive = a.id === config.default_ai_provider;
      const bIsActive = b.id === config.default_ai_provider;
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;

      // Priority 2: Pinned providers (in pin order)
      const aIsPinned = pinnedProviders.includes(a.id);
      const bIsPinned = pinnedProviders.includes(b.id);
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      if (aIsPinned && bIsPinned) {
        return pinnedProviders.indexOf(a.id) - pinnedProviders.indexOf(b.id);
      }

      // Priority 3: Alphabetical for the rest
      return a.name.localeCompare(b.name);
    });
  };

  const fetchFavoriteModels = async () => {
    try {
      const { data, error } = await supabase.from("system_config").select("id, value").in("id", ["favorite_models_openrouter", "favorite_models_groq"]);
      if (error) throw error;
      if (data) {
        const favorites: Record<string, string[]> = {
          openrouter: [],
          groq: []
        };
        data.forEach(item => {
          const providerId = item.id.replace("favorite_models_", "");
          try {
            favorites[providerId] = Array.isArray(item.value) ? item.value : JSON.parse(item.value as string);
          } catch {
            favorites[providerId] = [];
          }
        });
        setFavoriteModels(favorites);
      }
    } catch (error) {
      console.error("Error fetching favorite models:", error);
    }
  };

  const addFavoriteModel = async (providerId: string, model: string) => {
    if (!model.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Digite um identificador de modelo válido"
      });
      return;
    }
    const current = favoriteModels[providerId] || [];
    if (current.includes(model.trim())) {
      toast({
        variant: "destructive",
        title: "Já existe",
        description: "Este modelo já está nos favoritos"
      });
      return;
    }
    const updated = [...current, model.trim()];
    try {
      const { error } = await supabase.from("system_config").upsert({
        id: `favorite_models_${providerId}`,
        value: updated,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setFavoriteModels(prev => ({
        ...prev,
        [providerId]: updated
      }));
      toast({
        title: "Adicionado",
        description: "Modelo adicionado aos favoritos"
      });
    } catch (error) {
      console.error("Error adding favorite model:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao adicionar modelo aos favoritos"
      });
    }
  };

  const removeFavoriteModel = async (providerId: string, model: string) => {
    const updated = (favoriteModels[providerId] || []).filter(m => m !== model);
    try {
      const { error } = await supabase.from("system_config").upsert({
        id: `favorite_models_${providerId}`,
        value: updated,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setFavoriteModels(prev => ({
        ...prev,
        [providerId]: updated
      }));
      toast({
        title: "Removido",
        description: "Modelo removido dos favoritos"
      });
    } catch (error) {
      console.error("Error removing favorite model:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao remover modelo dos favoritos"
      });
    }
  };

  const copyModelId = (model: string) => {
    navigator.clipboard.writeText(model);
    setCopiedModel(model);
    toast({
      title: "Copiado",
      description: "Identificador copiado para área de transferência"
    });
    setTimeout(() => setCopiedModel(null), 2000);
  };

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase.from("system_config").select("id, value");
      if (error) throw error;
      if (data) {
        const configMap: Record<string, any> = {};
        data.forEach(item => {
          configMap[item.id] = item.value;
        });
        setConfig({
          default_ai_provider: configMap.default_ai_provider || DEFAULT_CONFIG.default_ai_provider,
          default_ai_model: configMap.default_ai_model || DEFAULT_CONFIG.default_ai_model,
          fallback_ai_provider: configMap.fallback_ai_provider || DEFAULT_CONFIG.fallback_ai_provider,
          fallback_ai_model: configMap.fallback_ai_model || DEFAULT_CONFIG.fallback_ai_model,
          gemini_pdf_model: configMap.gemini_pdf_model || DEFAULT_CONFIG.gemini_pdf_model,
          pdf_ai_provider: configMap.pdf_ai_provider || DEFAULT_CONFIG.pdf_ai_provider,
          pdf_ai_model: configMap.pdf_ai_model || DEFAULT_CONFIG.pdf_ai_model,
          pdf_fallback_provider: configMap.pdf_fallback_provider || DEFAULT_CONFIG.pdf_fallback_provider,
          pdf_fallback_model: configMap.pdf_fallback_model || DEFAULT_CONFIG.pdf_fallback_model,
          maintenance_mode: configMap.maintenance_mode || DEFAULT_CONFIG.maintenance_mode,
          max_pdf_size_mb: configMap.max_pdf_size_mb || DEFAULT_CONFIG.max_pdf_size_mb,
          allowed_ai_providers: configMap.allowed_ai_providers || DEFAULT_CONFIG.allowed_ai_providers,
          retry_enabled: configMap.retry_enabled ?? DEFAULT_CONFIG.retry_enabled,
          retry_max_attempts: configMap.retry_max_attempts ?? DEFAULT_CONFIG.retry_max_attempts,
          retry_base_delay_ms: configMap.retry_base_delay_ms ?? DEFAULT_CONFIG.retry_base_delay_ms,
          // Two-phase import strategy
          import_strategy: configMap.import_strategy || DEFAULT_CONFIG.import_strategy,
          text_fill_provider: configMap.text_fill_provider || DEFAULT_CONFIG.text_fill_provider,
          text_fill_model: configMap.text_fill_model || DEFAULT_CONFIG.text_fill_model,
          store_extracted_text: configMap.store_extracted_text ?? DEFAULT_CONFIG.store_extracted_text,
          phase1_gemini_model: configMap.phase1_gemini_model || DEFAULT_CONFIG.phase1_gemini_model,
          phase1_ocr_provider: configMap.phase1_ocr_provider || DEFAULT_CONFIG.phase1_ocr_provider
        });
      }
    } catch (error) {
      console.error("Error fetching config:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar configurações do sistema"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase.from("global_api_keys").select("id, api_key");
      if (error) throw error;
      if (data) {
        const keys: ApiKeys = {};
        const saved: Record<string, boolean> = {};
        data.forEach(item => {
          keys[item.id] = item.api_key;
          saved[item.id] = true;
        });
        setApiKeys(keys);
        setSavedApiKeys(saved);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    }
  };

  // Função para buscar modelos Gemini dinamicamente (com suporte a cache)
  const fetchGeminiModels = async (forceRefresh = false) => {
    const geminiKey = apiKeys.gemini;
    if (!geminiKey) {
      toast({
        variant: "destructive",
        title: "API Key necessária",
        description: "Configure uma API Key do Gemini primeiro"
      });
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh && dynamicGeminiModels.length > 0 && modelsCacheUpdatedAt) {
      const cacheAge = Date.now() - modelsCacheUpdatedAt.getTime();
      const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas
      if (cacheAge < CACHE_TTL) {
        toast({
          title: "Cache válido",
          description: `Modelos atualizados há ${Math.round(cacheAge / (60 * 60 * 1000))}h. Use refresh forçado se necessário.`
        });
        return;
      }
    }

    setLoadingGeminiModels(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-gemini-models', {
        body: { apiKey: geminiKey }
      });

      if (error) throw error;

      if (data?.success && data?.models) {
        // Stable text models
        const stableModelIds = sortGeminiModelsSafely(data.models.map((m: GeminiModelInfo) => m.id).filter((id: string) => !isGeminiNonTextUtilityModel(id)));
        setDynamicGeminiModels(stableModelIds);
        
        // Versioned models (separate list)
        const versionedIds = sortGeminiModelsSafely(data.versionedModels?.map((m: GeminiModelInfo) => m.id) || []);
        setVersionedGeminiModels(versionedIds);
        
        // Image models (separate list)
        const imageModelIds = data.imageModels?.map((m: GeminiModelInfo) => m.id) || [];
        setGeminiImageModels(imageModelIds);
        
        // Build model details map
        const detailsMap: Record<string, GeminiModelInfo> = {};
        [...(data.models || []), ...(data.versionedModels || []), ...(data.imageModels || [])].forEach((m: GeminiModelInfo) => {
          detailsMap[m.id] = m;
        });
        setGeminiModelDetails(detailsMap);
        
        // Update cache timestamp
        const now = new Date();
        setModelsCacheUpdatedAt(now);
        
        // Save to cache
        await supabase.from("system_config").upsert({
          id: "gemini_models_cache",
          value: {
            models: data.models,
            versionedModels: data.versionedModels,
            imageModels: data.imageModels,
            categories: data.categories,
            updatedAt: now.toISOString()
          },
          updated_at: now.toISOString()
        });
        
        // Atualizar a lista de modelos do provider Gemini (only stable models by default)
        const geminiProvider = AI_PROVIDERS.find(p => p.id === 'gemini');
        if (geminiProvider) {
          geminiProvider.models = stableModelIds;
        }

        setConfig(prev => {
          if (prev.default_ai_provider !== 'gemini') return prev;
          const safeModel = getSafeGeminiDefaultModel(prev.default_ai_model, stableModelIds);
          return safeModel === prev.default_ai_model ? prev : { ...prev, default_ai_model: safeModel };
        });

        toast({
          title: "Modelos Atualizados",
          description: (
            <div className="flex flex-col gap-1">
              <span>{stableModelIds.length} modelos estáveis</span>
              {versionedIds.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  + {versionedIds.length} modelos versionados (ocultos)
                </span>
              )}
              {imageModelIds.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  + {imageModelIds.length} modelos de imagem
                </span>
              )}
            </div>
          )
        });
      } else {
        throw new Error(data?.error || 'Erro ao buscar modelos');
      }
    } catch (error) {
      console.error("Error fetching Gemini models:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar modelos",
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setLoadingGeminiModels(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const updates = [{
        id: "default_ai_provider",
        value: config.default_ai_provider
      }, {
        id: "default_ai_model",
        value: config.default_ai_model
      }, {
        id: "fallback_ai_provider",
        value: config.fallback_ai_provider
      }, {
        id: "fallback_ai_model",
        value: config.fallback_ai_model
      }, {
        id: "gemini_pdf_model",
        value: config.gemini_pdf_model
      }, {
        id: "pdf_ai_provider",
        value: config.pdf_ai_provider
      }, {
        id: "pdf_ai_model",
        value: config.pdf_ai_model
      }, {
        id: "pdf_fallback_provider",
        value: config.pdf_fallback_provider
      }, {
        id: "pdf_fallback_model",
        value: config.pdf_fallback_model
      }, {
        id: "maintenance_mode",
        value: config.maintenance_mode
      }, {
        id: "max_pdf_size_mb",
        value: config.max_pdf_size_mb
      }, {
        id: "allowed_ai_providers",
        value: config.allowed_ai_providers
      }, {
        id: "retry_enabled",
        value: config.retry_enabled
      }, {
        id: "retry_max_attempts",
        value: config.retry_max_attempts
      }, {
        id: "retry_base_delay_ms",
        value: config.retry_base_delay_ms
      }, {
        id: "import_strategy",
        value: config.import_strategy
      }, {
        id: "text_fill_provider",
        value: config.text_fill_provider
      }, {
        id: "text_fill_model",
        value: config.text_fill_model
      }, {
        id: "store_extracted_text",
        value: config.store_extracted_text
      }, {
        id: "phase1_gemini_model",
        value: config.phase1_gemini_model
      }, {
        id: "phase1_ocr_provider",
        value: config.phase1_ocr_provider
      }];
      for (const update of updates) {
        const { error } = await supabase.from("system_config").upsert({
          id: update.id,
          value: update.value,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      }
      toast({
        title: "Sucesso",
        description: "Configurações do sistema atualizadas"
      });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar configurações"
      });
    } finally {
      setSaving(false);
    }
  };

  const saveApiKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key?.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Digite uma API Key válida"
      });
      return;
    }
    setSavingKey(providerId);
    try {
      const { error } = await supabase.from("global_api_keys").upsert({
        id: providerId,
        api_key: key.trim(),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setSavedApiKeys(prev => ({
        ...prev,
        [providerId]: true
      }));
      toast({
        title: "Sucesso",
        description: `API Key do ${AI_PROVIDERS.find(p => p.id === providerId)?.name} salva`
      });
      
      // Auto-teste com debounce após salvar
      if (autoTestTimeoutRef.current) {
        clearTimeout(autoTestTimeoutRef.current);
      }
      autoTestTimeoutRef.current = setTimeout(async () => {
        console.log(`[Auto-test] Testing ${providerId} after save...`);
        await testConnection(providerId);
      }, 1500);
      
    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar API Key"
      });
    } finally {
      setSavingKey(null);
    }
  };

  const deleteApiKey = async (providerId: string) => {
    if (!confirm(`Remover API Key do ${AI_PROVIDERS.find(p => p.id === providerId)?.name}?`)) {
      return;
    }
    try {
      const { error } = await supabase.from("global_api_keys").delete().eq("id", providerId);
      if (error) throw error;
      setApiKeys(prev => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      setSavedApiKeys(prev => ({
        ...prev,
        [providerId]: false
      }));
      setTestResults(prev => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      
      // Remove saved status
      await supabase.from("system_config").delete().eq("id", `provider_status_${providerId}`);
      
      toast({
        title: "Sucesso",
        description: "API Key removida"
      });
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao remover API Key"
      });
    }
  };

  const testConnection = async (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    // Check if key is required and available
    if (provider.requiresKey && !savedApiKeys[providerId]) {
      toast({
        variant: "destructive",
        title: "API Key necessária",
        description: `Configure uma API Key para testar ${provider.name}`
      });
      return;
    }
    setTestingProvider(providerId);
    try {
      const startTime = Date.now();
      const modelToTest = providerId === 'gemini'
        ? getSafeGeminiDefaultModel(config.default_ai_provider === 'gemini' ? config.default_ai_model : null, provider.models)
        : provider.models[0];
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: {
          provider: providerId,
          model: modelToTest,
          apiKey: provider.requiresKey ? apiKeys[providerId] : null
        }
      });
      const latencyMs = Date.now() - startTime;
      
      const now = new Date();
      let result: TestResult;
      
      if (error) {
        result = {
          success: false,
          error: error.message,
          testedAt: now
        };
        toast({
          variant: "destructive",
          title: "Teste falhou",
          description: error.message
        });
      } else if (data?.success) {
        result = {
          success: true,
          latencyMs: data.latencyMs || latencyMs,
          testedAt: now
        };
        toast({
          title: "Conexão OK",
          description: `${provider.name} (${modelToTest}) respondeu em ${data.latencyMs || latencyMs}ms`
        });
      } else {
        result = {
          success: false,
          error: data?.error || 'Erro desconhecido',
          testedAt: now
        };
        toast({
          variant: "destructive",
          title: "Teste falhou",
          description: data?.error || 'Erro desconhecido'
        });
      }
      
      setTestResults(prev => ({ ...prev, [providerId]: result }));
      
      // Salvar status no banco
      await supabase.from("system_config").upsert({
        id: `provider_status_${providerId}`,
        value: {
          lastTest: now.toISOString(),
          success: result.success,
          latencyMs: result.latencyMs,
          error: result.error
        },
        updated_at: now.toISOString()
      });
      
    } catch (error) {
      console.error("Error testing connection:", error);
      const result: TestResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Erro de conexão',
        testedAt: new Date()
      };
      setTestResults(prev => ({ ...prev, [providerId]: result }));
    } finally {
      setTestingProvider(null);
    }
  };

  const selectProvider = (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    // If provider requires key and no key is saved, show a message
    if (provider.requiresKey && !savedApiKeys[providerId]) {
      toast({
        variant: "destructive",
        title: "API Key necessária",
        description: `Configure uma API Key para usar o ${provider.name}`
      });
      return;
    }

    setConfig(prev => ({
      ...prev,
      default_ai_provider: providerId,
      default_ai_model: providerId === 'gemini'
        ? getSafeGeminiDefaultModel(prev.default_ai_model, provider.models)
        : provider.models[0]
    }));
    toast({
      title: "Provider Atualizado",
      description: <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <span>{provider.name} agora é o provider padrão</span>
        </div>
    });
  };

  const toggleProvider = (providerId: string) => {
    setConfig(prev => ({
      ...prev,
      allowed_ai_providers: prev.allowed_ai_providers.includes(providerId) ? prev.allowed_ai_providers.filter(p => p !== providerId) : [...prev.allowed_ai_providers, providerId]
    }));
  };

  const resetAllUserQuotas = async () => {
    if (!confirm("Tem certeza que deseja zerar o uso de IA de TODOS os usuários?")) {
      return;
    }
    try {
      const { error } = await supabase.from("user_settings").update({
        ai_requests_used: 0,
        last_reset_date: new Date().toISOString().split("T")[0]
      });
      if (error) throw error;
      toast({
        title: "Sucesso",
        description: "Cotas de IA resetadas para todos os usuários"
      });
    } catch (error) {
      console.error("Error resetting quotas:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao resetar cotas"
      });
    }
  };

  const getActiveProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.default_ai_provider);
    if (!provider) return [];
    if (provider.id === 'gemini') {
      const baseModels = dynamicGeminiModels.length > 0 ? dynamicGeminiModels : provider.models;
      return sortGeminiModelsSafely(showVersionedModels ? [...baseModels, ...versionedGeminiModels] : baseModels);
    }
    
    return provider.models;
  };

  const getFallbackProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.fallback_ai_provider);
    if (!provider) return [];
    if (provider.id === 'gemini') {
      const baseModels = dynamicGeminiModels.length > 0 ? dynamicGeminiModels : provider.models;
      return sortGeminiModelsSafely(showVersionedModels ? [...baseModels, ...versionedGeminiModels] : baseModels);
    }
    
    return provider.models;
  };

  const activeProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.default_ai_provider);
    return provider?.customModelInput || false;
  };

  const fallbackProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.fallback_ai_provider);
    return provider?.customModelInput || false;
  };

  const getActiveProvider = () => {
    return AI_PROVIDERS.find(p => p.id === config.default_ai_provider);
  };

  const getFallbackProvider = () => {
    return AI_PROVIDERS.find(p => p.id === config.fallback_ai_provider);
  };

  // PDF provider helper functions (mirrors fallback logic)
  const getPdfProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.pdf_ai_provider);
    return provider?.models || [];
  };

  const pdfProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.pdf_ai_provider);
    return provider?.customModelInput || false;
  };

  const getPdfProvider = () => {
    return AI_PROVIDERS.find(p => p.id === config.pdf_ai_provider);
  };

  // PDF Fallback helper functions
  const getPdfFallbackProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.pdf_fallback_provider);
    return provider?.models || [];
  };

  const pdfFallbackProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.pdf_fallback_provider);
    return provider?.customModelInput || false;
  };

  const getPdfFallbackProvider = () => {
    return AI_PROVIDERS.find(p => p.id === config.pdf_fallback_provider);
  };

  // Two-Phase Text Fill helper functions (Fase 2)
  const getTextFillProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
    if (!provider) return [];
    
    if (provider.id === 'gemini' && dynamicGeminiModels.length > 0) {
      return dynamicGeminiModels;
    }
    
    return provider.models || [];
  };

  const textFillProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
    return provider?.customModelInput || false;
  };

  const getTextFillProvider = () => {
    return AI_PROVIDERS.find(p => p.id === config.text_fill_provider);
  };

  // Helper functions for table view
  const getFilteredProviders = () => {
    const sorted = getSortedProviders();
    if (!filterText.trim()) return sorted;
    return sorted.filter(p => 
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      p.models.some(m => m.toLowerCase().includes(filterText.toLowerCase()))
    );
  };

  const getProviderStatus = (provider: ProviderInfo) => {
    const isActive = provider.id === config.default_ai_provider;
    const hasKey = savedApiKeys[provider.id];
    const isInternal = !provider.requiresKey;
    
    if (isActive) return { label: "ATIVO", variant: "active" as const };
    if (isInternal) return { label: "INTEGRADO", variant: "internal" as const };
    if (hasKey) return { label: "CONFIGURADO", variant: "configured" as const };
    return { label: "PENDENTE", variant: "pending" as const };
  };

  const getProviderStats = () => {
    const configured = AI_PROVIDERS.filter(p => 
      savedApiKeys[p.id] || !p.requiresKey
    ).length;
    const totalModels = AI_PROVIDERS.reduce((acc, p) => acc + p.models.length, 0);
    const testedResults = Object.values(testResults).filter(r => r.success && r.latencyMs);
    const avgLatency = testedResults.length > 0
      ? Math.round(testedResults.reduce((acc, r) => acc + (r.latencyMs || 0), 0) / testedResults.length)
      : 0;
    const healthPct = Math.round(
      (AI_PROVIDERS.filter(p => testResults[p.id]?.success !== false).length / AI_PROVIDERS.length) * 100
    );
    return { configured, totalModels, avgLatency, healthPct };
  };

  // Render Gemini model with details (token limit, PDF support, billing flag)
  const renderGeminiModelOption = (modelId: string) => {
    const details = geminiModelDetails[modelId];
    const isVersioned = versionedGeminiModels.includes(modelId);
    // Modelos Pro do Gemini têm free tier = 0 e exigem billing habilitado
    const requiresBilling = isGeminiProModel(modelId);
    
    return (
      <SelectItem key={modelId} value={modelId}>
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="font-mono text-xs truncate">{modelId}</span>
          <div className="flex items-center gap-1 shrink-0">
            {requiresBilling ? (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-600 border-red-300">
                billing
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-600 border-green-300">
                free
              </Badge>
            )}
            {isVersioned && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
                v
              </Badge>
            )}
            {details?.inputTokenLimit && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                {formatTokenLimit(details.inputTokenLimit)}
              </Badge>
            )}
            {details?.supportsPdf && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                <FileText className="h-2.5 w-2.5" />
              </Badge>
            )}
          </div>
        </div>
      </SelectItem>
    );
  };

  // Render individual provider row
  const renderProviderRow = (provider: ProviderInfo) => {
    const isActive = provider.id === config.default_ai_provider;
    const isPinned = pinnedProviders.includes(provider.id);
    const hasKey = savedApiKeys[provider.id];
    const status = getProviderStatus(provider);
    const testResult = testResults[provider.id];
    const isTesting = testingProvider === provider.id;
    
    return (
      <TableRow 
        key={provider.id}
        className={cn(
          "group transition-all duration-200 cursor-pointer",
          isActive && "bg-primary/5 border-l-4 border-l-primary",
          isPinned && !isActive && "bg-amber-50/50 dark:bg-amber-950/20",
          "hover:bg-muted/50"
        )}
        onClick={() => selectProvider(provider.id)}
      >
        {/* Coluna Pin/Status */}
        <TableCell className="w-12 text-center" onClick={e => e.stopPropagation()}>
          {isActive ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Crown className="h-4 w-4 text-primary mx-auto" />
                </TooltipTrigger>
                <TooltipContent>Provider Ativo</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "h-7 w-7 transition-opacity",
                isPinned ? "text-amber-500" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={() => togglePinProvider(provider.id)}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
          )}
        </TableCell>
        
        {/* Coluna Nome */}
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full shrink-0" 
                style={{ backgroundColor: provider.color }}
              />
              <span className={cn(
                "font-semibold text-sm",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {provider.name}
              </span>
              {isActive && (
                <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                  <Check className="h-2.5 w-2.5 mr-0.5" />
                  ATIVO
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground pl-4">
              {provider.description}
            </span>
          </div>
        </TableCell>
        
        {/* Coluna Modelos */}
        <TableCell>
          <div className="flex flex-wrap gap-1 max-w-xs">
            {provider.models.slice(0, 2).map(model => {
              const details = provider.id === 'gemini' ? geminiModelDetails[model] : null;
              return (
                <div key={model} className="flex items-center gap-0.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {model.length > 18 ? model.slice(0, 18) + "…" : model}
                  </Badge>
                  {details?.supportsPdf && (
                    <FileText className="h-2.5 w-2.5 text-blue-500" />
                  )}
                </div>
              );
            })}
            {provider.models.length > 2 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-primary font-semibold cursor-help">
                      +{provider.models.length - 2}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {provider.models.slice(2).map(model => (
                        <span key={model} className="text-xs font-mono">{model}</span>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
        
        {/* Coluna Status */}
        <TableCell className="text-center">
          <Badge className={cn(
            "text-[10px] uppercase font-bold px-2",
            status.variant === "active" && "bg-primary text-primary-foreground",
            status.variant === "configured" && "bg-transparent border border-green-500 text-green-500",
            status.variant === "internal" && "bg-primary/10 text-primary border-primary/20",
            status.variant === "pending" && "bg-muted text-muted-foreground"
          )}>
            {status.variant === "internal" && <Zap className="h-2.5 w-2.5 mr-1" />}
            {status.variant === "configured" && <Check className="h-2.5 w-2.5 mr-1" />}
            {status.variant === "pending" && <Lock className="h-2.5 w-2.5 mr-1" />}
            {status.label}
          </Badge>
        </TableCell>
        
        {/* Coluna API Key */}
        <TableCell onClick={e => e.stopPropagation()}>
          {provider.requiresKey ? (
            <div className="relative flex items-center group/key max-w-[200px]">
              <Input 
                type={showKeys[provider.id] ? "text" : "password"}
                value={apiKeys[provider.id] || ""}
                onChange={e => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                placeholder={provider.keyPlaceholder || "sk-..."}
                className="h-7 bg-muted/30 border-muted text-[11px] font-mono pr-16"
              />
              <div className="absolute right-0.5 flex gap-0.5 opacity-50 group-hover/key:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                >
                  {showKeys[provider.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-primary hover:text-primary"
                  onClick={() => saveApiKey(provider.id)}
                  disabled={savingKey === provider.id}
                >
                  {savingKey === provider.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          ) : (
            <span className="text-[11px] italic text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" />
              Não requer
            </span>
          )}
          {hasKey && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-medium text-green-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Configurada
              </span>
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-[10px] text-destructive hover:text-destructive"
                onClick={() => deleteApiKey(provider.id)}
              >
                Remover
              </Button>
            </div>
          )}
        </TableCell>
        
        {/* Coluna Ações */}
        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
          <div className={cn(
            "flex justify-end items-center gap-2 transition-opacity",
            !isActive && "opacity-50 group-hover:opacity-100"
          )}>
            {testResult && (
              <div className="flex items-center gap-1 text-[11px]">
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-600 font-mono">{testResult.latencyMs}ms</span>
                  </>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Erro</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{testResult.error}</p>
                        {testResult.testedAt && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Testado: {testResult.testedAt.toLocaleString('pt-BR')}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
            {/* Botão especial para Gemini: Atualizar Modelos */}
            {provider.id === 'gemini' && hasKey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => fetchGeminiModels(true)}
                      disabled={loadingGeminiModels}
                    >
                      {loadingGeminiModels ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p className="font-medium">Atualizar Modelos</p>
                      <p className="text-muted-foreground">Busca modelos disponíveis para sua API key</p>
                      {dynamicGeminiModels.length > 0 && (
                        <p className="text-primary mt-1">{dynamicGeminiModels.length} modelos estáveis</p>
                      )}
                      {modelsCacheUpdatedAt && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-2.5 w-2.5" />
                          Atualizado: {modelsCacheUpdatedAt.toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "h-7 px-2.5 text-[11px] uppercase gap-1",
                isActive && "border-primary"
              )}
              onClick={() => testConnection(provider.id)}
              disabled={isTesting || (provider.requiresKey && !hasKey)}
            >
              {isTesting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Test
                </>
              )}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  
  const stats = getProviderStats();
  
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie IA, providers e configurações globais</p>
        </div>
        <Button onClick={saveConfig} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Alterações
        </Button>
      </div>

      {/* Maintenance Mode Warning */}
      {config.maintenance_mode && <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Modo de Manutenção Ativo</p>
              <p className="text-sm text-muted-foreground">
                Usuários não conseguem acessar o sistema enquanto o modo de manutenção está ativo.
              </p>
            </div>
          </CardContent>
        </Card>}

      {/* Section: AI Providers - Table View */}
      <div className="space-y-4">
        {/* Header com filtro */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold uppercase tracking-tight">
              Provider Inventory <span className="text-primary">v2.0</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input 
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Filtrar providers..."
                className="h-8 w-48 sm:w-64 pr-8 text-xs"
              />
              <Search className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground">
          Clique em uma linha para selecionar como provider padrão. Use 📌 para fixar providers favoritos.
        </p>
        
        {/* Tabela Principal */}
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider">Provider</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider">Modelos Disponíveis</TableHead>
                <TableHead className="w-28 text-center text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-56 text-[11px] font-bold uppercase tracking-wider">API Key</TableHead>
                <TableHead className="w-32 text-right text-[11px] font-bold uppercase tracking-wider">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getFilteredProviders().map(provider => renderProviderRow(provider))}
            </TableBody>
          </Table>
        </div>
        
        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-bold">Configurados</span>
            <span className="text-lg font-bold font-mono">{String(stats.configured).padStart(2, '0')}</span>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-bold">Latência Média</span>
            <span className="text-lg font-bold font-mono text-primary">{stats.avgLatency || '--'}ms</span>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-bold">Total Modelos</span>
            <span className="text-lg font-bold font-mono">{stats.totalModels}</span>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
            <span className="text-[11px] uppercase text-muted-foreground font-bold flex items-center gap-1">
              <Activity className="h-3 w-3" />
              API Health
            </span>
            <span className={cn(
              "text-lg font-bold font-mono",
              stats.healthPct === 100 ? "text-green-500" : stats.healthPct >= 80 ? "text-amber-500" : "text-destructive"
            )}>{stats.healthPct}%</span>
          </div>
        </div>

        {/* Toggle para modelos versionados do Gemini */}
        {(dynamicGeminiModels.length > 0 || versionedGeminiModels.length > 0) && (
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="show-versioned" 
                checked={showVersionedModels} 
                onCheckedChange={(checked) => setShowVersionedModels(!!checked)}
              />
              <Label htmlFor="show-versioned" className="text-sm cursor-pointer">
                Mostrar modelos versionados do Gemini
              </Label>
              <Badge variant="outline" className="text-[10px]">
                +{versionedGeminiModels.length} modelos
              </Badge>
            </div>
            {modelsCacheUpdatedAt && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Cache: {modelsCacheUpdatedAt.toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Default Model Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Modelo Padrão</CardTitle>
            <CardDescription>
              {activeProviderHasCustomInput() ? `Digite qualquer modelo compatível com ${getActiveProvider()?.name} ou selecione uma sugestão` : `Selecione o modelo padrão do provider ${getActiveProvider()?.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeProviderHasCustomInput() ? <>
                <div className="space-y-2">
                  <Label>Nome do Modelo</Label>
                  <div className="flex gap-2 items-center">
                    <Input value={config.default_ai_model} onChange={e => setConfig({
                  ...config,
                  default_ai_model: e.target.value
                })} placeholder={getActiveProvider()?.modelPlaceholder} className="w-full md:w-96" />
                    <Button variant="outline" size="icon" onClick={() => addFavoriteModel(config.default_ai_provider, config.default_ai_model)} disabled={!config.default_ai_model.trim()} title="Adicionar aos favoritos">
                      <Plus className="h-4 w-4" />
                    </Button>
                    {config.default_ai_model && <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                        <Check className="h-3 w-3" />
                        Definido
                      </Badge>}
                  </div>
                </div>

                {/* Favorite Models List */}
                {favoriteModels[config.default_ai_provider]?.length > 0 && <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500" />
                      Meus modelos favoritos:
                    </Label>
                    <div className="flex flex-col gap-1">
                      {favoriteModels[config.default_ai_provider].map(model => <div key={model} className={cn("flex items-center justify-between p-2 rounded-md border text-sm group cursor-pointer hover:bg-muted/50 transition-colors", config.default_ai_model === model && "border-primary bg-primary/5")} onClick={() => setConfig({
                  ...config,
                  default_ai_model: model
                })}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                            <span className="font-mono text-xs truncate">{model}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => {
                      e.stopPropagation();
                      copyModelId(model);
                    }} title="Copiar identificador">
                              {copiedModel === model ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={e => {
                      e.stopPropagation();
                      removeFavoriteModel(config.default_ai_provider, model);
                    }} title="Remover dos favoritos">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>)}
                    </div>
                  </div>}

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Sugestões populares:</Label>
                  <div className="flex flex-wrap gap-2">
                    {getActiveProviderModels().slice(0, 6).map(model => <Button key={model} variant={config.default_ai_model === model ? "secondary" : "outline"} size="sm" className="text-xs h-7" onClick={() => setConfig({
                  ...config,
                  default_ai_model: model
                })}>
                        {model}
                      </Button>)}
                  </div>
                </div>
              </> : <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={config.default_ai_model} onValueChange={value => setConfig({
              ...config,
              default_ai_model: value
            })}>
                  <SelectTrigger className="w-full md:w-96">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.default_ai_provider === 'gemini' 
                      ? getActiveProviderModels().map(model => renderGeminiModelOption(model))
                      : getActiveProviderModels().map(model => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>}
          </CardContent>
        </Card>

        {/* Fallback Model Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Fallback (Backup)
            </CardTitle>
            <CardDescription>
              Provider e modelo usados quando o principal falha
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider Fallback</Label>
                <Select value={config.fallback_ai_provider} onValueChange={value => {
              const provider = AI_PROVIDERS.find(p => p.id === value);
              setConfig({
                ...config,
                fallback_ai_provider: value,
                fallback_ai_model: value === 'gemini' ? getSafeGeminiDefaultModel(null, provider?.models || []) : provider?.models[0] || ""
              });
            }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => <SelectItem key={provider.id} value={provider.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{
                      backgroundColor: provider.color
                    }} />
                          {provider.name}
                        </div>
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo Fallback</Label>
                {fallbackProviderHasCustomInput() ? (
                  <div className="space-y-4">
                    <div className="flex gap-2 items-center">
                      <Input 
                        value={config.fallback_ai_model} 
                        onChange={e => setConfig({
                          ...config,
                          fallback_ai_model: e.target.value
                        })} 
                        placeholder={getFallbackProvider()?.modelPlaceholder} 
                        className="flex-1"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => addFavoriteModel(config.fallback_ai_provider, config.fallback_ai_model)} 
                        disabled={!config.fallback_ai_model.trim()} 
                        title="Adicionar aos favoritos"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Favorite Models List for Fallback */}
                    {favoriteModels[config.fallback_ai_provider]?.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          Meus modelos favoritos:
                        </Label>
                        <div className="flex flex-col gap-1">
                          {favoriteModels[config.fallback_ai_provider].map(model => (
                            <div 
                              key={model} 
                              className={cn(
                                "flex items-center justify-between p-2 rounded-md border text-sm group cursor-pointer hover:bg-muted/50 transition-colors", 
                                config.fallback_ai_model === model && "border-primary bg-primary/5"
                              )} 
                              onClick={() => setConfig({
                                ...config,
                                fallback_ai_model: model
                              })}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                                <span className="font-mono text-xs truncate">{model}</span>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6" 
                                  onClick={e => {
                                    e.stopPropagation();
                                    copyModelId(model);
                                  }} 
                                  title="Copiar identificador"
                                >
                                  {copiedModel === model ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-destructive hover:text-destructive" 
                                  onClick={e => {
                                    e.stopPropagation();
                                    removeFavoriteModel(config.fallback_ai_provider, model);
                                  }} 
                                  title="Remover dos favoritos"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Popular suggestions for fallback */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Sugestões populares:</Label>
                      <div className="flex flex-wrap gap-2">
                        {getFallbackProviderModels().slice(0, 4).map(model => (
                          <Button 
                            key={model} 
                            variant={config.fallback_ai_model === model ? "secondary" : "outline"} 
                            size="sm" 
                            className="text-xs h-7" 
                            onClick={() => setConfig({
                              ...config,
                              fallback_ai_model: model
                            })}
                          >
                            {model.length > 25 ? model.slice(0, 25) + "…" : model}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Select value={config.fallback_ai_model} onValueChange={value => setConfig({
                    ...config,
                    fallback_ai_model: value
                  })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config.fallback_ai_provider === 'gemini'
                        ? getFallbackProviderModels().map(model => renderGeminiModelOption(model))
                        : getFallbackProviderModels().map(model => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Seção "Extração de PDF (OCR)" removida — unificada em "OCR — Provedor único"
          dentro do card "Estratégia de Importação" abaixo. */}


      {/* Section: Import Strategy (Two-Phase) */}
      <Card className={cn(
        config.import_strategy === "two_phase" && "border-primary/50"
      )}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Estratégia de Importação
            </CardTitle>
            {config.import_strategy === "two_phase" && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                ATIVO
              </Badge>
            )}
          </div>
          <CardDescription>
            Afeta apenas o pipeline de importação do módulo <strong>Trabalhista</strong>
            (economia de ~60% em custos no modo Duas Fases). Previdenciário e Impugnação
            sempre usam o Provedor de OCR abaixo, independente desta escolha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Import Strategy Mode */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo de Importação</Label>
              <p className="text-sm text-muted-foreground">
                Duas Fases: Gemini extrai texto → Provider mais barato preenche campos
              </p>
            </div>
            <Select value={config.import_strategy} onValueChange={value => setConfig({
              ...config,
              import_strategy: value
            })}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_pass">
                  <div className="flex flex-col">
                    <span>Passagem Única</span>
                    <span className="text-[10px] text-muted-foreground">Um provider faz tudo</span>
                  </div>
                </SelectItem>
                <SelectItem value="two_phase">
                  <div className="flex flex-col">
                    <span>Duas Fases (Recomendado)</span>
                    <span className="text-[10px] text-muted-foreground">~60% mais econômico</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Provedor de OCR — SEMPRE visível (aplica-se a todos os módulos) */}
          <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-600" />
              Provedor de OCR (todos os módulos)
            </h4>
            <p className="text-xs text-muted-foreground">
              Escolha o provider de OCR usado por <strong>Previdenciário</strong> e <strong>Impugnação</strong> em
              qualquer estratégia, e também pelo <strong>Trabalhista</strong> na Fase 1 quando em Duas Fases.
              Mistral tem precisão elite (~94.9%) para tabelas/escaneados. <strong>MiniMax M3</strong> usa
              rasterização no navegador (pdfjs) + chunks de 10 páginas com 3 paralelismos e backoff automático
              em rate limit — ideal para PDFs grandes (100+ páginas) sem estourar CPU da edge function.
            </p>

            {/* Provider Selector */}
            <div className="space-y-2">
              <Label>Provedor de OCR</Label>
              <Select
                value={config.phase1_ocr_provider || "gemini"}
                onValueChange={value => setConfig({...config, phase1_ocr_provider: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>Google Gemini</span>
                      <Badge variant="outline" className="text-[10px]">Padrão</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="mistral">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>Mistral OCR</span>
                      <Badge variant="secondary" className="text-[10px]">Elite</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="minimax">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(45, 93%, 47%)" }} />
                      <span>MiniMax M3</span>
                      <Badge variant="secondary" className="text-[10px]">Chunked</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
                
                {/* Gemini Model Selector (only if Gemini selected) */}
                {config.phase1_ocr_provider === "gemini" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Modelo Gemini</Label>
                      {dynamicGeminiModels.length === 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={() => fetchGeminiModels(true)}
                          disabled={loadingGeminiModels}
                        >
                          {loadingGeminiModels ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3" />
                              Carregar modelos
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    
                    <Select 
                      value={config.phase1_gemini_model || "gemini-2.5-flash"} 
                      onValueChange={value => setConfig({...config, phase1_gemini_model: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o modelo de OCR" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Usar dynamicGeminiModels sincronizado com Provider Inventory */}
                        {(dynamicGeminiModels.length > 0 
                          ? dynamicGeminiModels.filter(modelId => {
                              // Filtrar apenas modelos que suportam PDF
                              const details = geminiModelDetails[modelId];
                              return details?.supportsPdf !== false;
                            })
                          : ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview"]
                        ).map(modelId => {
                          const details = geminiModelDetails[modelId];
                          return (
                            <SelectItem key={modelId} value={modelId}>
                              <div className="flex items-center gap-2">
                                <span>{details?.displayName || modelId}</span>
                                {modelId.includes("3-") && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">3.0</Badge>
                                )}
                                {modelId.includes("pro") && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">Pro</Badge>
                                )}
                                {details?.inputTokenLimit && details.inputTokenLimit >= 1000000 && (
                                  <Badge className="text-[10px] px-1 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                    {(details.inputTokenLimit / 1000000).toFixed(0)}M tokens
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    
                    {modelsCacheUpdatedAt && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Modelos atualizados: {modelsCacheUpdatedAt.toLocaleString('pt-BR')}
                        <Button 
                          variant="link" 
                          className="h-auto p-0 text-[10px] ml-1"
                          onClick={() => fetchGeminiModels(true)}
                          disabled={loadingGeminiModels}
                        >
                          {loadingGeminiModels ? "Atualizando..." : "Atualizar"}
                        </Button>
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      💡 Modelos 3.0 têm melhor OCR para documentos escaneados. Flash é mais rápido, Pro é mais preciso.
                    </p>
                  </div>
                )}
                
                {/* Mistral OCR Info (only if Mistral selected) */}
                {config.phase1_ocr_provider === "mistral" && (
                  <div className="p-3 rounded-lg border border-border bg-muted/50">
                    <div className="flex items-start gap-2">
                      <Crown className="h-4 w-4 text-primary mt-0.5" />
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-foreground">
                          Mistral OCR - Precisão Elite
                        </p>
                        <ul className="text-muted-foreground space-y-0.5">
                          <li>• Precisão ~94.9% em tabelas e fórmulas</li>
                          <li>• Output: Markdown estruturado</li>
                          <li>• Custo: ~$1.00 por 1.000 páginas</li>
                          <li>• Limite: 50MB por arquivo (usa split automático)</li>
                        </ul>
                        {!savedApiKeys['mistral'] && (
                          <p className="text-destructive font-medium mt-2">
                            ⚠️ Requer MISTRAL_API_KEY configurada nas secrets
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
          </div>

          {config.import_strategy === "two_phase" && (
            <>
              <Separator />

              {/* Phase 2 Provider Configuration */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Fase 2: Preenchimento de Campos</h4>
                <p className="text-xs text-muted-foreground">
                  Após a extração visual (Gemini), qual provider usar para preencher os campos do laudo?
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Provider (Fase 2)</Label>
                    <Select value={config.text_fill_provider} onValueChange={value => {
                      let defaultModel = "";
                      if (value === "openrouter") defaultModel = "openai/gpt-4o-mini";
                      else if (value === "lovable") defaultModel = "google/gemini-2.5-flash";
                      else if (value === "gemini") defaultModel = "gemini-2.5-flash";
                      
                      setConfig({
                        ...config,
                        text_fill_provider: value,
                        text_fill_model: defaultModel
                      });
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: provider.color }} />
                              <span>{provider.name}</span>
                              {provider.id === "openrouter" && (
                                <span className="text-[10px] text-muted-foreground">(Recomendado)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Modelo (Fase 2)</Label>
                    {textFillProviderHasCustomInput() ? (
                      <div className="space-y-4">
                        {/* Input + Add Favorite Button */}
                        <div className="flex gap-2 items-center">
                          <Input 
                            value={config.text_fill_model} 
                            onChange={e => setConfig({
                              ...config,
                              text_fill_model: e.target.value
                            })} 
                            placeholder={getTextFillProvider()?.modelPlaceholder || "provider/model-name"} 
                            className="flex-1"
                          />
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => addFavoriteModel(config.text_fill_provider, config.text_fill_model)} 
                            disabled={!config.text_fill_model.trim()} 
                            title="Adicionar aos favoritos"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* Favorite Models from Provider Inventory */}
                        {favoriteModels[config.text_fill_provider]?.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500" />
                              Meus modelos favoritos:
                            </Label>
                            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                              {favoriteModels[config.text_fill_provider].map(model => (
                                <div 
                                  key={model} 
                                  className={cn(
                                    "flex items-center justify-between p-2 rounded-md border text-sm group cursor-pointer hover:bg-muted/50 transition-colors", 
                                    config.text_fill_model === model && "border-primary bg-primary/5"
                                  )} 
                                  onClick={() => setConfig({
                                    ...config,
                                    text_fill_model: model
                                  })}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                                    <span className="font-mono text-xs truncate">{model}</span>
                                  </div>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-6 w-6" 
                                      onClick={e => {
                                        e.stopPropagation();
                                        copyModelId(model);
                                      }} 
                                      title="Copiar identificador"
                                    >
                                      {copiedModel === model ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Popular Suggestions */}
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Sugestões econômicas:</Label>
                          <div className="flex flex-wrap gap-2">
                            {(config.text_fill_provider === "openrouter" 
                              ? [
                                  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", cost: "$0.15/M" },
                                  { id: "deepseek/deepseek-chat", name: "DeepSeek", cost: "$0.14/M" },
                                  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", cost: "$0.10/M" }
                                ]
                              : getTextFillProviderModels().slice(0, 4).map(m => ({ id: m, name: m, cost: "" }))
                            ).map(model => (
                              <Button
                                key={model.id}
                                variant={config.text_fill_model === model.id ? "secondary" : "outline"}
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => setConfig({
                                  ...config,
                                  text_fill_model: model.id
                                })}
                              >
                                {model.name.length > 20 ? model.name.slice(0, 20) + "…" : model.name}
                                {model.cost && <span className="text-muted-foreground ml-1">({model.cost})</span>}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : config.text_fill_provider === "gemini" ? (
                      <Select value={config.text_fill_model} onValueChange={value => setConfig({
                        ...config,
                        text_fill_model: value
                      })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(dynamicGeminiModels.length > 0 ? dynamicGeminiModels : ["gemini-2.5-flash", "gemini-2.5-pro"]).map(modelId => (
                            <SelectItem key={modelId} value={modelId}>{modelId}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={config.text_fill_model} onValueChange={value => setConfig({
                        ...config,
                        text_fill_model: value
                      })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getTextFillProviderModels().map(model => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Store Extracted Text Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Armazenar Texto Extraído</Label>
                  <p className="text-sm text-muted-foreground">
                    Salva o texto completo no bucket para regenerações mais precisas
                  </p>
                </div>
                <Switch 
                  checked={config.store_extracted_text} 
                  onCheckedChange={checked => setConfig({
                    ...config,
                    store_extracted_text: checked
                  })} 
                />
              </div>
            </>
          )}

          {/* Info box */}
          <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
            <p><strong>Fase 1 (Extração Visual):</strong> Gemini oficial com suporte a PDF Vision extrai todo o texto, incluindo imagens escaneadas.</p>
            <p><strong>Fase 2 (Preenchimento):</strong> Provider econômico recebe apenas texto puro (~2-5MB) e preenche cada campo do laudo.</p>
            <p><strong>Benefício:</strong> PDFs de até 2GB são suportados via Google Files API.</p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Section: Allowed Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Providers Permitidos</CardTitle>
          <CardDescription>
            Controle quais providers estão disponíveis para uso no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {AI_PROVIDERS.map(provider => <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{
                backgroundColor: provider.color
              }} />
                  <span className="text-sm font-medium">{provider.name}</span>
                </div>
                <Switch checked={config.allowed_ai_providers.includes(provider.id)} onCheckedChange={() => toggleProvider(provider.id)} />
              </div>)}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Section: Retry Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Retry e Rate Limits
          </CardTitle>
          <CardDescription>
            Configurações de retry automático quando providers falham
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Retry Automático</Label>
              <p className="text-sm text-muted-foreground">
                Tentar novamente automaticamente quando uma chamada falha
              </p>
            </div>
            <Switch checked={config.retry_enabled} onCheckedChange={checked => setConfig({
          ...config,
          retry_enabled: checked
        })} />
          </div>

          {config.retry_enabled && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <Label>Máximo de Tentativas</Label>
                <Select value={String(config.retry_max_attempts)} onValueChange={value => setConfig({
            ...config,
            retry_max_attempts: parseInt(value)
          })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} tentativa{n > 1 ? "s" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delay Base (ms)</Label>
                <Select value={String(config.retry_base_delay_ms)} onValueChange={value => setConfig({
            ...config,
            retry_base_delay_ms: parseInt(value)
          })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[500, 1000, 2000, 3000, 5000].map(n => <SelectItem key={n} value={String(n)}>{n}ms</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Delay aumenta exponencialmente a cada tentativa
                </p>
              </div>
            </div>}
        </CardContent>
      </Card>

      <Separator />

      {/* Section: System Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo de Manutenção</Label>
              <p className="text-sm text-muted-foreground">
                Bloqueia acesso de usuários ao sistema
              </p>
            </div>
            <Switch checked={config.maintenance_mode} onCheckedChange={checked => setConfig({
          ...config,
          maintenance_mode: checked
        })} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Tamanho Máximo de PDF (MB)</Label>
            <Select value={String(config.max_pdf_size_mb)} onValueChange={value => setConfig({
          ...config,
          max_pdf_size_mb: parseInt(value)
        })}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50, 100, 150, 200].map(size => <SelectItem key={size} value={String(size)}>{size} MB</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Section: Mass Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações em Massa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" onClick={resetAllUserQuotas}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Resetar Cotas de IA de Todos os Usuários
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How it Works Section */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Como Funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Provider Ativo:</strong> Usado para todas as chamadas de IA do sistema.
          </p>
          <p>
            <strong>Fallback:</strong> Ativado automaticamente quando o provider principal falha.
          </p>
          <p>
            <strong>PDF Extraction:</strong> Chain de providers específicos para processar documentos.
            O sistema tenta OpenRouter → Gemini Direto → Lovable AI em sequência.
          </p>
          <p>
            <strong>Auto-teste:</strong> Ao salvar uma API key, o sistema testa automaticamente a conexão após 1.5s.
          </p>
          <p>
            <strong>Cache de modelos:</strong> A lista de modelos do Gemini é cacheada por 24h para performance.
          </p>
          <p>
            <strong>Modelos versionados:</strong> Por padrão, apenas modelos estáveis são exibidos. 
            Use o toggle para ver também modelos com sufixos de versão/data.
          </p>
        </CardContent>
      </Card>
    </div>;
}
