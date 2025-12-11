import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Profile() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    crm: "",
    especialidade: "",
    telefone: "",
    endereco: "",
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        nome: profile.nome || "",
        email: profile.email || "",
        crm: profile.crm || "",
        especialidade: profile.especialidade || "",
        telefone: profile.telefone || "",
        endereco: profile.endereco || "",
      });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          nome: formData.nome,
          crm: formData.crm,
          especialidade: formData.especialidade,
          telefone: formData.telefone,
          endereco: formData.endereco,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram salvas com sucesso.",
      });

      window.location.reload();
    } catch (error: any) {
      console.error("Erro ao atualizar perfil:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const userInitials = formData.nome
    ? formData.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas informações e preferências
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tabs Navigation */}
        <Tabs defaultValue="perfil" className="flex-1">
          <div className="flex flex-col lg:flex-row gap-6">
            <TabsList className="flex lg:flex-col h-auto lg:w-48 bg-card p-1 lg:p-2 rounded-xl border border-border">
              <TabsTrigger 
                value="perfil" 
                className="flex-1 lg:w-full justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <User className="h-4 w-4" />
                Perfil do Usuário
              </TabsTrigger>
              <TabsTrigger 
                value="notificacoes" 
                className="flex-1 lg:w-full justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                disabled
              >
                Notificações
              </TabsTrigger>
              <TabsTrigger 
                value="preferencias" 
                className="flex-1 lg:w-full justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                disabled
              >
                Preferências do Laudo
              </TabsTrigger>
              <TabsTrigger 
                value="geral" 
                className="flex-1 lg:w-full justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                disabled
              >
                Geral
              </TabsTrigger>
            </TabsList>

            <div className="flex-1">
              <TabsContent value="perfil" className="mt-0 space-y-6">
                {/* Avatar Section */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Foto de Perfil</CardTitle>
                    <CardDescription>
                      Sua foto será exibida no menu lateral
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-20 w-20">
                        <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" disabled>
                          Alterar foto
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Em breve
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Profile Form */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Informações Profissionais</CardTitle>
                    <CardDescription>
                      Estas informações serão usadas automaticamente ao criar novos laudos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nome">Nome Completo *</Label>
                        <Input
                          id="nome"
                          value={formData.nome}
                          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                          placeholder="Dr. Nome do Perito"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="crm">CRM</Label>
                        <Input
                          id="crm"
                          value={formData.crm}
                          onChange={(e) => setFormData({ ...formData, crm: e.target.value })}
                          placeholder="123456/UF"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail Profissional</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">
                          O e-mail não pode ser alterado
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefone">Telefone</Label>
                        <Input
                          id="telefone"
                          value={formData.telefone}
                          onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="especialidade">Especialidade</Label>
                      <Input
                        id="especialidade"
                        value={formData.especialidade}
                        onChange={(e) => setFormData({ ...formData, especialidade: e.target.value })}
                        placeholder="Ex: Ortopedia"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="endereco">Endereço Completo</Label>
                      <Input
                        id="endereco"
                        value={formData.endereco}
                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                        placeholder="Rua, número, complemento, cidade - UF"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Security Section */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Segurança</CardTitle>
                    <CardDescription>
                      Gerencie sua senha de acesso
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Senha Atual</Label>
                        <Input type="password" disabled placeholder="••••••••" />
                      </div>
                      <div className="space-y-2">
                        <Label>Nova Senha</Label>
                        <Input type="password" disabled placeholder="••••••••" />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirmar Nova Senha</Label>
                        <Input type="password" disabled placeholder="••••••••" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Alteração de senha em breve
                    </p>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="notificacoes">
                <Card className="shadow-sm">
                  <CardContent className="py-16 text-center">
                    <p className="text-muted-foreground">Em breve</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="preferencias">
                <Card className="shadow-sm">
                  <CardContent className="py-16 text-center">
                    <p className="text-muted-foreground">Em breve</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="geral">
                <Card className="shadow-sm">
                  <CardContent className="py-16 text-center">
                    <p className="text-muted-foreground">Em breve</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
