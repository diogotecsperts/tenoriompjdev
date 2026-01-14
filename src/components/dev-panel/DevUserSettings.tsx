import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";

interface DevUserSettingsProps {
  userId: string;
  userName: string;
  userRoles: string[];
  onSaved: () => void;
  onCancel: () => void;
}

interface UserSettings {
  ai_provider: string;
  ai_model: string;
  ai_temperature: number;
  ai_max_tokens: number;
  monthly_ai_limit: number;
  ai_requests_used: number;
  custom_api_key: string | null;
  features_enabled: {
    importar_autos: boolean;
    gerar_resumos: boolean;
    assistente_ia: boolean;
  };
}

interface RolesState {
  user: boolean;
  admin: boolean;
  developer: boolean;
}

const AI_PROVIDERS = [
  { id: "lovable", name: "IA Integrada", requiresKey: false },
  { id: "openai", name: "OpenAI", requiresKey: true },
  { id: "gemini", name: "Google Gemini", requiresKey: true },
  { id: "claude", name: "Anthropic Claude", requiresKey: true },
  { id: "groq", name: "Groq", requiresKey: true },
  { id: "deepseek", name: "DeepSeek", requiresKey: true },
  { id: "openrouter", name: "OpenRouter", requiresKey: true },
];

const AI_MODELS: Record<string, { id: string; name: string }[]> = {
  lovable: [
    { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "openai/gpt-5", name: "GPT-5" },
    { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o1", name: "o1" },
    { id: "o1-mini", name: "o1 Mini" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ],
  claude: [
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek-coder", name: "DeepSeek Coder" },
  ],
  openrouter: [
    { id: "openai/gpt-4o", name: "GPT-4o (via OpenRouter)" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (via OpenRouter)" },
    { id: "google/gemini-pro", name: "Gemini Pro (via OpenRouter)" },
  ],
};

const DEFAULT_SETTINGS: UserSettings = {
  ai_provider: "lovable",
  ai_model: "google/gemini-3-flash-preview",
  ai_temperature: 0.7,
  ai_max_tokens: 4096,
  monthly_ai_limit: 100,
  ai_requests_used: 0,
  custom_api_key: null,
  features_enabled: {
    importar_autos: true,
    gerar_resumos: true,
    assistente_ia: true,
  },
};

export function DevUserSettings({
  userId,
  userName,
  userRoles,
  onSaved,
  onCancel,
}: DevUserSettingsProps) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [roles, setRoles] = useState<RolesState>({
    user: userRoles.includes("user"),
    admin: userRoles.includes("admin"),
    developer: userRoles.includes("developer"),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [userId]);

  useEffect(() => {
    setRoles({
      user: userRoles.includes("user"),
      admin: userRoles.includes("admin"),
      developer: userRoles.includes("developer"),
    });
  }, [userRoles]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setSettings({
          ai_provider: data.ai_provider || "lovable",
          ai_model: data.ai_model || "google/gemini-3-flash-preview",
          ai_temperature: Number(data.ai_temperature) || 0.7,
          ai_max_tokens: data.ai_max_tokens || 4096,
          monthly_ai_limit: data.monthly_ai_limit || 100,
          ai_requests_used: data.ai_requests_used || 0,
          custom_api_key: data.custom_api_key,
          features_enabled: (data.features_enabled as UserSettings["features_enabled"]) || DEFAULT_SETTINGS.features_enabled,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar configurações",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (role: "user" | "admin" | "developer", checked: boolean) => {
    try {
      if (checked) {
        // Add role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });
        
        if (error) {
          if (error.code === "23505") {
            // Duplicate, already exists
            toast({
              title: "Info",
              description: `Usuário já possui a role ${role}`,
            });
          } else {
            throw error;
          }
        } else {
          setRoles({ ...roles, [role]: true });
          toast({
            title: "Sucesso",
            description: `Role ${role} adicionada`,
          });
        }
      } else {
        // Remove role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);

        if (error) throw error;

        setRoles({ ...roles, [role]: false });
        toast({
          title: "Sucesso",
          description: `Role ${role} removida`,
        });
      }
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao atualizar role",
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: userId,
          ai_provider: settings.ai_provider,
          ai_model: settings.ai_model,
          ai_temperature: settings.ai_temperature,
          ai_max_tokens: settings.ai_max_tokens,
          monthly_ai_limit: settings.monthly_ai_limit,
          ai_requests_used: settings.ai_requests_used,
          custom_api_key: settings.custom_api_key,
          features_enabled: settings.features_enabled,
        }, { onConflict: "user_id" });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso",
      });
      onSaved();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar configurações",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const models = AI_MODELS[provider] || [];
    setSettings({
      ...settings,
      ai_provider: provider,
      ai_model: models[0]?.id || "",
      custom_api_key: provider === "lovable" ? null : settings.custom_api_key,
    });
  };

  const resetQuota = async () => {
    setSettings({ ...settings, ai_requests_used: 0 });
  };

  const selectedProvider = AI_PROVIDERS.find((p) => p.id === settings.ai_provider);
  const availableModels = AI_MODELS[settings.ai_provider] || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Roles Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Roles do Usuário</h3>
        </div>
        
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center space-x-2 p-3 rounded-lg border border-border">
            <Checkbox
              id="role-user"
              checked={roles.user}
              onCheckedChange={(checked) => handleRoleChange("user", checked as boolean)}
            />
            <Label htmlFor="role-user" className="flex-1 cursor-pointer">
              <div className="font-medium">User</div>
              <div className="text-xs text-muted-foreground">Acesso básico</div>
            </Label>
          </div>

          <div className="flex items-center space-x-2 p-3 rounded-lg border border-border bg-primary/5">
            <Checkbox
              id="role-admin"
              checked={roles.admin}
              onCheckedChange={(checked) => handleRoleChange("admin", checked as boolean)}
            />
            <Label htmlFor="role-admin" className="flex-1 cursor-pointer">
              <div className="font-medium">Admin</div>
              <div className="text-xs text-muted-foreground">Gerenciar usuários</div>
            </Label>
          </div>

          <div className="flex items-center space-x-2 p-3 rounded-lg border border-destructive/50 bg-destructive/5">
            <Checkbox
              id="role-developer"
              checked={roles.developer}
              onCheckedChange={(checked) => handleRoleChange("developer", checked as boolean)}
            />
            <Label htmlFor="role-developer" className="flex-1 cursor-pointer">
              <div className="font-medium">Developer</div>
              <div className="text-xs text-muted-foreground">Acesso total</div>
            </Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* AI Provider */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Configurações de IA</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider de IA</Label>
            <Select
              value={settings.ai_provider}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                    {provider.requiresKey && " (requer API key)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select
              value={settings.ai_model}
              onValueChange={(model) => setSettings({ ...settings, ai_model: model })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom API Key */}
        {selectedProvider?.requiresKey && (
          <div className="space-y-2">
            <Label>API Key Customizada</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={settings.custom_api_key || ""}
              onChange={(e) =>
                setSettings({ ...settings, custom_api_key: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground">
              Deixe vazio para usar a chave global (se configurada)
            </p>
          </div>
        )}

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Temperature</Label>
            <span className="text-sm text-muted-foreground">
              {settings.ai_temperature.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[settings.ai_temperature]}
            onValueChange={([value]) =>
              setSettings({ ...settings, ai_temperature: value })
            }
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <Label>Max Tokens</Label>
          <Input
            type="number"
            value={settings.ai_max_tokens}
            onChange={(e) =>
              setSettings({ ...settings, ai_max_tokens: parseInt(e.target.value) || 4096 })
            }
            min={100}
            max={128000}
          />
        </div>
      </div>

      <Separator />

      {/* Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Limites e Cotas</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Limite Mensal de Requisições</Label>
            <Input
              type="number"
              value={settings.monthly_ai_limit}
              onChange={(e) =>
                setSettings({ ...settings, monthly_ai_limit: parseInt(e.target.value) || 100 })
              }
              min={0}
            />
          </div>

          <div className="space-y-2">
            <Label>Requisições Usadas</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={settings.ai_requests_used}
                onChange={(e) =>
                  setSettings({ ...settings, ai_requests_used: parseInt(e.target.value) || 0 })
                }
                min={0}
              />
              <Button variant="outline" onClick={resetQuota}>
                Zerar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Features */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Funcionalidades</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Importar Autos</Label>
              <p className="text-sm text-muted-foreground">
                Permite importar documentos de processos
              </p>
            </div>
            <Switch
              checked={settings.features_enabled.importar_autos}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features_enabled: { ...settings.features_enabled, importar_autos: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Gerar Resumos</Label>
              <p className="text-sm text-muted-foreground">
                Permite gerar resumos com IA
              </p>
            </div>
            <Switch
              checked={settings.features_enabled.gerar_resumos}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features_enabled: { ...settings.features_enabled, gerar_resumos: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Assistente IA</Label>
              <p className="text-sm text-muted-foreground">
                Acesso ao assistente de IA
              </p>
            </div>
            <Switch
              checked={settings.features_enabled.assistente_ia}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  features_enabled: { ...settings.features_enabled, assistente_ia: checked },
                })
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}