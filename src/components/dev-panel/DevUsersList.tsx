import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Search, Settings, RefreshCw, User, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { DevUserSettings } from "./DevUserSettings";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
  id: string;
  nome: string;
  email: string;
  crm: string | null;
  especialidade: string | null;
  user_id: string | null;
  created_at: string | null;
}

interface UserWithSettings extends UserProfile {
  ai_provider?: string;
  ai_model?: string;
  ai_requests_used?: number;
  monthly_ai_limit?: number;
  roles: string[];
}

interface UserDataCount {
  laudos: number;
  financeiro: number;
  modelos: number;
  impugnacoes: number;
}

export function DevUsersList() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithSettings | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [userDataCount, setUserDataCount] = useState<UserDataCount | null>(null);
  const [loadingDataCount, setLoadingDataCount] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, nome, email, crm, especialidade, user_id, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user settings
      const { data: settings, error: settingsError } = await supabase
        .from("user_settings")
        .select("user_id, ai_provider, ai_model, ai_requests_used, monthly_ai_limit");

      if (settingsError) {
        console.error("Error fetching settings:", settingsError);
      }

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) {
        console.error("Error fetching roles:", rolesError);
      }

      // Merge profiles with settings and roles
      const usersWithSettings = (profiles || []).map((profile) => {
        const userSettings = settings?.find((s) => s.user_id === profile.id);
        const userRoles = roles?.filter((r) => r.user_id === profile.id).map((r) => r.role) || [];
        return {
          ...profile,
          ai_provider: userSettings?.ai_provider || "lovable",
          ai_model: userSettings?.ai_model || "google/gemini-3-flash-preview",
          ai_requests_used: userSettings?.ai_requests_used || 0,
          monthly_ai_limit: userSettings?.monthly_ai_limit || 100,
          roles: userRoles,
        };
      });

      setUsers(usersWithSettings);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar usuários",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDataCount = async (userId: string) => {
    setLoadingDataCount(true);
    try {
      // Fetch counts in parallel
      const [laudosRes, financeiroRes, modelosRes, impugnacoesRes] = await Promise.all([
        supabase.from("laudos").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("financeiro").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("modelos_laudo").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("impugnacoes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);

      setUserDataCount({
        laudos: laudosRes.count || 0,
        financeiro: financeiroRes.count || 0,
        modelos: modelosRes.count || 0,
        impugnacoes: impugnacoesRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching user data count:", error);
      setUserDataCount(null);
    } finally {
      setLoadingDataCount(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.crm && user.crm.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.user_id && user.user_id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openSettings = (user: UserWithSettings) => {
    setSelectedUser(user);
    setSettingsOpen(true);
  };

  const handleSettingsSaved = () => {
    fetchUsers();
    setSettingsOpen(false);
    setSelectedUser(null);
  };

  const openDeleteDialog = (user: UserWithSettings) => {
    // Prevent self-deletion
    if (user.id === currentUser?.id) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "Você não pode excluir sua própria conta.",
      });
      return;
    }
    
    setUserToDelete(user);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
    fetchUserDataCount(user.id);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || deleteConfirmText !== "EXCLUIR") return;

    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ userId: userToDelete.id }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir usuário");
      }

      toast({
        title: "Usuário excluído",
        description: `${userToDelete.nome} foi removido permanentemente.`,
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      setDeleteConfirmText("");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Falha ao excluir usuário",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (role) {
      case "developer":
        return "destructive";
      case "admin":
        return "default";
      default:
        return "outline";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
        <Button variant="outline" size="sm" onClick={fetchUsers}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Usuários ({users.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Provider IA</TableHead>
                <TableHead>Uso IA</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{user.nome}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.user_id || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge key={role} variant={getRoleBadgeVariant(role)}>
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={user.ai_provider === "lovable" ? "default" : "secondary"}
                      >
                        {user.ai_provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.ai_requests_used} / {user.monthly_ai_limit}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSettings(user)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(user)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={user.id === currentUser?.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Configurações: {selectedUser?.nome}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <DevUserSettings
              userId={selectedUser.id}
              userName={selectedUser.nome}
              userRoles={selectedUser.roles}
              onSaved={handleSettingsSaved}
              onCancel={() => setSettingsOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Usuário
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Você está prestes a excluir permanentemente:
                </p>
                
                <div className="bg-muted p-3 rounded-lg space-y-1">
                  <p className="font-medium text-foreground">{userToDelete?.nome}</p>
                  <p className="text-sm">{userToDelete?.email}</p>
                </div>

                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
                  <p className="text-sm font-medium text-destructive mb-2">
                    Esta ação irá remover PERMANENTEMENTE:
                  </p>
                  {loadingDataCount ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando dados...
                    </div>
                  ) : userDataCount ? (
                    <ul className="text-sm space-y-1 text-foreground">
                      <li>• {userDataCount.laudos} laudo(s)</li>
                      <li>• {userDataCount.financeiro} lançamento(s) financeiro(s)</li>
                      <li>• {userDataCount.modelos} modelo(s) de laudo</li>
                      <li>• {userDataCount.impugnacoes} impugnação(ões)</li>
                      <li>• Configurações e dados pessoais</li>
                      <li>• Arquivos de storage (avatars, logos, PDFs)</li>
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Dados não disponíveis</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Digite <span className="font-mono bg-muted px-1 rounded">EXCLUIR</span> para confirmar:
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Digite EXCLUIR"
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteConfirmText !== "EXCLUIR" || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Usuário"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
