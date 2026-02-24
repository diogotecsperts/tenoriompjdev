import { ReactNode, useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { Loader2, ShieldAlert } from "lucide-react";

interface DevProtectedRouteProps {
  children: ReactNode;
}

export function DevProtectedRoute({ children }: DevProtectedRouteProps) {
  const { isAuthenticated, user, loading } = useAuth();
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  usePresenceHeartbeat();

  useEffect(() => {
    const checkDeveloperRole = async () => {
      if (!user) {
        setIsDeveloper(false);
        setCheckingRole(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("is_developer");
        
        if (error) {
          console.error("Error checking developer role:", error);
          setIsDeveloper(false);
        } else {
          setIsDeveloper(data === true);
        }
      } catch (err) {
        console.error("Exception checking developer role:", err);
        setIsDeveloper(false);
      } finally {
        setCheckingRole(false);
      }
    };

    if (!loading && user) {
      checkDeveloperRole();
    } else if (!loading && !user) {
      setCheckingRole(false);
      setIsDeveloper(false);
    }
  }, [user, loading]);

  if (loading || checkingRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isDeveloper) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md p-8">
          <ShieldAlert className="mx-auto mb-4 h-16 w-16 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Acesso Restrito
          </h1>
          <p className="text-muted-foreground mb-6">
            Você não tem permissão para acessar o painel de desenvolvedor.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
