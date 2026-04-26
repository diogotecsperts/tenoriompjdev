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
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Download,
  FileArchive,
  Loader2,
  Search,
  User as UserIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DevUserRow {
  id: string;
  nome: string;
  email: string;
  codigo: string | null;
  created_at: string | null;
  total_pdfs: number;
}

interface DevFileRow {
  job_id: string;
  file_path: string;
  file_name: string;
  status: string;
  created_at: string;
  reclamante: string | null;
  processo: string | null;
  error: string | null;
}

export function DevOriginalFiles() {
  const [users, setUsers] = useState<DevUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<DevUserRow | null>(null);
  const [files, setFiles] = useState<DevFileRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke("dev-list-pdfs");
      if (error) throw error;
      setUsers((data as any)?.users ?? []);
    } catch (e: any) {
      toast({
        title: "Erro ao carregar usuários",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadFiles = async (user: DevUserRow) => {
    setSelectedUser(user);
    setLoadingFiles(true);
    setFiles([]);
    try {
      // GET com query param para listar PDFs do usuário
      const url = `/functions/v1/dev-list-pdfs?user_id=${user.id}`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}${url}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFiles(json.files ?? []);
    } catch (e: any) {
      toast({
        title: "Erro ao carregar arquivos",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoadingFiles(false);
    }
  };

  const downloadFile = async (filePath: string, fileName: string) => {
    setDownloadingPath(filePath);
    try {
      const { data, error } = await supabase.functions.invoke(
        "dev-download-pdf",
        { body: { file_path: filePath } },
      );
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("URL não retornada");

      // Force download via blob to preserve filename
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);

      toast({ title: "Download iniciado", description: fileName });
    } catch (e: any) {
      toast({
        title: "Erro no download",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setDownloadingPath(null);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.nome?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.codigo?.toLowerCase().includes(q)
    );
  });

  // Tela 2: arquivos do usuário selecionado
  if (selectedUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedUser(null);
              setFiles([]);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{selectedUser.nome}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedUser.email} · {selectedUser.codigo} · {files.length} arquivo(s)
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              PDFs originais enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFiles ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum PDF encontrado para este usuário.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => (
                    <TableRow key={f.job_id}>
                      <TableCell className="font-mono text-xs max-w-md truncate">
                        {f.file_name}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(f.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            f.status === "completed"
                              ? "default"
                              : f.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingPath === f.file_path}
                          onClick={() => downloadFile(f.file_path, f.file_name)}
                        >
                          {downloadingPath === f.file_path ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
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

  // Tela 1: lista de usuários
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileArchive className="h-6 w-6" />
          Arquivos Originais
        </h2>
        <p className="text-sm text-muted-foreground">
          Acesso aos PDFs originais enviados por cada perito. Bucket privado, URLs expiram em 1h.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loadingUsers ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((u) => (
            <Card
              key={u.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => loadFiles(u)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {u.codigo}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">PDFs:</span>
                  <span className="font-semibold">{u.total_pdfs}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredUsers.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-8">
              Nenhum usuário encontrado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
