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
          perito_nome: data.nome || "",
          perito_crm: data.crm || "",
          perito_especialidade: data.especialidade || "",
          perito_email: data.email || "",
          perito_telefone: data.telefone || "",
          perito_endereco: data.endereco || "",
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
          <Label htmlFor="perito_nome">Nome do Perito</Label>
          <Input
            id="perito_nome"
            value={currentLaudo?.perito_nome || ""}
            onChange={(e) => handleChange("perito_nome", e.target.value)}
            placeholder="Dr. João Silva"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="perito_crm">CRM</Label>
          <Input
            id="perito_crm"
            value={currentLaudo?.perito_crm || ""}
            onChange={(e) => handleChange("perito_crm", e.target.value)}
            placeholder="12345/SP"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="perito_especialidade">Especialidade</Label>
          <Input
            id="perito_especialidade"
            value={currentLaudo?.perito_especialidade || ""}
            onChange={(e) => handleChange("perito_especialidade", e.target.value)}
            placeholder="Medicina do Trabalho"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="perito_email">E-mail</Label>
          <Input
            id="perito_email"
            type="email"
            value={currentLaudo?.perito_email || ""}
            onChange={(e) => handleChange("perito_email", e.target.value)}
            placeholder="perito@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="perito_telefone">Telefone</Label>
          <Input
            id="perito_telefone"
            value={currentLaudo?.perito_telefone || ""}
            onChange={(e) => handleChange("perito_telefone", e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="perito_endereco">Endereço</Label>
          <Input
            id="perito_endereco"
            value={currentLaudo?.perito_endereco || ""}
            onChange={(e) => handleChange("perito_endereco", e.target.value)}
            placeholder="Rua Exemplo, 123 - Centro - São Paulo/SP"
          />
        </div>
      </div>
    </div>
  );
}
