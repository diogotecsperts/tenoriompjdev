import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, profile, loading } = useAuth();

  // Mostrar loading enquanto verifica autenticação OU carrega perfil
  // (evita o "vai e volta" / -> /dashboard -> / que causa piscadas)
  if (loading || (isAuthenticated && !profile)) {
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

  // Segurança extra: não renderizar rotas protegidas sem perfil
  if (!profile) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>; 
}
