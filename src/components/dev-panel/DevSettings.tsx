import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Save,
  AlertTriangle,
  RefreshCw,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Check,
  Globe,
  Cpu,
  Shield,
  Play,
  XCircle,
  CheckCircle2,
} from "lucide-react";

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
  maintenance_mode: boolean;
  max_pdf_size_mb: number;
  allowed_ai_providers: string[];
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

const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: "lovable",
    name: "Lovable AI",
    description: "Gateway integrado sem necessidade de API key externa.",
    models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5", "openai/gpt-5-mini"],
    requiresKey: false,
    color: "hsl(168, 58%, 39%)",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Modelos GPT-4o e série o1.",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
    requiresKey: true,
    color: "hsl(160, 84%, 39%)",
    keyPlaceholder: "sk-...",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Modelos Gemini via Google AI Studio.",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    requiresKey: true,
    color: "hsl(217, 91%, 60%)",
    keyPlaceholder: "AIza...",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    description: "Modelos Claude com raciocínio avançado.",
    models: ["claude-3.5-sonnet", "claude-3.5-haiku"],
    requiresKey: true,
    color: "hsl(25, 95%, 53%)",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Inferência ultra-rápida com modelos open-source.",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-3.2-90b-vision-preview",
      "mixtral-8x7b-32768",
      "gemma2-9b-it"
    ],
    requiresKey: true,
    color: "hsl(280, 87%, 65%)",
    keyPlaceholder: "gsk_...",
    customModelInput: true,
    modelPlaceholder: "llama-3.3-70b-versatile",
    modelDocsUrl: "https://console.groq.com/docs/models",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Modelos de alta qualidade com preços competitivos.",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    requiresKey: true,
    color: "hsl(200, 95%, 48%)",
    keyPlaceholder: "sk-...",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Gateway unificado com 200+ modelos de diversos providers.",
    models: [
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
      "thudm/glm-4-air-250414:free",
      "deepseek/deepseek-r1:free"
    ],
    requiresKey: true,
    color: "hsl(340, 82%, 52%)",
    keyPlaceholder: "sk-or-...",
    customModelInput: true,
    modelPlaceholder: "provider/model-name ou provider/model:variant",
    modelDocsUrl: "https://openrouter.ai/models",
  },
];

