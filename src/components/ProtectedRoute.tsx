import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, profile, loading } = useAuth();

  // Mostrar loading enquanto verifica autenticação OU carrega perfil
  // (evita o "vai e volta" / -> /dashboard -> / que causa piscadas)
  if (loading || (isAuthenticated && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
