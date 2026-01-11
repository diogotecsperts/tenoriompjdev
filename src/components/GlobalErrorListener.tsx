import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Componente que escuta erros globais não capturados pelo ErrorBoundary.
 * Captura: erros de script, promises rejeitadas, etc.
 */
export function GlobalErrorListener() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Evitar mostrar erros de extensões do navegador ou scripts externos
      if (event.filename && !event.filename.includes(window.location.origin)) {
        return;
      }

      console.error("[GlobalErrorListener] Uncaught error:", event.error);
      
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Ocorreu um problema. Tente recarregar a página.",
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[GlobalErrorListener] Unhandled promise rejection:", event.reason);
      
      // Não mostrar toast para erros de rede (geralmente tratados em outro lugar)
      const reason = event.reason?.message || String(event.reason);
      if (reason.includes("fetch") || reason.includes("network") || reason.includes("NetworkError")) {
        return;
      }

      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Ocorreu um problema. Tente recarregar a página.",
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
