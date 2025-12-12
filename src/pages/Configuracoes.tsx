import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Save, 
  User, 
  Bell, 
  FileText, 
  Settings, 
  Moon,
  Mail,
  Calendar,
  Clock,
  Download,
  Trash2,
  Shield,
  Loader2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Configuracoes() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("perfil");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    crm: "",
    especialidade: "",
    telefone: "",
    endereco: "",
  });

  // Notification preferences (local state - future feature)
  const [notifications, setNotifications] = useState({
    emailLaudoConcluido: true,
    emailPrazos: true,
    emailAtualizacoes: false,
    pushLembretes: true,
    pushPrazos: true,
  });

  // Preferences (local state - future feature)
  const [preferences, setPreferences] = useState({
    autoSave: true,
    autoSaveInterval: "5",
    defaultExportFormat: "pdf",
    showTips: true,
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
      // Load avatar URL from profile
      if ((profile as any).avatar_url) {
        setAvatarUrl((profile as any).avatar_url);
      }
    }
  }, [profile]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validations
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast({ 
        variant: "destructive", 
        title: "Tipo de arquivo inválido", 
        description: "Use arquivos JPG, PNG ou GIF" 
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ 
        variant: "destructive", 
        title: "Arquivo muito grande", 
        description: "O tamanho máximo é 2MB" 
      });
      return;
    }

    setUploadingAvatar(true);
    
    try {
      // Get file extension
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newAvatarUrl = `${data.publicUrl}?t=${Date.now()}`; // Cache bust

      // Update in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(newAvatarUrl);
      toast({ 
        title: "Foto atualizada!", 
        description: "Sua foto de perfil foi alterada com sucesso." 
      });
    } catch (error: any) {
      console.error("Erro no upload:", error);
      toast({ 
        variant: "destructive", 
        title: "Erro no upload", 
        description: error.message 
      });
    } finally {
      setUploadingAvatar(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    if (!user) return;

    setUploadingAvatar(true);

    try {
      // List and remove files from user folder
      const { data: files } = await supabase.storage.from('avatars').list(user.id);
      if (files?.length) {
        await supabase.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
      }

      // Clear URL in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(null);
      toast({ 
        title: "Foto removida", 
        description: "Sua foto de perfil foi removida." 
      });
    } catch (error: any) {
      console.error("Erro ao remover:", error);
      toast({ 
        variant: "destructive", 
        title: "Erro ao remover", 
        description: error.message 
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

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
        title: "Configurações salvas",
        description: "Suas alterações foram aplicadas com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao atualizar configurações:", error);
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

  const tabs = [
    { id: "perfil", label: "Perfil", icon: User },
    { id: "notificacoes", label: "Notificações", icon: Bell },
    { id: "preferencias", label: "Preferências", icon: FileText },
    { id: "geral", label: "Geral", icon: Settings },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas informações pessoais e preferências do sistema
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:w-56 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          {/* Perfil Tab */}
          {activeTab === "perfil" && (
            <>
              {/* Avatar Section */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Foto de Perfil</CardTitle>
                  <CardDescription>
                    Sua foto será exibida no menu lateral e em relatórios
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <Avatar className="h-24 w-24">
                      {avatarUrl && (
                        <AvatarImage 
                          src={avatarUrl} 
                          alt="Avatar" 
                          className="object-cover" 
                        />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {/* Hidden file input */}
                        <input
                          type="file"
                          id="avatar-upload"
                          accept="image/jpeg,image/png,image/gif"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={uploadingAvatar}
                          onClick={() => document.getElementById('avatar-upload')?.click()}
                        >
                          {uploadingAvatar ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Enviando...
                            </>
                          ) : avatarUrl ? "Alterar foto" : "Adicionar foto"}
                        </Button>
                        {avatarUrl && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={uploadingAvatar}
                            onClick={handleAvatarRemove}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG ou GIF. Máximo 2MB.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Profile Form */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Informações Profissionais</CardTitle>
                  <CardDescription>
                    Estes dados serão usados automaticamente ao criar novos laudos
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
                      <Label htmlFor="especialidade">Especialidade</Label>
                      <Input
                        id="especialidade"
                        value={formData.especialidade}
                        onChange={(e) => setFormData({ ...formData, especialidade: e.target.value })}
                        placeholder="Ex: Ortopedia e Traumatologia"
                      />
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
                        O e-mail de login não pode ser alterado
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endereco">Endereço do Consultório</Label>
                      <Input
                        id="endereco"
                        value={formData.endereco}
                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                        placeholder="Rua, número, cidade - UF"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Security Section */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Segurança
                  </CardTitle>
                  <CardDescription>
                    Gerencie sua senha e configurações de acesso
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
                      <Label>Confirmar</Label>
                      <Input type="password" disabled placeholder="••••••••" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Funcionalidade de alteração de senha em desenvolvimento
                  </p>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </>
          )}

          {/* Notificações Tab */}
          {activeTab === "notificacoes" && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Preferências de Notificação</CardTitle>
                <CardDescription>
                  Escolha como e quando deseja receber notificações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Notificações por E-mail
                  </div>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Laudo concluído</Label>
                        <p className="text-xs text-muted-foreground">
                          Receba confirmação quando um laudo for finalizado
                        </p>
                      </div>
                      <Switch 
                        checked={notifications.emailLaudoConcluido}
                        onCheckedChange={(checked) => setNotifications({...notifications, emailLaudoConcluido: checked})}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Lembretes de prazo</Label>
                        <p className="text-xs text-muted-foreground">
                          Aviso quando um prazo estiver próximo
                        </p>
                      </div>
                      <Switch 
                        checked={notifications.emailPrazos}
                        onCheckedChange={(checked) => setNotifications({...notifications, emailPrazos: checked})}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Atualizações do sistema</Label>
                        <p className="text-xs text-muted-foreground">
                          Novidades e melhorias no sistema
                        </p>
                      </div>
                      <Switch 
                        checked={notifications.emailAtualizacoes}
                        onCheckedChange={(checked) => setNotifications({...notifications, emailAtualizacoes: checked})}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Push Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    Notificações no Navegador
                  </div>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Lembretes de perícia</Label>
                        <p className="text-xs text-muted-foreground">
                          Lembrete antes de cada perícia agendada
                        </p>
                      </div>
                      <Switch 
                        checked={notifications.pushLembretes}
                        onCheckedChange={(checked) => setNotifications({...notifications, pushLembretes: checked})}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Alertas de prazo</Label>
                        <p className="text-xs text-muted-foreground">
                          Notificação quando um prazo está vencendo
                        </p>
                      </div>
                      <Switch 
                        checked={notifications.pushPrazos}
                        onCheckedChange={(checked) => setNotifications({...notifications, pushPrazos: checked})}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center pt-4">
                  As preferências de notificação serão salvas automaticamente
                </p>
              </CardContent>
            </Card>
          )}

          {/* Preferências Tab */}
          {activeTab === "preferencias" && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Preferências do Laudo</CardTitle>
                <CardDescription>
                  Configure o comportamento padrão ao trabalhar com laudos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Auto Save */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Salvamento Automático
                  </div>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Ativar salvamento automático</Label>
                        <p className="text-xs text-muted-foreground">
                          Salva o laudo automaticamente enquanto você edita
                        </p>
                      </div>
                      <Switch 
                        checked={preferences.autoSave}
                        onCheckedChange={(checked) => setPreferences({...preferences, autoSave: checked})}
                      />
                    </div>
                    {preferences.autoSave && (
                      <div className="flex items-center justify-between">
                        <Label>Intervalo de salvamento</Label>
                        <Select 
                          value={preferences.autoSaveInterval}
                          onValueChange={(value) => setPreferences({...preferences, autoSaveInterval: value})}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 minuto</SelectItem>
                            <SelectItem value="5">5 minutos</SelectItem>
                            <SelectItem value="10">10 minutos</SelectItem>
                            <SelectItem value="15">15 minutos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Export */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Download className="h-4 w-4" />
                    Exportação
                  </div>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Formato padrão de exportação</Label>
                        <p className="text-xs text-muted-foreground">
                          Formato usado ao gerar documento
                        </p>
                      </div>
                      <Select 
                        value={preferences.defaultExportFormat}
                        onValueChange={(value) => setPreferences({...preferences, defaultExportFormat: value})}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="docx">Word</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Tips */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Interface
                  </div>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Mostrar dicas de preenchimento</Label>
                        <p className="text-xs text-muted-foreground">
                          Exibe sugestões e exemplos nos campos
                        </p>
                      </div>
                      <Switch 
                        checked={preferences.showTips}
                        onCheckedChange={(checked) => setPreferences({...preferences, showTips: checked})}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Geral Tab */}
          {activeTab === "geral" && (
            <>
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Aparência</CardTitle>
                  <CardDescription>
                    Personalize a aparência do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Moon className="h-5 w-5 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <Label>Tema</Label>
                        <p className="text-xs text-muted-foreground">
                          Alterne entre tema claro e escuro
                        </p>
                      </div>
                    </div>
                    <ThemeToggle />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Dados</CardTitle>
                  <CardDescription>
                    Gerencie seus dados e exportações
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Exportar todos os laudos</Label>
                      <p className="text-xs text-muted-foreground">
                        Baixe uma cópia de todos os seus laudos em ZIP
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar
                    </Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-destructive">Excluir conta</Label>
                      <p className="text-xs text-muted-foreground">
                        Remove permanentemente sua conta e todos os dados
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" disabled>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Sobre</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><span className="font-medium text-foreground">Tenório MPJ</span> - Sistema de Laudos Periciais</p>
                  <p>Versão 1.0.0</p>
                  <p className="pt-2">
                    Desenvolvido por{" "}
                    <a 
                      href="https://tecsperts.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Tecsperts
                    </a>
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
