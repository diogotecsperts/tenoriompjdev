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

interface FallbackStats {
  totalJobs: number;
  fallbackCount: number;
  lastFallbackReason: string | null;
  lastFallbackDate: Date | null;
  lastOriginalProvider: string | null;
}

const PROVIDER_NAMES: Record<string, string> = {
  lovable: 'IA Integrada',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
};

const AI_OPERATIONS: AIOperation[] = [
  { id: 'pdf_extraction', name: 'Extração PDF (Vision)', provider: '', model: '', status: 'ok' },
  { id: 'pdf_fallback', name: 'Fallback PDF (Vision)', provider: '', model: '', status: 'ok' },
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
  const [fallbackStats, setFallbackStats] = useState<FallbackStats | null>(null);

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
        .in('id', [
          'default_ai_provider', 'default_ai_model', 
          'fallback_ai_provider', 'fallback_ai_model',
          'pdf_ai_provider', 'pdf_ai_model',
          'pdf_fallback_provider', 'pdf_fallback_model'
        ]);

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

      // Parse PDF-specific config
      const pdfProvider = configMap.pdf_ai_provider?.replace(/"/g, '') || 'openrouter';
      const pdfModel = configMap.pdf_ai_model?.replace(/"/g, '') || 'google/gemini-2.5-flash';
      const pdfFallbackProvider = configMap.pdf_fallback_provider?.replace(/"/g, '') || 'lovable';
      const pdfFallbackModel = configMap.pdf_fallback_model?.replace(/"/g, '') || 'google/gemini-2.5-flash';
      
      const pdfHasKey = pdfProvider === 'lovable' || savedKeys.has(pdfProvider);
      const pdfFallbackHasKey = pdfFallbackProvider === 'lovable' || savedKeys.has(pdfFallbackProvider);

      // Update operations with current config
      setOperations(AI_OPERATIONS.map(op => {
        if (op.id === 'pdf_extraction') {
          return {
            ...op,
            provider: pdfProvider,
            model: pdfModel,
            status: pdfHasKey ? 'ok' : 'error'
          };
        }
        if (op.id === 'pdf_fallback') {
          return {
            ...op,
            provider: pdfFallbackProvider,
            model: pdfFallbackModel,
            status: pdfFallbackHasKey ? 'ok' : 'error'
          };
        }
        return {
          ...op,
          provider: primaryProvider,
          model: primaryModel,
          status: primaryHasKey ? 'ok' : 'error'
        };
      }));

      // Fetch fallback statistics from recent jobs (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: jobsData } = await supabase
        .from('import_jobs')
        .select('result, created_at')
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50);

      // Calculate fallback stats
      let fallbackCount = 0;
      let lastFallbackReason: string | null = null;
      let lastFallbackDate: Date | null = null;
      let lastOriginalProvider: string | null = null;

      jobsData?.forEach(job => {
        const result = job.result as Record<string, unknown> | null;
        const aiUsage = result?.aiUsage as Record<string, unknown> | undefined;
        const pdfExtraction = aiUsage?.pdfExtraction as Record<string, unknown> | undefined;
        
        if (pdfExtraction?.usedFallback) {
          fallbackCount++;
          if (!lastFallbackReason && pdfExtraction.fallbackReason) {
            lastFallbackReason = pdfExtraction.fallbackReason as string;
            lastFallbackDate = new Date(job.created_at);
            lastOriginalProvider = pdfExtraction.originalProvider as string || null;
          }
        }
      });

      setFallbackStats({
        totalJobs: jobsData?.length || 0,
        fallbackCount,
        lastFallbackReason,
        lastFallbackDate,
        lastOriginalProvider
      });

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

        {/* Fallback Statistics */}
        {fallbackStats && (
          <Card className="bg-muted/30 border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-orange-500" />
                Estatísticas de Fallback (últimos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{fallbackStats.totalJobs}</div>
                  <div className="text-xs text-muted-foreground">Jobs Processados</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-500">{fallbackStats.fallbackCount}</div>
                  <div className="text-xs text-muted-foreground">Usaram Fallback</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {fallbackStats.totalJobs > 0 
                      ? ((fallbackStats.fallbackCount / fallbackStats.totalJobs) * 100).toFixed(1) 
                      : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground">Taxa de Fallback</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {fallbackStats.totalJobs - fallbackStats.fallbackCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Sucesso Direto</div>
                </div>
              </div>
              
              {fallbackStats.lastFallbackReason && (
                <div className="mt-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <div className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    Último Fallback:
                  </div>
                  <div className="text-sm mt-1">
                    <span className="text-muted-foreground">Motivo:</span>{' '}
                    <span className="font-medium">{fallbackStats.lastFallbackReason}</span>
                  </div>
                  {fallbackStats.lastOriginalProvider && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Provider Original:</span>{' '}
                      <span className="font-medium">{PROVIDER_NAMES[fallbackStats.lastOriginalProvider] || fallbackStats.lastOriginalProvider}</span>
                    </div>
                  )}
                  {fallbackStats.lastFallbackDate && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {fallbackStats.lastFallbackDate.toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
              )}
              
              {!fallbackStats.lastFallbackReason && fallbackStats.totalJobs > 0 && (
                <div className="text-sm text-center text-muted-foreground py-2">
                  Nenhum fallback acionado nos últimos 30 dias
                </div>
              )}
              
              {fallbackStats.totalJobs === 0 && (
                <div className="text-sm text-center text-muted-foreground py-2">
                  Nenhum job processado nos últimos 30 dias
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cache Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <span>Cache de configuração ativo (TTL: 5 minutos)</span>
          <Badge variant="outline" className="text-xs">Edge Functions</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
