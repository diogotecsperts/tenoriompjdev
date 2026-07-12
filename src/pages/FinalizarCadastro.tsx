import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Stethoscope, Lock, Eye, EyeOff, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function FinalizarCadastro() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ready" | "saving" | "done" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let timeoutId: number | undefined;
    let done = false;

    const finish = (next: "ready" | "error", msg?: string) => {
      if (done) return;
      done = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (next === "error") setErrorMsg(msg ?? "Link inválido.");
      setStatus(next);
    };

    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
      const type = (query.get("type") ?? hash.get("type") ?? "invite") as
        | "invite" | "signup" | "recovery" | "magiclink" | "email_change";

      const captureEmail = async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user?.email) setSessionEmail(data.session.user.email);
        } catch { /* ignore */ }
      };

      // Caso 1: token_hash presente → verifyOtp
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        window.history.replaceState({}, "", window.location.pathname);
        if (error) {
          console.warn("[finalizar-cadastro] verifyOtp falhou", { type, code: (error as any).code, msg: error.message });
          return finish("error", "Link inválido ou já utilizado (cada link é de uso único). Reenvie um novo link abaixo ou solicite um novo cadastro.");
        }
        await captureEmail();
        return finish("ready");
      }

      // Caso 2: fragmento de sessão (access_token/refresh_token no hash)
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState({}, "", window.location.pathname);
        if (error) {
          console.warn("[finalizar-cadastro] setSession falhou", { msg: error.message });
          return finish("error", "Link expirado ou já utilizado. Reenvie um novo link abaixo ou solicite um novo cadastro.");
        }
        await captureEmail();
        return finish("ready");
      }

      // Caso 3: sessão já ativa (raro, mas seguro)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (session.user?.email) setSessionEmail(session.user.email);
        return finish("ready");
      }

      console.warn("[finalizar-cadastro] sem token_hash, sem fragmento e sem sessão");
      finish(
        "error",
        "Não recebemos o código de acesso na URL. Isso costuma acontecer quando o link do email foi truncado ou aberto por um pré-visualizador. Reenvie um novo link abaixo ou abra o link direto no navegador.",
      );
    };

    timeoutId = window.setTimeout(() => {
      finish("error", "Não conseguimos validar o link a tempo. Reenvie um novo link abaixo.");
    }, 8000);

    run().catch((e) => {
      console.error("finalizar-cadastro validation error", e);
      finish("error", "Não conseguimos validar o link. Reenvie um novo link abaixo.");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ variant: "destructive", title: "Senha muito curta", description: "Use pelo menos 8 caracteres." });
      return;
    }
    if (password !== confirm) {
      toast({ variant: "destructive", title: "Senhas não conferem", description: "Verifique os campos." });
      return;
    }
    setStatus("saving");

    // Tenta direto — sem re-checar getSession antes, para não perder janela de sessão de link.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const raw = error.message ?? "";
      const isSessionMissing = /session\s*missing/i.test(raw) || (error as any).name === "AuthSessionMissingError";
      if (isSessionMissing) {
        console.warn("[finalizar-cadastro] updateUser sem sessão", { raw, sessionEmail });
        setStatus("error");
        setErrorMsg(
          "Sua sessão expirou. Reenvie um novo link abaixo para continuar.",
        );
        return;
      }
      setStatus("ready");
      toast({
        variant: "destructive",
        title: "Erro ao definir senha",
        description: raw || "Tente novamente em alguns instantes.",
      });
      return;
    }

    // Marca a solicitação como completed antes do signOut (precisamos da sessão)
    try {
      const { error: finErr } = await supabase.functions.invoke("signup-request-finalize");
      if (finErr) {
        console.error("finalize returned error", finErr);
        toast({
          variant: "destructive",
          title: "Senha salva, mas houve um aviso",
          description: "Não conseguimos marcar sua solicitação como concluída. Faça login normalmente; se algo travar, contate o suporte.",
        });
      }
    } catch (err) {
      console.error("finalize call failed", err);
    }
    await supabase.auth.signOut();
    setStatus("done");
    toast({ title: "Cadastro finalizado!", description: "Faça login com seu email e a senha que você definiu." });
    setTimeout(() => navigate("/"), 1500);
  };

  const handleResend = async () => {
    const email = (sessionEmail ?? resendEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: "destructive", title: "Email inválido", description: "Informe o email do cadastro." });
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.functions.invoke("signup-request-resend", {
        body: { email },
      });
      if (error) throw error;
      toast({
        title: "Se houver uma aprovação ativa, enviamos um novo link",
        description: "Verifique sua caixa de entrada (e o spam) nos próximos minutos.",
      });
    } catch (e) {
      console.error("resend failed", e);
      toast({
        variant: "destructive",
        title: "Não foi possível reenviar agora",
        description: "Aguarde alguns minutos e tente novamente.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mb-3">
              <Stethoscope className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Finalizando cadastro</h1>
            {(status === "ready" || status === "saving") && (
              <p className="text-sm text-muted-foreground mt-1">
                Defina uma senha para acessar o Tenório MPJ.
              </p>
            )}
          </div>

          {status === "verifying" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Validando seu link...</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <p className="text-center text-destructive">{errorMsg}</p>
              {sessionEmail ? (
                <p className="text-center text-xs text-muted-foreground">
                  Email da tentativa: <span className="font-medium">{sessionEmail}</span>
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="resend-email">Seu email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="resend-email"
                      type="email"
                      className="pl-10 h-11"
                      placeholder="voce@exemplo.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <Button className="w-full" onClick={handleResend} disabled={resending}>
                {resending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reenviando...</>
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" /> Reenviar link</>
                )}
              </Button>
              <Button className="w-full" variant="outline" onClick={() => navigate("/solicitar-cadastro")}>
                Solicitar novo cadastro
              </Button>
            </div>
          )}


          {(status === "ready" || status === "saving") && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="pw">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pw"
                    type={showPassword ? "text" : "password"}
                    className="pl-10 pr-10 h-11"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pw2"
                    type={showPassword ? "text" : "password"}
                    className="pl-10 h-11"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={status === "saving"}>
                {status === "saving" ? "Salvando..." : "Finalizar cadastro"}
              </Button>
            </form>
          )}

          {status === "done" && (
            <p className="text-center text-primary">Cadastro finalizado! Redirecionando...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
