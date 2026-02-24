import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RefreshCw, Users, LogIn, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Profile {
  id: string;
  nome: string;
  email: string;
  user_id: string | null;
}

interface PresenceRow {
  user_id: string;
  last_seen_at: string;
  is_online: boolean;
}

interface AccessLog {
  id: string;
  user_id: string;
  event_type: string;
  metadata: any;
  created_at: string;
}

interface LaudoRow {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
  status: string;
}

export function DevAccessHistory() {
  const [filter, setFilter] = useState<string>("all");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [laudos, setLaudos] = useState<LaudoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, presenceRes, logsRes, laudosRes] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, user_id"),
      (supabase.from("user_presence") as any).select("*"),
      (supabase.from("access_logs") as any).select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("laudos").select("id, title, user_id, created_at, status").neq("status", "rascunho").order("created_at", { ascending: false }).limit(50),
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    if (presenceRes.data) setPresence(presenceRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    if (laudosRes.data) setLaudos(laudosRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getProfileName = (userId: string) => profiles.find((p) => p.id === userId)?.nome ?? "Desconhecido";
  const getProfileUserId = (userId: string) => profiles.find((p) => p.id === userId)?.user_id ?? "";

  const isOnline = (userId: string) => {
    const p = presence.find((pr) => pr.user_id === userId);
    if (!p || !p.is_online) return false;
    const diff = Date.now() - new Date(p.last_seen_at).getTime();
    return diff < 2 * 60 * 1000; // 2 min
  };

  // Check who is dev by looking at user_id pattern or profiles
  const devProfiles = profiles.filter((p) => {
    // Dev check: query user_roles would need RPC. Use simple heuristic: check if user has developer role via presence of all data
    // For simplicity, filter by known dev profile (the one viewing this page)
    return false; // Will be filtered by the select
  });

  const filteredProfiles = profiles.filter((p) => {
    if (filter === "all") return true;
    if (filter === "dev") return p.email === "diogomixcds@gmail.com";
    if (filter === "users") return p.email !== "diogomixcds@gmail.com";
    return true;
  });

  const filteredUserIds = new Set(filteredProfiles.map((p) => p.id));
  const filteredLogs = logs.filter((l) => filteredUserIds.has(l.user_id));
  const filteredLaudos = laudos.filter((l) => filteredUserIds.has(l.user_id));

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Acesso</h1>
          <p className="text-sm text-muted-foreground">Monitore logins, presença e laudos finalizados</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="dev">Dev (Diogo)</SelectItem>
              <SelectItem value="users">Usuários</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Presence Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProfiles.map((p) => {
          const online = isOnline(p.id);
          const presenceData = presence.find((pr) => pr.user_id === p.id);
          return (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {initials(p.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${
                      online ? "bg-green-500" : "bg-destructive"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{p.user_id || p.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={online ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {online ? "Online" : "Offline"}
                    </Badge>
                    {presenceData && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(presenceData.last_seen_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Login History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LogIn className="h-5 w-5" />
            Logins Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum login registrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Data/Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{getProfileName(log.user_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {log.metadata?.method === "email" ? "Email" : "ID"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Laudos Finalizados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Laudos Finalizados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLaudos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum laudo finalizado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLaudos.map((laudo) => (
                  <TableRow key={laudo.id}>
                    <TableCell className="font-medium">{laudo.title}</TableCell>
                    <TableCell>{getProfileName(laudo.user_id)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{laudo.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(laudo.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
