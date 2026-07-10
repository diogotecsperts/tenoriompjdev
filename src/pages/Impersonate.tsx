import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rota /impersonate
 *
 * Fluxo:
 *  1. DevPanel abre esta URL em nova aba com #token=<hash>&email=<...>
 *  2. Se ainda NÃO está em modo "sessionStorage", ativa o flag e recarrega
 *     (o client.ts, ao carregar de novo, passa a persistir a sessão em
 *     sessionStorage — isolado por aba).
 *  3. Após o reload, chama supabase.auth.verifyOtp para consumir o magiclink
 *     de uso único → sessão desta aba fica autenticada como o cliente.
 *  4. Redireciona para /hub (rotas comuns funcionam normalmente).
 *
 * A senha do usuário-alvo NÃO é tocada. Nenhum email é enviado.
 */
export default function Impersonate() {
  const [status, setStatus] = useState<"init" | "exchanging" | "error">("init");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // Ler token/email do hash (mais seguro que query, não vai em referer)
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const tokenHash = params.get("token");
        const email = params.get("email");

        if (!tokenHash || !email) {
          setStatus("error");
          setErrorMsg("Token de impersonation ausente ou inválido.");
          return;
        }

        const flagActive =
          window.sessionStorage.getItem("lovable_impersonation_active") === "1";

        if (!flagActive) {
          // Ativa isolamento por aba e recarrega para o client.ts re-avaliar
          window.sessionStorage.setItem("lovable_impersonation_active", "1");
          window.location.reload();
          return;
        }

        setStatus("exchanging");

        // Import dinâmico para garantir que o client.ts já foi avaliado
        // com o flag ativo (sessionStorage no lugar de localStorage).
        const { supabase } = await import("@/integrations/supabase/client");

        const { data, error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: tokenHash,
          email,
        });

        if (error || !data.session) {
          setStatus("error");
          setErrorMsg(error?.message ?? "Falha ao consumir token de impersonation.");
          return;
        }

        // Limpa o hash da URL antes de navegar
        window.history.replaceState({}, "", "/impersonate");
        // Vai para o hub — daqui o AuthContext detecta a sessão impersonada
        navigate("/hub", { replace: true });
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    })();
     
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "error" ? (
          <>
            <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-bold">Impersonation falhou</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button
              variant="outline"
              onClick={() => {
                window.sessionStorage.removeItem("lovable_impersonation_active");
                window.close();
              }}
            >
              Fechar aba
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <h1 className="text-lg font-medium">Abrindo sessão como usuário…</h1>
            <p className="text-xs text-muted-foreground">
              Isolando esta aba e consumindo o token de acesso único.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
