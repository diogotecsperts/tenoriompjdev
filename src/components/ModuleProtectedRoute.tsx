import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type AppModule = "trabalhista" | "previdenciario";

interface Props {
  module: AppModule;
  children: React.ReactNode;
}

/**
 * Guard de rota por módulo. Pressupõe que ProtectedRoute já cuidou de autenticação.
 * Chama RPC `has_module(uid, module)`. Se falso → redireciona ao /hub.
 */
export function ModuleProtectedRoute({ module, children }: Props) {
  const { user, isAdmin } = useAuth();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user) return;
      // Admin/developer sempre passam
      if (isAdmin) {
        if (!cancelled) setStatus("allowed");
        return;
      }
      const { data, error } = await supabase.rpc("has_module" as any, {
        _user_id: user.id,
        _module: module,
      });
      if (cancelled) return;
      if (error) {
        console.error("has_module error", error);
        setStatus("denied");
        return;
      }
      setStatus(data ? "allowed" : "denied");
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [user, module, isAdmin]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "denied") {
    toast({
      variant: "destructive",
      title: "Acesso negado",
      description: "Você não tem acesso a este módulo.",
    });
    return <Navigate to="/hub" replace />;
  }

  return <>{children}</>;
}