const DEFAULT_CONFIG: SystemConfig = {
  default_ai_provider: "lovable",
  default_ai_model: "google/gemini-3-flash-preview",
  fallback_ai_provider: "lovable",
  fallback_ai_model: "google/gemini-2.5-flash",
  maintenance_mode: false,
  max_pdf_size_mb: 50,
  allowed_ai_providers: ["lovable", "openai", "gemini", "claude", "groq", "deepseek", "openrouter"],
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

  useEffect(() => {
    fetchConfig();
    fetchApiKeys();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("system_config")
        .select("id, value");

      if (error) throw error;

      if (data) {
        const configMap: Record<string, any> = {};
        data.forEach((item) => {
          configMap[item.id] = item.value;
        });

        setConfig({
          default_ai_provider: configMap.default_ai_provider || DEFAULT_CONFIG.default_ai_provider,
          default_ai_model: configMap.default_ai_model || DEFAULT_CONFIG.default_ai_model,
          fallback_ai_provider: configMap.fallback_ai_provider || DEFAULT_CONFIG.fallback_ai_provider,
          fallback_ai_model: configMap.fallback_ai_model || DEFAULT_CONFIG.fallback_ai_model,
          maintenance_mode: configMap.maintenance_mode || DEFAULT_CONFIG.maintenance_mode,
          max_pdf_size_mb: configMap.max_pdf_size_mb || DEFAULT_CONFIG.max_pdf_size_mb,
          allowed_ai_providers: configMap.allowed_ai_providers || DEFAULT_CONFIG.allowed_ai_providers,
        });
      }
    } catch (error) {
      console.error("Error fetching config:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar configurações do sistema",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("global_api_keys")
        .select("id, api_key");

      if (error) throw error;

      if (data) {
        const keys: ApiKeys = {};
        const saved: Record<string, boolean> = {};
        data.forEach((item) => {
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
      const updates = [
        { id: "default_ai_provider", value: config.default_ai_provider },
        { id: "default_ai_model", value: config.default_ai_model },
        { id: "fallback_ai_provider", value: config.fallback_ai_provider },
        { id: "fallback_ai_model", value: config.fallback_ai_model },
        { id: "maintenance_mode", value: config.maintenance_mode },
        { id: "max_pdf_size_mb", value: config.max_pdf_size_mb },
        { id: "allowed_ai_providers", value: config.allowed_ai_providers },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("system_config")
          .upsert({ 
            id: update.id, 
            value: update.value, 
            updated_at: new Date().toISOString() 
          });

        if (error) throw error;
      }

      toast({
        title: "Sucesso",
        description: "Configurações do sistema atualizadas",
      });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar configurações",
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
        description: "Digite uma API Key válida",
      });
      return;
    }

    setSavingKey(providerId);
    try {
      const { error } = await supabase
        .from("global_api_keys")
        .upsert({
          id: providerId,
          api_key: key.trim(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setSavedApiKeys((prev) => ({ ...prev, [providerId]: true }));
      toast({
        title: "Sucesso",
        description: `API Key do ${AI_PROVIDERS.find(p => p.id === providerId)?.name} salva`,
      });
    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar API Key",
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
      const { error } = await supabase
        .from("global_api_keys")
        .delete()
        .eq("id", providerId);

      if (error) throw error;

      setApiKeys((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      setSavedApiKeys((prev) => ({ ...prev, [providerId]: false }));
      setTestResults((prev) => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
      toast({
        title: "Sucesso",
        description: "API Key removida",
      });
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao remover API Key",
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
        description: `Configure uma API Key para testar ${provider.name}`,
      });
      return;
    }

    setTestingProvider(providerId);
    
    try {
      const startTime = Date.now();
      
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: {
          provider: providerId,
          model: provider.models[0],
          apiKey: provider.requiresKey ? apiKeys[providerId] : null
        }
      });

      const latencyMs = Date.now() - startTime;

      if (error) {
        setTestResults((prev) => ({
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
          description: error.message,
        });
      } else if (data?.success) {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: {
            success: true,
            latencyMs: data.latencyMs || latencyMs,
            testedAt: new Date()
          }
        }));
        toast({
          title: "Conexão OK",
          description: `${provider.name} respondeu em ${data.latencyMs || latencyMs}ms`,
        });
      } else {
        setTestResults((prev) => ({
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
          description: data?.error || 'Erro desconhecido',
        });
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      setTestResults((prev) => ({
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
        description: `Configure uma API Key para usar o ${provider.name}`,
      });
      return;
    }

    setConfig((prev) => ({
      ...prev,
      default_ai_provider: providerId,
      default_ai_model: provider.models[0],
    }));
  };

  const toggleProvider = (providerId: string) => {
    setConfig((prev) => ({
      ...prev,
      allowed_ai_providers: prev.allowed_ai_providers.includes(providerId)
        ? prev.allowed_ai_providers.filter((p) => p !== providerId)
        : [...prev.allowed_ai_providers, providerId],
    }));
  };

  const resetAllUserQuotas = async () => {
    if (!confirm("Tem certeza que deseja zerar o uso de IA de TODOS os usuários?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ ai_requests_used: 0, last_reset_date: new Date().toISOString().split("T")[0] });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Cotas de IA resetadas para todos os usuários",
      });
    } catch (error) {
      console.error("Error resetting quotas:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao resetar cotas",
      });
    }
  };

  const getActiveProviderModels = () => {
    const provider = AI_PROVIDERS.find((p) => p.id === config.default_ai_provider);
    return provider?.models || [];
  };

  const getFallbackProviderModels = () => {
    const provider = AI_PROVIDERS.find((p) => p.id === config.fallback_ai_provider);
    return provider?.models || [];
  };

  const activeProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find((p) => p.id === config.default_ai_provider);
    return provider?.customModelInput || false;
  };

  const fallbackProviderHasCustomInput = () => {
    const provider = AI_PROVIDERS.find((p) => p.id === config.fallback_ai_provider);
    return provider?.customModelInput || false;
  };

  const getActiveProvider = () => {
    return AI_PROVIDERS.find((p) => p.id === config.default_ai_provider);
  };

  const getFallbackProvider = () => {
    return AI_PROVIDERS.find((p) => p.id === config.fallback_ai_provider);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie IA, providers e configurações globais</p>
        </div>
        <Button onClick={saveConfig} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Alterações
        </Button>
      </div>

      {/* Maintenance Mode Warning */}
      {config.maintenance_mode && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Modo de Manutenção Ativo</p>
              <p className="text-sm text-muted-foreground">
                Usuários não conseguem acessar o sistema enquanto o modo de manutenção está ativo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section: AI Providers */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Provider de IA Padrão</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Clique em um card para selecionar como provider padrão. Providers com 🔒 requerem API Key.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {AI_PROVIDERS.map((provider) => {
            const isActive = config.default_ai_provider === provider.id;
            const hasKey = savedApiKeys[provider.id];
            const isAllowed = config.allowed_ai_providers.includes(provider.id);
            const testResult = testResults[provider.id];
            const isTesting = testingProvider === provider.id;

            return (
              <Card
                key={provider.id}
                className={cn(
                  "relative overflow-hidden transition-all cursor-pointer hover:shadow-md",
                  isActive && "ring-2 ring-primary shadow-lg",
                  !isAllowed && "opacity-50"
                )}
                onClick={() => selectProvider(provider.id)}
              >
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ backgroundColor: provider.color }}
                />

                {isActive && (
                  <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                    ATIVO
                  </Badge>
                )}

                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                    {provider.requiresKey ? (
                      hasKey ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )
                    ) : (
                      <Zap className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <CardDescription className="text-xs">{provider.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Models */}
                  <div className="flex flex-wrap gap-1">
                    {provider.models.slice(0, 3).map((model) => (
                      <Badge key={model} variant="secondary" className="text-xs">
                        {model.length > 20 ? model.slice(0, 20) + "..." : model}
                      </Badge>
                    ))}
                    {provider.models.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{provider.models.length - 3}
                      </Badge>
                    )}
                  </div>

                  {/* API Key input for providers that require it */}
                  {provider.requiresKey && (
                    <div
                      className="space-y-2 pt-2 border-t"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Label className="text-xs">API Key</Label>
                      <div className="flex gap-1">
                        <Input
                          type={showKeys[provider.id] ? "text" : "password"}
                          value={apiKeys[provider.id] || ""}
                          onChange={(e) =>
                            setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                          }
                          placeholder={provider.keyPlaceholder}
                          className="h-8 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() =>
                            setShowKeys((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
                          }
                        >
                          {showKeys[provider.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => saveApiKey(provider.id)}
                          disabled={savingKey === provider.id}
                        >
                          {savingKey === provider.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {hasKey && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Configurada
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteApiKey(provider.id)}
                          >
                            Remover
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Integrated badge for Lovable */}
                  {!provider.requiresKey && (
                    <Badge variant="default" className="w-fit">
                      Integrado
                    </Badge>
                  )}

                  {/* Test Connection Button */}
                  <div
                    className="pt-2 border-t"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => testConnection(provider.id)}
                        disabled={isTesting || (provider.requiresKey && !hasKey)}
                      >
                        {isTesting ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        Testar
                      </Button>
                      
                      {testResult && (
                        <div className="flex items-center gap-1 text-xs">
                          {testResult.success ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              <span className="text-green-600">{testResult.latencyMs}ms</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 text-destructive" />
                              <span className="text-destructive truncate max-w-20" title={testResult.error}>
                                Erro
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Default Model Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Modelo Padrão</CardTitle>
            <CardDescription>
              {activeProviderHasCustomInput() 
                ? `Digite qualquer modelo compatível com ${getActiveProvider()?.name} ou selecione uma sugestão`
                : `Selecione o modelo padrão do provider ${getActiveProvider()?.name}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeProviderHasCustomInput() ? (
              <>
                <div className="space-y-2">
                  <Label>Nome do Modelo</Label>
                  <Input
                    value={config.default_ai_model}
                    onChange={(e) => setConfig({ ...config, default_ai_model: e.target.value })}
                    placeholder={getActiveProvider()?.modelPlaceholder}
                    className="w-full md:w-96"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Sugestões populares:</Label>
                  <div className="flex flex-wrap gap-2">
                    {getActiveProviderModels().map((model) => (
                      <Button
                        key={model}
                        variant={config.default_ai_model === model ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setConfig({ ...config, default_ai_model: model })}
                      >
                        {model}
                      </Button>
                    ))}
                  </div>
                </div>
                {getActiveProvider()?.modelDocsUrl && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Ver todos os modelos em{" "}
                    <a
                      href={getActiveProvider()?.modelDocsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {getActiveProvider()?.modelDocsUrl?.replace("https://", "")}
                    </a>
                  </p>
                )}
              </>
            ) : (
              <Select
                value={config.default_ai_model}
                onValueChange={(value) => setConfig({ ...config, default_ai_model: value })}
              >
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getActiveProviderModels().map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                <Select
                  value={config.fallback_ai_provider}
                  onValueChange={(value) => {
                    const provider = AI_PROVIDERS.find(p => p.id === value);
                    if (provider?.requiresKey && !savedApiKeys[value]) {
                      toast({
                        variant: "destructive",
                        title: "API Key necessária",
                        description: `Configure uma API Key para usar ${provider.name} como fallback`,
                      });
                      return;
                    }
                    setConfig({ 
                      ...config, 
                      fallback_ai_provider: value,
                      fallback_ai_model: AI_PROVIDERS.find(p => p.id === value)?.models[0] || ""
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter(p => !p.requiresKey || savedApiKeys[p.id]).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modelo de Fallback</Label>
                {fallbackProviderHasCustomInput() ? (
                  <div className="space-y-2">
                    <Input
                      value={config.fallback_ai_model}
                      onChange={(e) => setConfig({ ...config, fallback_ai_model: e.target.value })}
                      placeholder={getFallbackProvider()?.modelPlaceholder}
                    />
                    <div className="flex flex-wrap gap-1">
                      {getFallbackProviderModels().slice(0, 4).map((model) => (
                        <Button
                          key={model}
                          variant={config.fallback_ai_model === model ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-6"
                          onClick={() => setConfig({ ...config, fallback_ai_model: model })}
                        >
                          {model.length > 25 ? model.slice(0, 25) + "..." : model}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Select
                    value={config.fallback_ai_model}
                    onValueChange={(value) => setConfig({ ...config, fallback_ai_model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getFallbackProviderModels().map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(config.fallback_ai_provider)}
                  disabled={testingProvider === config.fallback_ai_provider}
                >
                  {testingProvider === config.fallback_ai_provider ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Testar Fallback
                </Button>
                
                {testResults[config.fallback_ai_provider] && (
                  <div className="flex items-center gap-1 text-sm">
                    {testResults[config.fallback_ai_provider].success ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">
                          OK ({testResults[config.fallback_ai_provider].latencyMs}ms)
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
                <span>Lovable AI não requer API Key (recomendado)</span>
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
              {AI_PROVIDERS.map((provider) => (
                <div key={provider.id} className="flex items-center gap-3">
                  <Switch
                    checked={config.allowed_ai_providers.includes(provider.id)}
                    onCheckedChange={() => toggleProvider(provider.id)}
                  />
                  <Label className="cursor-pointer">{provider.name}</Label>
                </div>
              ))}
            </div>
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
              <Switch
                checked={config.maintenance_mode}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, maintenance_mode: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Tamanho Máximo de PDF (MB)</Label>
              <Input
                type="number"
                value={config.max_pdf_size_mb}
                onChange={(e) =>
                  setConfig({ ...config, max_pdf_size_mb: parseInt(e.target.value) || 50 })
                }
                min={1}
                max={100}
                className="w-32"
              />
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
              <strong>Lovable AI</strong> é o provider padrão e não requer configuração adicional.
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
    </div>
  );
}