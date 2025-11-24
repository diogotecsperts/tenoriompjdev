import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Users, FileText, ArrowLeft, Trash2, Edit, Search } from "lucide-react";

interface UserData {
  id: string;
  nome: string;
  email: string;
  crm: string | null;
  especialidade: string | null;
  telefone: string | null;
  endereco: string | null;
  created_at: string;
}

interface UserStats {
  userId: string;
  totalLaudos: number;
  lastLaudoCreated: string | null;
}

interface LaudoData {
  id: string;
  title: string;
  vitima_nome: string;
  created_at: string;
  updated_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [userStats, setUserStats] = useState<Map<string, UserStats>>(new Map());
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [userLaudos, setUserLaudos] = useState<LaudoData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [totalStats, setTotalStats] = useState({ totalUsers: 0, totalLaudos: 0 });

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
      toast.error("Acesso negado");
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchGlobalStats()]);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
      return;
    }

    if (data) {
      setUsers(data);
      
      // Fetch stats for each user
      const statsMap = new Map<string, UserStats>();
      for (const user of data) {
        const { data: laudosData } = await supabase
          .from("laudos")
          .select("id, created_at")
          .eq("user_id", user.id);

        if (laudosData) {
          const lastLaudo = laudosData.length > 0 
            ? laudosData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
            : null;

          statsMap.set(user.id, {
            userId: user.id,
            totalLaudos: laudosData.length,
            lastLaudoCreated: lastLaudo,
          });
        }
      }
      setUserStats(statsMap);
    }
  };

  const fetchGlobalStats = async () => {
    const { count: usersCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    const { count: laudosCount } = await supabase
      .from("laudos")
      .select("*", { count: "exact", head: true });

    setTotalStats({
      totalUsers: usersCount || 0,
      totalLaudos: laudosCount || 0,
    });
  };

  const fetchUserLaudos = async (userId: string) => {
    const { data, error } = await supabase
      .from("laudos")
      .select("id, title, vitima_nome, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user laudos:", error);
      toast.error("Erro ao carregar laudos do usuário");
      return;
    }

    setUserLaudos(data || []);
  };

  const handleViewUser = async (user: UserData) => {
    setSelectedUser(user);
    await fetchUserLaudos(user.id);
  };

  const handleEditUser = (user: UserData) => {
    setEditingUser({ ...user });
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        nome: editingUser.nome,
        crm: editingUser.crm,
        especialidade: editingUser.especialidade,
        telefone: editingUser.telefone,
        endereco: editingUser.endereco,
      })
      .eq("id", editingUser.id);

    if (error) {
      console.error("Error updating user:", error);
      toast.error("Erro ao atualizar usuário");
      return;
    }

    toast.success("Usuário atualizado com sucesso");
    setEditingUser(null);
    await fetchUsers();
    
    if (selectedUser?.id === editingUser.id) {
      setSelectedUser(editingUser);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      console.error("Error deleting user:", error);
      toast.error("Erro ao deletar usuário");
      return;
    }

    toast.success(`Usuário ${userName} deletado com sucesso`);
    await fetchAllData();
    
    if (selectedUser?.id === userId) {
      setSelectedUser(null);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.crm?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="h-12 w-12 animate-pulse mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando painel administrativo...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Painel Administrativo</h1>
              <p className="text-sm text-muted-foreground">Gerenciamento completo do sistema</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Dashboard
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Laudos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.totalLaudos}</div>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Média de Laudos/Usuário</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalStats.totalUsers > 0
                  ? (totalStats.totalLaudos / totalStats.totalUsers).toFixed(1)
                  : "0"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2">
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="details" disabled={!selectedUser}>
              Detalhes do Usuário
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Usuários</CardTitle>
                <CardDescription>
                  Visualize, edite e gerencie todos os usuários do sistema
                </CardDescription>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por nome, email ou CRM..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="hidden sm:table-cell">Email</TableHead>
                        <TableHead className="hidden md:table-cell">CRM</TableHead>
                        <TableHead className="hidden lg:table-cell">Especialidade</TableHead>
                        <TableHead className="text-center">Laudos</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const stats = userStats.get(user.id);
                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.nome}</TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {user.email}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {user.crm || "-"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {user.especialidade || "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{stats?.totalLaudos || 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewUser(user)}
                                  title="Ver detalhes"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditUser(user)}
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Deletar"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tem certeza que deseja deletar o usuário{" "}
                                        <strong>{user.nome}</strong>? Esta ação não pode ser
                                        desfeita e todos os laudos do usuário também serão
                                        deletados.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteUser(user.id, user.nome)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Deletar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            {selectedUser && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Dados do Usuário</CardTitle>
                    <CardDescription>
                      Informações detalhadas de {selectedUser.nome}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Nome</Label>
                        <p className="font-medium">{selectedUser.nome}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <p className="font-medium">{selectedUser.email}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">CRM</Label>
                        <p className="font-medium">{selectedUser.crm || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Especialidade</Label>
                        <p className="font-medium">{selectedUser.especialidade || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Telefone</Label>
                        <p className="font-medium">{selectedUser.telefone || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Total de Laudos
                        </Label>
                        <p className="font-medium">
                          {userStats.get(selectedUser.id)?.totalLaudos || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Laudos do Usuário</CardTitle>
                    <CardDescription>
                      Todos os laudos criados por {selectedUser.nome}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Título</TableHead>
                            <TableHead className="hidden sm:table-cell">Vítima</TableHead>
                            <TableHead className="hidden md:table-cell">Criado em</TableHead>
                            <TableHead className="hidden lg:table-cell">
                              Atualizado em
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userLaudos.map((laudo) => (
                            <TableRow key={laudo.id}>
                              <TableCell className="font-medium">{laudo.title}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                {laudo.vitima_nome || "-"}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                {new Date(laudo.created_at).toLocaleDateString("pt-BR")}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                {new Date(laudo.updated_at).toLocaleDateString("pt-BR")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {userLaudos.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        Nenhum laudo encontrado para este usuário
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        {editingUser && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Editar Usuário</CardTitle>
                <CardDescription>
                  Edite as informações de {editingUser.nome}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nome">Nome Completo</Label>
                  <Input
                    id="edit-nome"
                    value={editingUser.nome}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, nome: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-crm">CRM</Label>
                  <Input
                    id="edit-crm"
                    value={editingUser.crm || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, crm: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-especialidade">Especialidade</Label>
                  <Input
                    id="edit-especialidade"
                    value={editingUser.especialidade || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, especialidade: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-telefone">Telefone</Label>
                  <Input
                    id="edit-telefone"
                    value={editingUser.telefone || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, telefone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-endereco">Endereço</Label>
                  <Input
                    id="edit-endereco"
                    value={editingUser.endereco || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, endereco: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <Button onClick={handleSaveUser} className="w-full sm:w-auto">
                    Salvar Alterações
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditingUser(null)}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
