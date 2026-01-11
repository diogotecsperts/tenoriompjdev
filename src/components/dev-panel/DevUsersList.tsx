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
import { supabase } from "@/integrations/supabase/client";
import { Search, Settings, RefreshCw, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { DevUserSettings } from "./DevUserSettings";

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

export function DevUsersList() {
  const [users, setUsers] = useState<UserWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openSettings(user)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
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
    </div>
  );
}