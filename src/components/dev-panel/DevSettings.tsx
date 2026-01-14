import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Save, AlertTriangle, RefreshCw, Zap, Lock, Eye, EyeOff, Check, Globe, Cpu, Shield, Play, XCircle, CheckCircle2, Plus, Copy, Trash2, Star, FileText, Pin, PinOff, Crown, ArrowDownAZ } from "lucide-react";
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
const AI_PROVIDERS: ProviderInfo[] = [{
  id: "lovable",
  name: "IA Integrada",
  description: "Gateway integrado sem necessidade de API key externa.",
  models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5", "openai/gpt-5-mini"],
  requiresKey: false,
  color: "hsl(168, 58%, 39%)"
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
  description: "Modelos Gemini via Google AI Studio.",
  models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  requiresKey: true,
  color: "hsl(217, 91%, 60%)",
  keyPlaceholder: "AIza..."
}, {
  id: "claude",
  name: "Anthropic Claude",
  description: "Modelos Claude com raciocínio avançado.",
  models: ["claude-3.5-sonnet", "claude-3.5-haiku"],
  requiresKey: true,
  color: "hsl(25, 95%, 53%)",
  keyPlaceholder: "sk-ant-..."
}, {
  id: "groq",
  name: "Groq",
  description: "Inferência ultra-rápida com modelos open-source.",
  models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-3.2-90b-vision-preview", "mixtral-8x7b-32768", "gemma2-9b-it"],
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
  models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
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
}];
const DEFAULT_CONFIG: SystemConfig = {
  default_ai_provider: "lovable",
  default_ai_model: "google/gemini-3-flash-preview",
  fallback_ai_provider: "lovable",
  fallback_ai_model: "google/gemini-2.5-flash",
  gemini_pdf_model: "gemini-2.5-flash",
  pdf_ai_provider: "openrouter",
  pdf_ai_model: "google/gemini-2.5-flash",
  pdf_fallback_provider: "lovable",
  pdf_fallback_model: "google/gemini-2.5-flash",
  maintenance_mode: false,
  max_pdf_size_mb: 50,
  allowed_ai_providers: ["lovable", "openai", "gemini", "claude", "groq", "deepseek", "openrouter"],
  retry_enabled: true,
  retry_max_attempts: 3,
  retry_base_delay_ms: 1000
};

