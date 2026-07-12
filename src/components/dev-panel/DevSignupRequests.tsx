import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Check, X, Trash2, Mail, User, Stethoscope, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { FunctionsHttpError } from "@supabase/supabase-js";

type Status =
  | "pending"
  | "approved"
  | "awaiting_finalization"
  | "completed"
  | "rejected"
  | "cancelled";

interface SignupRequest {
  id: string;
  nome_completo: string;
  login_desejado: string | null;
  email: string;
  medico_vinculado: string;
  informacoes_adicionais: string;
  status: Status;
  created_at: string;
  reviewed_at: string | null;
  invite_sent_at: string | null;
  finalized_at: string | null;
  review_notes: string | null;
}

type FilterStatus = "all" | Status;

const statusStyles: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  awaiting_finalization: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const statusLabel: Record<Status, string> = {
  pending: "Pendente",
  approved: "Aguardando finalização",
  awaiting_finalization: "Aguardando finalização",
  completed: "Cadastro finalizado",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

export function DevSignupRequests() {
  const [rows, setRows] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: "approve" | "reject" | "cancel" } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("signup-request-list");
    setLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao listar solicitações." });
      return;
    }
    setRows((data as any)?.requests ?? []);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const runAction = async (id: string, action: "approve" | "reject" | "cancel") => {
    setBusyId(id);
    const fnName = `signup-request-${action}`;
    const body: Record<string, unknown> = { request_id: id };
    if (action === "approve") body.redirect_origin = window.location.origin;
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    setBusyId(null);

    let errorDescription: string | null = null;
    if (error) {
      if (error instanceof FunctionsHttpError) {
        try {
          const parsed = await error.context.clone().json();
          errorDescription = parsed?.error ?? JSON.stringify(parsed);
        } catch {
          try { errorDescription = await error.context.clone().text(); } catch { /* noop */ }
        }
      }
      errorDescription = errorDescription ?? error.message;
      console.error(`[${fnName}] failed`, error, errorDescription);
    } else if ((data as any)?.error) {
      errorDescription = (data as any).error;
      console.error(`[${fnName}] error in body`, data);
    }

    if (errorDescription) {
      toast({ variant: "destructive", title: "Falhou", description: errorDescription });
      return;
    }
    toast({
      title:
        action === "approve" ? "Aprovada" : action === "reject" ? "Rejeitada" : "Cancelada",
      description:
        action === "approve"
          ? "Email com link de finalização enviado ao solicitante."
          : "Solicitação atualizada.",
    });
    await fetchRows();
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitações de cadastro</h1>
          <p className="text-sm text-muted-foreground">
            Aprove, rejeite ou cancele pedidos de novos usuários.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="awaiting_finalization">Aguardando finalização</SelectItem>
              <SelectItem value="completed">Cadastro finalizado</SelectItem>
              <SelectItem value="rejected">Rejeitadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchRows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            {loading ? "Carregando..." : "Nenhuma solicitação neste filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-4 w-4 text-primary" />
                      {r.nome_completo}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviada em {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {r.reviewed_at && (
                        <> · revisada em {format(new Date(r.reviewed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
                      )}
                    </p>
                  </div>
                  <Badge className={`border ${statusStyles[r.status]}`}>{statusLabel[r.status]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{r.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Login desejado:</span>
                    <span className="font-medium">{r.login_desejado || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Médico vinculado:</span>
                    <span className="font-medium">{r.medico_vinculado}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Informações adicionais:</p>
                  <div className="bg-muted rounded-md p-3 whitespace-pre-wrap text-sm">
                    {r.informacoes_adicionais}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  {r.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => setConfirming({ id: r.id, action: "reject" })}
                      >
                        <X className="h-4 w-4 mr-1" /> Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => setConfirming({ id: r.id, action: "approve" })}
                      >
                        <Check className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                    </>
                  )}
                  {r.status !== "cancelled" && r.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={busyId === r.id}
                      onClick={() => setConfirming({ id: r.id, action: "cancel" })}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming?.action === "approve" && "Aprovar solicitação"}
              {confirming?.action === "reject" && "Rejeitar solicitação"}
              {confirming?.action === "cancel" && "Cancelar solicitação"}
            </DialogTitle>
            <DialogDescription>
              {confirming?.action === "approve" &&
                "A conta será criada e um email com link de uso único será enviado ao solicitante."}
              {confirming?.action === "reject" &&
                "A solicitação será marcada como rejeitada. Nenhum email é enviado ao solicitante."}
              {confirming?.action === "cancel" &&
                "A solicitação será marcada como cancelada. Contas já aprovadas não são apagadas."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Voltar</Button>
            <Button
              onClick={async () => {
                if (!confirming) return;
                const c = confirming;
                setConfirming(null);
                await runAction(c.id, c.action);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
