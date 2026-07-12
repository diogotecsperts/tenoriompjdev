import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, profile, loading, logout } = useAuth();

  // Mostrar loading enquanto verifica autenticação OU carrega perfil
  // (evita o "vai e volta" / -> /dashboard -> / que causa piscadas)
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Carregando...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold text-foreground">Não foi possível carregar seu perfil</h1>
          <p className="text-sm text-muted-foreground">
            Recarregue a página. Se continuar, saia e entre novamente.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => window.location.reload()}>Recarregar</Button>
            <Button onClick={() => logout()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>; 
}
