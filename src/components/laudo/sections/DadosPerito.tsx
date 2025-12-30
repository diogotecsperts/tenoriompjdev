import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLaudo } from "@/contexts/LaudoContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

export function DadosPerito() {
  const { currentLaudo, updateLaudo } = useLaudo();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const handleChange = (field: string, value: string) => {
    updateLaudo({ [field]: value });
  };

  const handleSyncFromProfile = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, crm, especialidade, email, telefone, endereco")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        updateLaudo({
          peritoNome: data.nome || "",
          peritoCRM: data.crm || "",
          peritoEspecialidade: data.especialidade || "",
          peritoEmail: data.email || "",
          peritoTelefone: data.telefone || "",
          peritoEndereco: data.endereco || "",
        });
        toast({
          title: "Dados sincronizados",
          description: "Os dados do perito foram atualizados com seu perfil.",
        });
      }
    } catch (error) {
      console.error("Erro ao sincronizar perfil:", error);
      toast({
        variant: "destructive",
        title: "Erro ao sincronizar",
        description: "Não foi possível buscar os dados do perfil.",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Dados do perito responsável pelo laudo
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncFromProfile}
          disabled={syncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          Sincronizar com Perfil
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="peritoNome">Nome do Perito</Label>
          <Input
            id="peritoNome"
            value={currentLaudo?.peritoNome || ""}
            onChange={(e) => handleChange("peritoNome", e.target.value)}
            placeholder="Dr. João Silva"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="peritoCRM">CRM</Label>
          <Input
            id="peritoCRM"
            value={currentLaudo?.peritoCRM || ""}
            onChange={(e) => handleChange("peritoCRM", e.target.value)}
            placeholder="12345/SP"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="peritoEspecialidade">Especialidade</Label>
          <Input
            id="peritoEspecialidade"
            value={currentLaudo?.peritoEspecialidade || ""}
            onChange={(e) => handleChange("peritoEspecialidade", e.target.value)}
            placeholder="Medicina do Trabalho"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="peritoEmail">E-mail</Label>
          <Input
            id="peritoEmail"
            type="email"
            value={currentLaudo?.peritoEmail || ""}
            onChange={(e) => handleChange("peritoEmail", e.target.value)}
            placeholder="perito@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="peritoTelefone">Telefone</Label>
          <Input
            id="peritoTelefone"
            value={currentLaudo?.peritoTelefone || ""}
            onChange={(e) => handleChange("peritoTelefone", e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="peritoEndereco">Endereço</Label>
          <Input
            id="peritoEndereco"
            value={currentLaudo?.peritoEndereco || ""}
            onChange={(e) => handleChange("peritoEndereco", e.target.value)}
            placeholder="Rua Exemplo, 123 - Centro - São Paulo/SP"
          />
        </div>
      </div>
    </div>
  );
}
