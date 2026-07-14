import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck, Stethoscope } from "lucide-react";

// Tiny typed wrapper for the beta supabase.auth.oauth namespace.
interface OAuthClient {
  name?: string;
  client_uri?: string;
  redirect_uri?: string;
}
interface AuthorizationDetails {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
}
interface OAuthNamespace {
  getAuthorizationDetails(id: string): Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization(id: string): Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization(id: string): Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
}
function oauthNs(): OAuthNamespace {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthNamespace;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente na URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar autorização.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauthNs().approveAuthorization(authorizationId)
        : await oauthNs().denyAuthorization(authorizationId);
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("O servidor de autorização não retornou URL de redirecionamento.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao concluir autorização.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 space-y-4 text-center">
            <h1 className="text-xl font-semibold text-foreground">Não foi possível concluir</h1>
            <p className="text-sm text-muted-foreground break-words">{error}</p>
            <Button variant="outline" onClick={() => window.location.assign("/hub")}>
              Voltar ao sistema
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando autorização…</p>
        </div>
      </div>
    );
  }

  const clientName = details.client?.name || "um aplicativo externo";
  const redirect = details.client?.redirect_uri;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-lg">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Conectar {clientName} ao Tenório MPJ
              </h1>
              <p className="text-sm text-muted-foreground">
                Este cliente poderá acessar suas ferramentas MCP em seu nome.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <Stethoscope className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Acesso concedido</div>
                <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Listar e ler seus laudos periciais</li>
                  <li>Listar suas perícias previdenciárias</li>
                  <li>Listar seus lançamentos financeiros</li>
                </ul>
              </div>
            </div>
            {redirect && (
              <p className="text-xs text-muted-foreground pt-2 break-all">
                Redirecionamento após autorização: <span className="font-mono">{redirect}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground pt-2">
              Todas as chamadas respeitam as políticas de acesso da sua conta (RLS). Este consentimento
              não concede permissões além das já disponíveis para você no sistema.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
              Negar
            </Button>
            <Button disabled={busy} onClick={() => decide(true)}>
              {busy ? "Processando…" : "Autorizar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
