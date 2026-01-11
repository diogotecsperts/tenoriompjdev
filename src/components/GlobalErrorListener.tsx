import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { logErrorDebounced } from "@/utils/errorLogger";

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
      
      // Log no banco de dados
      logErrorDebounced({
        error_type: 'global',
        error_message: event.message || event.error?.message || 'Unknown error',
        error_stack: event.error?.stack,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      });

      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Ocorreu um problema. Tente recarregar a página.",
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[GlobalErrorListener] Unhandled promise rejection:", event.reason);
      
      const reason = event.reason?.message || String(event.reason);
      
      // Log no banco de dados (mesmo para erros de rede, para análise)
      logErrorDebounced({
        error_type: 'promise',
        error_message: reason,
        error_stack: event.reason?.stack,
      });

      // Não mostrar toast para erros de rede (geralmente tratados em outro lugar)
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
