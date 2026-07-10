import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { Search, Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  BlockConfigPopover,
  type BlockMode,
} from "./usage/BlockConfigPopover";

type AppModule = "trabalhista" | "previdenciario";
const ALL_MODULES: AppModule[] = ["trabalhista", "previdenciario"];

interface ModuleState {
  enabled: boolean;
  block_mode: BlockMode;
  block_message: string;
}

interface UserRow {
  id: string;
  nome: string;
  email: string;
  user_id: string | null;
  modules: Record<AppModule, ModuleState>;
}

const defaultModuleState = (): ModuleState => ({
  enabled: false,
  block_mode: "none",
  block_message: "",
});

export function DevUserModules() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: mods }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, user_id").order("nome"),
      (supabase.from as any)("user_modules").select(
        "user_id, module, enabled, block_mode, block_message",
      ),
    ]);

    const map = new Map<string, Record<AppModule, ModuleState>>();
    (mods ?? []).forEach((m: any) => {
      if (!map.has(m.user_id)) {
        map.set(m.user_id, {
          trabalhista: defaultModuleState(),
          previdenciario: defaultModuleState(),
        });
      }
      map.get(m.user_id)![m.module as AppModule] = {
        enabled: !!m.enabled,
        block_mode: (m.block_mode as BlockMode) ?? "none",
        block_message: m.block_message ?? "",
      };
    });

    const rows: UserRow[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      nome: p.nome ?? "",
      email: p.email ?? "",
      user_id: p.user_id ?? null,
      modules:
        map.get(p.id) ?? {
          trabalhista: defaultModuleState(),
          previdenciario: defaultModuleState(),
        },
    }));
    setUsers(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (userId: string, mod: AppModule, next: boolean) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              modules: {
                ...u.modules,
                [mod]: { ...u.modules[mod], enabled: next },
              },
            }
          : u,
      ),
    );
    const { error } = await (supabase.from as any)("user_modules").upsert(
      { user_id: userId, module: mod, enabled: next },
      { onConflict: "user_id,module" },
    );
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar módulo",
        description: error.message,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                modules: {
                  ...u.modules,
                  [mod]: { ...u.modules[mod], enabled: !next },
                },
              }
            : u,
        ),
      );
    } else {
      toast({
        title: "Módulo atualizado",
        description: `${mod} ${next ? "habilitado" : "desabilitado"}.`,
      });
    }
  };

  const updateBlock = (
    userId: string,
    mod: AppModule,
    block_mode: BlockMode,
    block_message: string,
  ) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              modules: {
                ...u.modules,
                [mod]: { ...u.modules[mod], block_mode, block_message },
              },
            }
          : u,
      ),
    );
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.user_id ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Módulos por Usuário
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Habilite/desabilite acesso e configure avisos ou bloqueios com mensagem
          customizada por módulo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>ID</TableHead>
                  {ALL_MODULES.map((m) => (
                    <TableHead key={m} className="text-center capitalize">
                      {m}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {u.user_id ?? "—"}
                    </TableCell>
                    {ALL_MODULES.map((m) => {
                      const st = u.modules[m];
                      return (
                        <TableCell key={m} className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={st.enabled}
                              onCheckedChange={(v) => toggle(u.id, m, v)}
                            />
                            <BlockConfigPopover
                              userId={u.id}
                              module={m}
                              currentMode={st.block_mode}
                              currentMessage={st.block_message}
                              onSaved={(mode, msg) =>
                                updateBlock(u.id, m, mode, msg)
                              }
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={2 + ALL_MODULES.length}
                      className="text-center text-muted-foreground py-8"
                    >
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
