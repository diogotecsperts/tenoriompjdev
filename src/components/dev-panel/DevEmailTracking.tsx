import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, Plus, X, Send, Save, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";

interface TrackingConfig {
  id: string;
  enabled: boolean;
  recipient_emails: string[];
  notify_on_login: boolean;
  notify_on_pdf_error: boolean;
  notify_daily_summary: boolean;
  daily_summary_hour: number;
  daily_summary_minute: number;
  last_daily_sent_date: string | null;
}

interface LogRow {
  id: string;
  type: string;
  recipients: string[];
  subject: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Login", color: "bg-emerald-100 text-emerald-800" },
  pdf_error: { label: "Erro PDF", color: "bg-red-100 text-red-800" },
  daily_summary: { label: "Resumo diário", color: "bg-blue-100 text-blue-800" },
  test: { label: "Teste", color: "bg-slate-100 text-slate-800" },
};

export function DevEmailTracking() {
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("email_tracking_config" as any) as any)
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      toast({ title: "Erro ao carregar configuração", description: error.message, variant: "destructive" });
    } else {
      setConfig(data as TrackingConfig);
    }

    const { data: logData } = await (supabase.from("email_tracking_log" as any) as any)
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(20);
    setLogs((logData ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const persist = async (patch: Partial<TrackingConfig>) => {
    if (!config) return;
    setSaving(true);
    const next = { ...config, ...patch };
    setConfig(next);
    const { error } = await (supabase.from("email_tracking_config" as any) as any)
      .update(patch)
      .eq("id", "default");
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      load();
    }
  };

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }
    if (!config) return;
    if (config.recipient_emails.includes(email)) {
      toast({ title: "Já cadastrado" });
      return;
    }
    void persist({ recipient_emails: [...config.recipient_emails, email] });
    setNewEmail("");
  };

  const removeRecipient = (email: string) => {
    if (!config) return;
    void persist({ recipient_emails: config.recipient_emails.filter((e) => e !== email) });
  };

  const sendTest = async () => {
    if (!config || config.recipient_emails.length === 0) {
      toast({ title: "Adicione ao menos um destinatário", variant: "destructive" });
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("send-tracking-email", {
      body: { type: "test", force: true },
    });
    setTesting(false);
    if (error || (data && (data as any).error)) {
      toast({
        title: "Falha no envio",
        description: error?.message ?? (data as any)?.error ?? "Erro desconhecido",
        variant: "destructive",
      });
    } else {
      toast({ title: "Email de teste enviado", description: `Para ${config.recipient_emails.join(", ")}` });
      load();
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Rastreamento via Email
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Alertas automáticos por email sobre login, erros de PDF e resumo diário de uso — via Resend
          (domínio <code className="text-xs bg-muted px-1 py-0.5 rounded">mpjpericias.tecsperts.com</code>).
        </p>
      </div>

      {/* Status geral */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Status do rastreamento</CardTitle>
            <CardDescription>Ativa ou desativa todos os envios em uma única chave.</CardDescription>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => persist({ enabled: v })}
            disabled={saving}
          />
        </CardHeader>
      </Card>

      {/* Chave Resend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Chave da API Resend</CardTitle>
          <CardDescription>Gerenciada nos segredos do backend. Nunca é exposta na interface.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Configurada
          </Badge>
          <span className="text-xs text-muted-foreground">Para trocar, use o gerenciador de segredos.</span>
        </CardContent>
      </Card>

      {/* Destinatários */}
      <Card>
        <CardHeader>
          <CardTitle>Destinatários</CardTitle>
          <CardDescription>Emails que receberão todos os alertas ativados abaixo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="voce@exemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
            />
            <Button onClick={addRecipient} disabled={!newEmail.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          {config.recipient_emails.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">Nenhum destinatário cadastrado.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {config.recipient_emails.map((email) => (
                <Badge key={email} variant="secondary" className="pl-3 pr-1 py-1.5 gap-1">
                  {email}
                  <button
                    onClick={() => removeRecipient(email)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    aria-label={`Remover ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tipos de alerta */}
      <Card>
        <CardHeader>
          <CardTitle>Alertas ativos</CardTitle>
          <CardDescription>Escolha quais eventos disparam email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <Label className="font-medium">Login de usuário</Label>
              <p className="text-xs text-muted-foreground">Envia quando um usuário se conecta após 30+ min inativo.</p>
            </div>
            <Switch checked={config.notify_on_login} onCheckedChange={(v) => persist({ notify_on_login: v })} disabled={saving} />
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <Label className="font-medium">Erro ao processar PDF</Label>
              <p className="text-xs text-muted-foreground">Alerta instantâneo com erro traduzido, usuário e periciado.</p>
            </div>
            <Switch checked={config.notify_on_pdf_error} onCheckedChange={(v) => persist({ notify_on_pdf_error: v })} disabled={saving} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="font-medium">Resumo diário</Label>
              <p className="text-xs text-muted-foreground">Consolidação do uso enviada no horário abaixo.</p>
            </div>
            <Switch checked={config.notify_daily_summary} onCheckedChange={(v) => persist({ notify_daily_summary: v })} disabled={saving} />
          </div>

          <div className="pt-2">
            <Label className="text-sm font-medium">Horário do resumo diário (Brasília)</Label>
            <div className="flex gap-2 mt-2 items-center">
              <Select value={String(config.daily_summary_hour)} onValueChange={(v) => persist({ daily_summary_hour: parseInt(v, 10) })}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{hours.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}h</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select value={String(config.daily_summary_minute)} onValueChange={(v) => persist({ daily_summary_minute: parseInt(v, 10) })}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{minutes.map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>)}</SelectContent>
              </Select>
              {config.last_daily_sent_date && (
                <span className="text-xs text-muted-foreground ml-3">
                  Último envio: {new Date(config.last_daily_sent_date + "T12:00:00").toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teste */}
      <Card>
        <CardHeader>
          <CardTitle>Testar envio</CardTitle>
          <CardDescription>Dispara um email de teste para todos os destinatários cadastrados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendTest} disabled={testing || config.recipient_emails.length === 0}>
            {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar email de teste
          </Button>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos disparos</CardTitle>
            <CardDescription>Os 20 emails mais recentes.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Atualizar</Button>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground italic p-6">Nenhum envio registrado ainda.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Destinatários</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => {
                  const t = TYPE_LABELS[l.type] ?? { label: l.type, color: "bg-slate-100 text-slate-800" };
                  return (
                    <TableRow key={l.id}>
                      <TableCell><span className={`text-xs px-2 py-1 rounded font-medium ${t.color}`}>{t.label}</span></TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{l.subject ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.recipients.join(", ")}</TableCell>
                      <TableCell>
                        {l.status === "sent" ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-300 text-red-700 gap-1" title={l.error_message ?? undefined}><AlertCircle className="h-3 w-3" /> Falhou</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(l.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
