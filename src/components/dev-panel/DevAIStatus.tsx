import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  Zap,
  ArrowRight,
  Shield,
  Database,
} from "lucide-react";

interface ProviderConfig {
  provider: string;
  model: string;
  hasKey: boolean;
  status: 'active' | 'ready' | 'error';
}

interface AIOperation {
  id: string;
  name: string;
  provider: string;
  model: string;
  status: 'ok' | 'warning' | 'error';
}

const PROVIDER_NAMES: Record<string, string> = {
  lovable: 'Lovable AI',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
};

const AI_OPERATIONS: AIOperation[] = [
  { id: 'pdf_extraction', name: 'Extração PDF (Vision)', provider: '', model: '', status: 'ok' },
  { id: 'resumo_peticao', name: 'Resumo Petição', provider: '', model: '', status: 'ok' },
  { id: 'resumo_contestacao', name: 'Resumo Contestação', provider: '', model: '', status: 'ok' },
  { id: 'descricao_doencas', name: 'Descrição Doenças', provider: '', model: '', status: 'ok' },
  { id: 'nexo_causal', name: 'Análise Nexo Causal', provider: '', model: '', status: 'ok' },
  { id: 'incapacidade', name: 'Análise Incapacidade', provider: '', model: '', status: 'ok' },
];

export function DevAIStatus() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [primaryConfig, setPrimaryConfig] = useState<ProviderConfig | null>(null);
  const [fallbackConfig, setFallbackConfig] = useState<ProviderConfig | null>(null);
  const [operations, setOperations] = useState<AIOperation[]>(AI_OPERATIONS);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchConfig();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('ai_config_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'system_config'
      }, () => {
        console.log('[DevAIStatus] Config changed, refreshing...');
        fetchConfig();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'global_api_keys'
      }, () => {
        console.log('[DevAIStatus] API keys changed, refreshing...');
        fetchConfig();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConfig = async () => {
    try {
      // Fetch system config
      const { data: configData, error: configError } = await supabase
        .from('system_config')
        .select('id, value')
        .in('id', ['default_ai_provider', 'default_ai_model', 'fallback_ai_provider', 'fallback_ai_model']);

      if (configError) throw configError;

      // Fetch API keys
      const { data: keysData, error: keysError } = await supabase
        .from('global_api_keys')
        .select('id');

      if (keysError) throw keysError;

      const configMap: Record<string, string> = {};
      configData?.forEach(item => {
        configMap[item.id] = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
      });

      const savedKeys = new Set(keysData?.map(k => k.id) || []);

      // Parse primary config
      const primaryProvider = configMap.default_ai_provider?.replace(/"/g, '') || 'lovable';
      const primaryModel = configMap.default_ai_model?.replace(/"/g, '') || 'google/gemini-2.5-flash';
      const primaryHasKey = primaryProvider === 'lovable' || savedKeys.has(primaryProvider);

      setPrimaryConfig({
        provider: primaryProvider,
        model: primaryModel,
        hasKey: primaryHasKey,
        status: primaryHasKey ? 'active' : 'error'
      });

      // Parse fallback config
      const fallbackProvider = configMap.fallback_ai_provider?.replace(/"/g, '') || 'lovable';
      const fallbackModel = configMap.fallback_ai_model?.replace(/"/g, '') || 'google/gemini-2.5-flash';
      const fallbackHasKey = fallbackProvider === 'lovable' || savedKeys.has(fallbackProvider);

      setFallbackConfig({
        provider: fallbackProvider,
        model: fallbackModel,
        hasKey: fallbackHasKey,
        status: fallbackHasKey ? 'ready' : 'error'
      });

      // Update operations with current config
      setOperations(AI_OPERATIONS.map(op => ({
        ...op,
        provider: op.id === 'pdf_extraction' ? 'gemini' : primaryProvider,
        model: op.id === 'pdf_extraction' ? 
          (primaryProvider === 'gemini' ? primaryModel : 'gemini-2.5-flash') : 
          primaryModel,
        status: primaryHasKey ? 'ok' : 'error'
      })));

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching AI config:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar configuração de IA"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConfig();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'ok':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, label: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: 'default',
      ready: 'secondary',
      ok: 'default',
      warning: 'outline',
      error: 'destructive'
    };
    return <Badge variant={variants[status] || 'outline'}>{label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            <CardTitle>Status de Configuração de IA</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <CardDescription>
          Configuração atual do sistema de IA com atualização em tempo real
          {lastUpdate && (
            <span className="ml-2 text-xs">
              • Última atualização: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Primary and Fallback Configs */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Primary Config */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  IA Principal
                </CardTitle>
                {primaryConfig && getStatusBadge(primaryConfig.status, 
                  primaryConfig.status === 'active' ? 'ATIVO' : 'ERRO')}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {primaryConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Provider:</span>
                    <span className="font-medium">{PROVIDER_NAMES[primaryConfig.provider] || primaryConfig.provider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Modelo:</span>
                    <Badge variant="secondary">{primaryConfig.model}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">API Key:</span>
                    <span className="text-sm">
                      {primaryConfig.provider === 'lovable' ? (
                        <span className="text-muted-foreground">(não necessária)</span>
                      ) : primaryConfig.hasKey ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Configurada
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Não configurada
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Fallback Config */}
          <Card className="border-2 border-muted">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  IA Fallback
                </CardTitle>
                {fallbackConfig && getStatusBadge(fallbackConfig.status,
                  fallbackConfig.status === 'ready' ? 'PRONTO' : 'ERRO')}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {fallbackConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Provider:</span>
                    <span className="font-medium">{PROVIDER_NAMES[fallbackConfig.provider] || fallbackConfig.provider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Modelo:</span>
                    <Badge variant="secondary">{fallbackConfig.model}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">API Key:</span>
                    <span className="text-sm">
                      {fallbackConfig.provider === 'lovable' ? (
                        <span className="text-muted-foreground">(não necessária)</span>
                      ) : fallbackConfig.hasKey ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Configurada
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Não configurada
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fallback Flow */}
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="font-medium">{PROVIDER_NAMES[primaryConfig?.provider || 'lovable']}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Se falhar</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{PROVIDER_NAMES[fallbackConfig?.provider || 'lovable']}</span>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Operations Table */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Operações de IA</h3>
          </div>
          
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Operação</th>
                  <th className="text-left py-2 px-3 font-medium">Provider</th>
                  <th className="text-left py-2 px-3 font-medium">Modelo</th>
                  <th className="text-center py-2 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((op, idx) => (
                  <tr key={op.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="py-2 px-3">{op.name}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {PROVIDER_NAMES[op.provider] || op.provider}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {op.model}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {getStatusIcon(op.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cache Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <span>Cache de configuração ativo (TTL: 5 minutos)</span>
          <Badge variant="outline" className="text-xs">Edge Functions</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