// Gemini Vision models available for PDF extraction (legacy - direct Gemini)
const GEMINI_PDF_MODELS = [{
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  description: 'Rápido e eficiente (recomendado)'
}, {
  id: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  description: 'Maior precisão, mais lento'
}, {
  id: 'gemini-2.0-flash-exp',
  name: 'Gemini 2.0 Flash (Exp)',
  description: 'Versão experimental'
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

  // Animation states for visual feedback
  const [animatingProvider, setAnimatingProvider] = useState<string | null>(null);
  const [animationType, setAnimationType] = useState<'pin' | 'activate' | null>(null);
  useEffect(() => {
    fetchConfig();
    fetchApiKeys();
    fetchFavoriteModels();
    fetchPinnedProviders();
  }, []);
  const fetchPinnedProviders = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("system_config").select("value").eq("id", "pinned_ai_providers").single();
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

    // Trigger animation only when pinning (not unpinning)
    if (!isPinned) {
      setAnimatingProvider(providerId);
      setAnimationType('pin');
      setTimeout(() => {
        setAnimatingProvider(null);
        setAnimationType(null);
      }, 600);
    }
    try {
      const {
        error
      } = await supabase.from("system_config").upsert({
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
      const {
        data,
        error
      } = await supabase.from("system_config").select("id, value").in("id", ["favorite_models_openrouter", "favorite_models_groq"]);
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
      const {
        error
      } = await supabase.from("system_config").upsert({
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
      const {
        error
      } = await supabase.from("system_config").upsert({
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
      const {
        data,
        error
      } = await supabase.from("system_config").select("id, value");
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
          retry_base_delay_ms: configMap.retry_base_delay_ms ?? DEFAULT_CONFIG.retry_base_delay_ms
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
      const {
        data,
        error
      } = await supabase.from("global_api_keys").select("id, api_key");
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
      }];
      for (const update of updates) {
        const {
          error
        } = await supabase.from("system_config").upsert({
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
      const {
        error
      } = await supabase.from("global_api_keys").upsert({
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
      const {
        error
      } = await supabase.from("global_api_keys").delete().eq("id", providerId);
      if (error) throw error;
      setApiKeys(prev => {
        const updated = {
          ...prev
        };
        delete updated[providerId];
        return updated;
      });
      setSavedApiKeys(prev => ({
        ...prev,
        [providerId]: false
      }));
      setTestResults(prev => {
        const updated = {
          ...prev
        };
        delete updated[providerId];
        return updated;
      });
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
      const {
        data,
        error
      } = await supabase.functions.invoke('test-ai-connection', {
        body: {
          provider: providerId,
          model: provider.models[0],
          apiKey: provider.requiresKey ? apiKeys[providerId] : null
        }
      });
      const latencyMs = Date.now() - startTime;
      if (error) {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            error: error.message,
            testedAt: new Date()
          }
        }));
        toast({
          variant: "destructive",
          title: "Teste falhou",
          description: error.message
        });
      } else if (data?.success) {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: true,
            latencyMs: data.latencyMs || latencyMs,
            testedAt: new Date()
          }
        }));
        toast({
          title: "Conexão OK",
          description: `${provider.name} respondeu em ${data.latencyMs || latencyMs}ms`
        });
      } else {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            error: data?.error || 'Erro desconhecido',
            testedAt: new Date()
          }
        }));
        toast({
          variant: "destructive",
          title: "Teste falhou",
          description: data?.error || 'Erro desconhecido'
        });
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          error: error instanceof Error ? error.message : 'Erro de conexão',
          testedAt: new Date()
        }
      }));
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

    // Trigger activation animation
    setAnimatingProvider(providerId);
    setAnimationType('activate');
    setTimeout(() => {
      setAnimatingProvider(null);
      setAnimationType(null);
    }, 1000);
    setConfig(prev => ({
      ...prev,
      default_ai_provider: providerId,
      default_ai_model: provider.models[0]
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
      const {
        error
      } = await supabase.from("user_settings").update({
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
    return provider?.models || [];
  };
  const getFallbackProviderModels = () => {
    const provider = AI_PROVIDERS.find(p => p.id === config.fallback_ai_provider);
    return provider?.models || [];
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

  // Render individual provider card with enhanced styling
  const renderProviderCard = (provider: ProviderInfo, isActive: boolean, isPinned: boolean) => {
    const hasKey = savedApiKeys[provider.id];
    const isAllowed = config.allowed_ai_providers.includes(provider.id);
    const testResult = testResults[provider.id];
    const isTesting = testingProvider === provider.id;

    // Animation states
    const isAnimating = animatingProvider === provider.id;
    const isActivating = isAnimating && animationType === 'activate';
    const isPinning = isAnimating && animationType === 'pin';
    return <div key={provider.id} className="transition-all duration-500 ease-out" style={{
      willChange: isAnimating ? 'transform' : 'auto'
    }}>
        <Card className={cn("group relative overflow-hidden cursor-pointer hover:shadow-lg", "transition-all duration-300 ease-out",
      // Visual states
      isActive && "ring-2 ring-primary shadow-xl scale-[1.02]", isPinned && !isActive && "ring-1 ring-amber-400/50", !isAllowed && "opacity-50",
      // Temporary animations
      isActivating && "animate-glow-primary", isPinning && "animate-highlight-pulse")} onClick={() => selectProvider(provider.id)}>
          {/* Colored top bar - thicker for active */}
          <div className={cn("absolute top-0 left-0 w-full transition-all duration-300", isActive ? "h-2" : "h-1")} style={{
          backgroundColor: provider.color
        }} />

          {/* Pin button - visible on hover or when pinned */}
          <Button variant="ghost" size="icon" className={cn("absolute top-3 left-3 h-6 w-6 z-10 transition-all duration-200", "opacity-0 group-hover:opacity-100", isPinned && "opacity-100 text-amber-500", isActive && "opacity-0 group-hover:opacity-0",
        // Hide pin for active
        isPinning && "animate-pin-bounce")} onClick={e => {
          e.stopPropagation();
          togglePinProvider(provider.id);
        }} title={isPinned ? "Desafixar" : "Fixar no topo"}>
            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </Button>

          {/* Status badges */}
          {isActive ? <Badge className={cn("absolute top-3 right-3 bg-primary text-primary-foreground shadow-lg", "transition-all duration-300", isActivating && "animate-scale-in")}>
              <Check className="h-3 w-3 mr-1" />
              ATIVO
            </Badge> : isPinned ? <Badge variant="outline" className={cn("absolute top-3 right-3 border-amber-400 text-amber-500", isPinning && "animate-scale-in")}>
              <Pin className="h-3 w-3" />
            </Badge> : null}

        <CardHeader className="pb-2 pt-6">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{provider.name}</CardTitle>
            {provider.requiresKey ? hasKey ? <Check className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground" /> : <Zap className="h-4 w-4 text-primary" />}
          </div>
          <CardDescription className="text-xs">{provider.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Models */}
          <div className="flex flex-wrap gap-1">
            {provider.models.slice(0, 3).map(model => <Badge key={model} variant="secondary" className="text-xs">
                {model.length > 20 ? model.slice(0, 20) + "..." : model}
              </Badge>)}
            {provider.models.length > 3 && <Badge variant="outline" className="text-xs">
                +{provider.models.length - 3}
              </Badge>}
          </div>

          {/* API Key input for providers that require it */}
          {provider.requiresKey && <div className="space-y-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
              <Label className="text-xs">API Key</Label>
              <div className="flex gap-1">
                <Input type={showKeys[provider.id] ? "text" : "password"} value={apiKeys[provider.id] || ""} onChange={e => setApiKeys(prev => ({
                ...prev,
                [provider.id]: e.target.value
              }))} placeholder={provider.keyPlaceholder} className="h-8 text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowKeys(prev => ({
                ...prev,
                [provider.id]: !prev[provider.id]
              }))}>
                  {showKeys[provider.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => saveApiKey(provider.id)} disabled={savingKey === provider.id}>
                  {savingKey === provider.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </Button>
              </div>
              {hasKey && <div className="flex items-center justify-between">
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Configurada
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive" onClick={() => deleteApiKey(provider.id)}>
                    Remover
                  </Button>
                </div>}
            </div>}

          {/* Integrated badge for Lovable */}
          {!provider.requiresKey && <Badge variant="default" className="w-fit">
              Integrado
            </Badge>}

          {/* Test Connection Button */}
          <div className="pt-2 border-t" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => testConnection(provider.id)} disabled={isTesting || provider.requiresKey && !hasKey}>
                {isTesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                Testar
              </Button>

              {testResult && <div className="flex items-center gap-1 text-xs">
                  {testResult.success ? <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-green-600">{testResult.latencyMs}ms</span>
                    </> : <>
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span className="text-destructive truncate max-w-20" title={testResult.error}>
                        Erro
                      </span>
                    </>}
                </div>}
            </div>
          </div>
        </CardContent>
        </Card>
      </div>;
  };
  if (loading) {
    return <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
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

      {/* Section: AI Providers */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Provider de IA Padrão</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Clique em um card para selecionar como provider padrão. Use 📌 para fixar providers favoritos no topo.
        </p>

        {/* Provider Cards with Dynamic Sorting */}
        <div className="space-y-6">
          {(() => {
          const sortedProviders = getSortedProviders();
          const activeProvider = sortedProviders.find(p => p.id === config.default_ai_provider);
          const pinnedNonActive = sortedProviders.filter(p => pinnedProviders.includes(p.id) && p.id !== config.default_ai_provider);
          const others = sortedProviders.filter(p => !pinnedProviders.includes(p.id) && p.id !== config.default_ai_provider);
          return <>
                {/* Section: Default Provider */}
                {activeProvider && <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Crown className="h-4 w-4" />
                      <span>IA Padrão</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {renderProviderCard(activeProvider, true, false)}
                    </div>
                  </div>}

                {/* Section: Pinned Providers */}
                {pinnedNonActive.length > 0 && <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
                      <Pin className="h-4 w-4" />
                      <span>Fixados ({pinnedNonActive.length})</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {pinnedNonActive.map(provider => renderProviderCard(provider, false, true))}
                    </div>
                  </div>}

                {/* Section: Other Providers (Alphabetical) */}
                {others.length > 0 && <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <ArrowDownAZ className="h-4 w-4" />
                      <span>Outros Providers (A-Z)</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {others.map(provider => renderProviderCard(provider, false, false))}
                    </div>
                  </div>}
              </>;
        })()}
        </div>

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
                    {getActiveProviderModels().map(model => <Button key={model} variant={config.default_ai_model === model ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setConfig({
                  ...config,
                  default_ai_model: model
                })}>
                        {model}
                      </Button>)}
                  </div>
                </div>
                {getActiveProvider()?.modelDocsUrl && <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Ver todos os modelos em{" "}
                    <a href={getActiveProvider()?.modelDocsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {getActiveProvider()?.modelDocsUrl?.replace("https://", "")}
                    </a>
                  </p>}
              </> : <Select value={config.default_ai_model} onValueChange={value => setConfig({
            ...config,
            default_ai_model: value
          })}>
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getActiveProviderModels().map(model => <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>)}
                </SelectContent>
              </Select>}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: Fallback AI Configuration */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">IA de Fallback (Segunda IA)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Quando a IA principal falhar, esta será usada automaticamente como backup.
        </p>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Provider de Fallback</Label>
                <Select value={config.fallback_ai_provider} onValueChange={value => {
                const provider = AI_PROVIDERS.find(p => p.id === value);
                if (provider?.requiresKey && !savedApiKeys[value]) {
                  toast({
                    variant: "destructive",
                    title: "API Key necessária",
                    description: `Configure uma API Key para usar ${provider.name} como fallback`
                  });
                  return;
                }
                setConfig({
                  ...config,
                  fallback_ai_provider: value,
                  fallback_ai_model: AI_PROVIDERS.find(p => p.id === value)?.models[0] || ""
                });
              }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modelo de Fallback</Label>
                {fallbackProviderHasCustomInput() ? <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <Input value={config.fallback_ai_model} onChange={e => setConfig({
                    ...config,
                    fallback_ai_model: e.target.value
                  })} placeholder={getFallbackProvider()?.modelPlaceholder} />
                      <Button variant="outline" size="icon" onClick={() => addFavoriteModel(config.fallback_ai_provider, config.fallback_ai_model)} disabled={!config.fallback_ai_model.trim()} title="Adicionar aos favoritos">
                        <Plus className="h-4 w-4" />
                      </Button>
                      {config.fallback_ai_model && <Badge variant="secondary" className="flex items-center gap-1 shrink-0 text-xs">
                          <Check className="h-3 w-3" />
                          Definido
                        </Badge>}
                    </div>
                    
                    {/* Favorite Models for Fallback */}
                    {favoriteModels[config.fallback_ai_provider]?.length > 0 && <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          Favoritos:
                        </Label>
                        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                          {favoriteModels[config.fallback_ai_provider].map(model => <div key={model} className={cn("flex items-center justify-between p-1.5 rounded-md border text-xs group cursor-pointer hover:bg-muted/50 transition-colors", config.fallback_ai_model === model && "border-primary bg-primary/5")} onClick={() => setConfig({
                      ...config,
                      fallback_ai_model: model
                    })}>
                              <div className="flex items-center gap-1 min-w-0">
                                <Star className="h-2.5 w-2.5 text-yellow-500 shrink-0" />
                                <span className="font-mono truncate">{model}</span>
                              </div>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => {
                          e.stopPropagation();
                          copyModelId(model);
                        }}>
                                  {copiedModel === model ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={e => {
                          e.stopPropagation();
                          removeFavoriteModel(config.fallback_ai_provider, model);
                        }}>
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </div>)}
                        </div>
                      </div>}
                    
                    <div className="flex flex-wrap gap-1">
                      {getFallbackProviderModels().slice(0, 4).map(model => <Button key={model} variant={config.fallback_ai_model === model ? "default" : "outline"} size="sm" className="text-xs h-6" onClick={() => setConfig({
                    ...config,
                    fallback_ai_model: model
                  })}>
                          {model.length > 25 ? model.slice(0, 25) + "..." : model}
                        </Button>)}
                    </div>
                  </div> : <Select value={config.fallback_ai_model} onValueChange={value => setConfig({
                ...config,
                fallback_ai_model: value
              })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getFallbackProviderModels().map(model => <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => testConnection(config.fallback_ai_provider)} disabled={testingProvider === config.fallback_ai_provider}>
                  {testingProvider === config.fallback_ai_provider ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Testar Fallback
                </Button>
                
                {testResults[config.fallback_ai_provider] && <div className="flex items-center gap-1 text-sm">
                    {testResults[config.fallback_ai_provider].success ? <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">
                          OK ({testResults[config.fallback_ai_provider].latencyMs}ms)
                        </span>
                      </> : <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-destructive">Falhou</span>
                      </>}
                  </div>}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>IA Integrada não requer API Key (recomendado)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: PDF Extraction - Dynamic Provider (same as Fallback) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Extração de PDF (Importação de Autos)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure o provider e modelo de IA para processamento de PDFs. Modelos favoritos são compartilhados com a IA principal.
        </p>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* PDF Provider Selection - Uses AI_PROVIDERS like Fallback */}
              <div className="space-y-2">
                <Label>Provider para PDFs</Label>
                <Select value={config.pdf_ai_provider} onValueChange={value => {
                const provider = AI_PROVIDERS.find(p => p.id === value);
                if (provider?.requiresKey && !savedApiKeys[value]) {
                  toast({
                    variant: "destructive",
                    title: "API Key necessária",
                    description: `Configure uma API Key para usar ${provider.name} para PDFs`
                  });
                  return;
                }
                setConfig({
                  ...config,
                  pdf_ai_provider: value,
                  pdf_ai_model: AI_PROVIDERS.find(p => p.id === value)?.models[0] || ""
                });
              }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* PDF Model Selection - Dynamic like Fallback */}
              <div className="space-y-2">
                <Label>Modelo para PDFs</Label>
                {pdfProviderHasCustomInput() ? <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <Input value={config.pdf_ai_model} onChange={e => setConfig({
                    ...config,
                    pdf_ai_model: e.target.value
                  })} placeholder={getPdfProvider()?.modelPlaceholder} />
                      <Button variant="outline" size="icon" onClick={() => addFavoriteModel(config.pdf_ai_provider, config.pdf_ai_model)} disabled={!config.pdf_ai_model.trim()} title="Adicionar aos favoritos">
                        <Plus className="h-4 w-4" />
                      </Button>
                      {config.pdf_ai_model && <Badge variant="secondary" className="flex items-center gap-1 shrink-0 text-xs">
                          <Check className="h-3 w-3" />
                          Definido
                        </Badge>}
                    </div>
                    
                    {/* Favorite Models for PDF - Shared with main AI */}
                    {favoriteModels[config.pdf_ai_provider]?.length > 0 && <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          Favoritos:
                        </Label>
                        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                          {favoriteModels[config.pdf_ai_provider].map(model => <div key={model} className={cn("flex items-center justify-between p-1.5 rounded-md border text-xs group cursor-pointer hover:bg-muted/50 transition-colors", config.pdf_ai_model === model && "border-primary bg-primary/5")} onClick={() => setConfig({
                      ...config,
                      pdf_ai_model: model
                    })}>
                              <div className="flex items-center gap-1 min-w-0">
                                <Star className="h-2.5 w-2.5 text-yellow-500 shrink-0" />
                                <span className="font-mono truncate">{model}</span>
                              </div>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => {
                          e.stopPropagation();
                          copyModelId(model);
                        }}>
                                  {copiedModel === model ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={e => {
                          e.stopPropagation();
                          removeFavoriteModel(config.pdf_ai_provider, model);
                        }}>
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </div>)}
                        </div>
                      </div>}
                    
                    {/* Quick suggestions from provider defaults */}
                    <div className="flex flex-wrap gap-1">
                      {getPdfProviderModels().slice(0, 4).map(model => <Button key={model} variant={config.pdf_ai_model === model ? "default" : "outline"} size="sm" className="text-xs h-6" onClick={() => setConfig({
                    ...config,
                    pdf_ai_model: model
                  })}>
                          {model.length > 25 ? model.slice(0, 25) + "..." : model}
                        </Button>)}
                    </div>
                  </div> : <Select value={config.pdf_ai_model} onValueChange={value => setConfig({
                ...config,
                pdf_ai_model: value
              })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getPdfProviderModels().map(model => <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>}
              </div>
            </div>

            {/* Link to docs for custom input providers */}
            {getPdfProvider()?.modelDocsUrl && <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Ver todos os modelos em{" "}
                <a href={getPdfProvider()?.modelDocsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {getPdfProvider()?.modelDocsUrl?.replace("https://", "")}
                </a>
              </p>}

            {/* Info Box */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
              <Zap className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Dica: Favoritos são compartilhados</p>
                <p className="text-muted-foreground">
                  Modelos adicionados como favoritos na IA principal ou fallback também aparecem aqui automaticamente.
                </p>
              </div>
            </div>

            {/* Provider-specific warnings */}
            {getPdfProvider()?.requiresKey && !savedApiKeys[config.pdf_ai_provider] && <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>Configure a API Key do {getPdfProvider()?.name} nos cards acima.</span>
              </div>}
          </CardContent>
        </Card>
        
        {/* PDF Fallback Configuration Card */}
        <Card className="border-dashed border-amber-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Fallback para Extração de PDF</CardTitle>
            </div>
            <CardDescription>
              Usado automaticamente quando o provider principal falha (ex: limite de páginas excedido)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* PDF Fallback Provider Selection */}
              <div className="space-y-2">
                <Label>Provider de Fallback</Label>
                <Select value={config.pdf_fallback_provider} onValueChange={value => {
                const provider = AI_PROVIDERS.find(p => p.id === value);
                if (provider?.requiresKey && !savedApiKeys[value]) {
                  toast({
                    variant: "destructive",
                    title: "API Key necessária",
                    description: `Configure uma API Key para usar ${provider.name} como fallback`
                  });
                  return;
                }
                setConfig({
                  ...config,
                  pdf_fallback_provider: value,
                  pdf_fallback_model: AI_PROVIDERS.find(p => p.id === value)?.models[0] || ""
                });
              }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map(provider => <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* PDF Fallback Model Selection */}
              <div className="space-y-2">
                <Label>Modelo de Fallback</Label>
                {pdfFallbackProviderHasCustomInput() ? <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <Input value={config.pdf_fallback_model} onChange={e => setConfig({
                    ...config,
                    pdf_fallback_model: e.target.value
                  })} placeholder={getPdfFallbackProvider()?.modelPlaceholder} />
                      <Button variant="outline" size="icon" onClick={() => addFavoriteModel(config.pdf_fallback_provider, config.pdf_fallback_model)} disabled={!config.pdf_fallback_model.trim()} title="Adicionar aos favoritos">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Favorite Models for PDF Fallback - Shared */}
                    {favoriteModels[config.pdf_fallback_provider]?.length > 0 && <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          Favoritos:
                        </Label>
                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                          {favoriteModels[config.pdf_fallback_provider].map(model => <div key={model} className={cn("flex items-center justify-between p-1.5 rounded-md border text-xs group cursor-pointer hover:bg-muted/50 transition-colors", config.pdf_fallback_model === model && "border-primary bg-primary/5")} onClick={() => setConfig({
                      ...config,
                      pdf_fallback_model: model
                    })}>
                              <div className="flex items-center gap-1 min-w-0">
                                <Star className="h-2.5 w-2.5 text-yellow-500 shrink-0" />
                                <span className="font-mono truncate">{model}</span>
                              </div>
                            </div>)}
                        </div>
                      </div>}
                    
                    {/* Quick suggestions */}
                    <div className="flex flex-wrap gap-1">
                      {getPdfFallbackProviderModels().slice(0, 3).map(model => <Button key={model} variant={config.pdf_fallback_model === model ? "default" : "outline"} size="sm" className="text-xs h-6" onClick={() => setConfig({
                    ...config,
                    pdf_fallback_model: model
                  })}>
                          {model.length > 20 ? model.slice(0, 20) + "..." : model}
                        </Button>)}
                    </div>
                  </div> : <Select value={config.pdf_fallback_model} onValueChange={value => setConfig({
                ...config,
                pdf_fallback_model: value
              })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getPdfFallbackProviderModels().map(model => <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>}
              </div>
            </div>

            {/* Warning if fallback requires key */}
            {getPdfFallbackProvider()?.requiresKey && !savedApiKeys[config.pdf_fallback_provider] && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>Configure a API Key do {getPdfFallbackProvider()?.name} nos cards acima.</span>
              </div>
            )}

            {/* Footer com botão de teste e dica - Padrão igual ao Fallback principal */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => testConnection(config.pdf_fallback_provider)} 
                  disabled={testingProvider === config.pdf_fallback_provider}
                >
                  {testingProvider === config.pdf_fallback_provider ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Testar Fallback
                </Button>
                
                {testResults[config.pdf_fallback_provider] && (
                  <div className="flex items-center gap-1 text-sm">
                    {testResults[config.pdf_fallback_provider].success ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">
                          OK ({testResults[config.pdf_fallback_provider].latencyMs}ms)
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-destructive">Falhou</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>IA Integrada não requer API Key (recomendado)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: Allowed Providers */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Providers Habilitados</h2>
        <p className="text-sm text-muted-foreground">
          Controle quais providers de IA podem ser usados no sistema.
        </p>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-6">
              {AI_PROVIDERS.map(provider => <div key={provider.id} className="flex items-center gap-3">
                  <Switch checked={config.allowed_ai_providers.includes(provider.id)} onCheckedChange={() => toggleProvider(provider.id)} />
                  <Label className="cursor-pointer">{provider.name}</Label>
                </div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: Retry & Rate Limit Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Resiliência & Rate Limits</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure o comportamento de retry automático quando a IA retorna erros temporários (429, 502, 503).
        </p>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Toggle para habilitar/desabilitar */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Retry Automático</Label>
                <p className="text-sm text-muted-foreground">
                  Tentar novamente automaticamente em caso de rate limits
                </p>
              </div>
              <Switch checked={config.retry_enabled} onCheckedChange={checked => setConfig({
              ...config,
              retry_enabled: checked
            })} />
            </div>

            {/* Configurações detalhadas (visíveis apenas se habilitado) */}
            {config.retry_enabled && <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                {/* Máximo de Tentativas */}
                <div className="space-y-2">
                  <Label>Máximo de Tentativas</Label>
                  <Select value={String(config.retry_max_attempts)} onValueChange={value => setConfig({
                ...config,
                retry_max_attempts: Number(value)
              })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 tentativa</SelectItem>
                      <SelectItem value="2">2 tentativas</SelectItem>
                      <SelectItem value="3">3 tentativas (padrão)</SelectItem>
                      <SelectItem value="4">4 tentativas</SelectItem>
                      <SelectItem value="5">5 tentativas</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Número de retries antes de desistir
                  </p>
                </div>

                {/* Delay Base */}
                <div className="space-y-2">
                  <Label>Delay Base (ms)</Label>
                  <Select value={String(config.retry_base_delay_ms)} onValueChange={value => setConfig({
                ...config,
                retry_base_delay_ms: Number(value)
              })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">500ms (rápido)</SelectItem>
                      <SelectItem value="1000">1000ms (padrão)</SelectItem>
                      <SelectItem value="2000">2000ms (conservador)</SelectItem>
                      <SelectItem value="3000">3000ms (lento)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Tempo inicial de espera (dobra a cada retry)
                  </p>
                </div>
              </div>}

            {/* Visualização do comportamento */}
            {config.retry_enabled && <div className="bg-muted/50 rounded-lg p-4 mt-4">
                <Label className="text-sm">Comportamento esperado:</Label>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <span>Tentativa 1</span>
                  {Array.from({
                length: config.retry_max_attempts
              }).map((_, i) => <span key={i} className="flex items-center gap-1">
                      <span>→</span>
                      <span className="text-amber-500 font-mono">
                        {config.retry_base_delay_ms * Math.pow(2, i)}ms
                      </span>
                      <span>→ Tentativa {i + 2}</span>
                    </span>)}
                </div>
              </div>}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: General Settings */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configurações Gerais</CardTitle>
            <CardDescription>Configurações básicas do sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
              <Input type="number" value={config.max_pdf_size_mb} onChange={e => setConfig({
              ...config,
              max_pdf_size_mb: parseInt(e.target.value) || 50
            })} min={1} max={100} className="w-32" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações em Massa</CardTitle>
            <CardDescription>Operações que afetam múltiplos usuários</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Resetar Cotas de IA</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Zera o contador de requisições de IA para todos os usuários
              </p>
              <Button variant="outline" onClick={resetAllUserQuotas}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resetar Todas as Cotas
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Section: How it Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <ul className="space-y-2 text-muted-foreground list-disc pl-4">
            <li>
              <strong>IA Integrada</strong> é o provider padrão e não requer configuração adicional.
              Usa o gateway integrado para acessar modelos Gemini e GPT.
            </li>
            <li>
              <strong>Sistema de Fallback:</strong> Se a IA principal falhar (timeout, erro de API, etc.),
              o sistema automaticamente tentará a IA de fallback configurada.
            </li>
            <li>
              Providers externos requerem uma <strong>API key global</strong> configurada nos cards acima.
              Essas keys são usadas quando o usuário não tem uma key própria.
            </li>
            <li>
              Use o botão <strong>Testar</strong> em cada card para verificar se a conexão está funcionando
              antes de ativar o provider.
            </li>
            <li>
              O sistema registra todas as requisições de IA na tabela de logs,
              incluindo se usou fallback, latência, e erros na aba <strong>IA</strong>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>;
}