import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, RefreshCw } from "lucide-react";

interface SystemConfig {
  default_ai_provider: string;
  default_ai_model: string;
  maintenance_mode: boolean;
  max_pdf_size_mb: number;
  allowed_ai_providers: string[];
}

const DEFAULT_CONFIG: SystemConfig = {
  default_ai_provider: "lovable",
  default_ai_model: "google/gemini-3-flash-preview",
  maintenance_mode: false,
  max_pdf_size_mb: 50,
  allowed_ai_providers: ["lovable", "openai", "gemini", "claude", "groq", "deepseek", "openrouter"],
};

const AI_PROVIDERS = [
  { id: "lovable", name: "Lovable AI" },
  { id: "openai", name: "OpenAI" },
  { id: "gemini", name: "Google Gemini" },
  { id: "claude", name: "Anthropic Claude" },
  { id: "groq", name: "Groq" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "openrouter", name: "OpenRouter" },
];

export function DevSystemConfig() {
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
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

  const saveConfig = async () => {
    setSaving(true);
    try {
      const updates = [
        { id: "default_ai_provider", value: config.default_ai_provider },
        { id: "default_ai_model", value: config.default_ai_model },
        { id: "maintenance_mode", value: config.maintenance_mode },
        { id: "max_pdf_size_mb", value: config.max_pdf_size_mb },
        { id: "allowed_ai_providers", value: config.allowed_ai_providers },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("system_config")
          .update({ value: update.value, updated_at: new Date().toISOString() })
          .eq("id", update.id);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações do Sistema</h1>
          <p className="text-muted-foreground">Configurações globais que afetam todos os usuários</p>
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* General Settings */}
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
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações de IA</CardTitle>
            <CardDescription>Padrões para novos usuários</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Provider Padrão</Label>
              <Select
                value={config.default_ai_provider}
                onValueChange={(value) =>
                  setConfig({ ...config, default_ai_provider: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modelo Padrão</Label>
              <Input
                value={config.default_ai_model}
                onChange={(e) =>
                  setConfig({ ...config, default_ai_model: e.target.value })
                }
                placeholder="google/gemini-3-flash-preview"
              />
            </div>
          </CardContent>
        </Card>

        {/* Allowed Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Providers Permitidos</CardTitle>
            <CardDescription>Quais providers de IA podem ser usados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {AI_PROVIDERS.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between">
                <Label>{provider.name}</Label>
                <Switch
                  checked={config.allowed_ai_providers.includes(provider.id)}
                  onCheckedChange={() => toggleProvider(provider.id)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
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
    </div>
  );
}
