import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Stethoscope, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Página pública que consome o token de convite (`token_hash`) vindo no
 * link enviado por email quando o dev aprova a solicitação. Após verify,
 * o convidado define a senha e é deslogado para logar normalmente.
 */
export default function FinalizarCadastro() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ready" | "saving" | "done" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const run = async () => {
      // Supabase gera links com hash: #access_token=...&type=invite
      // ou query: ?token_hash=...&type=invite (dependendo do PKCE).
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
      const type = (query.get("type") ?? hash.get("type") ?? "invite") as
        | "invite" | "signup" | "recovery" | "magiclink" | "email_change";

      // Caso 1: token_hash presente → verifyOtp
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (error) {
          setStatus("error");
          setErrorMsg("Link inválido ou já utilizado. Solicite um novo cadastro.");
          return;
        }
        setStatus("ready");
        return;
      }

      // Caso 2: já veio como fragmento de sessão (access_token no hash)
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setStatus("error");
          setErrorMsg("Link inválido ou expirado.");
          return;
        }
        setStatus("ready");
        return;
      }

      // Caso 3: sessão já ativa (raro, mas seguro)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStatus("ready");
        return;
      }

      setStatus("error");
      setErrorMsg("Link inválido. Faça uma nova solicitação de cadastro.");
    };
    run();
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
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("ready");
      toast({ variant: "destructive", title: "Erro ao definir senha", description: error.message });
      return;
    }
    // Marca a solicitação como completed (best-effort; ainda temos sessão)
    try {
      await supabase.functions.invoke("signup-request-finalize");
    } catch (e) {
      console.error("finalize call failed", e);
    }
    await supabase.auth.signOut();
    setStatus("done");
    toast({ title: "Cadastro finalizado!", description: "Faça login com seu email e a senha que você definiu." });
    setTimeout(() => navigate("/"), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mb-3">
              <Stethoscope className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Finalizar cadastro</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Defina uma senha para acessar o Tenório MPJ.
            </p>
          </div>

          {status === "verifying" && (
            <p className="text-center text-muted-foreground">Validando seu link...</p>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <p className="text-center text-destructive">{errorMsg}</p>
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
